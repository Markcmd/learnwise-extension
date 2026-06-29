// =====================================================================
// Decks — grouping word records into named decks (pure CRUD + IO)
// ---------------------------------------------------------------------
// A deck is metadata { id, name, createdAt, updatedAt } kept in a map in
// chrome.storage.local. Membership is NOT stored on the deck — it lives on
// each Word as `tags: [deckId, …]` (DESIGN.md WORD }o--o{ DECK). That keeps
// decks cheap to rename/delete and lets a word belong to several decks.
//
// Everything here is pure (no chrome.*) except the getDecks/setDecks IO at
// the bottom, so the CRUD + assignment logic is unit-testable.
// =====================================================================
import { getLocal, setLocal } from "./storage.js";
import { STORAGE_KEYS } from "./constants.js";
import { normalizeWord } from "./wordbank.js";

/** Collapse whitespace + trim a deck name. */
export function normalizeDeckName(name) {
  return String(name ?? "").replace(/\s+/g, " ").trim();
}

/** Generate a reasonably-unique deck id (suffix injectable for tests). */
export function makeDeckId(now = Date.now(), suffix) {
  const s = suffix != null ? String(suffix) : Math.random().toString(36).slice(2, 8);
  return `d${Number(now).toString(36)}${s}`;
}

// ---------------------------------------------------------------------
// Deck CRUD (operate on the decks map; mutate + return)
// ---------------------------------------------------------------------

/**
 * Create a deck (pure). Empty names are ignored; a case-insensitive
 * name clash returns the existing deck instead of duplicating.
 * @returns {{decks:Object, deck:Object|null}}
 */
export function createDeck(decks, name, now = Date.now(), opts = {}) {
  const map = decks && typeof decks === "object" ? decks : {};
  const nm = normalizeDeckName(name);
  if (!nm) return { decks: map, deck: null };

  const existing = Object.values(map).find(
    (d) => d && normalizeDeckName(d.name).toLowerCase() === nm.toLowerCase()
  );
  if (existing) return { decks: map, deck: existing };

  const id = opts.id || makeDeckId(now, opts.suffix);
  const deck = { id, name: nm, createdAt: now, updatedAt: now };
  map[id] = deck;
  return { decks: map, deck };
}

/** Rename a deck (pure). No-op for unknown id / empty name. */
export function renameDeck(decks, id, name, now = Date.now()) {
  const deck = decks ? decks[id] : null;
  if (!deck) return decks;
  const nm = normalizeDeckName(name);
  if (!nm) return decks;
  deck.name = nm;
  deck.updatedAt = now;
  return decks;
}

/** Delete a deck (pure). Does NOT touch word tags — call removeDeckFromAllWords. */
export function deleteDeck(decks, id) {
  if (decks && decks[id]) delete decks[id];
  return decks;
}

/** Decks as an array, sorted by name (pure). */
export function listDecks(decks) {
  return Object.values(decks || {})
    .filter((d) => d && d.id)
    .sort((a, b) => normalizeDeckName(a.name).localeCompare(normalizeDeckName(b.name)));
}

// ---------------------------------------------------------------------
// Word ↔ deck membership (operate on the word bank; mutate + return)
// ---------------------------------------------------------------------

/** A word's deck ids (pure, always an array). */
export function wordTags(entry) {
  return Array.isArray(entry?.tags) ? entry.tags : [];
}

/** Add a word to a deck (pure). No-op for untracked words / missing deckId. */
export function assignWordToDeck(bank, word, deckId, now = Date.now()) {
  const key = normalizeWord(word);
  const entry = bank ? bank[key] : null;
  if (!entry || typeof entry !== "object" || !deckId) return bank;
  if (!Array.isArray(entry.tags)) entry.tags = [];
  if (!entry.tags.includes(deckId)) {
    entry.tags.push(deckId);
    entry.updatedAt = now;
  }
  return bank;
}

/** Remove a word from a deck (pure). */
export function removeWordFromDeck(bank, word, deckId, now = Date.now()) {
  const key = normalizeWord(word);
  const entry = bank ? bank[key] : null;
  if (!entry || !Array.isArray(entry.tags)) return bank;
  const i = entry.tags.indexOf(deckId);
  if (i >= 0) {
    entry.tags.splice(i, 1);
    entry.updatedAt = now;
  }
  return bank;
}

/** Strip a deck id from every word (pure) — used when deleting a deck. */
export function removeDeckFromAllWords(bank, deckId, now = Date.now()) {
  for (const entry of Object.values(bank || {})) {
    if (entry && Array.isArray(entry.tags)) {
      const i = entry.tags.indexOf(deckId);
      if (i >= 0) {
        entry.tags.splice(i, 1);
        entry.updatedAt = now;
      }
    }
  }
  return bank;
}

/** Sorted word keys belonging to a deck (pure). */
export function wordsInDeck(bank, deckId) {
  const out = [];
  for (const [w, entry] of Object.entries(bank || {})) {
    if (entry && Array.isArray(entry.tags) && entry.tags.includes(deckId)) {
      out.push(normalizeWord(w));
    }
  }
  return out.sort();
}

/** Map of deckId → number of words tagged with it (pure). */
export function deckCounts(bank) {
  const counts = {};
  for (const entry of Object.values(bank || {})) {
    if (entry && Array.isArray(entry.tags)) {
      for (const t of entry.tags) counts[t] = (counts[t] || 0) + 1;
    }
  }
  return counts;
}

// ---------------------------------------------------------------------
// IO wrappers (chrome.storage.local) — the only impure parts
// ---------------------------------------------------------------------

/** Read the decks map (always returns an object). */
export async function getDecks() {
  const res = await getLocal([STORAGE_KEYS.DECKS]);
  const d = res[STORAGE_KEYS.DECKS];
  return d && typeof d === "object" && !Array.isArray(d) ? d : {};
}

/** Persist the decks map. */
export async function setDecks(decks) {
  await setLocal({ [STORAGE_KEYS.DECKS]: decks || {} });
}
