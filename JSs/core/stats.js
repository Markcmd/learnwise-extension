// =====================================================================
// Stats — derive progress-dashboard numbers from the bank + event logs
// ---------------------------------------------------------------------
// "Store facts, derive scores" (DESIGN.md §1): the dashboard never stores
// a separate "progress" record. Every number here is COMPUTED on demand
// from the word bank (createdAt/level) and the raw exposure/review event
// logs. Because the facts are kept, the formulas can be retuned and every
// number recomputed — no migration. All of this is pure (no chrome/DOM/
// IndexedDB), which is exactly why it's unit-tested (M3.1, test-first).
//
// The dashboard page (M3.2) is the only impure layer: it loads the bank +
// events + reviews, then hands them to computeStats() below.
// =====================================================================
import { deriveStatus } from "./wordbank.js";
import { FAMILIARITY_TIERS, STOP_GLOSS_LEVEL, STATS } from "./constants.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------
// Day bucketing (the basis for streaks + the activity series)
// ---------------------------------------------------------------------

/**
 * Map a timestamp to an integer day number (pure, deterministic).
 * Day 0 is the Unix epoch day; consecutive calendar days differ by 1, which
 * is all the streak/series math needs. Bucketing is UTC by default so tests
 * are timezone-independent; pass the caller's `tzOffsetMin` (e.g.
 * `-new Date().getTimezoneOffset()`) to bucket by the user's local day.
 * @param {number} ts  epoch ms
 * @param {number} [tzOffsetMin]  minutes EAST of UTC (local = UTC + offset)
 * @returns {number}
 */
export function dayIndex(ts, tzOffsetMin = 0) {
  const t = Number(ts);
  if (!Number.isFinite(t)) return NaN;
  const shifted = t + (Number(tzOffsetMin) || 0) * 60 * 1000;
  return Math.floor(shifted / DAY_MS);
}

/**
 * Set of day indices on which there was ANY activity — an exposure event
 * (reading) OR a review event (studying). This is the "active day" definition
 * the streak is built on (per the M3 decision: reading + reviews both count).
 * @param {Object[]} events   exposure events ({ ts })
 * @param {Object[]} reviews  review events ({ ts })
 * @param {number} [tzOffsetMin]
 * @returns {Set<number>}
 */
export function activeDays(events = [], reviews = [], tzOffsetMin = 0) {
  const days = new Set();
  for (const list of [events, reviews]) {
    for (const e of Array.isArray(list) ? list : []) {
      const d = dayIndex(e?.ts, tzOffsetMin);
      if (Number.isFinite(d)) days.add(d);
    }
  }
  return days;
}

/**
 * Compute streak stats from a set/iterable of active day indices (pure).
 *  - current: length of the run of consecutive active days ending today or
 *    yesterday (a streak isn't broken until a whole day is missed). 0 if the
 *    last activity was 2+ days ago, or there's no activity.
 *  - longest: the longest run of consecutive active days, ever.
 *  - activeDays: how many distinct days had any activity.
 *  - lastActiveDay: the most recent active day index (null if none).
 * @param {Iterable<number>} dayset
 * @param {number} todayIndex  dayIndex(now, tzOffsetMin)
 * @returns {{current:number, longest:number, activeDays:number, lastActiveDay:(number|null)}}
 */
export function computeStreak(dayset, todayIndex) {
  const days = [...new Set([...(dayset || [])])]
    .filter((d) => Number.isFinite(d))
    .sort((a, b) => a - b);
  if (!days.length) {
    return { current: 0, longest: 0, activeDays: 0, lastActiveDay: null };
  }

  // Longest run of consecutive integers.
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] === days[i - 1] + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  // Current run: only counts if the last active day is today or yesterday.
  const last = days[days.length - 1];
  let current = 0;
  if (Number.isFinite(todayIndex) && (last === todayIndex || last === todayIndex - 1)) {
    current = 1;
    for (let i = days.length - 1; i > 0; i--) {
      if (days[i] === days[i - 1] + 1) current += 1;
      else break;
    }
  }

  return { current, longest, activeDays: days.length, lastActiveDay: last };
}

// ---------------------------------------------------------------------
// Level distribution (the familiarity-tier histogram)
// ---------------------------------------------------------------------

/**
 * Count bank records into the canonical familiarity tiers (pure). Reuses
 * deriveStatus so the dashboard histogram can never drift from the glossing
 * rule. Returns a map keyed by every FAMILIARITY_TIERS key (new/learning/
 * familiar/known), each guaranteed present (0 if empty). "ignored" words are
 * excluded — they aren't part of the learning progression.
 * @param {Object} bank  word → record
 * @returns {Record<string, number>}
 */
export function levelDistribution(bank = {}) {
  const dist = {};
  for (const t of FAMILIARITY_TIERS) dist[t.key] = 0;
  for (const r of Object.values(bank || {})) {
    if (!r || typeof r !== "object") continue;
    if (r.status === "ignored") continue;
    const tier = deriveStatus(r.level || 0);
    dist[tier] = (dist[tier] || 0) + 1;
  }
  return dist;
}

