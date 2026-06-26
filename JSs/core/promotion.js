// =====================================================================
// Word-promotion rule (pure) + sighting counter IO
// ---------------------------------------------------------------------
// A word is glossed on its 1st sighting but only promoted to a tracked
// Word record on its Nth (default 2). This filters one-off junk (names,
// typos, code) and keeps the bank small. We keep a lightweight per-word
// sighting counter in storage.local; the full event log arrives in M1.
// =====================================================================
import { getLocal, setLocal } from "./storage.js";
import { normalizeWord } from "./wordbank.js";
import { STORAGE_KEYS, DEFAULT_PROMOTION_THRESHOLD } from "./constants.js";

/**
 * Record sightings of as-yet-untracked words and decide which to promote (pure).
 * Increments each word's counter; a word whose count reaches the threshold is
 * promoted and removed from the counter (it now lives in the bank).
 * @param {Object} sightings  current { word: count }
 * @param {Iterable<string>} unknownWords  words seen this pass that aren't tracked
 * @param {number} [threshold]
 * @returns {{sightings:Object, promoted:string[]}}
 */
export function recordSightings(sightings, unknownWords, threshold = DEFAULT_PROMOTION_THRESHOLD) {
  const counts = sightings && typeof sightings === "object" ? { ...sightings } : {};
  const t = Number.isFinite(threshold) && threshold >= 1 ? Math.floor(threshold) : DEFAULT_PROMOTION_THRESHOLD;

  // One sighting per word per pass: dedupe the input so repeated occurrences
  // in a single viewport don't over-count.
  const unique = new Set();
  for (const raw of unknownWords || []) {
    const key = normalizeWord(raw);
    if (key) unique.add(key);
  }

  const promoted = [];
  for (const key of unique) {
    const next = (counts[key] || 0) + 1;
    if (next >= t) {
      promoted.push(key);
      delete counts[key]; // promoted → tracked in bank, stop counting
    } else {
      counts[key] = next;
    }
  }
  return { sightings: counts, promoted };
}

// ---------------------------------------------------------------------
// IO wrappers
// ---------------------------------------------------------------------

/** Read the sighting counter map. */
export async function getSightings() {
  const res = await getLocal([STORAGE_KEYS.SIGHTINGS]);
  const s = res[STORAGE_KEYS.SIGHTINGS];
  return s && typeof s === "object" && !Array.isArray(s) ? s : {};
}

/** Persist the sighting counter map. */
export async function setSightings(sightings) {
  await setLocal({ [STORAGE_KEYS.SIGHTINGS]: sightings || {} });
}

/** Read the configurable promotion threshold (default 2). */
export async function getPromotionThreshold() {
  const res = await getLocal([STORAGE_KEYS.PROMOTION_THRESHOLD]);
  const n = Number(res[STORAGE_KEYS.PROMOTION_THRESHOLD]);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_PROMOTION_THRESHOLD;
}
