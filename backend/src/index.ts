import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { disconnectDb } from "./db/client.js";
import { startResultsCleanupSweep } from "./db/resultsCleanup.js";
import { createSocketServer } from "./sockets/index.js";

async function main(): Promise<void> {
  const app = await buildApp();

  // Socket.IO attaches to the same HTTP server Fastify listens on — one
  // process, one port, per ARCHITECTURE.md §4 (single web service for
  // REST + realtime).
  await app.ready();
  createSocketServer(app.server);

  const cleanupTimer = startResultsCleanupSweep(app.log);

  await app.listen({ port: env.port, host: env.host });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    clearInterval(cleanupTimer);
    await app.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
