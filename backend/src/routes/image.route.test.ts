import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Prisma mocked, as in results.service.test.ts: this covers the request
// boundary (body limit, content type, sniffing, quota, caching headers),
// not a real Postgres round trip.
const prismaMock = vi.hoisted(() => ({
  creator: { findUnique: vi.fn() },
  questionImage: { aggregate: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
}));
vi.mock("../db/client.js", () => ({ prisma: prismaMock }));

import { CREATOR_IMAGE_QUOTA_BYTES, QUESTION_IMAGE_MAX_BYTES } from "../domain/constants.js";
import { imageRoutes } from "./image.route.js";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const IMAGE_ID = "0b6c1c39-6a0e-4f43-9a51-0f4b0f2f6c11";
const auth = { authorization: "Bearer creator-token" };

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  await app.register(imageRoutes);
  await app.ready();
});
afterAll(() => app.close());

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.creator.findUnique.mockResolvedValue({ id: "creator-1" });
  prismaMock.questionImage.aggregate.mockResolvedValue({ _sum: { byteSize: 0 } });
  prismaMock.questionImage.create.mockResolvedValue({ id: IMAGE_ID });
});

const upload = (body: Buffer, contentType = "image/png", headers: Record<string, string> = auth) =>
  app.inject({ method: "POST", url: "/images", headers: { ...headers, "content-type": contentType }, payload: body });

describe("POST /images (Decision #75)", () => {
  it("stores a real image under the type its bytes say it is", async () => {
    // Claimed JPEG, actually PNG: the sniffed type wins.
    const res = await upload(PNG, "image/jpeg");
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: IMAGE_ID });
    expect(prismaMock.questionImage.create.mock.calls[0][0].data).toMatchObject({
      creatorId: "creator-1",
      contentType: "image/png",
      byteSize: PNG.length,
    });
  });

  it("requires a Creator token", async () => {
    expect((await upload(PNG, "image/png", {})).statusCode).toBe(401);
  });

  it("refuses files over 5 MB", async () => {
    const tooBig = Buffer.concat([PNG, Buffer.alloc(QUESTION_IMAGE_MAX_BYTES)]);
    expect((await upload(tooBig)).statusCode).toBe(413);
    expect(prismaMock.questionImage.create).not.toHaveBeenCalled();
  });

  it("refuses other content types and non-image bytes", async () => {
    expect((await upload(Buffer.from("<svg/>"), "image/svg+xml")).statusCode).toBe(415);
    expect((await upload(Buffer.from("<svg/>"), "image/png")).statusCode).toBe(400);
    expect(prismaMock.questionImage.create).not.toHaveBeenCalled();
  });

  it("refuses an upload that would take the Creator over their quota", async () => {
    prismaMock.questionImage.aggregate.mockResolvedValue({ _sum: { byteSize: CREATOR_IMAGE_QUOTA_BYTES - 10 } });
    expect((await upload(PNG)).statusCode).toBe(400);
    expect(prismaMock.questionImage.create).not.toHaveBeenCalled();
  });
});

describe("GET /images/:id", () => {
  it("serves the stored bytes, cacheable for good and never sniffed", async () => {
    prismaMock.questionImage.findUnique.mockResolvedValue({ contentType: "image/png", data: new Uint8Array(PNG) });
    const res = await app.inject({ method: "GET", url: `/images/${IMAGE_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["cache-control"]).toContain("immutable");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.rawPayload.equals(PNG)).toBe(true);
  });

  it("404s an unknown id and 400s a malformed one", async () => {
    prismaMock.questionImage.findUnique.mockResolvedValue(null);
    expect((await app.inject({ method: "GET", url: `/images/${IMAGE_ID}` })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/images/not-a-uuid" })).statusCode).toBe(400);
  });
});
