// =====================================================================
// M2.6 — editable word bank: editWord + deleteWord (pure).
// =====================================================================
import { describe, it, expect } from "vitest";
import { createWordRecord, editWord, deleteWord } from "../JSs/core/wordbank.js";

const NOW = 1_000_000_000_000;

describe("wordbank — editWord", () => {
  it("updates meaning/pronunciation (trimmed) and bumps updatedAt", () => {
    const bank = { cat: createWordRecord("cat", { meaning: "old" }, NOW - 1000) };
    editWord(bank, "Cat", { meaning: "  猫  ", pronunciation: " kæt " }, NOW);
    expect(bank.cat.meaning).toBe("猫");
    expect(bank.cat.pronunciation).toBe("kæt");
    expect(bank.cat.updatedAt).toBe(NOW);
  });

  it("only touches provided fields and ignores non-strings", () => {
    const bank = { cat: createWordRecord("cat", { meaning: "keep", pronunciation: "p" }, NOW) };
    editWord(bank, "cat", { pronunciation: "new" }, NOW + 5);
    expect(bank.cat.meaning).toBe("keep");
    expect(bank.cat.pronunciation).toBe("new");
    editWord(bank, "cat", { meaning: 123 }, NOW + 9);
    expect(bank.cat.meaning).toBe("keep"); // numbers ignored
  });

  it("is a no-op for untracked words", () => {
    const bank = {};
    editWord(bank, "ghost", { meaning: "x" }, NOW);
    expect(bank.ghost).toBeUndefined();
  });
});

describe("wordbank — deleteWord", () => {
  it("removes a tracked word (normalizing the key)", () => {
    const bank = { cat: createWordRecord("cat", {}, NOW), dog: createWordRecord("dog", {}, NOW) };
    deleteWord(bank, "Cat");
    expect(bank.cat).toBeUndefined();
    expect(bank.dog).toBeDefined();
  });

  it("is a no-op for unknown / empty words", () => {
    const bank = { cat: createWordRecord("cat", {}, NOW) };
    deleteWord(bank, "ghost");
    deleteWord(bank, "");
    expect(Object.keys(bank)).toEqual(["cat"]);
  });
});
