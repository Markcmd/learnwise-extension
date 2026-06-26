import { describe, it, expect } from "vitest";
import {
  createWordRecord,
  deriveStatus,
  splitWords,
  applyExposures,
  insertWords,
  markKnown,
  addContext,
  normalizeWord,
} from "../JSs/core/wordbank.js";

const NOW = 1_700_000_000_000;

describe("normalizeWord", () => {
  it("lowercases and trims", () => {
    expect(normalizeWord("  Hello ")).toBe("hello");
    expect(normalizeWord(null)).toBe("");
  });
});

describe("deriveStatus", () => {
  it("maps level to status", () => {
    expect(deriveStatus(0)).toBe("new");
    expect(deriveStatus(1)).toBe("learning");
    expect(deriveStatus(90)).toBe("known");
    expect(deriveStatus(100)).toBe("known");
  });
});

describe("createWordRecord", () => {
  it("produces a complete v1 record with reserved fields", () => {
    const r = createWordRecord("Word", { meaning: "意思" }, NOW);
    expect(r.word).toBe("word");
    expect(r.meaning).toBe("意思");
    expect(r.level).toBe(1);
    expect(r.status).toBe("learning");
    expect(r.source).toBe("read");
    expect(r.readCount).toBe(1);
    expect(r.firstSeenAt).toBe(NOW);
    expect(r.lastSeenAt).toBe(NOW);
    expect(r.createdAt).toBe(NOW);
    expect(r.updatedAt).toBe(NOW);
    // reserved-for-later fields exist now to avoid future migrations
    expect(r.srs).toMatchObject({ box: 1, ease: 2.5, interval: 0, reps: 0 });
    expect(r.tags).toEqual([]);
    expect(r.recentContexts).toEqual([]);
  });
});

describe("splitWords", () => {
  const bank = {
    known: { level: 95 },
    learning: { level: 10 },
  };

  it("buckets known/learning/unknown; show includes unknown", () => {
    const { show, noshow, unknown } = splitWords(
      ["known", "learning", "brandnew", "BrandNew"],
      bank
    );
    expect([...noshow]).toEqual(["known"]);
    expect(show.has("learning")).toBe(true);
    expect(show.has("brandnew")).toBe(true);
    expect([...unknown]).toEqual(["brandnew"]); // deduped, lowercased
  });
});

describe("applyExposures", () => {
  it("bumps only tracked words and refreshes timestamps", () => {
    const bank = { seen: createWordRecord("seen", { level: 5, readCount: 2 }, 1) };
    applyExposures(bank, new Set(["seen", "untracked"]), NOW);
    expect(bank.seen.readCount).toBe(3);
    expect(bank.seen.level).toBe(5.5);
    expect(bank.seen.lastSeenAt).toBe(NOW);
    expect(bank.untracked).toBeUndefined();
  });

  it("caps level at 100", () => {
    const bank = { x: createWordRecord("x", { level: 100 }, 1) };
    applyExposures(bank, ["x"], NOW);
    expect(bank.x.level).toBe(100);
  });
});

describe("insertWords", () => {
  it("adds new records but never overwrites existing ones", () => {
    const bank = { keep: createWordRecord("keep", { meaning: "原" }, 1) };
    insertWords(bank, { keep: { meaning: "NEW" }, fresh: { meaning: "新" } }, NOW);
    expect(bank.keep.meaning).toBe("原"); // untouched
    expect(bank.fresh.meaning).toBe("新");
    expect(bank.fresh.status).toBe("learning");
  });
});

describe("markKnown", () => {
  it("sets level 100 on an existing word", () => {
    const bank = { w: createWordRecord("w", { level: 3 }, 1) };
    markKnown(bank, "w", NOW);
    expect(bank.w.level).toBe(100);
    expect(bank.w.status).toBe("known");
  });
  it("creates a minimal known record when absent", () => {
    const bank = {};
    markKnown(bank, "New", NOW);
    expect(bank.new.level).toBe(100);
    expect(bank.new.source).toBe("manual");
  });
});

describe("addContext", () => {
  it("keeps only the most recent N contexts", () => {
    const bank = { w: createWordRecord("w", {}, 1) };
    for (let i = 0; i < 8; i++) addContext(bank, "w", { sentence: `s${i}`, domain: "d", ts: i }, 5);
    expect(bank.w.recentContexts).toHaveLength(5);
    expect(bank.w.recentContexts[0].sentence).toBe("s3");
  });
});
