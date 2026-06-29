// =====================================================================
// Word bank — CRUD + transforms over the single source of truth
// ---------------------------------------------------------------------
// Pure transforms (no chrome.*, no DOM) take a `bank` object and return a
// result; the IO wrappers at the bottom load/save via the storage helper.
// Keeping the logic pure is what makes it unit-testable.
// =====================================================================
import { getLocal, setLocal } from "./storage.js";
import { STORAGE_KEYS, STOP_GLOSS_LEVEL, MAX_RECENT_CONTEXTS, DEMOTE_LEVEL, FAMILIARITY_TIERS } from "./constants.js";

/** Normalize a raw token into a word-bank key. */
export function normalizeWord(raw) {
  return String(raw ?? "").trim().toLowerCase();
}

/**
 * Derive a coarse status label from a familiarity level using the canonical
 * FAMILIARITY_TIERS rule (single source of truth in constants.js). Returns the
 * highest tier whose `min` the level meets: new | learning | familiar | known.
 * NOTE: "ignored" is a separate, user-set status and is never derived here.
 */
export function deriveStatus(level) {
  const n = Number(level) || 0;
  let key = FAMILIARITY_TIERS[0].key;
  for (const tier of FAMILIARITY_TIERS) {
    if (n >= tier.min) key = tier.key;
  }
  return key;
}

/** Default SRS sub-object (reserved now, used by the review feature in M2). */
export function defaultSrs() {
  return {
    box: 1,
    ease: 2.5,
    interval: 0,
    reps: 0,
    nextReviewAt: 0,
    lastResult: null,
    lastReviewedAt: 0,
  };
}

/**
 * Build a complete v1 Word record. All reserved fields are populated now so
 * later features (SRS, decks, contexts, sync) never require a data migration.
 * @param {string} word
 * @param {Object} [opts] meaning, pronunciation, level, readCount, source
 * @param {number} [now]
 */
export function createWordRecord(word, opts = {}, now = Date.now()) {
  const key = normalizeWord(word);
  const level = typeof opts.level === "number" ? opts.level : 1;
  return {
    word: key,
    meaning: opts.meaning || "",
    pronunciation: opts.pronunciation || "",
    level,
    status: deriveStatus(level),
    source: opts.source || "read",
    readCount: typeof opts.readCount === "number" ? opts.readCount : 1,
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
    srs: defaultSrs(),
    tags: [],
    recentContexts: [],
  };
}

/**
 * Split visible words into render buckets (pure).
 *  - in bank & level >= stopLevel  → noshow
 *  - in bank & level <  stopLevel  → show
 *  - not in bank                   → show + unknown
 * `show` always contains the `unknown` words (we gloss them on sight).
 * @param {Iterable<string>} visibleWords
 * @param {Object} bank
 * @param {number} [stopLevel]
 * @returns {{show:Set<string>, noshow:Set<string>, unknown:Set<string>}}
 */
export function splitWords(visibleWords, bank = {}, stopLevel = STOP_GLOSS_LEVEL) {
  const show = new Set();
  const noshow = new Set();
  const unknown = new Set();

  for (const raw of visibleWords || []) {
    const word = normalizeWord(raw);
    if (!word) continue;

    const entry = bank[word];
    if (entry && typeof entry === "object") {
      const level = Number(entry.level ?? 1);
      if (level >= stopLevel) noshow.add(word);
      else show.add(word);
    } else {
      show.add(word);
      unknown.add(word);
    }
  }
  return { show, noshow, unknown };
}

/**
 * Record a passive exposure for words ALREADY tracked in the bank (pure).
 * Bumps readCount + level (capped 100) and refreshes timestamps. Words not in
 * the bank are ignored — promotion handles first-time tracking.
 * Mutates and returns `bank` for convenience.
 */
export function applyExposures(bank, words, now = Date.now()) {
  for (const raw of words || []) {
    const key = normalizeWord(raw);
    if (!key) continue;
    const entry = bank[key];
    if (!entry || typeof entry !== "object") continue;

    entry.readCount = (entry.readCount || 0) + 1;
    entry.level = Math.min((entry.level || 1) + 0.5, 100);
    entry.status = deriveStatus(entry.level);
    entry.lastSeenAt = now;
    entry.updatedAt = now;
  }
  return bank;
}

/**
 * Insert new tracked records into the bank (pure). Existing entries are left
 * untouched (no clobbering meaning/level on re-sight).
 * @param {Object} bank
 * @param {Object} wordsToInsert  { word: { meaning, pronunciation, level, readCount, source } }
 * @param {number} [now]
 */
