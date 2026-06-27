// =====================================================================
// BYO-key provider registry (pure data + small helpers)
// ---------------------------------------------------------------------
// LearnWise supports "bring your own key" against a small, KNOWN set of
// providers (no arbitrary hosts by default — cleaner for Chrome review).
// Two request shapes are covered:
//   • "openai"    — Chat Completions (OpenAI, OpenRouter, any compatible)
//   • "anthropic" — Messages API (Claude); different headers + body
// The "custom" provider is an OpenAI-compatible endpoint the user points
// at (local model / other) — its host permission is requested at runtime.
// All network I/O lives in dom/llm.js; this file is pure + unit-testable.
// =====================================================================

/** @typedef {"openai"|"anthropic"} ApiShape */

export const PROVIDERS = {
  openai: {
    id: "openai",
    label: "OpenAI",
    api: "openai",
    chatUrl: "https://api.openai.com/v1/chat/completions",
    host: "https://api.openai.com/*",
    supportsJsonMode: true,
    keyHint: "sk-…",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    api: "anthropic",
    chatUrl: "https://api.anthropic.com/v1/messages",
    host: "https://api.anthropic.com/*",
    supportsJsonMode: false,
    keyHint: "sk-ant-…",
    models: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest", "claude-3-7-sonnet-latest"],
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    api: "openai",
    chatUrl: "https://openrouter.ai/api/v1/chat/completions",
    host: "https://openrouter.ai/*",
    supportsJsonMode: false, // varies by underlying model — rely on prompt + tolerant parse
    keyHint: "sk-or-…",
    models: [
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-haiku",
      "google/gemini-flash-1.5",
      "meta-llama/llama-3.1-8b-instruct",
    ],
  },
  custom: {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    api: "openai",
    chatUrl: "", // supplied by the user (base URL)
    host: null, // requested at runtime via chrome.permissions
    supportsJsonMode: false,
    keyHint: "your key (optional for local)",
    needsBaseUrl: true,
    models: [], // user types a model string
  },
};

export const DEFAULT_PROVIDER = "openai";

/** Provider ids in display order. */
export const PROVIDER_IDS = ["openai", "anthropic", "openrouter", "custom"];

/** Get a provider descriptor; unknown → the default provider (pure). */
export function getProvider(id) {
  return PROVIDERS[id] || PROVIDERS[DEFAULT_PROVIDER];
}

/** Normalize a provider id; unknown/empty → default (pure). */
export function normalizeProvider(id) {
  return PROVIDERS[id] ? id : DEFAULT_PROVIDER;
}

/** Is this an OpenAI-compatible (chat-completions) provider? (pure) */
export function isOpenAiShape(id) {
  return getProvider(id).api === "openai";
}

/** Default model for a provider (first in its list; "" for custom). */
export function defaultModelFor(id) {
  const p = getProvider(id);
  return p.models[0] || "";
}

/**
 * Resolve the chat endpoint for a provider (pure).
 * For "custom", normalize the user's base URL to a full chat-completions URL.
 * @param {string} id
 * @param {string} [baseUrl] required for custom
 * @returns {string} "" if custom without a usable base URL
 */
export function resolveChatUrl(id, baseUrl = "") {
  const p = getProvider(id);
  if (!p.needsBaseUrl) return p.chatUrl;

  let base = String(baseUrl || "").trim();
  if (!base) return "";
  base = base.replace(/\/+$/, ""); // drop trailing slashes
  // Accept either a bare base ("http://localhost:11434/v1") or a full path.
  if (/\/chat\/completions$/.test(base)) return base;
  if (/\/v1$/.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

/** Origin pattern (for chrome.permissions) from a custom base URL (pure). "" if unparseable. */
export function originPatternFromUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  try {
    return `${new URL(s).origin}/*`;
  } catch (_e) {
    return "";
  }
}
