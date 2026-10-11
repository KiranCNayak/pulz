import { prisma } from "../db/client.js";
import { CREATOR_IMAGE_QUOTA_BYTES } from "../domain/constants.js";
import { sniffImageType } from "../domain/imageType.js";
import { ValidationError } from "./quiz.service.js";

/** Stores one uploaded question image for this Creator (Decision #75).
 * The route has already capped the body at QUESTION_IMAGE_MAX_BYTES; this
 * checks the bytes really are an accepted image and that the Creator's
 * total stays under their quota. */
export async function createImage(creatorId: string, data: Buffer): Promise<{ id: string }> {
  const contentType = sniffImageType(data);
  if (!contentType) throw new ValidationError("Image must be a JPEG, PNG, WebP or GIF");

  const { _sum } = await prisma.questionImage.aggregate({ where: { creatorId }, _sum: { byteSize: true } });
  if ((_sum.byteSize ?? 0) + data.length > CREATOR_IMAGE_QUOTA_BYTES) {
    throw new ValidationError("Image storage for this account is full. Remove images from old quizzes first.");
  }

  return prisma.questionImage.create({
    data: { creatorId, contentType, byteSize: data.length, data },
    select: { id: true },
  });
}

export async function getImage(id: string) {
  return prisma.questionImage.findUnique({ where: { id }, select: { contentType: true, data: true } });
}

/** A question may only point at its own Creator's upload. */
export async function assertImageOwnedBy(creatorId: string, imageId: string): Promise<void> {
  const image = await prisma.questionImage.findFirst({ where: { id: imageId, creatorId }, select: { id: true } });
  if (!image) throw new ValidationError("Image not found");
}
