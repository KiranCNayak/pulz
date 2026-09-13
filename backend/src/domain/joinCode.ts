import { randomInt } from "node:crypto";
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from "./constants.js";

/** Generates a random 6-char join code and retries on collision against
 * `isTaken` (checked against currently-active sessions only — codes are
 * recycled once a session ends, per DESIGN.md §1). */
export function generateJoinCode(isTaken: (code: string) => boolean): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = "";
    for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
      code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
    }
    if (!isTaken(code)) return code;
  }
  // Astronomically unlikely at MVP scale (~1B-combination space, single-digit
  // concurrent sessions per ARCHITECTURE.md §8) — fail loudly rather than
  // silently loop forever or hand out a colliding code.
  throw new Error("Failed to generate a unique join code after 100 attempts");
}
