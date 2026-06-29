// =====================================================================
// Event log — exposure (+ review) events, the source of truth
// ---------------------------------------------------------------------
// "Store facts, derive scores" (DESIGN.md §1): we record raw exposure
// events and compute familiarity from them, rather than mutating a level.
// The pure builders/queries below have no IndexedDB or DOM; the IO
// wrappers at the bottom persist via the idb.js wrapper. Keeping the
// logic pure is what makes it unit-testable.
// =====================================================================
import { normalizeWord } from "./wordbank.js";
import { IDB, EXPOSURE_ACTIONS, MAX_SENTENCE_LEN, GRADES, GRADE_QUALITY } from "./constants.js";
import { addAll, getAll, getAllByIndex, count, deleteKeys } from "./idb.js";

// ---------------------------------------------------------------------
// Pure builders / helpers
// ---------------------------------------------------------------------

/** Extract a hostname from a URL string (pure). "" if unparseable. */
export function hostnameFromUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  try {
    return new URL(s).hostname.toLowerCase();
  } catch (_e) {
    return "";
  }
}

/** Clamp a context sentence to a bounded, trimmed string (pure). */
export function clampSentence(sentence, max = MAX_SENTENCE_LEN) {
  const s = String(sentence || "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Apply the privacy rule to a location (pure): domain-only by default,
 * full URL only when the user has opted in.
 * @returns {{domain:string, url:string}}
 */
export function locationForEvent({ url = "", domain = "" } = {}, captureFullUrl = false) {
  const host = domain ? String(domain).toLowerCase() : hostnameFromUrl(url);
  return {
    domain: host,
    url: captureFullUrl ? String(url || "") : "",
  };
}

/**
 * Build a normalized, validated exposure event (pure).
 * Returns null for an unusable event (no word / bad action) so callers can
 * filter junk before it reaches the log.
 * @param {Object} input { word, ts?, domain?, url?, sentence?, action? }
 * @param {number} [now]
 */
export function makeExposureEvent(input = {}, now = Date.now()) {
  const word = normalizeWord(input.word);
  if (!word) return null;

  const action = EXPOSURE_ACTIONS.includes(input.action) ? input.action : "seen";
  const ts = Number.isFinite(input.ts) ? input.ts : now;

  return {
    word,
    ts,
    domain: String(input.domain || "").toLowerCase(),
    url: String(input.url || ""),
    sentence: clampSentence(input.sentence),
    action,
  };
}

/**
 * Build many exposure events for one location/context in a single pass (pure).
 * One event per distinct word; junk words are dropped.
 * @param {Iterable<string>} words
 * @param {Object} ctx { domain?, url?, sentence?, action? }
 * @param {number} [now]
 * @returns {Object[]}
 */
export function buildExposureEvents(words, ctx = {}, now = Date.now()) {
  const out = [];
  const seen = new Set();
  for (const raw of words || []) {
    const key = normalizeWord(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const ev = makeExposureEvent({ ...ctx, word: key }, now);
    if (ev) out.push(ev);
  }
  return out;
}

/**
 * Build a normalized, validated review event (pure) — the record of one
 * graded review (DESIGN.md REVIEW_EVENT). Returns null for unusable input
 * (no word / bad grade). The grade is mapped to an SM-2 quality (0–5) and we
 * also persist the resulting interval/box so review history is self-describing.
 * @param {Object} input { word, grade, intervalAfter?, box?, ts? }
 * @param {number} [now]
 */
export function makeReviewEvent(input = {}, now = Date.now()) {
  const word = normalizeWord(input.word);
  if (!word) return null;
  if (!GRADES.includes(input.grade)) return null;

  const ts = Number.isFinite(input.ts) ? input.ts : now;
  const intervalAfter = Number.isFinite(input.intervalAfter) ? input.intervalAfter : 0;
  const box = Number.isFinite(input.box) ? input.box : 0;

  return {
    word,
    ts,
    grade: input.grade,
    quality: GRADE_QUALITY[input.grade],
    intervalAfter,
    box,
  };
}

/** Group a flat list of events by their word (pure). */
export function groupEventsByWord(events) {
  const out = {};
  for (const ev of events || []) {
    const key = normalizeWord(ev?.word);
    if (!key) continue;
    (out[key] || (out[key] = [])).push(ev);
  }
  return out;
}

// ---------------------------------------------------------------------
// IO wrappers (IndexedDB) — the only impure parts
// ---------------------------------------------------------------------

/**
 * Append exposure events to the log. Accepts already-built events or raw
 * inputs (which are normalized via makeExposureEvent). Returns the count
 * actually written.
 */
export async function appendExposures(events, now = Date.now()) {
  const normalized = [];
  for (const e of events || []) {
    const ev = e && Number.isFinite(e.ts) && EXPOSURE_ACTIONS.includes(e.action) && e.word
      ? e // already a built event
      : makeExposureEvent(e, now);
    if (ev) normalized.push(ev);
  }
  if (!normalized.length) return 0;
  await addAll(IDB.STORES.EVENTS, normalized);
  return normalized.length;
}

/** Append a single exposure event; resolves to the count written (0 or 1). */
export async function appendExposure(input, now = Date.now()) {
  return appendExposures([input], now);
}

/** All exposure events for one word, oldest-first. */
export async function getEventsForWord(word) {
  const key = normalizeWord(word);
  if (!key) return [];
  const rows = await getAllByIndex(IDB.STORES.EVENTS, "word", key);
  return rows.sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

/** Every exposure event, grouped by word — used to recompute familiarity. */
export async function getAllEventsByWord() {
  const rows = await getAll(IDB.STORES.EVENTS);
  return groupEventsByWord(rows);
}

/** Every exposure event as a flat list — used by the progress dashboard (M3.2). */
export async function getAllExposures() {
  return getAll(IDB.STORES.EVENTS);
}

/** Exposure events at or after a timestamp (uses the ts index). */
export async function getEventsSince(sinceTs) {
  const lower = Number.isFinite(sinceTs) ? sinceTs : 0;
  const range = IDBKeyRange.lowerBound(lower);
  return getAllByIndex(IDB.STORES.EVENTS, "ts", range);
}

/** Exposure events strictly before a timestamp (uses the ts index) — used by pruning. */
export async function getEventsBefore(beforeTs) {
  const upper = Number.isFinite(beforeTs) ? beforeTs : 0;
  const range = IDBKeyRange.upperBound(upper, true); // exclusive
  return getAllByIndex(IDB.STORES.EVENTS, "ts", range);
}

/** Total number of stored exposure events. */
export async function countEvents() {
  return count(IDB.STORES.EVENTS);
}

/**
 * Delete every exposure event for a word (IO). Used when demoting a word so its
 * derived familiarity restarts (otherwise an old clicked_known event re-pins it).
 * @returns {Promise<number>} how many events were removed
 */
export async function deleteEventsForWord(word) {
  const key = normalizeWord(word);
  if (!key) return 0;
  const rows = await getAllByIndex(IDB.STORES.EVENTS, "word", key);
  const ids = rows.map((r) => r.id).filter((id) => id != null);
  if (ids.length) await deleteKeys(IDB.STORES.EVENTS, ids);
  return ids.length;
}

// ---------------------------------------------------------------------
// Review events (IndexedDB "reviews" store) — written by the M2 review UI
// ---------------------------------------------------------------------

/**
 * Append review events to the log. Accepts built events or raw inputs (which
 * are normalized via makeReviewEvent). Returns the count actually written.
 */
export async function appendReviews(events, now = Date.now()) {
  const normalized = [];
  for (const e of events || []) {
    const ev = e && Number.isFinite(e.ts) && GRADES.includes(e.grade) && e.word
      ? e // already a built event
      : makeReviewEvent(e, now);
    if (ev) normalized.push(ev);
  }
  if (!normalized.length) return 0;
  await addAll(IDB.STORES.REVIEWS, normalized);
  return normalized.length;
}

/** Append a single review event; resolves to the count written (0 or 1). */
export async function appendReview(input, now = Date.now()) {
  return appendReviews([input], now);
}

/** All review events for one word, oldest-first. */
export async function getReviewsForWord(word) {
  const key = normalizeWord(word);
  if (!key) return [];
  const rows = await getAllByIndex(IDB.STORES.REVIEWS, "word", key);
  return rows.sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

/** Every review event as a flat list — used by the progress dashboard (M3.2). */
export async function getAllReviews() {
  return getAll(IDB.STORES.REVIEWS);
}

/** Total number of stored review events. */
export async function countReviews() {
  return count(IDB.STORES.REVIEWS);
}