// ---------------------------------------------------------------------
// Review accuracy (from the review event log)
// ---------------------------------------------------------------------

/**
 * Aggregate review accuracy from review events (pure). A review is "correct"
 * when its SM-2 quality is at/above STATS.CORRECT_QUALITY_MIN (good/easy).
 * Accuracy is a 0–1 fraction (0 when there are no reviews).
 * @param {Object[]} reviews  review events ({ grade, quality })
 * @returns {{total:number, correct:number, accuracy:number, byGrade:Record<string,number>}}
 */
export function reviewAccuracy(reviews = []) {
  const byGrade = { again: 0, hard: 0, good: 0, easy: 0 };
  let total = 0;
  let correct = 0;
  for (const r of Array.isArray(reviews) ? reviews : []) {
    if (!r || typeof r !== "object") continue;
    total += 1;
    if (r.grade in byGrade) byGrade[r.grade] += 1;
    const q = Number(r.quality);
    if (Number.isFinite(q) && q >= STATS.CORRECT_QUALITY_MIN) correct += 1;
  }
  const accuracy = total > 0 ? correct / total : 0;
  return { total, correct, accuracy, byGrade };
}

// ---------------------------------------------------------------------
// Activity series (per-day counts for the dashboard sparkline/heatmap)
// ---------------------------------------------------------------------

/**
 * Build a dense per-day activity series ending today (pure). Always returns
 * exactly `days` entries, oldest→newest, even for days with no activity, so
 * the dashboard can plot a fixed-width strip without gap handling.
 * @param {Object[]} events   exposure events ({ ts })
 * @param {Object[]} reviews  review events ({ ts })
 * @param {Object} [opts] { now, days, tzOffsetMin }
 * @returns {{dayIndex:number, exposures:number, reviews:number, total:number}[]}
 */
export function activitySeries(events = [], reviews = [], opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const days = Number.isFinite(opts.days) && opts.days > 0 ? Math.floor(opts.days) : STATS.ACTIVITY_DAYS;
  const tz = opts.tzOffsetMin || 0;
  const today = dayIndex(now, tz);
  const start = today - (days - 1);

  // Pre-fill the window so every day is present.
  const byDay = new Map();
  for (let d = start; d <= today; d++) byDay.set(d, { dayIndex: d, exposures: 0, reviews: 0, total: 0 });

  const tally = (list, field) => {
    for (const e of Array.isArray(list) ? list : []) {
      const d = dayIndex(e?.ts, tz);
      const bucket = byDay.get(d);
      if (bucket) {
        bucket[field] += 1;
        bucket.total += 1;
      }
    }
  };
  tally(events, "exposures");
  tally(reviews, "reviews");

  return [...byDay.values()];
}

// ---------------------------------------------------------------------
// Headline totals
// ---------------------------------------------------------------------

/**
 * Count words added within the last `windowDays` (pure), by `createdAt`.
 * @param {Object} bank
 * @param {number} [now]
 * @param {number} [windowDays]
 */
export function wordsAddedSince(bank = {}, now = Date.now(), windowDays = STATS.WEEK_DAYS) {
  const cutoff = now - windowDays * DAY_MS;
  let n = 0;
  for (const r of Object.values(bank || {})) {
    if (r && typeof r === "object" && Number(r.createdAt) > cutoff) n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------
// Aggregate — the single object the dashboard consumes
// ---------------------------------------------------------------------

/**
 * Compute the full progress-dashboard stats payload (pure). Combines the
 * bank-derived distribution/totals with the event-log-derived streak,
 * accuracy, and activity series.
 * @param {Object} bank      word → record
 * @param {Object[]} events  exposure events
 * @param {Object[]} reviews review events
 * @param {Object} [opts] { now, days, tzOffsetMin }
 * @returns {Object}
 */
export function computeStats(bank = {}, events = [], reviews = [], opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const tz = opts.tzOffsetMin || 0;
  const days = Number.isFinite(opts.days) && opts.days > 0 ? Math.floor(opts.days) : STATS.ACTIVITY_DAYS;

  const records = Object.values(bank || {}).filter((r) => r && typeof r === "object");
  const dist = levelDistribution(bank);
  const tracked = records.length;
  const known = records.filter((r) => (r.level || 0) >= STOP_GLOSS_LEVEL).length;

  const streak = computeStreak(activeDays(events, reviews, tz), dayIndex(now, tz));
  const reviews_ = reviewAccuracy(reviews);
  const activity = activitySeries(events, reviews, { now, days, tzOffsetMin: tz });

  return {
    generatedAt: now,
    totals: {
      tracked,
      known,
      addedThisWeek: wordsAddedSince(bank, now, STATS.WEEK_DAYS),
      reviews: reviews_.total,
    },
    distribution: dist,
    streak,
    reviews: reviews_,
    activity,
  };
}
