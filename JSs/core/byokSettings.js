// =====================================================================
// BYO-key settings — resolve the active provider config (pure) + IO
// ---------------------------------------------------------------------
// Keys and model choices are stored per provider, so switching providers
// never loses a previously-entered key. The pure resolver also migrates
// the legacy single-OpenAI-key storage (M1.4 first cut) into the map.
// The user's key lives only in chrome.storage.local and is never logged.
// =====================================================================
import { getLocal, setLocal } from "./storage.js";
import { STORAGE_KEYS } from "./constants.js";
import { normalizeProvider, defaultModelFor } from "./providers.js";
import { normalizeModel } from "./translation.js";

function asObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

/**
 * Resolve the active provider config from a stored slice (pure).
 * @param {Object} s storage slice (see STORAGE_KEYS)
 * @returns {{providerId:string, apiKey:string, model:string, baseUrl:string}}
 */
export function resolveByokConfig(s = {}) {
  const providerId = normalizeProvider(s[STORAGE_KEYS.BYOK_PROVIDER]);
  const keys = asObject(s[STORAGE_KEYS.BYOK_KEYS]);
  const models = asObject(s[STORAGE_KEYS.BYOK_MODELS]);

  let apiKey = String(keys[providerId] || "");
  let model = String(models[providerId] || "");

  // Legacy migration: the first BYO-key cut stored a single OpenAI key/model.
  if (providerId === "openai") {
    if (!apiKey && s[STORAGE_KEYS.OPENAI_KEY]) apiKey = String(s[STORAGE_KEYS.OPENAI_KEY]);
    if (!model && s[STORAGE_KEYS.OPENAI_MODEL]) model = String(s[STORAGE_KEYS.OPENAI_MODEL]);
  }

  return {
    providerId,
    apiKey: apiKey.trim(),
    model: normalizeModel(model, providerId),
    baseUrl: providerId === "custom" ? String(s[STORAGE_KEYS.BYOK_BASE_URL] || "").trim() : "",
  };
}

const ALL_KEYS = [
  STORAGE_KEYS.BYOK_PROVIDER,
  STORAGE_KEYS.BYOK_KEYS,
  STORAGE_KEYS.BYOK_MODELS,
  STORAGE_KEYS.BYOK_BASE_URL,
  STORAGE_KEYS.OPENAI_KEY,
  STORAGE_KEYS.OPENAI_MODEL,
];

/** Read + resolve the active provider config (IO). */
export async function getByokConfig() {
  return resolveByokConfig(await getLocal(ALL_KEYS));
}

/**
 * Read the full settings shape for the UI (IO).
 * @returns {Promise<{provider:string, keys:Object, models:Object, baseUrl:string}>}
 */
export async function getByokSettings() {
  const s = await getLocal(ALL_KEYS);
  const keys = { ...asObject(s[STORAGE_KEYS.BYOK_KEYS]) };
  const models = { ...asObject(s[STORAGE_KEYS.BYOK_MODELS]) };
  // Surface the legacy OpenAI key/model so the field isn't blank for old users.
  if (!keys.openai && s[STORAGE_KEYS.OPENAI_KEY]) keys.openai = String(s[STORAGE_KEYS.OPENAI_KEY]);
  if (!models.openai && s[STORAGE_KEYS.OPENAI_MODEL]) models.openai = String(s[STORAGE_KEYS.OPENAI_MODEL]);
  return {
    provider: normalizeProvider(s[STORAGE_KEYS.BYOK_PROVIDER]),
    keys,
    models,
    baseUrl: String(s[STORAGE_KEYS.BYOK_BASE_URL] || ""),
  };
}

/**
 * Persist the active provider + its key/model (and base URL for custom),
 * merging into the per-provider maps (IO).
 * @param {Object} args { provider, key, model, baseUrl }
 */
export async function saveByokProvider({ provider, key, model, baseUrl } = {}) {
  const id = normalizeProvider(provider);
  const s = await getLocal([STORAGE_KEYS.BYOK_KEYS, STORAGE_KEYS.BYOK_MODELS]);
  const keys = { ...asObject(s[STORAGE_KEYS.BYOK_KEYS]) };
  const models = { ...asObject(s[STORAGE_KEYS.BYOK_MODELS]) };

  keys[id] = String(key || "").trim();
  models[id] = normalizeModel(model, id) || defaultModelFor(id);

  const patch = {
    [STORAGE_KEYS.BYOK_PROVIDER]: id,
    [STORAGE_KEYS.BYOK_KEYS]: keys,
    [STORAGE_KEYS.BYOK_MODELS]: models,
  };
  if (id === "custom") patch[STORAGE_KEYS.BYOK_BASE_URL] = String(baseUrl || "").trim();
  await setLocal(patch);
}
