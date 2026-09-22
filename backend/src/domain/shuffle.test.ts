import { describe, expect, it } from "vitest";
import { shuffled } from "./shuffle.js";

describe("shuffled", () => {
  it("returns an array with the same elements (a permutation)", () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffled(input);
    expect(result).toHaveLength(input.length);
    expect([...result].sort()).toEqual([...input].sort());
  });

  it("does not mutate the input array", () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffled(input);
    expect(input).toEqual(copy);
  });

  it("handles empty and single-element arrays without throwing", () => {
    expect(shuffled([])).toEqual([]);
    expect(shuffled(["only"])).toEqual(["only"]);
  });

  it("produces different orderings across many runs (not a no-op)", () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const orderings = new Set<string>();
    for (let i = 0; i < 30; i++) {
      orderings.add(shuffled(input).join(","));
    }
    // With 20 items and 30 attempts, seeing only one ordering would mean
    // the shuffle isn't actually randomizing.
    expect(orderings.size).toBeGreaterThan(1);
  });
});
