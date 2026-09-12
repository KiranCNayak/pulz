import type { FastifyInstance } from "fastify";

/** Minimal liveness/readiness endpoint so the service can be verified as running. */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));
}
