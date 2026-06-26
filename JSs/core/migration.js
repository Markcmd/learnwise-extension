// =====================================================================
// Schema migration — the data-safety guard
// ---------------------------------------------------------------------
// A bad migration wipes a user's saved words, so this logic is pure and
// tested first (tests/migration.test.js). `runMigration()` runs on load:
// it reads the stored schemaVersion, upgrades the bank shape if needed,
// and writes it back — preserving every existing field.
// =====================================================================
import { getLocal, setLocal } from "./storage.js";
import { STORAGE_KEYS, CURRENT_SCHEMA_VERSION } from "./constants.js";
import { createWordRecord, deriveStatus, defaultSrs } from "./wordbank.js";

/** Does the stored version need upgrading? */
export function needsMigration(version) {
  return Number(version) !== CURRENT_SCHEMA_VERSION;
}

/**
 * Upgrade a single word record to the current (v1) shape (pure).
 * Preserves all existing values; fills in reserved fields so no later
 * feature has to migrate again. Tolerant of legacy/alias field names.
 */
export function migrateWordRecord(word, rec, now = Date.now()) {
  const r = rec && typeof rec === "object" ? rec : {};

  // Start from a clean v1 record, then overlay the preserved legacy values.
  const base = createWordRecord(word, {}, now);

  const level =
    typeof r.level === "number"
      ? r.level
      : typeof r.familiarity === "number"
        ? r.familiarity
        : base.level;

  const createdAt = r.createdAt || r.created_at || r.firstSeenAt || now;
  const updatedAt = r.updatedAt || r.updated_at || r.lastSeenAt || createdAt;

  return {
    ...base,
    word: base.word,
    meaning: r.meaning || r.translation || "",
    pronunciation: r.pronunciation || r.pronounce || "",
    level,
    status: r.status || deriveStatus(level),
    source: r.source || "read",
    readCount:
      typeof r.readCount === "number"
        ? r.readCount
        : typeof r.read_events === "number"
          ? r.read_events
          : base.readCount,
    firstSeenAt: r.firstSeenAt || createdAt,
    lastSeenAt: r.lastSeenAt || updatedAt,
    createdAt,
    updatedAt,
    // Reserved fields: keep if already valid, else default.
    srs: r.srs && typeof r.srs === "object" ? { ...defaultSrs(), ...r.srs } : defaultSrs(),
    tags: Array.isArray(r.tags) ? r.tags : [],
    recentContexts: Array.isArray(r.recentContexts) ? r.recentContexts : [],
  };
}

/** Upgrade an entire bank to the current shape (pure). */
export function migrateWordBank(bank, now = Date.now()) {
  const src = bank && typeof bank === "object" && !Array.isArray(bank) ? bank : {};
  const out = {};
  for (const [word, rec] of Object.entries(src)) {
    const key = String(word).trim().toLowerCase();
    if (!key) continue;
    out[key] = migrateWordRecord(key, rec, now);
  }
  return out;
}

/**
 * Migrate a full state slice (pure). `state` = { schemaVersion?, wordbank? }.
 * Returns { schemaVersion, wordbank }. Idempotent when already current.
 */
export function migrateState(state = {}, now = Date.now()) {
  const version = state[STORAGE_KEYS.SCHEMA_VERSION];
  const bank = state[STORAGE_KEYS.WORDBANK] || {};
  if (!needsMigration(version)) {
    return {
      [STORAGE_KEYS.SCHEMA_VERSION]: CURRENT_SCHEMA_VERSION,
      [STORAGE_KEYS.WORDBANK]: bank,
    };
  }
  return {
    [STORAGE_KEYS.SCHEMA_VERSION]: CURRENT_SCHEMA_VERSION,
    [STORAGE_KEYS.WORDBANK]: migrateWordBank(bank, now),
  };
}

/**
 * IO entry point: read version + bank, migrate if needed, persist.
 * Safe to call on every load. Returns true if a migration was written.
 *
 * Important: on a fresh install (no existing bank) this only stamps the
 * schema version — it must NOT fabricate an empty `wordbank`, otherwise the
 * first-run seeding step would think a bank already exists.
 */
export async function runMigration(now = Date.now()) {
  const res = await getLocal([STORAGE_KEYS.SCHEMA_VERSION, STORAGE_KEYS.WORDBANK]);
  if (!needsMigration(res[STORAGE_KEYS.SCHEMA_VERSION])) return false;

  const patch = { [STORAGE_KEYS.SCHEMA_VERSION]: CURRENT_SCHEMA_VERSION };
  const existing = res[STORAGE_KEYS.WORDBANK];
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    patch[STORAGE_KEYS.WORDBANK] = migrateWordBank(existing, now);
  }
  await setLocal(patch);
  return true;
}