export function insertWords(bank, wordsToInsert, now = Date.now()) {
  const entries = wordsToInsert && typeof wordsToInsert === "object" ? wordsToInsert : {};
  for (const [rawWord, optsRaw] of Object.entries(entries)) {
    const key = normalizeWord(rawWord);
    if (!key) continue;
    if (bank[key]) continue; // never overwrite an existing record
    const opts = optsRaw && typeof optsRaw === "object" ? optsRaw : {};
    bank[key] = createWordRecord(key, opts, now);
  }
  return bank;
}

/** Mark a word as fully known (level 100). Creates a minimal record if absent (pure). */
export function markKnown(bank, word, now = Date.now()) {
  const key = normalizeWord(word);
  if (!key) return bank;
  const entry = bank[key];
  if (!entry || typeof entry !== "object") {
    bank[key] = createWordRecord(key, { level: 100, source: "manual" }, now);
  } else {
    entry.level = 100;
    entry.status = "known";
    entry.updatedAt = now;
    entry.lastSeenAt = now;
  }
  return bank;
}

/**
 * Demote a "known" word back into the glossing range (pure) — the user forgot
 * it and wants it checked again. Sets the level below STOP_GLOSS_LEVEL so it is
 * glossed, and status to "learning". The word record (meaning, readCount, etc.)
 * is preserved; the caller is responsible for clearing the word's events so the
 * derived familiarity actually restarts (a clicked_known event would re-pin it).
 * No-op for untracked words. Mutates and returns `bank`.
 */
export function demoteWord(bank, word, level = DEMOTE_LEVEL, now = Date.now()) {
  const key = normalizeWord(word);
  const entry = bank[key];
  if (!entry || typeof entry !== "object") return bank;
  const lvl = Math.max(1, Math.min(STOP_GLOSS_LEVEL - 1, Math.round(Number(level) || DEMOTE_LEVEL)));
  entry.level = lvl;
  entry.status = deriveStatus(lvl);
  entry.updatedAt = now;
  return bank;
}

/**
 * Edit a tracked word's user-facing fields (pure). Only `meaning` and
 * `pronunciation` are editable; strings are written as-is (trimmed), and
 * `updatedAt` is bumped so export/import + sync treat the edit as newest.
 * No-op for untracked words. Mutates and returns `bank`.
 */
export function editWord(bank, word, fields = {}, now = Date.now()) {
  const key = normalizeWord(word);
  const entry = bank ? bank[key] : null;
  if (!entry || typeof entry !== "object") return bank;
  let changed = false;
  if (typeof fields.meaning === "string") {
    entry.meaning = fields.meaning.trim();
    changed = true;
  }
  if (typeof fields.pronunciation === "string") {
    entry.pronunciation = fields.pronunciation.trim();
    changed = true;
  }
  if (changed) entry.updatedAt = now;
  return bank;
}

/**
 * Remove a word from the bank (pure). Caller is responsible for clearing the
 * word's events (done in the background via MSG.DELETE_WORD) so derived
 * familiarity doesn't resurrect it on the next pass. Mutates and returns `bank`.
 */
export function deleteWord(bank, word) {
  const key = normalizeWord(word);
  if (bank && key && bank[key]) delete bank[key];
  return bank;
}

/** Push a context snippet onto a tracked word, keeping only the most recent few (pure). */
export function addContext(bank, word, context, max = MAX_RECENT_CONTEXTS) {
  const key = normalizeWord(word);
  const entry = bank[key];
  if (!entry || typeof entry !== "object" || !context) return bank;
  if (!Array.isArray(entry.recentContexts)) entry.recentContexts = [];
  entry.recentContexts.push(context);
  if (entry.recentContexts.length > max) {
    entry.recentContexts = entry.recentContexts.slice(-max);
  }
  return bank;
}

// ---------------------------------------------------------------------
// IO wrappers (load / save via storage). These are the only impure parts.
// ---------------------------------------------------------------------

/** True if a valid (object, non-array) word bank exists in storage. */
export async function isWordBankExist() {
  const res = await getLocal([STORAGE_KEYS.WORDBANK]);
  const wb = res[STORAGE_KEYS.WORDBANK];
  return !!(wb && typeof wb === "object" && !Array.isArray(wb));
}

/** Read the word bank (always returns an object). */
export async function getWordBank() {
  const res = await getLocal([STORAGE_KEYS.WORDBANK]);
  const wb = res[STORAGE_KEYS.WORDBANK];
  return wb && typeof wb === "object" && !Array.isArray(wb) ? wb : {};
}

/** Persist the word bank. */
export async function setWordBank(bank) {
  await setLocal({ [STORAGE_KEYS.WORDBANK]: bank });
}

/** Initialize an empty word bank. */
export async function createEmptyWordBank() {
  await setWordBank({});
}
