import { describe, expect, it } from "vitest";
import { isMediaUrl, mediaKind } from "./media";

describe("media URLs", () => {
  it.each([
    "javascript:alert(1)",
    "data:image/svg+xml,evil",
    "http://example.com/image.png",
    "/image.png",
    "https://user:password@example.com/img",
  ])("rejects %s", (value) => expect(isMediaUrl(value)).toBe(false));
  it("accepts direct HTTPS media links and recognizes query-bearing URLs", () => {
    expect(isMediaUrl("https://example.com/image.webp")).toBe(true);
    expect(mediaKind("https://example.com/a.MP4?token=abc")).toBe("video");
    expect(mediaKind("https://example.com/a.ogg")).toBe("audio");
    expect(mediaKind("https://example.com/a.webp")).toBe("image");
  });
});
