import { describe, it, expect } from "vitest";
import {
  hasCachedMeaning,
  wordsNeedingTranslation,
  buildShowDict,
  mergeTranslationsIntoBank,
  normalizeSource,
} from "../JSs/core/translation.js";
import { createWordRecord } from "../JSs/core/wordbank.js";

const NOW = 1_700_000_000_000;

describe("hasCachedMeaning", () => {
  it("detects a usable meaning", () => {
    expect(hasCachedMeaning({ meaning: "意思" })).toBe(true);
    expect(hasCachedMeaning({ meaning: "  " })).toBe(false);
    expect(hasCachedMeaning({})).toBe(false);
    expect(hasCachedMeaning(null)).toBe(false);
  });
});

describe("wordsNeedingTranslation", () => {
  it("returns only uncached words, de-duplicated", () => {
    const bank = { cached: { meaning: "已" }, empty: { meaning: "" } };
    const need = wordsNeedingTranslation(["cached", "empty", "new", "New"], bank);
    expect(need).toEqual(["empty", "new"]); // cached skipped, 'New' deduped
  });
});

describe("buildShowDict", () => {
  it("prefers the cached bank meaning, falls back to fetched", () => {
    const bank = { cached: { meaning: "缓存", pronunciation: "p1" } };
    const fetched = { fresh: { meaning: "新鲜", pronunciation: "p2" } };
    const dict = buildShowDict(["cached", "fresh", "blank"], bank, fetched);
    expect(dict.cached).toEqual({ meaning: "缓存", pronunciation: "p1" });
    expect(dict.fresh).toEqual({ meaning: "新鲜", pronunciation: "p2" });
    expect(dict.blank).toEqual({ meaning: "", pronunciation: "" });
  });
});

describe("mergeTranslationsIntoBank", () => {
  it("caches meanings onto tracked words only, without overwriting", () => {
    const bank = {
      tracked: createWordRecord("tracked", {}, 1),
      hasMeaning: createWordRecord("hasMeaning", { meaning: "原" }, 1),
    };
    mergeTranslationsIntoBank(
      bank,
      {
        tracked: { meaning: "缓存了", pronunciation: "pp" },
        hasMeaning: { meaning: "覆盖?" },
        untracked: { meaning: "忽略" },
      },
      NOW
    );
    expect(bank.tracked.meaning).toBe("缓存了");
    expect(bank.tracked.pronunciation).toBe("pp");
    expect(bank.tracked.updatedAt).toBe(NOW);
    expect(bank.hasMeaning.meaning).toBe("原"); // not overwritten
    expect(bank.untracked).toBeUndefined(); // not created
  });

  it("ignores empty meanings", () => {
    const bank = { w: createWordRecord("w", {}, 1) };
    mergeTranslationsIntoBank(bank, { w: { meaning: "  " } }, NOW);
    expect(bank.w.meaning).toBe("");
  });
});

describe("normalizeSource", () => {
  it("defaults unknown values to local; maps legacy 'api' to 'byok'", () => {
    expect(normalizeSource("local")).toBe("local");
    expect(normalizeSource("api")).toBe("byok"); // legacy value (pre-M1.4)
    expect(normalizeSource("byok")).toBe("byok");
    expect(normalizeSource("nonsense")).toBe("local");
    expect(normalizeSource(undefined)).toBe("local");
  });
});
