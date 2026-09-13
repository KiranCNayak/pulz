import type { FastifyInstance, FastifyReply } from "fastify";
import { NotFoundError, ValidationError } from "../services/quiz.service.js";
import * as quizService from "../services/quiz.service.js";
import type { CreateQuizInput, QuestionInput, UpdateQuizInput } from "../types/quiz.js";
import { requireCreatorId } from "./creatorAuth.js";
import {
  addQuestionSchema,
  createQuizSchema,
  reorderQuestionsSchema,
  updateQuestionSchema,
  updateQuizSchema,
} from "./quiz.schemas.js";

function handleError(err: unknown, reply: FastifyReply): void {
  if (err instanceof ValidationError) {
    reply.code(400).send({ error: err.message });
    return;
  }
  if (err instanceof NotFoundError) {
    reply.code(404).send({ error: err.message });
    return;
  }
  throw err;
}

export async function quizRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateQuizInput }>("/quizzes", { schema: createQuizSchema }, async (request, reply) => {
    const creatorId = await requireCreatorId(request, reply);
    if (!creatorId) return;
    try {
      const quiz = await quizService.createQuiz(creatorId, request.body);
      reply.code(201).send(quiz);
    } catch (err) {
      handleError(err, reply);
    }
  });

  app.get("/quizzes", async (request, reply) => {
    const creatorId = await requireCreatorId(request, reply);
    if (!creatorId) return;
    reply.send(await quizService.listQuizzesByCreator(creatorId));
  });

  app.get<{ Params: { id: string } }>("/quizzes/:id", async (request, reply) => {
    const creatorId = await requireCreatorId(request, reply);
    if (!creatorId) return;
    try {
      reply.send(await quizService.getQuizForCreator(creatorId, request.params.id));
    } catch (err) {
      handleError(err, reply);
    }
  });

  app.put<{ Params: { id: string }; Body: UpdateQuizInput }>(
    "/quizzes/:id",
    { schema: updateQuizSchema },
    async (request, reply) => {
      const creatorId = await requireCreatorId(request, reply);
      if (!creatorId) return;
      try {
        reply.send(await quizService.updateQuiz(creatorId, request.params.id, request.body));
      } catch (err) {
        handleError(err, reply);
      }
    },
  );

  app.delete<{ Params: { id: string } }>("/quizzes/:id", async (request, reply) => {
    const creatorId = await requireCreatorId(request, reply);
    if (!creatorId) return;
    try {
      await quizService.deleteQuiz(creatorId, request.params.id);
      reply.code(204).send();
    } catch (err) {
      handleError(err, reply);
    }
  });

  app.post<{ Params: { id: string }; Body: QuestionInput }>(
    "/quizzes/:id/questions",
    { schema: addQuestionSchema },
    async (request, reply) => {
      const creatorId = await requireCreatorId(request, reply);
      if (!creatorId) return;
      try {
        const question = await quizService.addQuestion(creatorId, request.params.id, request.body);
        reply.code(201).send(question);
      } catch (err) {
        handleError(err, reply);
      }
    },
  );

  app.put<{ Params: { id: string; questionId: string }; Body: Partial<QuestionInput> }>(
    "/quizzes/:id/questions/:questionId",
    { schema: updateQuestionSchema },
    async (request, reply) => {
      const creatorId = await requireCreatorId(request, reply);
      if (!creatorId) return;
      try {
        const question = await quizService.updateQuestion(
          creatorId,
          request.params.id,
          request.params.questionId,
          request.body,
        );
        reply.send(question);
      } catch (err) {
        handleError(err, reply);
      }
    },
  );

  app.delete<{ Params: { id: string; questionId: string } }>(
    "/quizzes/:id/questions/:questionId",
    async (request, reply) => {
      const creatorId = await requireCreatorId(request, reply);
      if (!creatorId) return;
      try {
        await quizService.deleteQuestion(creatorId, request.params.id, request.params.questionId);
        reply.code(204).send();
      } catch (err) {
        handleError(err, reply);
      }
    },
  );

  app.put<{ Params: { id: string }; Body: { questionIds: string[] } }>(
    "/quizzes/:id/questions/reorder",
    { schema: reorderQuestionsSchema },
    async (request, reply) => {
      const creatorId = await requireCreatorId(request, reply);
      if (!creatorId) return;
      try {
        await quizService.reorderQuestions(creatorId, request.params.id, request.body.questionIds);
        reply.code(204).send();
      } catch (err) {
        handleError(err, reply);
      }
    },
  );
}
