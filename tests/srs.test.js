// =====================================================================
// M2.1 — SRS scheduler (Leitner boxes + SM-2 ease). Test-first, pure math.
// =====================================================================
import { describe, it, expect } from "vitest";
import {
  defaultSrs,
  normalizeSrs,
  clampEase,
  seedReview,
  schedule,
  isDue,
  dueWords,
  gradeWord,
  countDue,
  isReviewEligible,
  isUnscheduled,
  seedNewReviews,
} from "../JSs/core/srs.js";
import { LEITNER } from "../JSs/core/constants.js";
import { createWordRecord } from "../JSs/core/wordbank.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000_000_000_000;

describe("srs — defaults & normalization", () => {
  it("defaultSrs is a box-1, default-ease, unscheduled card", () => {
    expect(defaultSrs()).toEqual({
      box: 1,
      ease: 2.5,
      interval: 0,
      reps: 0,
      nextReviewAt: 0,
      lastResult: null,
      lastReviewedAt: 0,
    });
  });

  it("normalizeSrs fills missing fields and clamps box/ease into range", () => {
    const n = normalizeSrs({ box: 99, ease: 9 });
    expect(n.box).toBe(LEITNER.BOXES); // clamped to max box
    expect(n.ease).toBe(LEITNER.MAX_EASE); // clamped ease
    expect(n.reps).toBe(0);
    const lo = normalizeSrs({ box: 0, ease: 0.1 });
    expect(lo.box).toBe(1);
    expect(lo.ease).toBe(LEITNER.MIN_EASE);
  });

  it("clampEase keeps ease within [MIN_EASE, MAX_EASE]", () => {
    expect(clampEase(2.5)).toBe(2.5);
    expect(clampEase(99)).toBe(LEITNER.MAX_EASE);
    expect(clampEase(-1)).toBe(LEITNER.MIN_EASE);
  });
});

describe("srs — seedReview (entry into the review system)", () => {
  it("schedules a fresh word into box 1, due after the box-1 interval", () => {
    const s = seedReview(defaultSrs(), NOW);
    expect(s.box).toBe(1);
    expect(s.interval).toBe(LEITNER.INTERVALS_DAYS[1]); // 1 day
    expect(s.nextReviewAt).toBe(NOW + LEITNER.INTERVALS_DAYS[1] * DAY);
    expect(s.reps).toBe(0);
    expect(s.lastReviewedAt).toBe(0); // not actually reviewed yet
  });

  it("does not mutate the input srs", () => {
    const input = defaultSrs();
    seedReview(input, NOW);
    expect(input.nextReviewAt).toBe(0);
  });

  it("dueNow makes the card due immediately (still box 1)", () => {
    const s = seedReview(defaultSrs(), NOW, { dueNow: true });
    expect(s.box).toBe(1);
    expect(s.nextReviewAt).toBe(NOW);
    expect(isDue(s, NOW)).toBe(true);
  });
});

describe("srs — review eligibility & seeding", () => {
  it("isReviewEligible accepts learning words, rejects known/ignored/untracked", () => {
    expect(isReviewEligible(createWordRecord("a", { level: 10 }, NOW))).toBe(true);
    const known = createWordRecord("b", { level: 100 }, NOW); // status "known"
    expect(isReviewEligible(known)).toBe(false);
    const ignored = { ...createWordRecord("c", { level: 5 }, NOW), status: "ignored" };
    expect(isReviewEligible(ignored)).toBe(false);
    expect(isReviewEligible(null)).toBe(false);
    expect(isReviewEligible({})).toBe(true); // object w/o status defaults eligible
  });

  it("isUnscheduled is true only before a card enters the review system", () => {
    expect(isUnscheduled(defaultSrs())).toBe(true);
    expect(isUnscheduled(seedReview(defaultSrs(), NOW))).toBe(false);
    expect(isUnscheduled({ ...defaultSrs(), lastReviewedAt: NOW })).toBe(false);
  });

  it("seedNewReviews seeds eligible unscheduled words due now, skipping the rest", () => {
    const bank = {
      learn: createWordRecord("learn", { level: 10 }, NOW),
      known: createWordRecord("known", { level: 100 }, NOW),
      already: createWordRecord("already", { level: 10 }, NOW),
    };
    bank.already.srs = seedReview(defaultSrs(), NOW - DAY); // already scheduled
    const seeded = seedNewReviews(bank, NOW);
    expect(seeded).toEqual(["learn"]);
    expect(bank.learn.srs.nextReviewAt).toBe(NOW); // due now
    expect(isDue(bank.learn.srs, NOW)).toBe(true);
    expect(bank.known.srs.nextReviewAt).toBe(0); // untouched
  });
});

