// =====================================================================
//                   LearnWise — background service worker
// ---------------------------------------------------------------------
// Sets first-run defaults and runs the schema migration on install/update
// (a data-safety guard, so an update never reads a stale bank shape).
// Bundled into dist/ by esbuild.
// =====================================================================
import { getLocal, setLocal } from "./core/storage.js";
import { STORAGE_KEYS, CURRENT_SCHEMA_VERSION, MSG, IDB } from "./core/constants.js";
import { runMigration } from "./core/migration.js";
import { pruneEvents } from "./core/pruning.js";
import { validateApiKey } from "./core/translation.js";
import { getByokConfig } from "./core/byokSettings.js";
import { fetchByokTranslations, LlmError } from "./dom/llm.js";
import { getWordBank, setWordBank, demoteWord, deleteWord } from "./core/wordbank.js";
import { deleteEventsForWord } from "./core/events.js";
import { clearStore } from "./core/idb.js";

async function ensureDefaults() {
  const res = await getLocal([
    STORAGE_KEYS.ENABLED,
    STORAGE_KEYS.TRANSLATION_SOURCE,
    STORAGE_KEYS.SCHEMA_VERSION,
  ]);

  const patch = {};
  if (typeof res[STORAGE_KEYS.ENABLED] === "undefined") {
    patch[STORAGE_KEYS.ENABLED] = true;
  }
  if (typeof res[STORAGE_KEYS.TRANSLATION_SOURCE] === "undefined") {
    patch[STORAGE_KEYS.TRANSLATION_SOURCE] = "local"; // local dictionary is the default
  }
  if (typeof res[STORAGE_KEYS.SCHEMA_VERSION] === "undefined") {
    // Fresh install: nothing to migrate, just stamp the current version.
    patch[STORAGE_KEYS.SCHEMA_VERSION] = CURRENT_SCHEMA_VERSION;
  }
  if (Object.keys(patch).length) await setLocal(patch);
}

// Collapse events older than the retention window into word aggregates and
// drop them, keeping the IndexedDB log bounded. Best-effort.
async function prune() {
  try {
    const res = await pruneEvents();
    if (res.prunedCount) {
      console.log(`[LearnWise] Pruned ${res.prunedCount} old event(s) across ${res.words} word(s).`);
    }
  } catch (e) {
    console.warn("[LearnWise] Event pruning failed:", e);
  }
}

// Open the first-run onboarding (vocabulary calibration) once, on install,
// unless the user has already completed it.
async function maybeOpenOnboarding(reason) {
  if (reason !== "install") return;
  try {
    const res = await getLocal([STORAGE_KEYS.ONBOARDED]);
    if (res[STORAGE_KEYS.ONBOARDED]) return;
    await chrome.tabs.create({ url: chrome.runtime.getURL("HTMLs/onboarding.html") });
  } catch (e) {
    console.warn("[LearnWise] Could not open onboarding:", e);
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  (async () => {
    try {
      // Migrate any existing data first, then fill in missing defaults.
      await runMigration();
      await ensureDefaults();
      await prune();
      await maybeOpenOnboarding(details?.reason);
      console.log("[LearnWise] Background: defaults ensured, schema up to date.");
    } catch (e) {
      console.warn("[LearnWise] Background init failed:", e);
    }
  })();
});

// Also prune once per browser session at startup.
chrome.runtime.onStartup?.addListener(() => {
  prune();
});

// ---------------------------------------------------------------------
// BYO-key translation handler
// ---------------------------------------------------------------------
// The OpenAI call must run here (service-worker origin + host_permissions)
// because a content script's cross-origin fetch is blocked by CORS. The
// content script sends words; we read the user's key/model from local
// storage (the key never travels through the message), call OpenAI, and
// return either translations or a classified error so the page can fall
// back to the local dictionary.
async function handleByokTranslate(msg) {
  const { providerId, apiKey, model, baseUrl } = await getByokConfig();

  const fmt = validateApiKey(apiKey, providerId);
  if (!fmt.valid) {
    return { ok: false, error: { kind: "auth", message: fmt.reason, retriable: false, fallbackToLocal: true } };
  }

  try {
    const translations = await fetchByokTranslations({
      providerId,
      words: msg?.words,
      apiKey,
      model,
      baseUrl,
      sentence: msg?.sentence,
    });
    return { ok: true, translations };
  } catch (e) {
    const error =
      e instanceof LlmError
        ? e.info
        : { kind: "unknown", message: String(e?.message || e), retriable: false, fallbackToLocal: true };
    return { ok: false, error };
  }
}

// Demote a "known" word back into the glossing range and clear its events so
// derived familiarity restarts (the user forgot it and wants it checked again).
async function handleDemoteWord(msg) {
  const word = msg?.word;
  const bank = await getWordBank();
  demoteWord(bank, word, undefined, Date.now());
  await setWordBank(bank);
  const removed = await deleteEventsForWord(word);
  return { ok: true, removedEvents: removed };
}

// Delete one word: remove its bank record and clear its events so derived
// familiarity can't resurrect it on the next reading pass (M2.6).
async function handleDeleteWord(msg) {
  const word = msg?.word;
  const bank = await getWordBank();
  deleteWord(bank, word);
  await setWordBank(bank);
  let removed = 0;
  try {
    removed = await deleteEventsForWord(word);
  } catch (e) {
    console.warn("[LearnWise] clearing events on delete failed:", e);
  }
  return { ok: true, removedEvents: removed };
}

// Clear everything the user has accumulated: the word bank, the sighting
// counters, and the full IndexedDB event + review log (M2.6). Settings/
// onboarding flags are intentionally preserved.
async function handleClearWordBank() {
  await setWordBank({});
  await setLocal({ [STORAGE_KEYS.SIGHTINGS]: {} });
  for (const store of [IDB.STORES.EVENTS, IDB.STORES.REVIEWS]) {
    try {
      await clearStore(store);
    } catch (e) {
      console.warn(`[LearnWise] clearing ${store} failed:`, e);
    }
  }
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === MSG.TRANSLATE_BYOK) {
    handleByokTranslate(msg).then(sendResponse, (e) => {
      sendResponse({
        ok: false,
        error: { kind: "unknown", message: String(e?.message || e), retriable: false, fallbackToLocal: true },
      });
    });
    return true; // keep the message channel open for the async response
  }
  if (msg?.type === MSG.DEMOTE_WORD) {
    handleDemoteWord(msg).then(sendResponse, (e) =>
      sendResponse({ ok: false, error: String(e?.message || e) })
    );
    return true;
  }
  if (msg?.type === MSG.DELETE_WORD) {
    handleDeleteWord(msg).then(sendResponse, (e) =>
      sendResponse({ ok: false, error: String(e?.message || e) })
    );
    return true;
  }
  if (msg?.type === MSG.CLEAR_WORDBANK) {
    handleClearWordBank().then(sendResponse, (e) =>
      sendResponse({ ok: false, error: String(e?.message || e) })
    );
    return true;
  }
  return false;
});
