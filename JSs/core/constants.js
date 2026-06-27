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
  /** Privacy: capture full page URLs in the event log (opt-in). Domain-only by default. */
  LOG_FULL_URL: "lw_log_full_url",
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

// ---------------------------------------------------------------------
// M1 — exposure/review event log (IndexedDB) + derived familiarity
// ---------------------------------------------------------------------

/** IndexedDB database for the full event log (DESIGN.md §2: large + historical → IndexedDB). */
export const IDB = {
  NAME: "learnwise",
  VERSION: 1,
  STORES: {
    EVENTS: "events", // exposure events
    REVIEWS: "reviews", // review events (populated by SRS in M2; store created now)
  },
};

/** Valid exposure-event actions (DESIGN.md ExposureEvent.action). */
export const EXPOSURE_ACTIONS = ["seen", "glossed", "clicked_known"];

/** Cap stored context sentences so the event log stays bounded. */
export const MAX_SENTENCE_LEN = 300;

/**
 * Familiarity derivation tunables (core/familiarity.js).
 * `level` is a DERIVED cache computed from exposure events — store facts, derive scores.
 *  - HALF_LIFE_DAYS: an exposure's recency weight halves every this-many days.
 *  - SATURATION: how quickly accumulated (recency-weighted) exposures raise the level.
 *  - CLICKED_KNOWN_LEVEL: a user "I know this" click pins the word at this level.
 */
export const FAMILIARITY = {
  HALF_LIFE_DAYS: 30,
  SATURATION: 0.18,
  CLICKED_KNOWN_LEVEL: 100,
};

/** Keep this many days of raw events; older ones collapse into Word aggregates (core/pruning.js). */
export const EVENT_RETENTION_DAYS = 90;
