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
  /** BYO-key (legacy, M1.4 OpenAI-only): kept for back-compat migration into the maps below. */
  OPENAI_KEY: "lw_openai_key",
  OPENAI_MODEL: "lw_openai_model",
  /** BYO-key (multi-provider): which provider is active (openai|anthropic|openrouter|custom). */
  BYOK_PROVIDER: "lw_byok_provider",
  /** BYO-key: per-provider API keys { [providerId]: key } — stored locally only, never logged. */
  BYOK_KEYS: "lw_byok_keys",
  /** BYO-key: per-provider model choice { [providerId]: model }. */
  BYOK_MODELS: "lw_byok_models",
  /** BYO-key: base URL for the "custom" (OpenAI-compatible) provider. */
  BYOK_BASE_URL: "lw_byok_base_url",
  /** Onboarding (M1.5): whether the first-run vocabulary calibration is done. */
  ONBOARDED: "lw_onboarded",
  /** Onboarding: the estimated known-vocabulary size (frequency rank threshold). */
  ESTIMATED_VOCAB: "lw_estimated_vocab",
};

/** Current data schema version. Bump + add a migration step when the shape changes. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Familiarity at/above which we stop glossing a word. */
export const STOP_GLOSS_LEVEL = 90;

/** A word is promoted to a tracked record on its Nth sighting (configurable). */
export const DEFAULT_PROMOTION_THRESHOLD = 2;

/** How many recent context snippets to cache on a Word (full history → IndexedDB, M1). */
export const MAX_RECENT_CONTEXTS = 5;

/**
 * Valid translation backends (DESIGN.md META.translation_source):
 *  - local:   offline ECDICT dictionary (default, free, no key)
 *  - byok:    bring-your-own OpenAI key (M1.4, free — user pays OpenAI)
 *  - managed: paid hosted endpoint (v2, not built yet)
 * Legacy value "api" is treated as "byok" (see normalizeSource).
 */
export const TRANSLATION_SOURCES = ["local", "byok", "managed"];

// ---------------------------------------------------------------------
// M1.4 — BYO-key OpenAI translation
// ---------------------------------------------------------------------

/** OpenAI Chat Completions endpoint (called from the background worker). */
export const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

/** Models the user can pick from in settings; first entry is the default. */
export const OPENAI_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"];
export const DEFAULT_OPENAI_MODEL = OPENAI_MODELS[0];

/** Target gloss language (English→Chinese at launch; pluggable later). */
export const TARGET_LANGUAGE = "Simplified Chinese";

/** Network timeout (ms) for a BYO-key translation request. */
export const OPENAI_TIMEOUT_MS = 20000;

/** Runtime message types between content script and background worker. */
export const MSG = {
  TRANSLATE_BYOK: "lw_translate_byok",
  DEMOTE_WORD: "lw_demote_word",
};

/** Familiarity a "known" word is reset to when the user demotes it (below STOP_GLOSS_LEVEL so it's glossed again). */
export const DEMOTE_LEVEL = 20;

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

// ---------------------------------------------------------------------
// M1.5 — first-run onboarding (vocabulary calibration test)
// ---------------------------------------------------------------------

/** Number of frequency bands the calibration test samples across. */
export const CALIBRATION_BANDS = 12;

/** Words sampled per band (total test length = bands × this). */
export const CALIBRATION_PER_BAND = 2;
