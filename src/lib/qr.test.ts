import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateQRMatrix, qrToSvgPath } from "./qr.ts";

describe("generateQRMatrix", () => {
  it("generates a square matrix of expected size for short text", () => {
    const text = "https://quizza.club/play/428193";
    const matrix = generateQRMatrix(text);
    assert.equal(Array.isArray(matrix), true);
    assert.ok(matrix.length >= 21);
    assert.equal(matrix[0].length, matrix.length);
  });

  it("places finder patterns in top-left, top-right, and bottom-left", () => {
    const matrix = generateQRMatrix("test");
    const size = matrix.length;

    // Top-left finder center (row 3, col 3) is true
    assert.equal(matrix[3][3], true);
    // Top-left finder corner (0,0) is true
    assert.equal(matrix[0][0], true);
    // Top-right finder corner (0, size-1) is true
    assert.equal(matrix[0][size - 1], true);
    // Bottom-left finder corner (size-1, 0) is true
    assert.equal(matrix[size - 1][0], true);

    // Separators around finder (e.g. (7,0), (0,7)) should be false
    assert.equal(matrix[7][0], false);
    assert.equal(matrix[0][7], false);
  });

  it("converts matrix to clean SVG path data", () => {
    const matrix = generateQRMatrix("https://quizza.club/play/123456");
    const { path, size } = qrToSvgPath(matrix);
    assert.equal(size, matrix.length);
    assert.equal(path.startsWith("M"), true);
    assert.equal(path.includes("h1v1h-1z"), true);
  });
});
