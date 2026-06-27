// =====================================================================
// Familiarity — derive a word's level from its exposure events (pure)
// ---------------------------------------------------------------------
// "Store facts, derive scores" (DESIGN.md §1): `level` is a cached value
// computed from the raw exposure log, never the source of truth. Because
// we keep the events, the formula can be retuned later and every word's
// level recomputed — no data migration required.
//
// Model (intentionally simple, per PLAN §7 — exposures + recency):
//   • each exposure contributes a recency weight that halves every
//     HALF_LIFE_DAYS, so recent reading counts more than stale reading;
//   • accumulated weight maps to 0–100 through a saturating curve, so the
//     level rises fast at first and slows as a word becomes familiar;
//   • a "clicked_known" event is the user asserting mastery → pin to max.
// This is pure and deterministic, which is exactly why it's unit-tested.
// =====================================================================
import { deriveStatus, normalizeWord } from "./wordbank.js";
import { FAMILIARITY } from "./constants.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Recency weight of an event of the given age (pure).
 * 1.0 for a just-now (or future-dated) event, halving every halfLifeDays.
 * @param {number} ageMs  now - event.ts
 * @param {number} [halfLifeDays]
 * @returns {number} weight in (0, 1]
 */
export function recencyWeight(ageMs, halfLifeDays = FAMILIARITY.HALF_LIFE_DAYS) {
  const ageDays = Math.max(0, Number(ageMs) || 0) / DAY_MS;
  const hl = halfLifeDays > 0 ? halfLifeDays : FAMILIARITY.HALF_LIFE_DAYS;
  return Math.pow(0.5, ageDays / hl);
}

/**
 * Compute a familiarity level (0–100, integer) from a word's exposure
 * events (pure).
 * @param {Object[]} events  exposure events ({ ts, action })
 * @param {number} [now]
 * @param {Object} [opts] { halfLifeDays, saturation }
 * @returns {number}
 */
export function computeFamiliarity(events, now = Date.now(), opts = {}) {
  const list = Array.isArray(events) ? events : [];
  if (!list.length) return 0;

  // An explicit "I know this" click pins the word at the top.
  if (list.some((e) => e && e.action === "clicked_known")) {
    return FAMILIARITY.CLICKED_KNOWN_LEVEL;
  }

  const halfLife = opts.halfLifeDays ?? FAMILIARITY.HALF_LIFE_DAYS;
  const saturation = opts.saturation ?? FAMILIARITY.SATURATION;

  let weighted = 0;
  for (const e of list) {
    const ts = Number(e?.ts);
    if (!Number.isFinite(ts)) continue;
    weighted += recencyWeight(now - ts, halfLife);
  }
  if (weighted <= 0) return 0;

  const level = 100 * (1 - Math.exp(-saturation * weighted));
  return Math.max(0, Math.min(100, Math.round(level)));
}

/** Convenience alias for a single word's events. */
export function deriveLevelForWord(events, now = Date.now(), opts = {}) {
  return computeFamiliarity(events, now, opts);
}

/**
 * Recompute levels for many words at once (pure).
 * @param {Record<string, Object[]>} eventsByWord
 * @returns {Record<string, number>} word → level
 */
export function recomputeLevels(eventsByWord = {}, now = Date.now(), opts = {}) {
  const out = {};
  for (const [rawWord, events] of Object.entries(eventsByWord || {})) {
    const key = normalizeWord(rawWord);
    if (!key) continue;
    out[key] = computeFamiliarity(events, now, opts);
  }
  return out;
}

/**
 * Write derived levels back onto the cached bank records (pure).
 * Updates `level` + `status` (and `updatedAt`) only for words already
 * tracked in the bank; untracked words are ignored (promotion owns those).
 * Mutates and returns `bank`.
 * @param {Object} bank
 * @param {Record<string, number>} levels  word → level
 * @param {number} [now]
 */
export function applyDerivedLevels(bank, levels = {}, now = Date.now()) {
  for (const [rawWord, levelRaw] of Object.entries(levels || {})) {
    const key = normalizeWord(rawWord);
    const entry = bank[key];
    if (!entry || typeof entry !== "object") continue;
    const level = Math.max(0, Math.min(100, Math.round(Number(levelRaw) || 0)));
    if (entry.level === level) continue; // no-op: don't churn updatedAt
    entry.level = level;
    entry.status = deriveStatus(level);
    entry.updatedAt = now;
  }
  return bank;
}
