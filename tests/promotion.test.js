import { describe, it, expect } from "vitest";
import { recordSightings } from "../JSs/core/promotion.js";

describe("recordSightings", () => {
  it("does not promote before the threshold (default 2)", () => {
    const { sightings, promoted } = recordSightings({}, ["alpha", "beta"], 2);
    expect(promoted).toEqual([]);
    expect(sightings).toEqual({ alpha: 1, beta: 1 });
  });

  it("promotes on the Nth sighting and clears the counter for promoted words", () => {
    const first = recordSightings({}, ["alpha"], 2);
    const second = recordSightings(first.sightings, ["alpha"], 2);
    expect(second.promoted).toEqual(["alpha"]);
    expect(second.sightings.alpha).toBeUndefined(); // removed after promotion
  });

  it("threshold of 1 promotes immediately", () => {
    const { promoted, sightings } = recordSightings({}, ["x", "y"], 1);
    expect(promoted.sort()).toEqual(["x", "y"]);
    expect(sightings).toEqual({});
  });

  it("dedupes repeated words within a single pass", () => {
    // 'dup' appears twice this pass but should only count as one sighting
    const { sightings, promoted } = recordSightings({}, ["dup", "dup"], 2);
    expect(promoted).toEqual([]);
    expect(sightings).toEqual({ dup: 1 });
  });

  it("normalizes and ignores empty tokens", () => {
    const { sightings } = recordSightings({}, ["  Mixed ", "", null], 3);
    expect(sightings).toEqual({ mixed: 1 });
  });

  it("does not mutate the input map", () => {
    const input = { a: 1 };
    recordSightings(input, ["a"], 5);
    expect(input).toEqual({ a: 1 });
  });
});
