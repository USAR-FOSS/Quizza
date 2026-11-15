/**
 * Zero-dependency, lightweight QR Code (Model 2) SVG matrix generator.
 * Fully self-contained, pure TypeScript. Encodes UTF-8 / ASCII strings
 * into a 2D boolean matrix (true = dark module, false = light module).
 */

// Galois Field GF(256) with primitive polynomial 0x11d (x^8 + x^4 + x^3 + x^2 + 1)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_EXP[i + 255] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x] + GF_LOG[y]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], GF_EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsCalculateEcc(data: Uint8Array, eccCount: number): Uint8Array {
  const gen = rsGeneratorPoly(eccCount);
  const res = new Uint8Array(eccCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    res.copyWithin(0, 1);
    res[eccCount - 1] = 0;
    for (let j = 0; j < eccCount; j++) {
      res[j] ^= gfMul(gen[j], factor);
    }
  }
  return res;
}

// Version table for ECC Level M: [version, totalModules, totalDataBytes, eccBytesPerBlock, blocks]
interface VersionInfo {
  version: number;
  size: number;
  dataCapacity: number;
  eccPerBlock: number;
  numBlocks: number;
  alignmentPositions: number[];
}

const VERSIONS: VersionInfo[] = [
  { version: 1, size: 21, dataCapacity: 16, eccPerBlock: 10, numBlocks: 1, alignmentPositions: [] },
  { version: 2, size: 25, dataCapacity: 28, eccPerBlock: 16, numBlocks: 1, alignmentPositions: [6, 18] },
  { version: 3, size: 29, dataCapacity: 44, eccPerBlock: 26, numBlocks: 1, alignmentPositions: [6, 22] },
  { version: 4, size: 33, dataCapacity: 64, eccPerBlock: 18, numBlocks: 2, alignmentPositions: [6, 26] },
  { version: 5, size: 37, dataCapacity: 86, eccPerBlock: 24, numBlocks: 2, alignmentPositions: [6, 30] },
  { version: 6, size: 41, dataCapacity: 108, eccPerBlock: 16, numBlocks: 4, alignmentPositions: [6, 34] },
];

function selectVersion(byteLength: number): VersionInfo {
  for (const v of VERSIONS) {
    // 4 bits mode + 8 bits length (for V1-9) + bytes
    const requiredBits = 4 + 8 + byteLength * 8;
    const requiredBytes = Math.ceil(requiredBits / 8);
    if (requiredBytes <= v.dataCapacity) return v;
  }
  return VERSIONS[VERSIONS.length - 1];
}

export type QRMatrix = boolean[][];

