// =====================================================================
// M3.1 — progress-dashboard stats aggregation. Test-first, pure logic.
// =====================================================================
import { describe, it, expect } from "vitest";
import {
  dayIndex,
  activeDays,
  computeStreak,
  levelDistribution,
  reviewAccuracy,
  activitySeries,
  wordsAddedSince,
  computeStats,
} from "../JSs/core/stats.js";
import { STATS, STOP_GLOSS_LEVEL } from "../JSs/core/constants.js";
import { createWordRecord } from "../JSs/core/wordbank.js";

const DAY = 24 * 60 * 60 * 1000;
// A round epoch that is exactly a UTC midnight, so day math is easy to reason about.
const DAY0 = 19000; // arbitrary day index
const NOW = DAY0 * DAY + 12 * 60 * 60 * 1000; // midday on day DAY0

const ev = (dayOffset, action = "seen") => ({ ts: NOW + dayOffset * DAY, action });
const rv = (dayOffset, grade, quality) => ({ ts: NOW + dayOffset * DAY, grade, quality });

describe("dayIndex", () => {
  it("buckets a timestamp into an integer UTC day", () => {
    expect(dayIndex(0)).toBe(0);
    expect(dayIndex(DAY - 1)).toBe(0);
    expect(dayIndex(DAY)).toBe(1);
    expect(dayIndex(NOW)).toBe(DAY0);
  });

  it("two times on the same UTC day share an index; next day is +1", () => {
    expect(dayIndex(NOW)).toBe(dayIndex(NOW + 6 * 60 * 60 * 1000));
    expect(dayIndex(NOW + DAY)).toBe(dayIndex(NOW) + 1);
  });

  it("applies a timezone offset (can push a late-evening UTC ts into the next local day)", () => {
    const lateUtc = DAY0 * DAY + 23 * 60 * 60 * 1000; // 23:00 UTC on DAY0
    expect(dayIndex(lateUtc, 0)).toBe(DAY0);
    expect(dayIndex(lateUtc, 120)).toBe(DAY0 + 1); // +2h → 01:00 next day
  });

  it("returns NaN for a non-finite timestamp", () => {
    expect(Number.isNaN(dayIndex(undefined))).toBe(true);
    expect(Number.isNaN(dayIndex("nope"))).toBe(true);
  });
});

describe("activeDays", () => {
  it("unions exposure + review days into a set of day indices", () => {
    const set = activeDays([ev(0), ev(0), ev(-1)], [rv(-1, "good", 4), rv(-3, "again", 1)]);
    expect([...set].sort((a, b) => a - b)).toEqual([DAY0 - 3, DAY0 - 1, DAY0]);
  });

  it("ignores events with bad timestamps", () => {
    const set = activeDays([{ ts: NaN }, ev(0)], [{ ts: "x" }]);
    expect([...set]).toEqual([DAY0]);
  });
});

describe("computeStreak", () => {
  it("is all-zero with no activity", () => {
    expect(computeStreak([], DAY0)).toEqual({
      current: 0,
      longest: 0,
      activeDays: 0,
      lastActiveDay: null,
    });
  });

  it("counts a run ending today as the current streak", () => {
    const streak = computeStreak([DAY0, DAY0 - 1, DAY0 - 2], DAY0);
    expect(streak.current).toBe(3);
    expect(streak.longest).toBe(3);
    expect(streak.lastActiveDay).toBe(DAY0);
    expect(streak.activeDays).toBe(3);
  });

  it("still counts the streak if the last active day was yesterday (grace day)", () => {
    expect(computeStreak([DAY0 - 1, DAY0 - 2], DAY0).current).toBe(2);
  });

  it("breaks the current streak when the last activity was 2+ days ago", () => {
    expect(computeStreak([DAY0 - 2, DAY0 - 3], DAY0).current).toBe(0);
  });

  it("a gap resets current but longest remembers the best past run", () => {
    // active: …, then a gap, then today only
    const days = [DAY0 - 10, DAY0 - 9, DAY0 - 8, DAY0 - 7, DAY0];
    const s = computeStreak(days, DAY0);
    expect(s.current).toBe(1); // just today
    expect(s.longest).toBe(4); // the older 4-day run
  });

  it("dedupes repeated days and tolerates unsorted input", () => {
    const s = computeStreak([DAY0, DAY0, DAY0 - 1, DAY0 - 1, DAY0 - 2], DAY0);
    expect(s.current).toBe(3);
    expect(s.activeDays).toBe(3);
  });
});

describe("levelDistribution", () => {
  it("buckets words into the four familiarity tiers", () => {
    const bank = {
      a: createWordRecord("a", { level: 5 }), // new
      b: createWordRecord("b", { level: 30 }), // learning
      c: createWordRecord("c", { level: 70 }), // familiar
      d: createWordRecord("d", { level: 95 }), // known
      e: createWordRecord("e", { level: 92 }), // known
    };
    expect(levelDistribution(bank)).toEqual({ new: 1, learning: 1, familiar: 1, known: 2 });
  });

  it("always returns all tier keys, even for an empty bank", () => {
    expect(levelDistribution({})).toEqual({ new: 0, learning: 0, familiar: 0, known: 0 });
  });

  it("excludes ignored words", () => {
    const bank = {
      a: createWordRecord("a", { level: 30 }),
      b: { ...createWordRecord("b", { level: 30 }), status: "ignored" },
    };
    expect(levelDistribution(bank)).toEqual({ new: 0, learning: 1, familiar: 0, known: 0 });
  });
});

