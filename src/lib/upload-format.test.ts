import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  audioContentType,
  extensionForContentType,
  imageContentType,
  isSameUploadOrigin,
  mediaContentType,
} from "./upload-format.ts";
import { isMediaUrl, mediaKind } from "./media.ts";

describe("image and audio uploads", () => {
  it("checks the browser-visible host and safely rejects invalid origins", () => {
    assert.equal(isSameUploadOrigin("http://127.0.0.1:3001", "127.0.0.1:3001"), true);
    assert.equal(isSameUploadOrigin("https://quiz.example.com", "quiz.example.com"), true);
    for (const origin of [
      null,
      "null",
      "https://elsewhere.test",
      "http://[invalid",
      "ftp://quiz.example.com",
      "https://user:pass@quiz.example.com",
    ]) {
      assert.equal(isSameUploadOrigin(origin, "quiz.example.com"), false);
    }
  });

  it("recognizes only supported binary image signatures", () => {
    assert.equal(
      imageContentType(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])),
      "image/png",
    );
    assert.equal(
      imageContentType(Uint8Array.from([255, 216, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0])),
      "image/jpeg",
    );
    assert.equal(imageContentType(new TextEncoder().encode("RIFF0000WEBP")), "image/webp");
    assert.equal(imageContentType(new TextEncoder().encode('<svg onload="alert(1)">')), null);
    assert.equal(imageContentType(new TextEncoder().encode("<html>not an image</html>")), null);
    assert.equal(imageContentType(new Uint8Array()), null);
  });

  it("recognizes audio binary signatures for MP3, WAV, and OGG", () => {
    // MP3 with ID3 header
    const id3 = new Uint8Array(16);
    id3.set([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]);
    assert.equal(audioContentType(id3), "audio/mpeg");

    // MP3 raw frame sync
    const rawMpeg = new Uint8Array(16);
    rawMpeg.set([0xff, 0xfb, 0x90, 0x64]);
    assert.equal(audioContentType(rawMpeg), "audio/mpeg");

    // WAV RIFF
    const wav = new Uint8Array(16);
    wav.set([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
    assert.equal(audioContentType(wav), "audio/wav");

    // OGG
    const ogg = new Uint8Array(16);
    ogg.set([0x4f, 0x67, 0x67, 0x53]);
    assert.equal(audioContentType(ogg), "audio/ogg");

    // Invalid / empty
    assert.equal(audioContentType(new Uint8Array([1, 2, 3])), null);
  });

  it("maps extensions correctly for audio and image types", () => {
    assert.equal(extensionForContentType("audio/mpeg"), ".mp3");
    assert.equal(extensionForContentType("audio/wav"), ".wav");
    assert.equal(extensionForContentType("audio/ogg"), ".ogg");
    assert.equal(extensionForContentType("image/png"), ".png");
    assert.equal(extensionForContentType("image/jpeg"), ".jpeg");
    assert.equal(extensionForContentType("image/webp"), ".webp");
    assert.equal(extensionForContentType("unknown/type"), "");
  });

  it("detects audio URLs in media helpers", () => {
    assert.equal(mediaKind("https://example.com/sound.mp3"), "audio");
    assert.equal(mediaKind("https://example.com/song.wav"), "audio");
    assert.equal(mediaKind("https://example.com/track.ogg"), "audio");
    assert.equal(mediaKind("/api/v1/uploads/test.mp3"), "audio");
    assert.equal(mediaKind("https://example.com/image.png"), "image");
    assert.equal(mediaKind("https://example.com/video.mp4"), "video");
  });
});
