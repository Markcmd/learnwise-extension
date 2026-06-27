// =====================================================================
// Translation caching + routing helpers (pure)
// ---------------------------------------------------------------------
// Rule: translate each word once, then reuse forever. Before any ECDICT /
// AI lookup we check the cached `meaning` on the bank record; only words
// without a cached meaning are looked up. The actual fetch (ECDICT shards,
// OpenAI) is I/O glue and lives outside core/.
// =====================================================================
import { normalizeWord } from "./wordbank.js";
import { TRANSLATION_SOURCES, TARGET_LANGUAGE } from "./constants.js";
import {
  getProvider,
  normalizeProvider,
  defaultModelFor,
  resolveChatUrl,
} from "./providers.js";

/** Anthropic Messages API version pin. */
const ANTHROPIC_VERSION = "2023-06-01";

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
 * Normalize the stored translation source; legacy "api" → "byok"; anything
 * unknown → "local".
 */
export function normalizeSource(source) {
  if (source === "api") return "byok"; // legacy value from before M1.4
  return TRANSLATION_SOURCES.includes(source) ? source : "local";
}

// =====================================================================
// BYO-key translation — PURE request/response/error helpers (provider-aware)
// ---------------------------------------------------------------------
// The actual network call is I/O glue (dom/llm.js, run in the background
// worker). Everything here is pure and unit-tested: key validation,
// request construction (OpenAI Chat Completions *and* Anthropic Messages
// shapes), response parsing, error classifying. Provider data lives in
// providers.js.
// =====================================================================

/**
 * Validate the FORMAT of an API key (pure). A cheap UX pre-check; the
 * authoritative check is the provider rejecting a bad key at call time.
 * Prefixes differ across providers, so we don't hard-require one. The
 * "custom" provider may legitimately need no key (e.g. a local model).
 * @param {string} key
 * @param {string} [providerId]
 * @returns {{valid:boolean, reason:string}}
 */
export function validateApiKey(key, providerId = "openai") {
  const k = String(key || "").trim();
  const isCustom = normalizeProvider(providerId) === "custom";
  if (!k) {
    return isCustom ? { valid: true, reason: "" } : { valid: false, reason: "No API key set." };
  }
  if (/\s/.test(k)) return { valid: false, reason: "API key must not contain spaces." };
  if (!isCustom && k.length < 20) return { valid: false, reason: "API key looks too short." };
  return { valid: true, reason: "" };
}

/**
 * Coerce a model to one supported by the provider (pure).
 * Preset providers fall back to their default; "custom" accepts any string.
 * @param {string} model
 * @param {string} [providerId]
 */
export function normalizeModel(model, providerId = "openai") {
  const id = normalizeProvider(providerId);
  const p = getProvider(id);
  if (id === "custom") return String(model || "").trim();
  return p.models.includes(model) ? model : defaultModelFor(id);
}

/** The shared system instruction (pure). */
export function buildSystemPrompt(targetLang = TARGET_LANGUAGE) {
  return (
    `You are a bilingual dictionary for an English-reading app. ` +
    `For each English word given, return its meaning in ${targetLang} and its IPA pronunciation. ` +
    `If a context sentence is provided, choose the sense that fits that context. ` +
    `Respond ONLY with a JSON object whose keys are the exact input words (lowercased) and whose ` +
    `values are objects {"meaning": string, "pronunciation": string}. No prose, no markdown.`
  );
}

/** The shared user content (word list + optional context) (pure). */
export function buildUserContent(words, sentence = "") {
  const list = (Array.isArray(words) ? words : []).map((w) => normalizeWord(w)).filter(Boolean);
  const parts = [`Words: ${JSON.stringify(list)}`];
  const s = String(sentence || "").trim();
  if (s) parts.push(`Context sentence: ${s}`);
  return parts.join("\n");
}

/**
 * Build chat messages for the OpenAI (Chat Completions) shape (pure).
 * @param {string[]} words
 * @param {Object} [opts] { targetLang, sentence }
 */
export function buildTranslationMessages(words, opts = {}) {
  return [
    { role: "system", content: buildSystemPrompt(opts.targetLang) },
    { role: "user", content: buildUserContent(words, opts.sentence) },
  ];
}

/**
 * Build a full request descriptor for any supported provider (pure). The
 * glue just passes url/headers/body to fetch. Dispatches on the provider's
 * API shape (OpenAI Chat Completions vs. Anthropic Messages).
 * @param {Object} args { providerId, words, apiKey, model, sentence, baseUrl, targetLang }
 * @returns {{url:string, method:string, headers:Object, body:string}}
 */
