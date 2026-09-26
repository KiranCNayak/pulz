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
  // PRD §5's worked table: base 10, brackets at 20/40/60/80/100% of the
  // time limit, multipliers 5/4/3/2/1.
  const timeLimitMs = 20_000;

  it("awards 0 for a wrong answer regardless of speed", () => {
    expect(computePoints(false, 0, timeLimitMs)).toBe(0);
    expect(computePoints(false, timeLimitMs, timeLimitMs)).toBe(0);
  });

  it("awards 50 (5x) at or under 20% of the time limit", () => {
    expect(computePoints(true, 0, timeLimitMs)).toBe(50);
    expect(computePoints(true, timeLimitMs * 0.2, timeLimitMs)).toBe(50);
  });

  it("awards 40 (4x) just over 20% and at or under 40%", () => {
    expect(computePoints(true, timeLimitMs * 0.2 + 1, timeLimitMs)).toBe(40);
    expect(computePoints(true, timeLimitMs * 0.4, timeLimitMs)).toBe(40);
  });

  it("awards 30 (3x) just over 40% and at or under 60%", () => {
    expect(computePoints(true, timeLimitMs * 0.4 + 1, timeLimitMs)).toBe(30);
    expect(computePoints(true, timeLimitMs * 0.6, timeLimitMs)).toBe(30);
  });

  it("awards 20 (2x) just over 60% and at or under 80%", () => {
    expect(computePoints(true, timeLimitMs * 0.6 + 1, timeLimitMs)).toBe(20);
    expect(computePoints(true, timeLimitMs * 0.8, timeLimitMs)).toBe(20);
  });

  it("awards 10 (1x) just over 80% and up to the full time limit", () => {
    expect(computePoints(true, timeLimitMs * 0.8 + 1, timeLimitMs)).toBe(10);
    expect(computePoints(true, timeLimitMs, timeLimitMs)).toBe(10);
  });

  it("treats a zero time limit as the worst bracket (100% used) rather than dividing by zero", () => {
    expect(computePoints(true, 0, 0)).toBe(10);
  });

  it("always returns a non-negative integer multiple of the base (PRD §5)", () => {
    for (const pct of [0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 1]) {
      const points = computePoints(true, timeLimitMs * pct, timeLimitMs);
      expect(Number.isInteger(points)).toBe(true);
      expect(points % 10).toBe(0);
      expect(points).toBeGreaterThan(0);
    }
  });
});
