import type { FastifyInstance } from "fastify";
import { QUESTION_IMAGE_MAX_BYTES } from "../domain/constants.js";
import { QUESTION_IMAGE_TYPES } from "../domain/imageType.js";
import * as imageService from "../services/image.service.js";
import { ValidationError } from "../services/quiz.service.js";
import { requireCreatorId } from "./creatorAuth.js";

const imageParamsSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string", format: "uuid" } },
  },
} as const;

// Question images (Decision #75). Upload is the raw file as the request
// body (Content-Type: image/*), not multipart — one file per request, so
// there's nothing for a multipart parser to do.
export async function imageRoutes(app: FastifyInstance): Promise<void> {
  // Scoped to this plugin: only these routes accept image bodies.
  app.addContentTypeParser(
    [...QUESTION_IMAGE_TYPES],
    { parseAs: "buffer", bodyLimit: QUESTION_IMAGE_MAX_BYTES },
    (_request, body, done) => done(null, body),
  );

  app.post<{ Body: Buffer }>("/images", { bodyLimit: QUESTION_IMAGE_MAX_BYTES }, async (request, reply) => {
    const creatorId = await requireCreatorId(request, reply);
    if (!creatorId) return;
    if (!Buffer.isBuffer(request.body)) {
      return reply.code(415).send({ error: "Send the image file as the body, with an image Content-Type" });
    }
    try {
      reply.code(201).send(await imageService.createImage(creatorId, request.body));
    } catch (err) {
      if (err instanceof ValidationError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  // Public, like results: Display screens and Host tabs load these with a
  // plain <img>, and the unguessable UUID is the access control. Rows are
  // immutable, so browsers may cache them for good.
  app.get<{ Params: { id: string } }>("/images/:id", { schema: imageParamsSchema }, async (request, reply) => {
    const image = await imageService.getImage(request.params.id);
    if (!image) return reply.code(404).send({ error: "Image not found" });
    reply
      .header("Content-Type", image.contentType)
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .header("X-Content-Type-Options", "nosniff")
      .send(Buffer.from(image.data));
  });
}
