// =====================================================================
// Schema migration — the data-safety guard
// ---------------------------------------------------------------------
// A bad migration wipes a user's saved words, so this logic is pure and
// tested first (tests/migration.test.js). `runMigration()` runs on load:
// it reads the stored schemaVersion, upgrades the bank shape if needed,
// and writes it back — preserving every existing field.
// =====================================================================
import { getLocal, setLocal, removeLocal } from "./storage.js";
import { STORAGE_KEYS, CURRENT_SCHEMA_VERSION } from "./constants.js";
import { createWordRecord, deriveStatus, defaultSrs } from "./wordbank.js";

/**
 * BYOK（Bring Your Own Key，用户自带密钥）取消后要清掉的遗留本地键。
 * 里面可能存着用户的 API 密钥 —— 升级时必须删除，不能留在 chrome.storage.local。
 */
export const LEGACY_BYOK_STORAGE_KEYS = [
  "lw_openai_key",
  "lw_openai_model",
  "lw_byok_provider",
  "lw_byok_keys",
  "lw_byok_models",
  "lw_byok_base_url",
];

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
  const res = await getLocal([
    STORAGE_KEYS.SCHEMA_VERSION,
    STORAGE_KEYS.WORDBANK,
    STORAGE_KEYS.TRANSLATION_SOURCE,
  ]);
  if (!needsMigration(res[STORAGE_KEYS.SCHEMA_VERSION])) return false;

  const patch = { [STORAGE_KEYS.SCHEMA_VERSION]: CURRENT_SCHEMA_VERSION };
  const existing = res[STORAGE_KEYS.WORDBANK];
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    patch[STORAGE_KEYS.WORDBANK] = migrateWordBank(existing, now);
  }
  // BYOK 取消：把翻译来源从 byok/api 退回本地词典，免得指向一个已经不存在的通路。
  const src = res[STORAGE_KEYS.TRANSLATION_SOURCE];
  if (src === "byok" || src === "api") patch[STORAGE_KEYS.TRANSLATION_SOURCE] = "local";
  await setLocal(patch);
  // 再删掉遗留的密钥（放在 setLocal 之后：即使删除失败，版本号也已推进，
  // 下次启动不会重复迁移词库；密钥清理本身是 best-effort）。
  try {
    await removeLocal(LEGACY_BYOK_STORAGE_KEYS);
  } catch (e) {
    console.warn("[LearnWise] 清理 BYOK 遗留键失败：", e);
  }
  return true;
}