describe("srs — schedule (grade transitions, pure)", () => {
  it("'good' moves up one box and sets the new box interval", () => {
    const s = schedule(defaultSrs(), "good", NOW); // box1 -> box2
    expect(s.box).toBe(2);
    expect(s.interval).toBe(3); // INTERVALS_DAYS[2]
    expect(s.ease).toBe(2.5); // good leaves ease unchanged
    expect(s.reps).toBe(1);
    expect(s.lastResult).toBe("good");
    expect(s.lastReviewedAt).toBe(NOW);
    expect(s.nextReviewAt).toBe(NOW + 3 * DAY);
  });

  it("repeated 'good' walks the box ladder 1→2→3→4→5 and caps at 5", () => {
    let s = defaultSrs();
    const got = [];
    for (let i = 0; i < 6; i++) {
      s = schedule(s, "good", NOW);
      got.push([s.box, s.interval]);
    }
    expect(got).toEqual([
      [2, 3],
      [3, 7],
      [4, 16],
      [5, 35],
      [5, 35], // capped at top box
      [5, 35],
    ]);
  });

  it("'easy' jumps two boxes, bumps ease, and gives a longer interval than 'good'", () => {
    const s = schedule(defaultSrs(), "easy", NOW); // box1 -> box3
    expect(s.box).toBe(3);
    expect(s.ease).toBeCloseTo(2.65, 10);
    // round(INTERVALS_DAYS[3] * ease/DEFAULT_EASE) = round(7 * 1.06) = 7
    expect(s.interval).toBe(7);
    expect(s.interval).toBeGreaterThan(schedule(defaultSrs(), "good", NOW).interval);
    expect(s.reps).toBe(1);
    expect(s.lastResult).toBe("easy");
  });

  it("'hard' keeps the same box at a fraction of the box interval and lowers ease", () => {
    const start = { ...defaultSrs(), box: 3, ease: 2.5 };
    const s = schedule(start, "hard", NOW); // stays box3
    expect(s.box).toBe(3);
    expect(s.ease).toBeCloseTo(2.35, 10);
    // max(1, round(INTERVALS_DAYS[3] * 0.5)) = round(3.5) = 4
    expect(s.interval).toBe(4);
    expect(s.reps).toBe(1);
    expect(s.nextReviewAt).toBe(NOW + 4 * DAY);
  });

  it("'hard' from box 1 still yields at least a 1-day interval", () => {
    const s = schedule(defaultSrs(), "hard", NOW);
    expect(s.box).toBe(1);
    expect(s.interval).toBe(1);
  });

  it("'again' resets to box 1, zeroes reps, lowers ease, and is due immediately", () => {
    const start = { ...defaultSrs(), box: 4, ease: 2.5, reps: 7 };
    const s = schedule(start, "again", NOW);
    expect(s.box).toBe(1);
    expect(s.reps).toBe(0);
    expect(s.ease).toBeCloseTo(2.3, 10);
    expect(s.interval).toBe(0);
    expect(s.nextReviewAt).toBe(NOW); // re-show this session
    expect(s.lastResult).toBe("again");
  });

  it("ease is clamped: repeated 'again' floors at MIN_EASE, repeated 'easy' caps at MAX_EASE", () => {
    let s = defaultSrs();
    for (let i = 0; i < 20; i++) s = schedule(s, "again", NOW);
    expect(s.ease).toBe(LEITNER.MIN_EASE);
    let t = defaultSrs();
    for (let i = 0; i < 20; i++) t = schedule(t, "easy", NOW);
    expect(t.ease).toBe(LEITNER.MAX_EASE);
  });

  it("does not mutate the input srs and rejects unknown grades", () => {
    const input = defaultSrs();
    schedule(input, "good", NOW);
    expect(input).toEqual(defaultSrs());
    expect(() => schedule(defaultSrs(), "nope", NOW)).toThrow();
  });
});

describe("srs — isDue / dueWords / countDue", () => {
  it("a never-scheduled card is not due; a scheduled one is due once its time passes", () => {
    expect(isDue(defaultSrs(), NOW)).toBe(false); // nextReviewAt 0 => not in review yet
    const seeded = seedReview(defaultSrs(), NOW);
    expect(isDue(seeded, seeded.nextReviewAt - 1)).toBe(false);
    expect(isDue(seeded, seeded.nextReviewAt)).toBe(true);
    expect(isDue(seeded, seeded.nextReviewAt + DAY)).toBe(true);
  });

  it("dueWords returns due tracked words sorted by nextReviewAt (most overdue first)", () => {
    const bank = {
      a: createWordRecord("a", {}, NOW),
      b: createWordRecord("b", {}, NOW),
      c: createWordRecord("c", {}, NOW),
      d: createWordRecord("d", {}, NOW),
    };
    bank.a.srs = { ...defaultSrs(), nextReviewAt: NOW - 5 * DAY, reps: 1 };
    bank.b.srs = { ...defaultSrs(), nextReviewAt: NOW - 1 * DAY, reps: 1 };
    bank.c.srs = { ...defaultSrs(), nextReviewAt: NOW + 1 * DAY, reps: 1 }; // future
    bank.d.srs = defaultSrs(); // unscheduled

    expect(dueWords(bank, NOW)).toEqual(["a", "b"]);
    expect(countDue(bank, NOW)).toBe(2);
  });
});

describe("srs — gradeWord (mutating bank convenience)", () => {
  it("applies a grade to a tracked word's srs and bumps updatedAt", () => {
    const bank = { cat: createWordRecord("cat", {}, NOW - DAY) };
    bank.cat.srs = seedReview(defaultSrs(), NOW - DAY);
    gradeWord(bank, "cat", "good", NOW);
    expect(bank.cat.srs.box).toBe(2);
    expect(bank.cat.srs.lastResult).toBe("good");
    expect(bank.cat.srs.lastReviewedAt).toBe(NOW);
    expect(bank.cat.updatedAt).toBe(NOW);
  });

  it("is a no-op for untracked words", () => {
    const bank = {};
    expect(gradeWord(bank, "ghost", "good", NOW)).toBe(bank);
    expect(bank.ghost).toBeUndefined();
  });
});
