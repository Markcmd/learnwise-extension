import { describe, it, expect } from "vitest";
import {
  recencyWeight,
  computeFamiliarity,
  recomputeLevels,
  applyDerivedLevels,
} from "../JSs/core/familiarity.js";
import { createWordRecord } from "../JSs/core/wordbank.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000_000_000_000;

describe("familiarity — recencyWeight", () => {
  it("is 1 for a just-now event and halves every half-life", () => {
    expect(recencyWeight(0, 30)).toBeCloseTo(1, 10);
    expect(recencyWeight(30 * DAY, 30)).toBeCloseTo(0.5, 10);
    expect(recencyWeight(60 * DAY, 30)).toBeCloseTo(0.25, 10);
  });

  it("treats future-dated events as weight 1 (no negative ages)", () => {
    expect(recencyWeight(-5 * DAY, 30)).toBeCloseTo(1, 10);
  });
});

describe("familiarity — computeFamiliarity", () => {
  it("returns 0 with no events", () => {
    expect(computeFamiliarity([], NOW)).toBe(0);
    expect(computeFamiliarity(undefined, NOW)).toBe(0);
  });

  it("rises monotonically and saturates with more recent exposures", () => {
    const ev = (n) => Array.from({ length: n }, () => ({ ts: NOW, action: "seen" }));
    const l1 = computeFamiliarity(ev(1), NOW);
    const l2 = computeFamiliarity(ev(2), NOW);
    const l5 = computeFamiliarity(ev(5), NOW);
    const l10 = computeFamiliarity(ev(10), NOW);
    expect([l1, l2, l5, l10]).toEqual([16, 30, 59, 83]);
    expect(l1).toBeLessThan(l2);
    expect(l5).toBeLessThan(l10);
    expect(l10).toBeLessThan(100);
  });

  it("crosses the stop-gloss threshold (90) after enough recent reading", () => {
    const ev = Array.from({ length: 15 }, () => ({ ts: NOW, action: "seen" }));
    expect(computeFamiliarity(ev, NOW)).toBeGreaterThanOrEqual(90);
  });

  it("weights old exposures less than recent ones", () => {
    const recent = computeFamiliarity([{ ts: NOW, action: "seen" }], NOW);
    const old = computeFamiliarity([{ ts: NOW - 60 * DAY, action: "seen" }], NOW);
    expect(old).toBeLessThan(recent);
    // a 60-day-old single exposure: weight 0.25 → 100*(1-e^-0.045) ≈ 4
    expect(old).toBe(4);
  });

  it("pins to max on a clicked_known event regardless of count/age", () => {
    const evs = [
      { ts: NOW - 200 * DAY, action: "seen" },
      { ts: NOW - 100 * DAY, action: "clicked_known" },
    ];
    expect(computeFamiliarity(evs, NOW)).toBe(100);
  });

  it("ignores events with non-finite timestamps", () => {
    const evs = [{ ts: NOW, action: "seen" }, { ts: "oops", action: "seen" }, {}];
    expect(computeFamiliarity(evs, NOW)).toBe(16);
  });
});

describe("familiarity — recomputeLevels + applyDerivedLevels", () => {
  it("recomputes a level per word", () => {
    const levels = recomputeLevels(
      {
        cat: [{ ts: NOW, action: "seen" }],
        dog: Array.from({ length: 5 }, () => ({ ts: NOW, action: "seen" })),
        "": [{ ts: NOW, action: "seen" }],
      },
      NOW
    );
    expect(levels).toEqual({ cat: 16, dog: 59 });
  });

  it("writes derived levels + status onto tracked records only", () => {
    const bank = {
      cat: createWordRecord("cat", { level: 1 }, NOW - DAY),
    };
    applyDerivedLevels(bank, { cat: 95, ghost: 50 }, NOW);
    expect(bank.cat.level).toBe(95);
    expect(bank.cat.status).toBe("known");
    expect(bank.cat.updatedAt).toBe(NOW);
    expect(bank.ghost).toBeUndefined(); // untracked words are ignored
  });

  it("does not churn updatedAt when the level is unchanged", () => {
    const bank = { cat: createWordRecord("cat", { level: 42 }, NOW - DAY) };
    bank.cat.level = 42;
    const before = bank.cat.updatedAt;
    applyDerivedLevels(bank, { cat: 42 }, NOW);
    expect(bank.cat.updatedAt).toBe(before);
  });
});