describe("reviewAccuracy", () => {
  it("counts good/easy as correct, again/hard as not", () => {
    const reviews = [
      rv(0, "good", 4),
      rv(0, "easy", 5),
      rv(0, "hard", 3),
      rv(0, "again", 1),
    ];
    const a = reviewAccuracy(reviews);
    expect(a.total).toBe(4);
    expect(a.correct).toBe(2);
    expect(a.accuracy).toBeCloseTo(0.5, 10);
    expect(a.byGrade).toEqual({ again: 1, hard: 1, good: 1, easy: 1 });
  });

  it("honours STATS.CORRECT_QUALITY_MIN as the threshold", () => {
    const reviews = [rv(0, "good", STATS.CORRECT_QUALITY_MIN), rv(0, "hard", STATS.CORRECT_QUALITY_MIN - 1)];
    expect(reviewAccuracy(reviews).correct).toBe(1);
  });

  it("is zero-accuracy (not NaN) with no reviews", () => {
    expect(reviewAccuracy([])).toEqual({
      total: 0,
      correct: 0,
      accuracy: 0,
      byGrade: { again: 0, hard: 0, good: 0, easy: 0 },
    });
  });
});

describe("activitySeries", () => {
  it("returns a dense window of exactly `days` entries, oldest→newest, ending today", () => {
    const series = activitySeries([], [], { now: NOW, days: 7 });
    expect(series).toHaveLength(7);
    expect(series[0].dayIndex).toBe(DAY0 - 6);
    expect(series[6].dayIndex).toBe(DAY0);
    expect(series.every((d) => d.total === 0)).toBe(true);
  });

  it("tallies exposures and reviews into their day buckets", () => {
    const series = activitySeries(
      [ev(0), ev(0), ev(-1)],
      [rv(0, "good", 4), rv(-2, "again", 1)],
      { now: NOW, days: 7 }
    );
    const byDay = Object.fromEntries(series.map((d) => [d.dayIndex, d]));
    expect(byDay[DAY0]).toMatchObject({ exposures: 2, reviews: 1, total: 3 });
    expect(byDay[DAY0 - 1]).toMatchObject({ exposures: 1, reviews: 0, total: 1 });
    expect(byDay[DAY0 - 2]).toMatchObject({ exposures: 0, reviews: 1, total: 1 });
  });

  it("drops activity older than the window", () => {
    const series = activitySeries([ev(-100)], [], { now: NOW, days: 7 });
    expect(series.reduce((s, d) => s + d.total, 0)).toBe(0);
  });

  it("defaults to STATS.ACTIVITY_DAYS when days is unspecified", () => {
    expect(activitySeries([], [], { now: NOW })).toHaveLength(STATS.ACTIVITY_DAYS);
  });
});

describe("wordsAddedSince", () => {
  it("counts only words created inside the window", () => {
    const bank = {
      fresh: { ...createWordRecord("fresh"), createdAt: NOW - 2 * DAY },
      old: { ...createWordRecord("old"), createdAt: NOW - 30 * DAY },
    };
    expect(wordsAddedSince(bank, NOW, 7)).toBe(1);
  });
});

describe("computeStats (aggregate)", () => {
  it("assembles totals, distribution, streak, accuracy and activity", () => {
    const bank = {
      a: { ...createWordRecord("a", { level: 95 }), createdAt: NOW - 1 * DAY }, // known, added this week
      b: { ...createWordRecord("b", { level: 30 }), createdAt: NOW - 1 * DAY }, // learning, this week
      c: { ...createWordRecord("c", { level: 5 }), createdAt: NOW - 40 * DAY }, // new, old
    };
    const events = [ev(0), ev(-1), ev(-2)];
    const reviews = [rv(0, "good", 4), rv(0, "again", 1)];

    const stats = computeStats(bank, events, reviews, { now: NOW, days: 30 });

    expect(stats.totals.tracked).toBe(3);
    expect(stats.totals.known).toBe(1);
    expect(stats.totals.addedThisWeek).toBe(2);
    expect(stats.totals.reviews).toBe(2);
    expect(stats.distribution).toEqual({ new: 1, learning: 1, familiar: 0, known: 1 });
    expect(stats.streak.current).toBe(3);
    expect(stats.reviews.accuracy).toBeCloseTo(0.5, 10);
    expect(stats.activity).toHaveLength(30);
    expect(stats.activity[29].dayIndex).toBe(DAY0);
    expect(stats.generatedAt).toBe(NOW);
  });

  it("known total tracks STOP_GLOSS_LEVEL exactly", () => {
    const bank = {
      a: createWordRecord("a", { level: STOP_GLOSS_LEVEL }),
      b: createWordRecord("b", { level: STOP_GLOSS_LEVEL - 1 }),
    };
    expect(computeStats(bank, [], [], { now: NOW }).totals.known).toBe(1);
  });

  it("is robust to empty inputs", () => {
    const stats = computeStats({}, [], [], { now: NOW });
    expect(stats.totals).toEqual({ tracked: 0, known: 0, addedThisWeek: 0, reviews: 0 });
    expect(stats.streak.current).toBe(0);
    expect(stats.reviews.total).toBe(0);
  });
});
