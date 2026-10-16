export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

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
