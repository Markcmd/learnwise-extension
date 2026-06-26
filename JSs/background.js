// =====================================================================
//                   LearnWise — background service worker
// ---------------------------------------------------------------------
// Sets first-run defaults and runs the schema migration on install/update
// (a data-safety guard, so an update never reads a stale bank shape).
// Bundled into dist/ by esbuild.
// =====================================================================
import { getLocal, setLocal } from "./core/storage.js";
import { STORAGE_KEYS, CURRENT_SCHEMA_VERSION } from "./core/constants.js";
import { runMigration } from "./core/migration.js";

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

chrome.runtime.onInstalled.addListener(() => {
  (async () => {
    try {
      // Migrate any existing data first, then fill in missing defaults.
      await runMigration();
      await ensureDefaults();
      console.log("[LearnWise] Background: defaults ensured, schema up to date.");
    } catch (e) {
      console.warn("[LearnWise] Background init failed:", e);
    }
  })();
});
