import { prisma } from "../db/client.js";
import {
  QUESTION_OPTIONS_MAX,
  QUESTION_OPTIONS_MIN,
  QUESTION_TIME_LIMIT_DEFAULT_SECONDS,
  clampTimeLimitSeconds,
} from "../domain/constants.js";
import type { CreateQuizInput, QuestionInput, UpdateQuizInput } from "../types/quiz.js";

export class ValidationError extends Error {}
export class NotFoundError extends Error {}

/**
 * "Exactly one correct option per question" (DESIGN.md §1) is a
 * cross-field invariant JSON Schema can't express, so it's enforced here
 * at the application layer, on every write. The DB's partial unique index
 * (see migration.sql) backstops the "at most one" half; this covers both
 * halves plus the option-count bounds (PRD §4.1: 2-4 options).
 */
function assertValidQuestion(question: QuestionInput): void {
  if (question.options.length < QUESTION_OPTIONS_MIN || question.options.length > QUESTION_OPTIONS_MAX) {
    throw new ValidationError(
      `Question must have between ${QUESTION_OPTIONS_MIN} and ${QUESTION_OPTIONS_MAX} options`,
    );
  }
  const correctCount = question.options.filter((o) => o.isCorrect).length;
  if (correctCount !== 1) {
    throw new ValidationError(
      `Question must have exactly one correct option (found ${correctCount})`,
    );
  }
}

function toQuestionCreateData(question: QuestionInput, order: number) {
  assertValidQuestion(question);
  return {
    order,
    text: question.text,
    mediaUrl: question.mediaUrl ?? null,
    timeLimitSeconds: clampTimeLimitSeconds(
      question.timeLimitSeconds ?? QUESTION_TIME_LIMIT_DEFAULT_SECONDS,
    ),
    options: {
      create: question.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
    },
  };
}

const quizWithQuestions = {
  questions: {
    orderBy: { order: "asc" as const },
    include: { options: true },
  },
} as const;

export async function createQuiz(creatorId: string, input: CreateQuizInput) {
  input.questions.forEach(assertValidQuestion);

  return prisma.quiz.create({
    data: {
      creatorId,
      title: input.title,
      coverImage: input.coverImage ?? null,
      questions: {
        create: input.questions.map((q, index) => toQuestionCreateData(q, index)),
      },
    },
    include: quizWithQuestions,
  });
}

export async function listQuizzesByCreator(creatorId: string) {
  return prisma.quiz.findMany({
    where: { creatorId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getQuizForCreator(creatorId: string, quizId: string) {
  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, creatorId },
    include: quizWithQuestions,
  });
  if (!quiz) throw new NotFoundError("Quiz not found");
  return quiz;
}

export async function updateQuiz(creatorId: string, quizId: string, input: UpdateQuizInput) {
  await getQuizForCreator(creatorId, quizId); // 404s / ownership check
  return prisma.quiz.update({
    where: { id: quizId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.coverImage !== undefined ? { coverImage: input.coverImage } : {}),
    },
    include: quizWithQuestions,
  });
}

export async function deleteQuiz(creatorId: string, quizId: string): Promise<void> {
  await getQuizForCreator(creatorId, quizId);
  await prisma.quiz.delete({ where: { id: quizId } });
}

export async function addQuestion(creatorId: string, quizId: string, input: QuestionInput) {
  const quiz = await getQuizForCreator(creatorId, quizId);
  const nextOrder = quiz.questions.length;
  return prisma.question.create({
    data: { quizId, ...toQuestionCreateData(input, nextOrder) },
    include: { options: true },
  });
}

export async function updateQuestion(
  creatorId: string,
  quizId: string,
  questionId: string,
  input: Partial<QuestionInput>,
) {
  const quiz = await getQuizForCreator(creatorId, quizId);
  const existing = quiz.questions.find((q) => q.id === questionId);
  if (!existing) throw new NotFoundError("Question not found on this quiz");

  // Merge onto the existing question so a partial update (e.g. just the
  // time limit) still gets re-validated as a complete question.
  const merged: QuestionInput = {
    text: input.text ?? existing.text,
    mediaUrl: input.mediaUrl !== undefined ? input.mediaUrl : existing.mediaUrl,
    timeLimitSeconds: input.timeLimitSeconds ?? existing.timeLimitSeconds,
    options: input.options ?? existing.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
  };
  assertValidQuestion(merged);

  return prisma.$transaction(async (tx) => {
    if (input.options) {
      await tx.option.deleteMany({ where: { questionId } });
    }
    return tx.question.update({
      where: { id: questionId },
      data: {
        text: merged.text,
        mediaUrl: merged.mediaUrl ?? null,
        timeLimitSeconds: clampTimeLimitSeconds(merged.timeLimitSeconds!),
        ...(input.options
          ? { options: { create: merged.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) } }
          : {}),
      },
      include: { options: true },
    });
  });
}

export async function deleteQuestion(creatorId: string, quizId: string, questionId: string): Promise<void> {
  const quiz = await getQuizForCreator(creatorId, quizId);
  const existing = quiz.questions.find((q) => q.id === questionId);
  if (!existing) throw new NotFoundError("Question not found on this quiz");

  await prisma.$transaction(async (tx) => {
    await tx.question.delete({ where: { id: questionId } });
    // Re-pack `order` to stay contiguous (0..n-1) after a deletion.
    const remaining = await tx.question.findMany({
      where: { quizId },
      orderBy: { order: "asc" },
    });
    await Promise.all(
      remaining.map((q, index) =>
        q.order === index ? Promise.resolve() : tx.question.update({ where: { id: q.id }, data: { order: index } }),
      ),
    );
  });
}

export async function reorderQuestions(
  creatorId: string,
  quizId: string,
  questionIds: string[],
): Promise<void> {
  const quiz = await getQuizForCreator(creatorId, quizId);
  const existingIds = new Set(quiz.questions.map((q) => q.id));
  if (questionIds.length !== existingIds.size || !questionIds.every((id) => existingIds.has(id))) {
    throw new ValidationError("questionIds must be exactly the quiz's current question ids, in the new order");
  }

  // Two-phase update: the (quizId, order) unique constraint is checked
  // immediately (not deferred), so writing final order values directly
  // can collide mid-transaction (e.g. swapping orders 0 and 1). Stage
  // through negative placeholders first, which can never collide with an
  // existing non-negative order.
  await prisma.$transaction([
    ...questionIds.map((id, index) => prisma.question.update({ where: { id }, data: { order: -(index + 1) } })),
    ...questionIds.map((id, index) => prisma.question.update({ where: { id }, data: { order: index } })),
  ]);
}
