import {
  QUESTION_OPTIONS_MAX,
  QUESTION_OPTIONS_MIN,
  QUESTION_TIME_LIMIT_MAX_SECONDS,
  QUESTION_TIME_LIMIT_MIN_SECONDS,
} from "../domain/constants.js";

// Fastify/AJV JSON schemas — validated at the request boundary before a
// handler ever runs (ARCHITECTURE.md §1: "useful for enforcing the PRD's
// validation rules ... at the request boundary, not just in the DB").
// Cheap structural checks (types, lengths, ranges) live here; the
// "exactly one correct option" cross-field invariant is checked in
// quiz.service.ts since JSON Schema can't express it cleanly.

const optionSchema = {
  type: "object",
  required: ["text", "isCorrect"],
  additionalProperties: false,
  properties: {
    text: { type: "string", minLength: 1, maxLength: 200 },
    isCorrect: { type: "boolean" },
  },
} as const;

const questionSchema = {
  type: "object",
  required: ["text", "options"],
  additionalProperties: false,
  properties: {
    text: { type: "string", minLength: 1, maxLength: 500 },
    mediaUrl: { type: ["string", "null"], format: "uri" },
    timeLimitSeconds: {
      type: "integer",
      minimum: QUESTION_TIME_LIMIT_MIN_SECONDS,
      maximum: QUESTION_TIME_LIMIT_MAX_SECONDS,
    },
    options: {
      type: "array",
      minItems: QUESTION_OPTIONS_MIN,
      maxItems: QUESTION_OPTIONS_MAX,
      items: optionSchema,
    },
  },
} as const;

export const createQuizSchema = {
  body: {
    type: "object",
    required: ["title", "questions"],
    additionalProperties: false,
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      coverImage: { type: ["string", "null"], format: "uri" },
      questions: { type: "array", items: questionSchema },
    },
  },
} as const;

export const updateQuizSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      coverImage: { type: ["string", "null"], format: "uri" },
    },
  },
} as const;

export const addQuestionSchema = {
  body: questionSchema,
} as const;

export const updateQuestionSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      text: { type: "string", minLength: 1, maxLength: 500 },
      mediaUrl: { type: ["string", "null"], format: "uri" },
      timeLimitSeconds: {
        type: "integer",
        minimum: QUESTION_TIME_LIMIT_MIN_SECONDS,
        maximum: QUESTION_TIME_LIMIT_MAX_SECONDS,
      },
      options: {
        type: "array",
        minItems: QUESTION_OPTIONS_MIN,
        maxItems: QUESTION_OPTIONS_MAX,
        items: optionSchema,
      },
    },
  },
} as const;

export const reorderQuestionsSchema = {
  body: {
    type: "object",
    required: ["questionIds"],
    additionalProperties: false,
    properties: {
      questionIds: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
      },
    },
  },
} as const;
