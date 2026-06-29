// =====================================================================
// SRS scheduler — Leitner boxes + SM-2 ease (pure, deterministic)
// ---------------------------------------------------------------------
// "Store facts, derive scores" (DESIGN.md §1): the schedule lives in each
// Word's `srs` sub-object and is computed by pure functions, so a card's
// next review is reproducible and unit-testable — no chrome.*, no DOM.
//
// Model (PLAN §6 "Review & audio", DESIGN.md SRS block):
//   • a card sits in a Leitner box 1..BOXES; each box has a base interval
//     in days (LEITNER.INTERVALS_DAYS). Higher box → longer interval.
//   • grading a card moves it along the ladder:
//       again → reset to box 1, due again this session (re-show)
//       hard  → stay in box, shorter (fractional) interval
//       good  → up one box, the new box's base interval
//       easy  → up two boxes, a longer interval (ease bonus)
//   • the SM-2 `ease` factor is a per-word multiplier that again/hard
//     shrink and easy grows (clamped to [MIN_EASE, MAX_EASE]); it scales
//     the good/easy interval so the schedule personalises over time.
// Pure functions return NEW srs objects; the *Word helpers at the bottom
// mutate a bank record for convenience (mirrors wordbank.js style).
// =====================================================================
import { LEITNER, GRADES, STOP_GLOSS_LEVEL } from "./constants.js";
import { defaultSrs as bankDefaultSrs, normalizeWord } from "./wordbank.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Re-export the canonical default srs shape (defined in wordbank.js). */
export function defaultSrs() {
  return bankDefaultSrs();
}

/** Clamp the SM-2 ease factor into its allowed range. */
export function clampEase(ease) {
  const e = Number(ease);
  if (!Number.isFinite(e)) return LEITNER.DEFAULT_EASE;
  return Math.max(LEITNER.MIN_EASE, Math.min(LEITNER.MAX_EASE, e));
}

/** Clamp a box number into [1, BOXES]. */
export function clampBox(box) {
  const b = Math.round(Number(box));
  if (!Number.isFinite(b)) return 1;
  return Math.max(1, Math.min(LEITNER.BOXES, b));
}

/**
 * Return a complete, range-checked srs object, filling any missing fields
 * from the default and clamping box/ease (pure — returns a new object).
 */
export function normalizeSrs(srs) {
  const base = defaultSrs();
  const s = srs && typeof srs === "object" ? srs : {};
  return {
    box: clampBox(s.box ?? base.box),
    ease: clampEase(s.ease ?? base.ease),
    interval: Number.isFinite(Number(s.interval)) ? Number(s.interval) : base.interval,
    reps: Number.isFinite(Number(s.reps)) ? Number(s.reps) : base.reps,
    nextReviewAt: Number.isFinite(Number(s.nextReviewAt)) ? Number(s.nextReviewAt) : base.nextReviewAt,
    lastResult: s.lastResult ?? base.lastResult,
    lastReviewedAt: Number.isFinite(Number(s.lastReviewedAt)) ? Number(s.lastReviewedAt) : base.lastReviewedAt,
  };
}

/** Base interval (days) for a Leitner box (clamped). */
export function intervalForBox(box) {
  return LEITNER.INTERVALS_DAYS[clampBox(box)];
}

/**
 * Bring a word into the review system without grading it (pure). Used the
 * first time a learned word becomes review-eligible: it stays in box 1 and
 * (by default) becomes due after the box-1 interval. reps/lastReviewedAt stay
 * 0 (it hasn't been recalled yet). Returns a new srs object.
 * @param {Object} srs
 * @param {number} [now]
 * @param {Object} [opts] { dueNow } — if true, the card is due immediately
 *   (used when seeding a queue so the first review can happen right away).
 */
export function seedReview(srs, now = Date.now(), opts = {}) {
  const s = normalizeSrs(srs);
  const interval = LEITNER.INTERVALS_DAYS[1];
  return {
    ...s,
    box: 1,
    interval,
    nextReviewAt: opts.dueNow ? now : now + interval * DAY_MS,
  };
}

/**
 * Is a word-bank entry eligible to enter the review system (pure)? We review
 * words the user is actively learning: tracked, not yet "known", and not
 * "ignored". Brand-new seeded "known" words (level ≥ stop) are skipped.
 */
export function isReviewEligible(entry, stopLevel = STOP_GLOSS_LEVEL) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.status === "known" || entry.status === "ignored") return false;
  const level = Number(entry.level);
  if (Number.isFinite(level) && level >= stopLevel) return false;
  return true;
}

