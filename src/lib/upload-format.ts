export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 6 * 1024 * 1024; // 6 MB max for audio clips

export function isSameUploadOrigin(
  origin: string | null,
  host: string | null,
): boolean {
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return (
      ["https:", "http:"].includes(parsed.protocol) &&
      parsed.host === host &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

/** Never trust a filename or a user-supplied MIME type. SVG is intentionally excluded. */
export function imageContentType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b))
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}

/** Validates audio magic numbers (MP3, WAV, OGG). */
export function audioContentType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  // MP3 ID3 header: 'ID3' (0x49, 0x44, 0x33)
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)
    return "audio/mpeg";
  // MP3 raw MPEG frame sync: 0xFF followed by 0xE0 mask
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    return "audio/mpeg";
  // WAV: 'RIFF' .... 'WAVE'
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WAVE"
  )
    return "audio/wav";
  // OGG: 'OggS'
  if (
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  )
    return "audio/ogg";
  return null;
}

/** Detects either image or audio format from raw binary bytes. */
export function mediaContentType(bytes: Uint8Array): string | null {
  return imageContentType(bytes) ?? audioContentType(bytes);
}

export function extensionForContentType(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpeg";
    case "image/webp":
      return ".webp";
    case "audio/mpeg":
      return ".mp3";
    case "audio/wav":
      return ".wav";
    case "audio/ogg":
      return ".ogg";
    default:
      return "";
  }
}
