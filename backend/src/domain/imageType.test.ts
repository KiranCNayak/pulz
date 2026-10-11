import { describe, expect, it } from "vitest";
import { sniffImageType } from "./imageType.js";

const bytes = (...values: number[]) => Uint8Array.from(values);

describe("sniffImageType (Decision #75)", () => {
  it("recognises the four accepted formats by their magic bytes", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe("image/jpeg");
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(sniffImageType(Buffer.from("GIF89a..."))).toBe("image/gif");
    expect(sniffImageType(Buffer.from("RIFF\x10\x00\x00\x00WEBPVP8 "))).toBe("image/webp");
  });

  it("rejects anything else, whatever it claims to be", () => {
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeUndefined();
    expect(sniffImageType(Buffer.from("<html><script>"))).toBeUndefined();
    expect(sniffImageType(Buffer.from("RIFF\x10\x00\x00\x00WAVE"))).toBeUndefined();
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeUndefined(); // truncated
    expect(sniffImageType(bytes())).toBeUndefined();
  });
});
