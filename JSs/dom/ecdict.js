// =====================================================================
// ECDICT local dictionary loader (I/O glue)
// ---------------------------------------------------------------------
// Loads bundled offline dictionary shards on demand and caches them for
// the content-script lifetime. This is the "local" translation backend.
// =====================================================================

/** shard key -> Map(word -> entry). Lives for the content-script lifetime. */
const ECDICT_CACHE = new Map();

/** First-letter shard bucket for a word. */
export function shardKeyFromWord(word) {
  const c = (word?.[0] || "").toLowerCase();
  if (c >= "a" && c <= "z") return c;
  if (c >= "0" && c <= "9") return "0-9";
  return "other";
}

/** Load (and cache) a shard's word→entry map. */
export async function loadEcdictShard(shard) {
  if (ECDICT_CACHE.has(shard)) return ECDICT_CACHE.get(shard);

  const url = chrome.runtime.getURL(`ecdict_json/${shard}.json`);
  let map = new Map();
  try {
    const res = await fetch(url);
    if (res.ok) {
      const arr = await res.json(); // [{ w, p, t }, ...]
      if (Array.isArray(arr)) {
        for (const it of arr) {
          const w = (it?.w || "").toLowerCase();
          if (w) map.set(w, it);
        }
      }
    }
  } catch (_e) {
    // Network/parse failure → cache empty map to avoid retry storms.
  }
  ECDICT_CACHE.set(shard, map);
  return map;
}

/** Return the ECDICT entry `{w,p,t}` for a word, or null. */
export async function wordExistsInEcdict(word) {
  const key = String(word || "").trim().toLowerCase();
  if (!key) return null;
  const shardMap = await loadEcdictShard(shardKeyFromWord(key));
  return shardMap.get(key) || null;
}

/**
 * Translate words via the local ECDICT dictionary.
 * @param {string[]} words lowercased
 * @returns {Promise<Record<string,{meaning:string,pronunciation:string}>>}
 */
export async function fetchTranslationFromLocalDictionary(words) {
  const out = {};
  const arr = Array.isArray(words) ? words : [];
  for (const raw of arr) {
    const key = String(raw || "").trim().toLowerCase();
    if (!key || out[key]) continue;
    const entry = await wordExistsInEcdict(key);
    out[key] = entry
      ? { meaning: entry.t || "", pronunciation: entry.p || "" }
      : { meaning: "", pronunciation: "" };
  }
  return out;
}
