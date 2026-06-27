import { describe, it, expect } from "vitest";
import {
  hostnameFromUrl,
  clampSentence,
  locationForEvent,
  makeExposureEvent,
  buildExposureEvents,
  groupEventsByWord,
  appendExposures,
  appendExposure,
  getEventsForWord,
  getAllEventsByWord,
  getEventsSince,
  countEvents,
} from "../JSs/core/events.js";
import { MAX_SENTENCE_LEN } from "../JSs/core/constants.js";

describe("events — pure builders", () => {
  it("extracts hostnames and tolerates junk", () => {
    expect(hostnameFromUrl("https://En.Wikipedia.org/wiki/Cat")).toBe("en.wikipedia.org");
    expect(hostnameFromUrl("not a url")).toBe("");
    expect(hostnameFromUrl("")).toBe("");
  });

  it("clamps and normalizes sentences", () => {
    expect(clampSentence("  the   quick  fox ")).toBe("the quick fox");
    const long = "x".repeat(MAX_SENTENCE_LEN + 50);
    expect(clampSentence(long).length).toBe(MAX_SENTENCE_LEN);
  });

  it("respects the privacy rule: domain-only by default, URL only on opt-in", () => {
    const url = "https://example.com/a/b?q=1";
    const off = locationForEvent({ url }, false);
    expect(off).toEqual({ domain: "example.com", url: "" });
    const on = locationForEvent({ url }, true);
    expect(on).toEqual({ domain: "example.com", url });
  });

  it("builds a normalized event and rejects junk", () => {
    const ev = makeExposureEvent(
      { word: "  Hello ", domain: "Example.com", sentence: " hi  there ", action: "glossed" },
      1000
    );
    expect(ev).toMatchObject({
      word: "hello",
      domain: "example.com",
      sentence: "hi there",
      action: "glossed",
      ts: 1000,
    });
    expect(makeExposureEvent({ word: "   " })).toBeNull();
    // unknown action falls back to "seen"
    expect(makeExposureEvent({ word: "x", action: "bogus" }, 1).action).toBe("seen");
  });

  it("builds one event per distinct word for a shared context", () => {
    const evs = buildExposureEvents(
      ["Cat", "cat", "dog", "  "],
      { domain: "x.com", action: "seen" },
      5
    );
    expect(evs.map((e) => e.word)).toEqual(["cat", "dog"]);
    expect(evs.every((e) => e.domain === "x.com" && e.ts === 5)).toBe(true);
  });

  it("groups events by word", () => {
    const g = groupEventsByWord([
      { word: "cat", ts: 1 },
      { word: "cat", ts: 2 },
      { word: "dog", ts: 3 },
    ]);
    expect(Object.keys(g).sort()).toEqual(["cat", "dog"]);
    expect(g.cat).toHaveLength(2);
  });
});

describe("events — IndexedDB IO", () => {
  it("appends and reads back events for a word, oldest-first", async () => {
    await appendExposures([
      makeExposureEvent({ word: "cat", action: "seen" }, 300),
      makeExposureEvent({ word: "cat", action: "glossed" }, 100),
      makeExposureEvent({ word: "dog" }, 200),
    ]);
    const cat = await getEventsForWord("cat");
    expect(cat.map((e) => e.ts)).toEqual([100, 300]);
    expect(await countEvents()).toBe(3);
  });

  it("normalizes raw inputs on append and skips junk", async () => {
    const n = await appendExposures(
      [{ word: " Fox " }, { word: "" }, { word: "fox", action: "seen" }],
      50
    );
    expect(n).toBe(2);
    const fox = await getEventsForWord("fox");
    expect(fox).toHaveLength(2);
    expect(fox.every((e) => e.word === "fox")).toBe(true);
  });

  it("appendExposure writes a single event", async () => {
    expect(await appendExposure({ word: "owl" })).toBe(1);
    expect(await countEvents()).toBe(1);
  });

  it("groups all events by word", async () => {
    await appendExposures([
      makeExposureEvent({ word: "a" }, 1),
      makeExposureEvent({ word: "a" }, 2),
      makeExposureEvent({ word: "b" }, 3),
    ]);
    const g = await getAllEventsByWord();
    expect(g.a).toHaveLength(2);
    expect(g.b).toHaveLength(1);
  });

  it("queries events since a timestamp via the ts index", async () => {
    await appendExposures([
      makeExposureEvent({ word: "a" }, 100),
      makeExposureEvent({ word: "b" }, 200),
      makeExposureEvent({ word: "c" }, 300),
    ]);
    const recent = await getEventsSince(200);
    expect(recent.map((e) => e.word).sort()).toEqual(["b", "c"]);
  });
});