/** True if an srs has never been scheduled into the review system. */
export function isUnscheduled(srs) {
  const s = srs && typeof srs === "object" ? srs : {};
  return !(Number(s.nextReviewAt) > 0) && !(Number(s.lastReviewedAt) > 0);
}

/**
 * Seed every review-eligible, not-yet-scheduled word in the bank into the
 * review system, due immediately (mutates + returns the seeded word keys).
 * Lets a brand-new user start reviewing learned words right away; thereafter
 * the Leitner schedule (schedule()) spaces them out.
 * @returns {string[]} the words that were newly seeded
 */
export function seedNewReviews(bank, now = Date.now()) {
  const seeded = [];
  for (const [rawWord, entry] of Object.entries(bank || {})) {
    if (!isReviewEligible(entry)) continue;
    if (!isUnscheduled(entry.srs)) continue;
    entry.srs = seedReview(entry.srs, now, { dueNow: true });
    entry.updatedAt = now;
    seeded.push(normalizeWord(rawWord));
  }
  return seeded;
}

/**
 * Apply a review grade to an srs state and return the NEW srs (pure).
 * @param {Object} srs   current srs (any subset; normalized internally)
 * @param {"again"|"hard"|"good"|"easy"} grade
 * @param {number} [now]
 * @returns {Object} new srs
 */
export function schedule(srs, grade, now = Date.now()) {
  if (!GRADES.includes(grade)) {
    throw new Error(`srs.schedule: unknown grade "${grade}"`);
  }
  const s = normalizeSrs(srs);
  const ease = clampEase(s.ease + LEITNER.EASE_DELTA[grade]);
  const easeFactor = ease / LEITNER.DEFAULT_EASE;

  let box;
  let interval; // days
  let reps;

  switch (grade) {
    case "again":
      box = 1;
      interval = LEITNER.AGAIN_INTERVAL_DAYS; // re-show this session
      reps = 0;
      break;
    case "hard":
      box = clampBox(s.box); // stays put
      interval = Math.max(1, Math.round(intervalForBox(box) * LEITNER.HARD_INTERVAL_FACTOR));
      reps = s.reps + 1;
      break;
    case "good":
      box = clampBox(s.box + 1);
      interval = Math.round(intervalForBox(box) * easeFactor);
      reps = s.reps + 1;
      break;
    case "easy":
      box = clampBox(s.box + 2);
      interval = Math.round(intervalForBox(box) * easeFactor);
      reps = s.reps + 1;
      break;
  }

  return {
    box,
    ease,
    interval,
    reps,
    nextReviewAt: now + interval * DAY_MS,
    lastResult: grade,
    lastReviewedAt: now,
  };
}

/**
 * Is this card due for review at `now`? A card that has never been scheduled
 * (nextReviewAt 0) is NOT due — it hasn't entered the review system yet.
 */
export function isDue(srs, now = Date.now()) {
  const s = srs && typeof srs === "object" ? srs : null;
  if (!s) return false;
  const next = Number(s.nextReviewAt);
  if (!Number.isFinite(next) || next <= 0) return false;
  return next <= now;
}

/**
 * Words in the bank that are due for review at `now`, sorted by nextReviewAt
 * ascending (most overdue first). Returns word keys (pure).
 */
export function dueWords(bank, now = Date.now()) {
  const out = [];
  for (const [rawWord, entry] of Object.entries(bank || {})) {
    if (!entry || typeof entry !== "object") continue;
    if (!isDue(entry.srs, now)) continue;
    out.push([normalizeWord(rawWord), Number(entry.srs.nextReviewAt)]);
  }
  out.sort((a, b) => a[1] - b[1]);
  return out.map(([w]) => w);
}

/** How many words are due for review at `now`. */
export function countDue(bank, now = Date.now()) {
  let n = 0;
  for (const entry of Object.values(bank || {})) {
    if (entry && typeof entry === "object" && isDue(entry.srs, now)) n++;
  }
  return n;
}

/**
 * Grade a tracked word in the bank: replace its srs with the scheduled next
 * state and refresh updatedAt (mutates + returns bank, like applyExposures).
 * No-op for untracked words. The caller logs the review event (M2.2).
 */
export function gradeWord(bank, word, grade, now = Date.now()) {
  const key = normalizeWord(word);
  const entry = bank ? bank[key] : null;
  if (!entry || typeof entry !== "object") return bank;
  entry.srs = schedule(entry.srs, grade, now);
  entry.updatedAt = now;
  return bank;
}
