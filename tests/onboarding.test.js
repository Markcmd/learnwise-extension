import { describe, it, expect } from "vitest";
import {
  makeRng,
  bandBounds,
  buildCalibrationTest,
  estimateVocabulary,
  buildKnownSeed,
} from "../JSs/core/onboarding.js";

// A predictable frequency list: word0001 (most common) .. word0600.
const WORDS = Array.from({ length: 600 }, (_, i) => `word${String(i + 1).padStart(4, "0")}`);

describe("makeRng", () => {
  it("is deterministic for a given seed and in [0,1)", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const xs = [a(), a(), a()];
    expect(xs).toEqual([b(), b(), b()]);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("bandBounds", () => {
  it("partitions the list into contiguous, even-ish bands covering everything", () => {
    const bounds = bandBounds(600, 12);
    expect(bounds).toHaveLength(12);
    expect(bounds[0].start).toBe(0);
    expect(bounds[11].end).toBe(600);
    for (let i = 1; i < bounds.length; i++) {
      expect(bounds[i].start).toBe(bounds[i - 1].end); // no gaps/overlaps
    }
    expect(bounds[0]).toEqual({ start: 0, end: 50 });
  });
});

describe("buildCalibrationTest", () => {
  it("samples perBand words from every band, within band ranges, deterministically", () => {
    const test = buildCalibrationTest(WORDS, { bands: 12, perBand: 2, seed: 7 });
    expect(test).toHaveLength(24);

    // Every band 0..11 is represented exactly twice.
    const counts = {};
    for (const item of test) counts[item.band] = (counts[item.band] || 0) + 1;
    for (let b = 0; b < 12; b++) expect(counts[b]).toBe(2);

    // Ranks fall inside each band's [start, end).
    const bounds = bandBounds(600, 12);
    for (const item of test) {
      const { start, end } = bounds[item.band];
      expect(item.rank - 1).toBeGreaterThanOrEqual(start);
      expect(item.rank - 1).toBeLessThan(end);
    }

    // Same seed → same sample.
    expect(buildCalibrationTest(WORDS, { bands: 12, perBand: 2, seed: 7 })).toEqual(test);
  });

  it("does not request more than a band can supply", () => {
    const small = buildCalibrationTest(["a", "b", "c"], { bands: 12, perBand: 2, seed: 1 });
    // Only 3 words across 12 bands → at most 3 items, all distinct words.
    expect(small.length).toBeLessThanOrEqual(3);
    expect(new Set(small.map((i) => i.word)).size).toBe(small.length);
  });
});

describe("estimateVocabulary", () => {
  it("knowing everything estimates the whole list; nothing estimates 0", () => {
    const test = buildCalibrationTest(WORDS, { bands: 12, perBand: 2, seed: 7 });
    const allKnown = test.map((t) => ({ band: t.band, known: true }));
    const noneKnown = test.map((t) => ({ band: t.band, known: false }));
    expect(estimateVocabulary(allKnown, 600, { bands: 12 }).estimatedVocab).toBe(600);
    expect(estimateVocabulary(noneKnown, 600, { bands: 12 }).estimatedVocab).toBe(0);
  });

  it("knowing only the easiest half of bands estimates ~half the vocabulary", () => {
    const test = buildCalibrationTest(WORDS, { bands: 12, perBand: 2, seed: 7 });
    // Know bands 0..5 (the most common words), not 6..11.
    const results = test.map((t) => ({ band: t.band, known: t.band < 6 }));
    const { estimatedVocab } = estimateVocabulary(results, 600, { bands: 12 });
    expect(estimatedVocab).toBe(300); // 6 bands × 50 words
  });

  it("scales a partially-known band by its known fraction", () => {
    // One band, 100 words, 1 of 2 sampled known → ~50.
    const results = [
      { band: 0, known: true },
      { band: 0, known: false },
    ];
    expect(estimateVocabulary(results, 100, { bands: 1 }).estimatedVocab).toBe(50);
  });
});

describe("buildKnownSeed", () => {
  it("marks the top-N words known, shaped for insertWords", () => {
    const seed = buildKnownSeed(WORDS, 3);
    expect(Object.keys(seed)).toEqual(["word0001", "word0002", "word0003"]);
    expect(seed.word0001).toEqual({ level: 100, source: "onboarding", readCount: 0 });
  });

  it("caps at the list length and handles zero/garbage", () => {
    expect(Object.keys(buildKnownSeed(WORDS, 10000))).toHaveLength(600);
    expect(buildKnownSeed(WORDS, 0)).toEqual({});
    expect(buildKnownSeed(WORDS, -5)).toEqual({});
  });
});
