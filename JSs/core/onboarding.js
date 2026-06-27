// =====================================================================
// Onboarding — first-run vocabulary calibration (pure logic)
// ---------------------------------------------------------------------
// Instead of a hardcoded "known words" seed, we estimate the user's
// vocabulary with a short calibration test in the spirit of an academic
// Vocabulary Size Test: sample words from several frequency bands, ask
// which the user knows, then estimate total known vocabulary as the sum
// over bands of (known fraction in band × band size). We then seed every
// word up to that estimated rank as "known" so it isn't glossed.
//
// All functions here are pure and deterministic (the sampler takes a seed),
// which is what makes them unit-testable. The data list lives in
// JSs/data/frequencyWords.js (frequency-ordered).
// =====================================================================
import { normalizeWord } from "./wordbank.js";
import { CALIBRATION_BANDS, CALIBRATION_PER_BAND } from "./constants.js";

/** Small deterministic PRNG (mulberry32) so the test is reproducible per seed. */
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Even-ish band boundaries over a list of `total` words (pure).
 * @returns {Array<{start:number, end:number}>} end is exclusive
 */
export function bandBounds(total, bands = CALIBRATION_BANDS) {
  const n = Math.max(0, Math.floor(total) || 0);
  const b = Math.max(1, Math.floor(bands) || 1);
  const out = [];
  for (let i = 0; i < b; i++) {
    out.push({
      start: Math.floor((i * n) / b),
      end: Math.floor(((i + 1) * n) / b),
    });
  }
  return out;
}

/**
 * Build a calibration test: sample `perBand` words from each frequency band (pure).
 * @param {string[]} words frequency-ordered list (index 0 = most common)
 * @param {Object} [opts] { bands, perBand, seed }
 * @returns {Array<{word:string, band:number, rank:number}>}
 */
export function buildCalibrationTest(words, opts = {}) {
  const list = Array.isArray(words) ? words : [];
  const bands = opts.bands || CALIBRATION_BANDS;
  const perBand = opts.perBand || CALIBRATION_PER_BAND;
  const rng = makeRng(opts.seed ?? 1);

  const bounds = bandBounds(list.length, bands);
  const items = [];
  for (let bi = 0; bi < bounds.length; bi++) {
    const { start, end } = bounds[bi];
    const span = end - start;
    if (span <= 0) continue;

    const picks = new Set();
    const want = Math.min(perBand, span);
    let guard = 0;
    while (picks.size < want && guard++ < span * 5) {
      picks.add(start + Math.floor(rng() * span));
    }
    for (const idx of [...picks].sort((a, b) => a - b)) {
      const w = normalizeWord(list[idx]);
      if (w) items.push({ word: w, band: bi, rank: idx + 1 });
    }
  }
  return items;
}

/**
 * Estimate vocabulary size from calibration answers (pure).
 * For each band: knownFraction = known / sampled; estimated += fraction × bandSize.
 * @param {Array<{band:number, known:boolean}>} results
 * @param {number} totalWords size of the frequency list
 * @param {Object} [opts] { bands }
 * @returns {{estimatedVocab:number, perBand:Array<{band:number, known:number, sampled:number, size:number}>}}
 */
export function estimateVocabulary(results, totalWords, opts = {}) {
  const bands = opts.bands || CALIBRATION_BANDS;
  const bounds = bandBounds(totalWords, bands);

  const tally = bounds.map((b, i) => ({
    band: i,
    known: 0,
    sampled: 0,
    size: b.end - b.start,
  }));

  for (const r of results || []) {
    const t = tally[r?.band];
    if (!t) continue;
    t.sampled += 1;
    if (r.known) t.known += 1;
  }

  let estimatedVocab = 0;
  for (const t of tally) {
    if (t.sampled > 0) estimatedVocab += (t.known / t.sampled) * t.size;
  }
  return { estimatedVocab: Math.round(estimatedVocab), perBand: tally };
}

/**
 * Build the known-words seed: every word up to the estimated rank becomes a
 * tracked, fully-known record so it is never glossed (pure).
 * @param {string[]} words frequency-ordered list
 * @param {number} estimatedVocab how many top words to mark known
 * @returns {Record<string, {level:number, source:string, readCount:number}>}
 *          shaped for wordbank.insertWords
 */
export function buildKnownSeed(words, estimatedVocab) {
  const list = Array.isArray(words) ? words : [];
  const n = Math.max(0, Math.min(Math.floor(estimatedVocab) || 0, list.length));
  const seed = {};
  for (let i = 0; i < n; i++) {
    const w = normalizeWord(list[i]);
    if (w && !seed[w]) {
      seed[w] = { level: 100, source: "onboarding", readCount: 0 };
    }
  }
  return seed;
}
