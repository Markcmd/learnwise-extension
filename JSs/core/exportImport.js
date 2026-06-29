// =====================================================================
// Export / import — back up and restore the word bank (pure)
// ---------------------------------------------------------------------
// Export wraps the word bank in a small self-describing envelope so an
// import can recognise it (and old raw-bank dumps still work). Import
// MERGES into the existing bank by `updatedAt` — the newer record wins —
// so restoring on another device never clobbers fresher local progress.
// Decks aren't serialized: they're derived from frequency rank.
// All pure; the settings page (classic script) mirrors this logic.
// =====================================================================
import { normalizeWord } from "./wordbank.js";
import { CURRENT_SCHEMA_VERSION } from "./constants.js";

export const EXPORT_FORMAT = "learnwise-export";
export const EXPORT_VERSION = 1;

/**
 * Wrap a word bank in an export envelope (pure).
 * @param {Object} bank
 * @param {Object} [opts] { now, appVersion }
 */
export function buildExport(bank, opts = {}) {
  const wordbank = bank && typeof bank === "object" && !Array.isArray(bank) ? bank : {};
  return {
    format: EXPORT_FORMAT,
    exportVersion: EXPORT_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: Number.isFinite(opts.now) ? opts.now : Date.now(),
    appVersion: opts.appVersion || "",
    wordCount: Object.keys(wordbank).length,
    wordbank,
  };
}

/**
 * Pull the word bank out of parsed import data (pure).
 * Accepts a wrapped export ({wordbank}) or a raw bank map (legacy "Download").
 * Returns the bank object, or null if it isn't recognisable.
 */
export function extractBank(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  // Wrapped export.
  if (parsed.wordbank !== undefined) {
    const wb = parsed.wordbank;
    return wb && typeof wb === "object" && !Array.isArray(wb) ? wb : null;
  }
  // A wrapper that names a format but has no wordbank is malformed.
  if (parsed.format !== undefined) return null;

  // Otherwise treat the object itself as a raw bank map.
  return parsed;
}

/**
 * Parse import input (JSON string or already-parsed object) into a bank (pure).
 * Throws on invalid JSON or an unrecognised shape.
 */
export function parseImport(input) {
  const obj = typeof input === "string" ? JSON.parse(input) : input;
  const bank = extractBank(obj);
  if (!bank) throw new Error("Not a recognized LearnWise backup.");
  return bank;
}

/**
 * Merge an incoming bank into the current one by `updatedAt` (pure).
 * Newer record wins; ties and older incoming records are skipped. Invalid
 * incoming entries are skipped. Returns a NEW bank + stats (does not mutate).
 * @returns {{bank:Object, stats:{added:number, updated:number, skipped:number}}}
 */
export function mergeBank(current, incoming, now = Date.now()) {
  const out = {};
  const base = current && typeof current === "object" && !Array.isArray(current) ? current : {};
  for (const [k, v] of Object.entries(base)) {
    const key = normalizeWord(k);
    if (key) out[key] = v;
  }

  let added = 0;
  let updated = 0;
  let skipped = 0;

  const inc = incoming && typeof incoming === "object" && !Array.isArray(incoming) ? incoming : {};
  for (const [rawKey, rec] of Object.entries(inc)) {
    const key = normalizeWord(rawKey);
    if (!key || !rec || typeof rec !== "object" || Array.isArray(rec)) {
      skipped++;
      continue;
    }
    const existing = out[key];
    if (!existing) {
      out[key] = rec;
      added++;
      continue;
    }
    const a = Number(existing.updatedAt) || 0;
    const b = Number(rec.updatedAt) || 0;
    if (b > a) {
      out[key] = rec;
      updated++;
    } else {
      skipped++;
    }
  }

  return { bank: out, stats: { added, updated, skipped } };
}
