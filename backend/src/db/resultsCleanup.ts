import type { FastifyBaseLogger } from "fastify";
import { env } from "../config/env.js";
import { prisma } from "./client.js";

/**
 * In-process TTL sweep for ResultsSnapshot rows (ARCHITECTURE.md §3,
 * Decision #15) — no external cron/scheduler. Read paths must
 * additionally filter `expiresAt > now()` themselves so correctness never
 * depends on this sweep having run recently; this just reclaims storage.
 */
export function startResultsCleanupSweep(logger: FastifyBaseLogger): NodeJS.Timeout {
  const intervalMs = env.resultsCleanupIntervalMinutes * 60_000;

  const sweep = async () => {
    try {
      const { count } = await prisma.resultsSnapshot.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (count > 0) {
        logger.info({ count }, "results_snapshots: swept expired rows");
      }
    } catch (err) {
      logger.error({ err }, "results_snapshots: cleanup sweep failed");
    }
  };

  const timer = setInterval(sweep, intervalMs);
  timer.unref(); // don't keep the process alive solely for this timer
  return timer;
}
