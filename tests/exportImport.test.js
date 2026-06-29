// =====================================================================
// M2.5 — export / import: envelope + merge-by-updatedAt.
// =====================================================================
import { describe, it, expect } from "vitest";
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  buildExport,
  extractBank,
  parseImport,
  mergeBank,
} from "../JSs/core/exportImport.js";
import { createWordRecord } from "../JSs/core/wordbank.js";

const NOW = 1_000_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("export/import — buildExport", () => {
  it("wraps the bank in a self-describing envelope", () => {
    const bank = { cat: createWordRecord("cat", {}, NOW) };
    const exp = buildExport(bank, { now: NOW, appVersion: "1.0.8" });
    expect(exp.format).toBe(EXPORT_FORMAT);
    expect(exp.exportVersion).toBe(EXPORT_VERSION);
    expect(exp.exportedAt).toBe(NOW);
    expect(exp.appVersion).toBe("1.0.8");
    expect(exp.wordCount).toBe(1);
    expect(exp.wordbank).toBe(bank);
  });
});

describe("export/import — extractBank / parseImport", () => {
  it("reads a wrapped export", () => {
    const wb = { cat: { updatedAt: NOW } };
    expect(extractBank({ format: EXPORT_FORMAT, wordbank: wb })).toBe(wb);
  });

  it("reads a raw bank map (legacy download)", () => {
    const raw = { cat: { updatedAt: NOW }, dog: { updatedAt: NOW } };
    expect(extractBank(raw)).toBe(raw);
  });

  it("rejects malformed wrappers and non-objects", () => {
    expect(extractBank({ format: EXPORT_FORMAT })).toBeNull(); // no wordbank
    expect(extractBank({ wordbank: [] })).toBeNull();
    expect(extractBank(null)).toBeNull();
    expect(extractBank([1, 2])).toBeNull();
  });

  it("parseImport handles JSON strings and throws on junk", () => {
    const json = JSON.stringify({ format: EXPORT_FORMAT, wordbank: { a: { updatedAt: 1 } } });
    expect(parseImport(json).a.updatedAt).toBe(1);
    expect(() => parseImport("{not json")).toThrow();
    expect(() => parseImport({ format: "x" })).toThrow(/not a recognized/i);
  });
});

describe("export/import — mergeBank (newer wins)", () => {
  it("adds new words, updates older ones, skips older/equal incoming", () => {
    const current = {
      keep: { meaning: "old-keep", updatedAt: NOW },
      stale: { meaning: "local-newer", updatedAt: NOW + 10 * DAY },
      tie: { meaning: "local-tie", updatedAt: NOW },
    };
    const incoming = {
      fresh: { meaning: "brand-new", updatedAt: NOW }, // added
      stale: { meaning: "import-older", updatedAt: NOW }, // skipped (local newer)
      keep: { meaning: "import-newer", updatedAt: NOW + 5 * DAY }, // updated
      tie: { meaning: "import-tie", updatedAt: NOW }, // skipped (equal)
    };
    const { bank, stats } = mergeBank(current, incoming, NOW);
    expect(bank.fresh.meaning).toBe("brand-new");
    expect(bank.keep.meaning).toBe("import-newer");
    expect(bank.stale.meaning).toBe("local-newer");
    expect(bank.tie.meaning).toBe("local-tie");
    expect(stats).toEqual({ added: 1, updated: 1, skipped: 2 });
  });

  it("normalizes keys and skips invalid incoming entries", () => {
    const { bank, stats } = mergeBank(
      {},
      { Cat: { updatedAt: NOW }, "": { updatedAt: NOW }, bad: null, arr: [] },
      NOW
    );
    expect(Object.keys(bank)).toEqual(["cat"]);
    expect(stats).toEqual({ added: 1, updated: 0, skipped: 3 });
  });

  it("treats a missing updatedAt as 0 (incoming loses unless current is also 0)", () => {
    const a = mergeBank({ x: { v: "local", updatedAt: 5 } }, { x: { v: "imp" } }, NOW);
    expect(a.bank.x.v).toBe("local"); // incoming 0 < 5 → skipped
    const b = mergeBank({ x: { v: "local" } }, { x: { v: "imp", updatedAt: 1 } }, NOW);
    expect(b.bank.x.v).toBe("imp"); // incoming 1 > 0 → updated
  });

  it("does not mutate the inputs", () => {
    const current = { a: { updatedAt: 1 } };
    const incoming = { b: { updatedAt: 2 } };
    mergeBank(current, incoming, NOW);
    expect(Object.keys(current)).toEqual(["a"]);
    expect(Object.keys(incoming)).toEqual(["b"]);
  });
});
