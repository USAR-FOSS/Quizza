/** URLs are rendered by the browser only; never fetched by our server. */
export function isMediaUrl(value: string): boolean {
  if (isUploadUrl(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function mediaKind(value: string): "image" | "video" | "audio" {
  const path = new URL(value, "https://quizza.invalid").pathname.toLowerCase();
  if (/\.(mp4|webm|ogv)$/.test(path)) return "video";
  if (/\.(mp3|wav|ogg|m4a)$/.test(path)) return "audio";
  return "image";
}

export function isUploadUrl(value: string): boolean {
  return /^\/api\/v1\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
    value,
  );
}
