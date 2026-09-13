import type { FastifyReply, FastifyRequest } from "fastify";
import { extractBearerToken, resolveCreatorId } from "../services/auth.service.js";

/**
 * Shared Creator identity resolution for the quiz-CRUD and session-
 * creation routes (Decision #38). Replaces the old x-creator-id
 * placeholder header (Decision #28) — a route now requires the caller
 * to hold a valid bearer token minted by POST /auth/register, not just
 * assert an id.
 */
export async function requireCreatorId(request: FastifyRequest, reply: FastifyReply): Promise<string | undefined> {
  const token = extractBearerToken(request.headers.authorization);
  if (!token) {
    reply.code(401).send({ error: "Missing Authorization: Bearer <token> header — see POST /auth/register" });
    return undefined;
  }
  const creatorId = await resolveCreatorId(token);
  if (!creatorId) {
    reply.code(401).send({ error: "Invalid or revoked token" });
    return undefined;
  }
  return creatorId;
}
