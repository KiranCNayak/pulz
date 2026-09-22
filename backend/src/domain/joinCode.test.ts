import { describe, expect, it } from "vitest";
import { generateJoinCode } from "./joinCode.js";
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from "./constants.js";

describe("generateJoinCode", () => {
  it("generates a code of the configured length using only the configured alphabet", () => {
    const code = generateJoinCode(() => false);
    expect(code).toHaveLength(JOIN_CODE_LENGTH);
    for (const char of code) {
      expect(JOIN_CODE_ALPHABET).toContain(char);
    }
  });

  it("retries when a generated code is already taken", () => {
    let calls = 0;
    const isTaken = (_code: string) => {
      calls += 1;
      return calls <= 3; // first 3 attempts collide, 4th is free
    };
    const code = generateJoinCode(isTaken);
    expect(code).toHaveLength(JOIN_CODE_LENGTH);
    expect(calls).toBe(4);
  });

  it("throws rather than looping forever if every attempt collides", () => {
    expect(() => generateJoinCode(() => true)).toThrow(/unique join code/i);
  });
});
