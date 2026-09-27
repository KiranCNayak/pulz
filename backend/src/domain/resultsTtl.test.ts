import { describe, expect, it } from "vitest";
import { resolveResultsTtlHours } from "./resultsTtl.js";

describe("resolveResultsTtlHours (DESIGN.md §7)", () => {
  it("falls back to the server default when the host doesn't choose", () => {
    expect(resolveResultsTtlHours(undefined, 24)).toBe(24);
    expect(resolveResultsTtlHours(null, 24)).toBe(24);
  });

  it("accepts each preset", () => {
    expect(resolveResultsTtlHours(1, 24)).toBe(1);
    expect(resolveResultsTtlHours(6, 24)).toBe(6);
    expect(resolveResultsTtlHours(24, 24)).toBe(24);
  });

  it("rejects anything that isn't a preset", () => {
    for (const bad of [0, 2, 48, 8760, -1, 1.5, "6", {}]) {
      expect(resolveResultsTtlHours(bad, 24)).toBeUndefined();
    }
  });
});
