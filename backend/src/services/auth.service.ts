// Capability-token Creator identity (Decision #38, replacing the old
// x-creator-id placeholder header, Decision #28). A Creator is created
// with no email/password; proof of identity is holding the bearer token
// handed back exactly once at registration. Only a SHA-256 hash of the
// token is ever persisted — a DB leak alone doesn't hand out usable
// credentials (the token itself has enough entropy that hashing it isn't
// for slowing down brute-force, just for "don't store the bearer secret
// in plaintext" hygiene, so a fast hash is fine here, unlike a
// low-entropy user-chosen password).

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db/client.js";

const TOKEN_BYTES = 32;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates a new Creator identity and returns the plaintext bearer token.
 * This is the only moment the plaintext token ever exists outside the
 * caller's own storage — it is not retrievable again if lost (Option 1's
 * accepted trade-off: no account recovery, see docs/DECISIONS.md #38). */
export async function registerCreator(): Promise<{ creatorId: string; token: string }> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const creator = await prisma.creator.create({
    data: { tokenHash: hashToken(token) },
  });
  return { creatorId: creator.id, token };
}

/** Resolves a bearer token to its Creator id, or undefined if the token
 * doesn't match any Creator (wrong/revoked/malformed). */
export async function resolveCreatorId(token: string): Promise<string | undefined> {
  const creator = await prisma.creator.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true },
  });
  return creator?.id;
}

/** Extracts the bearer token from a standard `Authorization: Bearer
 * <token>` header value, or undefined if absent/malformed. */
export function extractBearerToken(authorizationHeader: string | string[] | undefined): string | undefined {
  const header = Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader;
  if (!header) return undefined;
  const match = /^Bearer (.+)$/.exec(header);
  return match?.[1];
}
