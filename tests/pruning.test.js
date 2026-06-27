import { describe, it, expect } from "vitest";
import {
  retentionCutoff,
  partitionEvents,
  aggregateStale,
  applyAggregatesToBank,
  pruneEvents,
} from "../JSs/core/pruning.js";
import { createWordRecord, getWordBank, setWordBank } from "../JSs/core/wordbank.js";
import { appendExposures, makeExposureEvent, countEvents, getEventsForWord } from "../JSs/core/events.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000_000_000_000;

describe("pruning — pure logic", () => {
  it("computes the retention cutoff", () => {
    expect(retentionCutoff(NOW, 90)).toBe(NOW - 90 * DAY);
  });

  it("partitions events into fresh vs stale around the cutoff", () => {
    const events = [
      { word: "a", ts: NOW - 10 * DAY },
      { word: "b", ts: NOW - 89 * DAY },
      { word: "c", ts: NOW - 91 * DAY },
      { word: "d", ts: NOW - 200 * DAY },
    ];
    const { fresh, stale } = partitionEvents(events, NOW, 90);
    expect(fresh.map((e) => e.word).sort()).toEqual(["a", "b"]);
    expect(stale.map((e) => e.word).sort()).toEqual(["c", "d"]);
  });

  it("aggregates stale events by word with a count and the latest ts", () => {
    const agg = aggregateStale([
      { word: "cat", ts: 100 },
      { word: "cat", ts: 300 },
      { word: "dog", ts: 200 },
      { word: "", ts: 1 },
    ]);
    expect(agg).toEqual({
      cat: { count: 2, lastTs: 300 },
      dog: { count: 1, lastTs: 200 },
    });
  });

  it("folds aggregates into readCount + lastSeenAt without touching level", () => {
    const bank = {
      cat: createWordRecord("cat", { level: 40, readCount: 5 }, NOW - 300 * DAY),
    };
    bank.cat.lastSeenAt = NOW - 300 * DAY;
    applyAggregatesToBank(bank, { cat: { count: 3, lastTs: NOW - 100 * DAY }, ghost: { count: 9, lastTs: NOW } }, NOW);
    expect(bank.cat.readCount).toBe(8);
    expect(bank.cat.lastSeenAt).toBe(NOW - 100 * DAY);
    expect(bank.cat.level).toBe(40); // untouched
    expect(bank.cat.updatedAt).toBe(NOW);
    expect(bank.ghost).toBeUndefined();
  });

  it("does not move lastSeenAt backwards", () => {
    const bank = { cat: createWordRecord("cat", {}, NOW) };
    bank.cat.lastSeenAt = NOW;
    applyAggregatesToBank(bank, { cat: { count: 1, lastTs: NOW - 50 * DAY } }, NOW);
    expect(bank.cat.lastSeenAt).toBe(NOW);
  });
});

describe("pruning — IO (IndexedDB + bank)", () => {
  it("collapses old events into the bank and deletes them", async () => {
    await setWordBank({ cat: createWordRecord("cat", { readCount: 1 }, NOW - 300 * DAY) });
    await appendExposures([
      makeExposureEvent({ word: "cat" }, NOW - 200 * DAY), // stale
      makeExposureEvent({ word: "cat" }, NOW - 120 * DAY), // stale
      makeExposureEvent({ word: "cat" }, NOW - 10 * DAY), // fresh
    ]);

    const res = await pruneEvents(NOW, 90);
    expect(res).toEqual({ prunedCount: 2, words: 1 });

    // Two stale events gone; the fresh one survives.
    expect(await countEvents()).toBe(1);
    expect(await getEventsForWord("cat")).toHaveLength(1);

    // readCount absorbed the two pruned exposures (1 + 2).
    const bank = await getWordBank();
    expect(bank.cat.readCount).toBe(3);
  });

  it("is a no-op when nothing is stale", async () => {
    await appendExposures([makeExposureEvent({ word: "dog" }, NOW - 5 * DAY)]);
    const res = await pruneEvents(NOW, 90);
    expect(res).toEqual({ prunedCount: 0, words: 0 });
    expect(await countEvents()).toBe(1);
  });
});
