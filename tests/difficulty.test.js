// =====================================================================
// M2.4 (revised) — difficulty: automatic word grouping by frequency rank.
// =====================================================================
import { describe, it, expect } from "vitest";
import {
  DIFFICULTY_BANDS,
  buildRankIndex,
  rankOf,
  bandForRank,
  bandForWord,
  bandLabel,
  groupByDifficulty,
} from "../JSs/core/difficulty.js";

describe("difficulty — rank index", () => {
  it("maps words to 1-based ranks, lowercased, first occurrence wins", () => {
    const idx = buildRankIndex(["the", "Of", "and", "the"]);
    expect(idx.get("the")).toBe(1);
    expect(idx.get("of")).toBe(2);
    expect(idx.get("and")).toBe(3);
    expect(idx.size).toBe(3);
  });

  it("rankOf returns 0 for unknown words / bad index", () => {
    const idx = buildRankIndex(["the"]);
    expect(rankOf("The", idx)).toBe(1);
    expect(rankOf("zzz", idx)).toBe(0);
    expect(rankOf("the", null)).toBe(0);
  });
});

describe("difficulty — bandForRank thresholds", () => {
  it("classifies by frequency rank", () => {
    expect(bandForRank(0)).toBe("rare"); // not in list
    expect(bandForRank(1)).toBe("beginner");
    expect(bandForRank(600)).toBe("beginner");
    expect(bandForRank(601)).toBe("intermediate");
    expect(bandForRank(1200)).toBe("intermediate");
    expect(bandForRank(1201)).toBe("advanced");
    expect(bandForRank(99999)).toBe("advanced");
  });

  it("treats negatives/garbage as rare", () => {
    expect(bandForRank(-5)).toBe("rare");
    expect(bandForRank(NaN)).toBe("rare");
  });
});

describe("difficulty — labels + grouping", () => {
  it("bandLabel resolves keys", () => {
    expect(bandLabel("beginner")).toBe("Beginner");
    expect(bandLabel("rare")).toBe("Rare / specialized");
    expect(DIFFICULTY_BANDS.map((b) => b.key)).toEqual([
      "beginner",
      "intermediate",
      "advanced",
      "rare",
    ]);
  });

  it("groupByDifficulty buckets records and puts unlisted words in 'rare'", () => {
    // 601 words so "rare-word" is unlisted and "w601" is intermediate.
    const words = Array.from({ length: 601 }, (_, i) => (i === 0 ? "cat" : `w${i + 1}`));
    const idx = buildRankIndex(words); // cat=1 (beginner), w601=601 (intermediate)
    const records = [{ word: "cat" }, { word: "w601" }, { word: "obscure" }];
    const groups = groupByDifficulty(records, idx);
    expect(groups.beginner.map((r) => r.word)).toEqual(["cat"]);
    expect(groups.intermediate.map((r) => r.word)).toEqual(["w601"]);
    expect(groups.rare.map((r) => r.word)).toEqual(["obscure"]);
    expect(bandForWord("cat", idx)).toBe("beginner");
  });
});
