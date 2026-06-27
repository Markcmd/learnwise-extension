// =====================================================================
// BYO-key LLM client (I/O glue) — runs in the BACKGROUND worker
// ---------------------------------------------------------------------
// Why the background worker: a content script's fetch uses the page's
// origin and is subject to CORS, which the providers do not grant. The
// service worker fetches with the extension origin + host_permissions, so
// the call succeeds and the user's key never touches the page. All the
// pure request/response/error logic (incl. per-provider shapes) lives in
// core/translation.js + core/providers.js (tested); this file only does
// the network + timeout.
// =====================================================================
import {
  buildProviderRequest,
  parseProviderResponse,
  classifyProviderError,
} from "../core/translation.js";
import { OPENAI_TIMEOUT_MS } from "../core/constants.js";

/** Thrown on any provider failure; `info` is the classifyProviderError result. */
export class LlmError extends Error {
  constructor(info) {
    super(info?.message || "Translation request failed");
    this.name = "LlmError";
    this.info = info;
  }
}

/**
 * Translate words via the user's chosen provider + key.
 * @param {Object} args { providerId, words, apiKey, model, sentence, baseUrl, targetLang, timeoutMs }
 * @returns {Promise<Record<string,{meaning:string,pronunciation:string}>>}
 * @throws {LlmError}
 */
export async function fetchByokTranslations({
  providerId,
  words,
  apiKey,
  model,
  sentence,
  baseUrl,
  targetLang,
  timeoutMs = OPENAI_TIMEOUT_MS,
} = {}) {
  const list = (Array.isArray(words) ? words : []).filter(Boolean);
  if (!list.length) return {};

  const req = buildProviderRequest({ providerId, words: list, apiKey, model, sentence, baseUrl, targetLang });
  if (!req.url) {
    throw new LlmError({
      kind: "bad_request",
      message: "No endpoint is configured for this provider. Check the base URL in settings.",
      retriable: false,
      fallbackToLocal: true,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal: controller.signal,
    });
  } catch (_e) {
    clearTimeout(timer);
    // Abort or any network-layer failure → treat as a network error.
    throw new LlmError(classifyProviderError({ networkError: true }));
  }
  clearTimeout(timer);

  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch (_e) {
      /* non-JSON error body */
    }
    throw new LlmError(classifyProviderError({ status: res.status, body }));
  }

  let json;
  try {
    json = await res.json();
  } catch (_e) {
    throw new LlmError(classifyProviderError({ status: res.status, body: null }));
  }
  return parseProviderResponse(providerId, json);
}
