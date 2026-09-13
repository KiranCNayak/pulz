import type { FastifyInstance } from "fastify";
import { REGISTER_IP_RATE_LIMIT, REGISTER_IP_RATE_WINDOW_MS } from "../domain/constants.js";
import { SlidingWindowLimiter } from "../domain/rateLimiter.js";
import { extractBearerToken, registerCreator, resolveCreatorId } from "../services/auth.service.js";

// See Decision #38: registration is the one anonymous-by-construction
// Creator endpoint, so it gets its own per-IP rate limit rather than
// relying on Decision #22's "already authenticated" exemption.
const registerLimiter = new SlidingWindowLimiter(REGISTER_IP_RATE_LIMIT, REGISTER_IP_RATE_WINDOW_MS);

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", async (request, reply) => {
    if (!registerLimiter.consume(request.ip)) {
      reply.code(429).send({ error: "Too many registrations from this address — try again later" });
      return;
    }
    const { creatorId, token } = await registerCreator();
    // The token is returned exactly once, here — the server never
    // stores or re-displays the plaintext (see auth.service.ts).
    reply.code(201).send({ creatorId, token });
  });

  // Lets a client confirm its stored token is still valid before, e.g.,
  // showing a "logged in" state — not required for any other route to
  // function, just a convenience check.
  app.get("/auth/me", async (request, reply) => {
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      reply.code(401).send({ error: "Missing Authorization: Bearer <token> header" });
      return;
    }
    const creatorId = await resolveCreatorId(token);
    if (!creatorId) {
      reply.code(401).send({ error: "Invalid or revoked token" });
      return;
    }
    reply.send({ creatorId });
  });
}
