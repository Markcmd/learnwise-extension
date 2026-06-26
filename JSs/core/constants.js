// =====================================================================
// Shared constants — single source of truth for storage keys & tunables
// =====================================================================

/** Keys used in chrome.storage.local. */
export const STORAGE_KEYS = {
  WORDBANK: "wordbank",
  SCHEMA_VERSION: "schemaVersion",
  ENABLED: "lw_enabled",
  TRANSLATION_SOURCE: "translation_source",
  SIGHTINGS: "lw_sightings",
  PROMOTION_THRESHOLD: "lw_promotion_threshold",
};

/** Current data schema version. Bump + add a migration step when the shape changes. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Familiarity at/above which we stop glossing a word. */
export const STOP_GLOSS_LEVEL = 90;

/** A word is promoted to a tracked record on its Nth sighting (configurable). */
export const DEFAULT_PROMOTION_THRESHOLD = 2;

/** How many recent context snippets to cache on a Word (full history → IndexedDB, M1). */
export const MAX_RECENT_CONTEXTS = 5;

/** Valid translation backends. `api` stays disabled until BYO-key ships (M1). */
export const TRANSLATION_SOURCES = ["local", "api"];