export function generateQRMatrix(text: string): QRMatrix {
  const utf8 = new TextEncoder().encode(text);
  const version = selectVersion(utf8.length);
  const size = version.size;

  // 1. Bitstream creation (Byte mode: 0100)
  const bits: number[] = [0, 1, 0, 0];
  // 8-bit character count indicator
  const len = utf8.length;
  for (let i = 7; i >= 0; i--) bits.push((len >> i) & 1);
  // Byte data
  for (let i = 0; i < utf8.length; i++) {
    const b = utf8[i];
    for (let j = 7; j >= 0; j--) bits.push((b >> j) & 1);
  }
  // Terminator
  while (bits.length < version.dataCapacity * 8 && bits.length % 8 !== 0) bits.push(0);
  while (bits.length < version.dataCapacity * 8 && bits.length < version.dataCapacity * 8) {
    if (bits.length + 4 <= version.dataCapacity * 8) bits.push(0, 0, 0, 0);
    else while (bits.length < version.dataCapacity * 8) bits.push(0);
  }
  // Pad bytes: 0xEC, 0x11
  const dataBytes = new Uint8Array(version.dataCapacity);
  for (let i = 0; i < dataBytes.length; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      const bitIndex = i * 8 + j;
      if (bitIndex < bits.length) byte = (byte << 1) | bits[bitIndex];
      else {
        const pad = (i % 2 === 0) ? 0xec : 0x11;
        byte = pad;
        break;
      }
    }
    dataBytes[i] = byte;
  }

  // 2. Error Correction calculation
  const blockSize = Math.floor(version.dataCapacity / version.numBlocks);
  const blocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];
  for (let b = 0; b < version.numBlocks; b++) {
    const block = dataBytes.slice(b * blockSize, (b + 1) * blockSize);
    blocks.push(block);
    eccBlocks.push(rsCalculateEcc(block, version.eccPerBlock));
  }

  // Interleave data and ecc
  const finalCodewords: number[] = [];
  for (let i = 0; i < blockSize; i++) {
    for (let b = 0; b < version.numBlocks; b++) finalCodewords.push(blocks[b][i]);
  }
  for (let i = 0; i < version.eccPerBlock; i++) {
    for (let b = 0; b < version.numBlocks; b++) finalCodewords.push(eccBlocks[b][i]);
  }

  // 3. Matrix allocation (null = unassigned, true = dark, false = light)
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null)
  );

  function setModule(r: number, c: number, val: boolean) {
    if (r >= 0 && r < size && c >= 0 && c < size) matrix[r][c] = val;
  }

  // 4. Place Finder Patterns (7x7) + Separators
  function placeFinder(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          const isDark = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
          matrix[nr][nc] = isDark;
        } else {
          matrix[nr][nc] = false; // separator
        }
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // 5. Alignment Patterns (5x5)
  if (version.alignmentPositions.length > 0) {
    const pos = version.alignmentPositions;
    for (const r of pos) {
      for (const c of pos) {
        if (matrix[r][c] !== null) continue; // skip if overlaps finder
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isDark = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
            matrix[r + dr][c + dc] = isDark;
          }
        }
      }
    }
  }

  // 6. Timing Patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
  }

  // 7. Dark module
  matrix[4 * version.version + 9][8] = true;

  // 8. Reserve Format Information areas
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }
  for (let i = size - 8; i < size; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }

  // 9. Data placement in zigzag columns
  let bitIdx = 0;
  const allBits: number[] = [];
  for (const cw of finalCodewords) {
    for (let i = 7; i >= 0; i--) allBits.push((cw >> i) & 1);
  }

  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // skip timing column
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const c of [right, right - 1]) {
        if (matrix[r][c] === null) {
          const bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
          // Apply Mask Pattern 0: (row + col) % 2 == 0
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = (bit === 1) !== mask;
        }
      }
    }
    upward = !upward;
  }

  // 10. Format information for ECC Level M (00) and Mask 0 (000)
  // Format bit string for Level M / Mask 0 with BCH error code: 101010000010010
  const FORMAT_BITS = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];

  for (let i = 0; i < 6; i++) matrix[8][i] = Boolean(FORMAT_BITS[i]);
  matrix[8][7] = Boolean(FORMAT_BITS[6]);
  matrix[8][8] = Boolean(FORMAT_BITS[7]);
  matrix[7][8] = Boolean(FORMAT_BITS[8]);
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = Boolean(FORMAT_BITS[i]);

  for (let i = 0; i < 7; i++) matrix[size - 1 - i][8] = Boolean(FORMAT_BITS[i]);
  for (let i = 7; i < 15; i++) matrix[8][size - 15 + i] = Boolean(FORMAT_BITS[i]);

  return matrix.map((row) => row.map((m) => Boolean(m)));
}

/**
 * Generates an SVG path data string (`d="..."`) for all dark modules.
 * This yields super-crisp, high-performance vector rendering.
 */
export function qrToSvgPath(matrix: QRMatrix): { path: string; size: number } {
  const size = matrix.length;
  let d = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        d += `M${c},${r}h1v1h-1z `;
      }
    }
  }
  return { path: d.trim(), size };
}
