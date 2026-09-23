// =====================================================================
// Translation caching + routing helpers (pure)
// ---------------------------------------------------------------------
// Rule: translate each word once, then reuse forever. Before any ECDICT /
// AI lookup we check the cached `meaning` on the bank record; only words
// without a cached meaning are looked up. The actual fetch (ECDICT shards,
// v2 的服务端翻译代理) is I/O glue and lives outside core/.
// 提示词与模型响应解析已随 BYOK 一起移出扩展 —— 它们属于 v2 后端的
// Edge Function（参考实现见 learnwise-backend/dev-notes/cost-measurement/translate_core.mjs）。
// =====================================================================
import { normalizeWord } from "./wordbank.js";
import { TRANSLATION_SOURCES } from "./constants.js";

/** True if a bank entry already has a usable cached meaning. */
export function hasCachedMeaning(entry) {
  return !!(entry && typeof entry === "object" && String(entry.meaning || "").trim());
}

/**
 * Of the words we want to show, which still need a meaning looked up? (pure)
 * Returns a de-duplicated array of words with no cached meaning in the bank.
 */
export function wordsNeedingTranslation(showWords, bank = {}) {
  const out = [];
  const seen = new Set();
  for (const raw of showWords || []) {
    const key = normalizeWord(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!hasCachedMeaning(bank[key])) out.push(key);
  }
  return out;
}

/**
 * Build the render dictionary for the show-set (pure):
 * prefer the bank's cached meaning, fall back to a freshly-fetched one.
 * @returns {Record<string,{meaning:string,pronunciation:string}>}
 */
export function buildShowDict(showWords, bank = {}, fetched = {}) {
  const out = {};
  for (const raw of showWords || []) {
    const key = normalizeWord(raw);
    if (!key || out[key]) continue;

    const entry = bank[key];
    if (hasCachedMeaning(entry)) {
      out[key] = {
        meaning: entry.meaning || "",
        pronunciation: entry.pronunciation || "",
      };
    } else {
      const f = fetched[key] || {};
      out[key] = {
        meaning: f.meaning || "",
        pronunciation: f.pronunciation || "",
      };
    }
  }
  return out;
}

/**
 * Cache freshly-fetched meanings onto tracked bank records (pure).
 * Only writes when the record currently lacks a meaning, so we never
 * overwrite a better/edited translation. Mutates and returns `bank`.
 */
export function mergeTranslationsIntoBank(bank, fetched = {}, now = Date.now()) {
  for (const [rawWord, data] of Object.entries(fetched)) {
    const key = normalizeWord(rawWord);
    const entry = bank[key];
    if (!entry || typeof entry !== "object") continue; // only cache onto tracked words
    const meaning = String(data?.meaning || "").trim();
    if (!meaning) continue;
    if (!String(entry.meaning || "").trim()) {
      entry.meaning = meaning;
      if (!entry.pronunciation && data?.pronunciation) {
        entry.pronunciation = data.pronunciation;
      }
      entry.updatedAt = now;
    }
  }
  return bank;
}

/**
 * Normalize the stored translation source; anything unknown → "local".
 * 旧值 "api" / "byok"（取消 BYOK 前的自带密钥模式）都归一成 "local"。
 */
export function normalizeSource(source) {
  if (source === "api" || source === "byok") return "local";
  return TRANSLATION_SOURCES.includes(source) ? source : "local";
}
