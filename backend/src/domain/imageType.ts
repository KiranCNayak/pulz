// Question-image type check (Decision #75). The stored Content-Type comes
// from the file's own magic bytes, not from what the uploader claimed, so
// GET /images/:id can only ever serve one of these four raster formats —
// never SVG or HTML, which a browser would run script from.

export const QUESTION_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type QuestionImageType = (typeof QUESTION_IMAGE_TYPES)[number];

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);
}

/** The image format these bytes actually are, or undefined if they're not
 * one we accept. */
export function sniffImageType(bytes: Uint8Array): QuestionImageType | undefined {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif"; // "GIF8"
  // "RIFF" <size> "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return undefined;
}
