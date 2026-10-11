import { describe, expect, it } from "vitest";
import { clampTimeTakenMs, computePoints } from "./scoring.js";

describe("clampTimeTakenMs", () => {
  it("clamps negative values to 0", () => {
    expect(clampTimeTakenMs(-500, 20_000)).toBe(0);
  });

  it("clamps values over the time limit to the time limit", () => {
    expect(clampTimeTakenMs(25_000, 20_000)).toBe(20_000);
  });

  it("passes through values already in range", () => {
    expect(clampTimeTakenMs(5_000, 20_000)).toBe(5_000);
  });
});

describe("computePoints", () => {
  // PRD §5's worked table: 1000 at 0ms, falling linearly to 500 at the
  // time limit.
  const timeLimitMs = 20_000;

  it("awards 0 for a wrong answer regardless of speed", () => {
    expect(computePoints(false, 0, timeLimitMs)).toBe(0);
    expect(computePoints(false, timeLimitMs, timeLimitMs)).toBe(0);
  });

  it("matches PRD §5's worked table", () => {
    expect(computePoints(true, 0, timeLimitMs)).toBe(1000);
    expect(computePoints(true, 300, timeLimitMs)).toBe(993);
    expect(computePoints(true, 500, timeLimitMs)).toBe(988);
    expect(computePoints(true, 1_200, timeLimitMs)).toBe(970);
    expect(computePoints(true, 10_000, timeLimitMs)).toBe(750);
    expect(computePoints(true, timeLimitMs, timeLimitMs)).toBe(500);
  });

  it("separates two fast correct answers that used to share the top bracket", () => {
    // Both were a flat 50 under the old 20%-bracket model (Decision #2).
    const first = computePoints(true, 400, timeLimitMs);
    const second = computePoints(true, 600, timeLimitMs);
    expect(first).toBeGreaterThan(second);
  });

  it("never scores an earlier answer below a later one", () => {
    for (const limit of [5_000, 20_000, 120_000]) {
      let previous = Infinity;
      for (let t = 0; t <= limit; t += 7) {
        const points = computePoints(true, t, limit);
        expect(points).toBeLessThanOrEqual(previous);
        previous = points;
      }
    }
  });

  it("clamps out-of-range elapsed times to the [500, 1000] range", () => {
    expect(computePoints(true, -1_000, timeLimitMs)).toBe(1000);
    expect(computePoints(true, timeLimitMs * 2, timeLimitMs)).toBe(500);
  });

  it("treats a zero time limit as 100% used rather than dividing by zero", () => {
    expect(computePoints(true, 0, 0)).toBe(500);
  });

  it("always returns a non-negative integer for a correct answer (PRD §5)", () => {
    for (const pct of [0, 0.1, 0.2, 0.3, 0.33, 0.5, 0.7, 0.9, 1]) {
      const points = computePoints(true, timeLimitMs * pct, timeLimitMs);
      expect(Number.isInteger(points)).toBe(true);
      expect(points).toBeGreaterThanOrEqual(500);
      expect(points).toBeLessThanOrEqual(1000);
    }
  });
});
