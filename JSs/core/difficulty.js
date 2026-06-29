// =====================================================================
// Difficulty — automatic word grouping by frequency rank (pure)
// ---------------------------------------------------------------------
// "Decks" in LearnWise are automatic: a word's difficulty is DERIVED from
// how common it is (its rank in the bundled frequency list), never set by
// the user. Deriving (rather than storing a deck membership) means the
// grouping is always correct and needs no migration — same spirit as the
// familiarity "store facts, derive scores" rule.
//
// Bands (by frequency rank; rank 1 = most common):
//   beginner      rank 1–600      the most common words
//   intermediate  rank 601–1200   common everyday words
//   advanced      rank 1201+      less common (but still listed) words
//   rare          not in the list uncommon / specialized / technical
// =====================================================================

/** Band definitions in display order. `maxRank` is the inclusive upper bound. */
export const DIFFICULTY_BANDS = [
  { key: "beginner", label: "Beginner", maxRank: 600 },
  { key: "intermediate", label: "Intermediate", maxRank: 1200 },
  { key: "advanced", label: "Advanced", maxRank: Infinity },
  { key: "rare", label: "Rare / specialized", maxRank: 0 },
];

/** Build a word→rank index from a frequency-ordered word list (pure). */
export function buildRankIndex(words) {
  const idx = new Map();
  const list = Array.isArray(words) ? words : [];
  for (let i = 0; i < list.length; i++) {
    const w = String(list[i] || "").trim().toLowerCase();
    if (w && !idx.has(w)) idx.set(w, i + 1); // rank is 1-based
  }
  return idx;
}

/** Frequency rank of a word (0 = not in the list), given a rank index (pure). */
export function rankOf(word, rankIndex) {
  const w = String(word || "").trim().toLowerCase();
  if (!w || !(rankIndex instanceof Map)) return 0;
  return rankIndex.get(w) || 0;
}

/** Difficulty band key for a frequency rank (pure). 0/unknown → "rare". */
export function bandForRank(rank) {
  const r = Number(rank) || 0;
  if (r <= 0) return "rare";
  if (r <= 600) return "beginner";
  if (r <= 1200) return "intermediate";
  return "advanced";
}

/** Difficulty band key for a word, given a rank index (pure). */
export function bandForWord(word, rankIndex) {
  return bandForRank(rankOf(word, rankIndex));
}

/** Human label for a band key (pure). */
export function bandLabel(key) {
  const b = DIFFICULTY_BANDS.find((x) => x.key === key);
  return b ? b.label : String(key || "");
}

/**
 * Group word records into difficulty bands (pure).
 * @param {Array<{word:string}>} records
 * @param {Map} rankIndex
 * @returns {Record<string, Array>} band key → records
 */
export function groupByDifficulty(records, rankIndex) {
  const out = { beginner: [], intermediate: [], advanced: [], rare: [] };
  for (const r of Array.isArray(records) ? records : []) {
    const key = bandForWord(r && r.word, rankIndex);
    out[key].push(r);
  }
  return out;
}
