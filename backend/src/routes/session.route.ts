import type { FastifyInstance } from "fastify";
import * as sessionService from "../services/session.service.js";
import { NotFoundError, ValidationError } from "../services/quiz.service.js";
import * as resultsService from "../services/results.service.js";
import { ResultsNotFoundError } from "../services/results.service.js";
import { requireCreatorId } from "./creatorAuth.js";

const resultsQuerySchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      page: { type: "integer", minimum: 1, default: 1 },
      pageSize: { type: "integer", minimum: 1, maximum: 100, default: 10 },
    },
  },
} as const;

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  // Session creation requires an authenticated-as-Creator caller (PRD §8,
  // Decision #22: this endpoint is explicitly NOT part of the anonymous
  // attack surface, so it gets no extra rate limiting beyond normal auth).
  app.post<{ Params: { id: string } }>("/quizzes/:id/sessions", async (request, reply) => {
    const creatorId = await requireCreatorId(request, reply);
    if (!creatorId) return;
    try {
      const session = await sessionService.createGameSession(creatorId, request.params.id);
      reply.code(201).send({
        sessionId: session.id,
        joinCode: session.joinCode,
        hostToken: session.hostToken,
        displayToken: session.displayToken,
        status: session.status,
        questionCount: session.questions.length,
      });
    } catch (err) {
      if (err instanceof ValidationError) return reply.code(400).send({ error: err.message });
      if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
      throw err;
    }
  });

  // Results fetch is deliberately unauthenticated — PRD §9: "accessible
  // via the session's unguessable link; no additional auth layer in
  // MVP." The sessionId (a UUID) is the access control.
  app.get<{ Params: { sessionId: string }; Querystring: { page?: number; pageSize?: number } }>(
    "/results/:sessionId",
    { schema: resultsQuerySchema },
    async (request, reply) => {
      try {
        const results = await resultsService.getResults(request.params.sessionId);
        const page = request.query.page ?? 1;
        const pageSize = request.query.pageSize ?? 10;

        // PRD §6: ranks 4-10 shown alongside the podium on page 1; 11+
        // paginated. Page 1 therefore always includes ranks 4..(3+pageSize);
        // page 2+ continues from there.
        const beyondPodium = results.ranks.slice(3);
        const start = (page - 1) * pageSize;
        const pageOfRanks = beyondPodium.slice(start, start + pageSize);

        reply.send({
          sessionId: results.sessionId,
          quizId: results.quizId,
          generatedAt: results.generatedAt,
          totalParticipants: results.totalParticipants,
          podium: results.podium,
          ranks: pageOfRanks,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(beyondPodium.length / pageSize)),
        });
      } catch (err) {
        if (err instanceof ResultsNotFoundError) return reply.code(404).send({ error: err.message });
        throw err;
      }
    },
  );
}
