// =====================================================================
// M2.2 — review events: pure builder + IndexedDB round-trip.
// =====================================================================
import { describe, it, expect } from "vitest";
import {
  makeReviewEvent,
  appendReview,
  appendReviews,
  getReviewsForWord,
  countReviews,
} from "../JSs/core/events.js";
import { GRADE_QUALITY } from "../JSs/core/constants.js";

const NOW = 1_000_000_000_000;

describe("review events — makeReviewEvent (pure)", () => {
  it("builds a normalized event with grade→quality mapping", () => {
    const ev = makeReviewEvent({ word: "Cat", grade: "good", intervalAfter: 3, box: 2 }, NOW);
    expect(ev).toEqual({
      word: "cat", // normalized
      ts: NOW,
      grade: "good",
      quality: GRADE_QUALITY.good,
      intervalAfter: 3,
      box: 2,
    });
  });

  it("defaults ts/interval/box and maps every grade to a quality", () => {
    for (const grade of ["again", "hard", "good", "easy"]) {
      const ev = makeReviewEvent({ word: "x", grade }, NOW);
      expect(ev.quality).toBe(GRADE_QUALITY[grade]);
      expect(ev.intervalAfter).toBe(0);
      expect(ev.box).toBe(0);
      expect(ev.ts).toBe(NOW);
    }
  });

  it("returns null for missing word or unknown grade", () => {
    expect(makeReviewEvent({ grade: "good" }, NOW)).toBeNull();
    expect(makeReviewEvent({ word: "x", grade: "nope" }, NOW)).toBeNull();
    expect(makeReviewEvent({ word: "x" }, NOW)).toBeNull();
  });
});

describe("review events — IndexedDB IO", () => {
  it("appends and reads back review events per word, oldest-first", async () => {
    expect(await countReviews()).toBe(0);
    await appendReview({ word: "cat", grade: "good", intervalAfter: 3, box: 2 }, NOW);
    await appendReview({ word: "cat", grade: "again", intervalAfter: 0, box: 1 }, NOW + 1000);
    await appendReview({ word: "dog", grade: "easy", intervalAfter: 7, box: 3 }, NOW);

    expect(await countReviews()).toBe(3);
    const cat = await getReviewsForWord("cat");
    expect(cat.map((r) => r.grade)).toEqual(["good", "again"]); // oldest-first
    expect(cat.map((r) => r.ts)).toEqual([NOW, NOW + 1000]);
    const dog = await getReviewsForWord("dog");
    expect(dog).toHaveLength(1);
    expect(dog[0].quality).toBe(GRADE_QUALITY.easy);
  });

  it("appendReviews skips junk and returns the count written", async () => {
    const n = await appendReviews(
      [
        { word: "a", grade: "good" },
        { word: "", grade: "good" }, // no word
        { word: "b", grade: "nope" }, // bad grade
        { word: "c", grade: "hard" },
      ],
      NOW
    );
    expect(n).toBe(2);
    expect(await countReviews()).toBe(2);
  });
});
