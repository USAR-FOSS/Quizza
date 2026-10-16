import { describe, it, expect } from "vitest";
import { imageContentType, isSameUploadOrigin } from "./upload-format";
import { isMediaUrl, mediaKind } from "./media";

describe("image uploads", () => {
  it("checks the browser-visible host and safely rejects invalid origins", () => {
    expect(isSameUploadOrigin("http://127.0.0.1:3001", "127.0.0.1:3001")).toBe(
      true,
    );
    expect(
      isSameUploadOrigin("https://quiz.example.com", "quiz.example.com"),
    ).toBe(true);
    for (const origin of [
      null,
      "null",
      "https://elsewhere.test",
      "http://[invalid",
      "ftp://quiz.example.com",
      "https://user:pass@quiz.example.com",
    ])
      expect(isSameUploadOrigin(origin, "quiz.example.com")).toBe(false);
  });
  it("recognizes only supported binary image signatures", () => {
    expect(
      imageContentType(
        Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]),
      ),
    ).toBe("image/png");
    expect(
      imageContentType(
        Uint8Array.from([255, 216, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      ),
    ).toBe("image/jpeg");
    expect(imageContentType(new TextEncoder().encode("RIFF0000WEBP"))).toBe(
      "image/webp",
    );
    expect(
      imageContentType(new TextEncoder().encode('<svg onload="alert(1)">')),
    ).toBeNull();
    expect(
      imageContentType(new TextEncoder().encode("<html>not an image</html>")),
    ).toBeNull();
    expect(imageContentType(new Uint8Array())).toBeNull();
  });
  it("accepts only tightly scoped local asset paths", () => {
    const url = "/api/v1/uploads/12345678-1234-1234-1234-123456789abc";
    expect(isMediaUrl(url)).toBe(true);
    expect(mediaKind(url)).toBe("image");
    for (const bad of [
      "//evil.test/x",
      "/api/v1/uploads/../../auth",
      url + "?x=1",
      "/other.png",
      "data:image/svg+xml,<svg/>",
    ])
      expect(isMediaUrl(bad)).toBe(false);
  });
});
