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
  /** Audio (M2.3): auto-play pronunciation when a review answer is revealed. */
  SPEECH_AUTOPLAY: "lw_speech_autoplay",
};

/** Current data schema version. Bump + add a migration step when the shape changes. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Familiarity at/above which we stop glossing a word. */
export const STOP_GLOSS_LEVEL = 90;

/**
 * Familiarity TIERS — the SINGLE source of truth for mapping a 0–100 `level`
 * to a coarse label (used by deriveStatus, the settings folders, the progress
 * chart). Ordered low→high; `min` is the inclusive lower bound. A level belongs
 * to the HIGHEST tier whose `min` it meets. The top tier's `min` is exactly
 * STOP_GLOSS_LEVEL, so "known" and "stop glossing" can never drift apart.
 *
 * Tuning (why these numbers): `level` is derived from the saturating exposure
 * curve in core/familiarity.js (SATURATION 0.18, 30-day half-life), where
 * ~1 weighted exposure ≈ 16, ~2 ≈ 30, ~4 ≈ 51, ~5 ≈ 59, ~7 ≈ 72, ~13 ≈ 90.
 * So: new = barely seen, learning = a few recent sightings, familiar = many
 * recent sightings, known = effectively mastered (or an explicit "I know this"
 * click → 100). Because `level` is a derived cache, you can retune these `min`
 * values freely — every word's status is recomputed, no data migration needed.
 *
 * NOTE: settingsWindow.js is an unbundled classic script and inlines a mirror
 * of these thresholds — keep the two in sync.
 */
export const FAMILIARITY_TIERS = [
  { key: "new", label: "New", min: 0 },
  { key: "learning", label: "Learning", min: 25 },
  { key: "familiar", label: "Familiar", min: 60 },
  { key: "known", label: "Known", min: STOP_GLOSS_LEVEL },
];

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
  /** M2.6: delete one word (bank record + its events). */
  DELETE_WORD: "lw_delete_word",
  /** M2.6: clear the entire word bank + event log. */
  CLEAR_WORDBANK: "lw_clear_wordbank",
};

/**
 * Familiarity a "known" word is reset to when the user demotes it ("Review
 * again"). Sits inside the "learning" tier (≥ FAMILIARITY_TIERS learning.min,
 * < STOP_GLOSS_LEVEL) so the word is glossed again AND reads as "learning"
 * (not "new") everywhere — a demoted word is one you're re-learning.
 */
export const DEMOTE_LEVEL = 30;

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

// ---------------------------------------------------------------------
// M2.1 — spaced-repetition scheduler (Leitner boxes + SM-2 ease)
// ---------------------------------------------------------------------

/** Grade buttons shown on a review card, weakest → strongest recall. */
export const GRADES = ["again", "hard", "good", "easy"];

/**
 * Leitner scheduler tunables (core/srs.js). A word lives in a box 1..BOXES;
 * each box has a base review interval in days. Recalling a word moves it up a
 * box (longer interval); forgetting it ("again") resets it to box 1. The SM-2
 * `ease` factor is a per-word multiplier that "again"/"hard" shrink and "easy"
 * grows, so the schedule personalises over time without leaving the Leitner
 * frame. All math is pure + deterministic → unit-tested ("store facts").
 */
export const LEITNER = {
  /** Number of Leitner boxes. */
  BOXES: 5,
  /**
   * Base interval (days) for each box, indexed by box number.
   * Index 0 is unused (boxes are 1-based); box 1 = 1 day … box 5 = 35 days.
   */
  INTERVALS_DAYS: [0, 1, 3, 7, 16, 35],
  /** Interval (days) applied on "again" — re-show this session (due now). */
  AGAIN_INTERVAL_DAYS: 0,
  /** Default SM-2 ease for a brand-new word. */
  DEFAULT_EASE: 2.5,
  /** Ease is clamped to this range so it never runs away or collapses. */
  MIN_EASE: 1.3,
  MAX_EASE: 3.0,
  /** How much each grade nudges the ease factor. */
  EASE_DELTA: { again: -0.2, hard: -0.15, good: 0, easy: 0.15 },
  /** "hard" keeps the word in its box at a fraction of the box interval. */
  HARD_INTERVAL_FACTOR: 0.5,
};

/** Map a grade to an SM-2-style recall quality (0–5) stored on the review event. */
export const GRADE_QUALITY = { again: 1, hard: 3, good: 4, easy: 5 };

/** Max cards surfaced in a single review session (keeps the queue manageable). */
export const REVIEW_SESSION_LIMIT = 40;

// ---------------------------------------------------------------------
// M2.3 — pronunciation audio (Web Speech API)
// ---------------------------------------------------------------------

/** Text-to-speech defaults: English voice, slightly slowed for learners. */
export const SPEECH = {
  LANG: "en-US",
  RATE: 0.95,
};

// ---------------------------------------------------------------------
// M3.1 — progress dashboard stats aggregation (core/stats.js)
// ---------------------------------------------------------------------

/**
 * Stats tunables. Like familiarity, the dashboard numbers are DERIVED from the
 * bank + event logs — store facts, derive scores — so these can change freely
 * (no migration). All stats math is pure + deterministic → unit-tested.
 *  - ACTIVITY_DAYS: length (days) of the activity series the dashboard plots.
 *  - WEEK_DAYS: "this week" window used for added/learned recency counts.
 *  - CORRECT_QUALITY_MIN: a review counts as "correct" at this SM-2 quality or
 *    above (GRADE_QUALITY good=4, easy=5 → correct; again=1, hard=3 → not).
 */
export const STATS = {
  ACTIVITY_DAYS: 30,
  WEEK_DAYS: 7,
  CORRECT_QUALITY_MIN: 4,
};
