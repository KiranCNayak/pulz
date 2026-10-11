import type { FastifyBaseLogger } from "fastify";
import { ORPHAN_IMAGE_MAX_AGE_MS } from "../domain/constants.js";
import { prisma } from "./client.js";

const SWEEP_INTERVAL_MS = 60 * 60_000;

/**
 * Deletes question images no question points at any more (Decision #75):
 * removed or replaced in the editor, uploaded but never saved, or left
 * behind by a deleted question. Same in-process approach as the results
 * sweep (Decision #15). The age floor keeps an image uploaded moments ago,
 * whose question hasn't been saved yet, out of reach.
 */
export function startImageCleanupSweep(logger: FastifyBaseLogger): NodeJS.Timeout {
  const sweep = async () => {
    try {
      const { count } = await prisma.questionImage.deleteMany({
        where: { questions: { none: {} }, createdAt: { lt: new Date(Date.now() - ORPHAN_IMAGE_MAX_AGE_MS) } },
      });
      if (count > 0) logger.info({ count }, "question_images: swept orphaned images");
    } catch (err) {
      logger.error({ err }, "question_images: cleanup sweep failed");
    }
  };

  const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}
