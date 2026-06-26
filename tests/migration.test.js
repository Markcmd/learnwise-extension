import { describe, it, expect } from "vitest";
import {
  needsMigration,
  migrateWordRecord,
  migrateWordBank,
  migrateState,
  runMigration,
} from "../JSs/core/migration.js";
import { getLocal, setLocal } from "../JSs/core/storage.js";
import { CURRENT_SCHEMA_VERSION, STORAGE_KEYS } from "../JSs/core/constants.js";

const NOW = 1_700_000_000_000;

// A realistic pre-v1 bank: the old 8-field shape produced by the original
// contentScript, plus a couple of legacy alias fields to be safe.
function legacyBank() {
  return {
    apple: {
      word: "apple",
      meaning: "苹果",
      pronunciation: "ˈæpəl",
      level: 12,
      readCount: 4,
      createdAt: 1000,
      updatedAt: 2000,
    },
    science: {
      word: "science",
      meaning: "科学",
      pronunciation: "ˈsaɪəns",
      level: 100,
      readCount: 9,
      createdAt: 500,
      updatedAt: 600,
    },
    // legacy aliases (familiarity/translation/read_events)
    quirk: {
      translation: "怪癖",
      familiarity: 30,
      read_events: 2,
      updated_at: 800,
    },
  };
}

describe("needsMigration", () => {
  it("true for missing/old versions, false for current", () => {
    expect(needsMigration(undefined)).toBe(true);
    expect(needsMigration(0)).toBe(true);
    expect(needsMigration(CURRENT_SCHEMA_VERSION)).toBe(false);
  });
});

describe("migrateWordRecord", () => {
  it("preserves core data and maps timestamps", () => {
    const r = migrateWordRecord("apple", legacyBank().apple, NOW);
    expect(r.meaning).toBe("苹果");
    expect(r.level).toBe(12);
    expect(r.readCount).toBe(4);
    expect(r.createdAt).toBe(1000);
    expect(r.firstSeenAt).toBe(1000); // derived from createdAt
    expect(r.lastSeenAt).toBe(2000); // derived from updatedAt
    expect(r.status).toBe("learning");
  });

  it("handles legacy alias fields", () => {
    const r = migrateWordRecord("quirk", legacyBank().quirk, NOW);
    expect(r.meaning).toBe("怪癖"); // from translation
    expect(r.level).toBe(30); // from familiarity
    expect(r.readCount).toBe(2); // from read_events
    expect(r.status).toBe("learning");
  });

  it("adds all reserved fields", () => {
    const r = migrateWordRecord("apple", legacyBank().apple, NOW);
    expect(r.srs).toMatchObject({ box: 1, ease: 2.5 });
    expect(r.tags).toEqual([]);
    expect(r.recentContexts).toEqual([]);
    expect(r.source).toBe("read");
  });

  it("is safe on garbage input", () => {
    const r = migrateWordRecord("x", null, NOW);
    expect(r.word).toBe("x");
    expect(r.meaning).toBe("");
  });
});

describe("migrateWordBank — no data loss", () => {
  it("keeps every word and value while upgrading the shape", () => {
    const before = legacyBank();
    const after = migrateWordBank(before, NOW);

    // every key survives
    expect(Object.keys(after).sort()).toEqual(["apple", "quirk", "science"]);
    // values preserved
    expect(after.apple.meaning).toBe("苹果");
    expect(after.science.level).toBe(100);
    expect(after.science.status).toBe("known");
    // input not mutated
    expect(before.apple.srs).toBeUndefined();
  });
});

describe("migrateState", () => {
  it("stamps the current version and migrates the bank", () => {
    const out = migrateState(
      { [STORAGE_KEYS.WORDBANK]: legacyBank() }, // no schemaVersion => needs migration
      NOW
    );
    expect(out[STORAGE_KEYS.SCHEMA_VERSION]).toBe(CURRENT_SCHEMA_VERSION);
    expect(out[STORAGE_KEYS.WORDBANK].apple.firstSeenAt).toBe(1000);
  });

  it("is idempotent when already current", () => {
    const v1 = migrateState({ [STORAGE_KEYS.WORDBANK]: legacyBank() }, NOW);
    const again = migrateState(v1, NOW + 999);
    // already current → bank passed through unchanged (no re-write)
    expect(again[STORAGE_KEYS.WORDBANK]).toBe(v1[STORAGE_KEYS.WORDBANK]);
  });

  it("handles an empty state", () => {
    const out = migrateState({}, NOW);
    expect(out[STORAGE_KEYS.SCHEMA_VERSION]).toBe(CURRENT_SCHEMA_VERSION);
    expect(out[STORAGE_KEYS.WORDBANK]).toEqual({});
  });
});

describe("runMigration (IO)", () => {
  it("on a fresh install stamps the version but does NOT create a wordbank", async () => {
    const did = await runMigration(NOW); // empty store
    expect(did).toBe(true);
    const res = await getLocal([STORAGE_KEYS.SCHEMA_VERSION, STORAGE_KEYS.WORDBANK]);
    expect(res[STORAGE_KEYS.SCHEMA_VERSION]).toBe(CURRENT_SCHEMA_VERSION);
    // crucial: bank must stay absent so first-run seeding still triggers
    expect(STORAGE_KEYS.WORDBANK in res).toBe(false);
  });

  it("migrates an existing legacy bank and is then idempotent", async () => {
    await setLocal({ [STORAGE_KEYS.WORDBANK]: legacyBank() });
    expect(await runMigration(NOW)).toBe(true);
    const res = await getLocal([STORAGE_KEYS.SCHEMA_VERSION, STORAGE_KEYS.WORDBANK]);
    expect(res[STORAGE_KEYS.SCHEMA_VERSION]).toBe(CURRENT_SCHEMA_VERSION);
    expect(res[STORAGE_KEYS.WORDBANK].apple.firstSeenAt).toBe(1000);
    expect(await runMigration(NOW)).toBe(false); // already current
  });
});
