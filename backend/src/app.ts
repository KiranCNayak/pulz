import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { env } from "./config/env.js";
import { healthRoutes } from "./routes/health.route.js";
import { quizRoutes } from "./routes/quiz.route.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.nodeEnv === "test" ? "silent" : "info",
    },
  });

  await app.register(cors, {
    origin: env.corsOrigin.split(",").map((o) => o.trim()),
  });

  await app.register(healthRoutes);
  await app.register(quizRoutes);

  return app;
}
