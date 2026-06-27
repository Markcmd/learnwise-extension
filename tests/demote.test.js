import { describe, it, expect } from "vitest";
import { demoteWord, createWordRecord } from "../JSs/core/wordbank.js";
import { DEMOTE_LEVEL, STOP_GLOSS_LEVEL } from "../JSs/core/constants.js";
import {
  deleteEventsForWord,
  appendExposures,
  makeExposureEvent,
  getEventsForWord,
  countEvents,
} from "../JSs/core/events.js";

const NOW = 1_000_000_000_000;

describe("demoteWord (pure)", () => {
  it("drops a known word back into the glossing range as 'learning'", () => {
    const bank = { cat: createWordRecord("cat", { level: 100 }, NOW - 1000) };
    bank.cat.status = "known";
    demoteWord(bank, "Cat", undefined, NOW);
    expect(bank.cat.level).toBe(DEMOTE_LEVEL);
    expect(bank.cat.level).toBeLessThan(STOP_GLOSS_LEVEL); // will be glossed again
    expect(bank.cat.status).toBe("learning");
    expect(bank.cat.updatedAt).toBe(NOW);
  });

  it("preserves the record's other fields (meaning, readCount)", () => {
    const bank = { cat: createWordRecord("cat", { level: 100, meaning: "猫", readCount: 7 }, NOW) };
    demoteWord(bank, "cat", undefined, NOW);
    expect(bank.cat.meaning).toBe("猫");
    expect(bank.cat.readCount).toBe(7);
  });

  it("clamps a custom level to [1, STOP_GLOSS_LEVEL-1]", () => {
    const bank = { a: createWordRecord("a", { level: 100 }, NOW), b: createWordRecord("b", { level: 100 }, NOW) };
    demoteWord(bank, "a", 5000, NOW);
    demoteWord(bank, "b", -5, NOW);
    expect(bank.a.level).toBe(STOP_GLOSS_LEVEL - 1);
    expect(bank.b.level).toBe(1);
  });

  it("is a no-op for an untracked word", () => {
    const bank = {};
    demoteWord(bank, "ghost", undefined, NOW);
    expect(bank.ghost).toBeUndefined();
  });
});

describe("deleteEventsForWord (IO)", () => {
  it("removes only the target word's events", async () => {
    await appendExposures([
      makeExposureEvent({ word: "cat", action: "clicked_known" }, NOW),
      makeExposureEvent({ word: "cat", action: "seen" }, NOW - 100),
      makeExposureEvent({ word: "dog", action: "seen" }, NOW),
    ]);
    const removed = await deleteEventsForWord("Cat");
    expect(removed).toBe(2);
    expect(await getEventsForWord("cat")).toHaveLength(0);
    expect(await getEventsForWord("dog")).toHaveLength(1);
    expect(await countEvents()).toBe(1);
  });

  it("returns 0 for a word with no events", async () => {
    expect(await deleteEventsForWord("nothing")).toBe(0);
    expect(await deleteEventsForWord("")).toBe(0);
  });
});