export function buildProviderRequest({
  providerId = "openai",
  words,
  apiKey,
  model,
  sentence,
  baseUrl,
  targetLang,
} = {}) {
  const id = normalizeProvider(providerId);
  const provider = getProvider(id);
  const key = String(apiKey || "").trim();
  const m = normalizeModel(model, id);

  if (provider.api === "anthropic") {
    return {
      url: provider.chatUrl,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
        // Allow the call from a non-browser-page (extension worker) origin.
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: m,
        max_tokens: 1024,
        system: buildSystemPrompt(targetLang),
        messages: [{ role: "user", content: buildUserContent(words, sentence) }],
      }),
    };
  }

  // OpenAI-compatible Chat Completions (openai, openrouter, custom).
  const url = id === "custom" ? resolveChatUrl("custom", baseUrl) : provider.chatUrl;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
  if (id === "openrouter") headers["X-Title"] = "LearnWise";

  const payload = {
    model: m,
    messages: buildTranslationMessages(words, { sentence, targetLang }),
    temperature: 0.2,
  };
  if (provider.supportsJsonMode) payload.response_format = { type: "json_object" };

  return { url, method: "POST", headers, body: JSON.stringify(payload) };
}

/** Back-compat: OpenAI-specific request builder (pure). */
export function buildOpenAIRequest(args = {}) {
  return buildProviderRequest({ ...args, providerId: "openai" });
}

/**
 * Parse the model's JSON content string into a normalized dict (pure).
 * Tolerant of code-fenced JSON and of {meaning|pronunciation} aliases.
 * @returns {Record<string,{meaning:string,pronunciation:string}>}
 */
export function parseTranslationContent(content) {
  const out = {};
  let text = String(content || "").trim();
  if (!text) return out;

  // Strip a ```json ... ``` fence if the model added one.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  let obj;
  try {
    obj = JSON.parse(text);
  } catch (_e) {
    return out;
  }
  if (!obj || typeof obj !== "object") return out;

  // Some models wrap the result, e.g. { words: {...} } — unwrap a lone object.
  const root =
    obj.words && typeof obj.words === "object" && !Array.isArray(obj.words) ? obj.words : obj;

  for (const [rawWord, val] of Object.entries(root)) {
    const key = normalizeWord(rawWord);
    if (!key || !val) continue;
    if (typeof val === "string") {
      out[key] = { meaning: val.trim(), pronunciation: "" };
    } else if (typeof val === "object") {
      out[key] = {
        meaning: String(val.meaning ?? val.translation ?? "").trim(),
        pronunciation: String(val.pronunciation ?? val.ipa ?? val.pron ?? "").trim(),
      };
    }
  }
  return out;
}

/**
 * Extract + parse the translation dict from a full provider response (pure).
 * Handles both the OpenAI (choices[].message.content) and Anthropic
 * (content[].text) response shapes.
 * @param {string} providerId
 * @param {Object} json
 * @returns {Record<string,{meaning:string,pronunciation:string}>}
 */
export function parseProviderResponse(providerId, json) {
  const provider = getProvider(normalizeProvider(providerId));
  const content =
    provider.api === "anthropic"
      ? json?.content?.[0]?.text
      : json?.choices?.[0]?.message?.content;
  return parseTranslationContent(content);
}

/** Back-compat: parse an OpenAI-shaped response (pure). */
export function parseOpenAIResponse(json) {
  return parseProviderResponse("openai", json);
}

/**
 * Classify a provider failure into a stable kind + user-facing message (pure).
 * Drives whether the content script should retry, fall back, or warn the user.
 * Works across providers: reads error code/type from common body shapes
 * (OpenAI `error.code`, Anthropic `error.type`).
 * @param {Object} info { status?, body?, networkError? }
 * @returns {{kind:string, message:string, retriable:boolean, fallbackToLocal:boolean}}
 */
export function classifyProviderError({ status, body, networkError } = {}) {
  if (networkError) {
    return {
      kind: "network",
      message: "Couldn't reach OpenAI. Check your connection.",
      retriable: true,
      fallbackToLocal: true,
    };
  }

  const code = String(body?.error?.code || body?.error?.type || "");

  if (status === 401 || status === 403) {
    return {
      kind: "auth",
      message: "Your AI provider rejected the API key. Check it in settings.",
      retriable: false,
      fallbackToLocal: true,
    };
  }
  if (status === 429) {
    const quota = code === "insufficient_quota";
    return {
      kind: quota ? "quota" : "rate_limit",
      message: quota
        ? "Your AI provider account is out of quota/credits."
        : "Rate limit hit. Try again shortly.",
      retriable: !quota,
      fallbackToLocal: true,
    };
  }
  if (status === 400) {
    // Anthropic reports an exhausted balance as a 400 mentioning credit.
    const msg = String(body?.error?.message || "");
    if (/credit|balance|quota/i.test(msg)) {
      return { kind: "quota", message: "Your AI provider account is out of credits.", retriable: false, fallbackToLocal: true };
    }
    return {
      kind: "bad_request",
      message: "The AI provider rejected the request.",
      retriable: false,
      fallbackToLocal: true,
    };
  }
  if (typeof status === "number" && status >= 500) {
    return {
      kind: "server",
      message: "The AI provider had a server error. Try again later.",
      retriable: true,
      fallbackToLocal: true,
    };
  }
  return {
    kind: "unknown",
    message: "Translation failed. Falling back to the local dictionary.",
    retriable: false,
    fallbackToLocal: true,
  };
}

/** Back-compat alias for the provider error classifier (pure). */
export const classifyOpenAIError = classifyProviderError;
