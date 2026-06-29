// =====================================================================
// M2.4 — decks: pure CRUD + word-tag assignment.
// =====================================================================
import { describe, it, expect } from "vitest";
import {
  normalizeDeckName,
  createDeck,
  renameDeck,
  deleteDeck,
  listDecks,
  wordTags,
  assignWordToDeck,
  removeWordFromDeck,
  removeDeckFromAllWords,
  wordsInDeck,
  deckCounts,
} from "../JSs/core/decks.js";
import { createWordRecord } from "../JSs/core/wordbank.js";

const NOW = 1_000_000_000_000;

describe("decks — name + id helpers", () => {
  it("normalizeDeckName trims and collapses whitespace", () => {
    expect(normalizeDeckName("  IELTS   words ")).toBe("IELTS words");
    expect(normalizeDeckName(null)).toBe("");
  });
});

describe("decks — CRUD", () => {
  it("createDeck adds a deck with id/name/timestamps", () => {
    const { decks, deck } = createDeck({}, "Work", NOW, { id: "d1" });
    expect(deck).toEqual({ id: "d1", name: "Work", createdAt: NOW, updatedAt: NOW });
    expect(decks.d1).toBe(deck);
  });

  it("createDeck ignores empty names and de-dupes by case-insensitive name", () => {
    expect(createDeck({}, "   ", NOW).deck).toBeNull();
    const a = createDeck({}, "IELTS", NOW, { id: "d1" });
    const b = createDeck(a.decks, "ielts", NOW, { id: "d2" });
    expect(b.deck.id).toBe("d1"); // returned existing, not a duplicate
    expect(Object.keys(b.decks)).toEqual(["d1"]);
  });

  it("renameDeck updates name + updatedAt; no-op on unknown id/empty name", () => {
    const { decks } = createDeck({}, "Work", NOW, { id: "d1" });
    renameDeck(decks, "d1", "Office", NOW + 5);
    expect(decks.d1.name).toBe("Office");
    expect(decks.d1.updatedAt).toBe(NOW + 5);
    renameDeck(decks, "nope", "X", NOW + 9);
    renameDeck(decks, "d1", "  ", NOW + 9);
    expect(decks.d1.name).toBe("Office"); // unchanged
  });

  it("deleteDeck removes a deck; listDecks returns name-sorted array", () => {
    let decks = {};
    decks = createDeck(decks, "Zebra", NOW, { id: "dz" }).decks;
    decks = createDeck(decks, "Apple", NOW, { id: "da" }).decks;
    expect(listDecks(decks).map((d) => d.name)).toEqual(["Apple", "Zebra"]);
    deleteDeck(decks, "dz");
    expect(listDecks(decks).map((d) => d.name)).toEqual(["Apple"]);
  });
});

describe("decks — word membership via tags", () => {
  const bankWith = () => ({
    cat: createWordRecord("cat", {}, NOW),
    dog: createWordRecord("dog", {}, NOW),
  });

  it("assign/remove a word to/from a deck (idempotent, updates updatedAt)", () => {
    const bank = bankWith();
    assignWordToDeck(bank, "Cat", "d1", NOW + 1); // normalizes the word
    assignWordToDeck(bank, "cat", "d1", NOW + 2); // no duplicate
    expect(wordTags(bank.cat)).toEqual(["d1"]);
    expect(bank.cat.updatedAt).toBe(NOW + 1);

    removeWordFromDeck(bank, "cat", "d1", NOW + 3);
    expect(wordTags(bank.cat)).toEqual([]);
    expect(bank.cat.updatedAt).toBe(NOW + 3);
  });

  it("assign is a no-op for untracked words or missing deckId", () => {
    const bank = bankWith();
    assignWordToDeck(bank, "ghost", "d1", NOW);
    assignWordToDeck(bank, "cat", "", NOW);
    expect(bank.ghost).toBeUndefined();
    expect(wordTags(bank.cat)).toEqual([]);
  });

  it("wordsInDeck + deckCounts reflect assignments", () => {
    const bank = bankWith();
    assignWordToDeck(bank, "cat", "d1", NOW);
    assignWordToDeck(bank, "dog", "d1", NOW);
    assignWordToDeck(bank, "dog", "d2", NOW);
    expect(wordsInDeck(bank, "d1")).toEqual(["cat", "dog"]);
    expect(wordsInDeck(bank, "d2")).toEqual(["dog"]);
    expect(deckCounts(bank)).toEqual({ d1: 2, d2: 1 });
  });

  it("removeDeckFromAllWords strips a deleted deck's id everywhere", () => {
    const bank = bankWith();
    assignWordToDeck(bank, "cat", "d1", NOW);
    assignWordToDeck(bank, "dog", "d1", NOW);
    removeDeckFromAllWords(bank, "d1", NOW + 1);
    expect(deckCounts(bank)).toEqual({});
    expect(wordTags(bank.cat)).toEqual([]);
  });
});
