/** Resize locally: faster uploads, no EXIF/location metadata, modest database size. */
export async function uploadImage(
  file: File,
  scope: { quizId: string } | { code: string; clientToken: string },
): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 15 * 1024 * 1024
  )
    throw new Error("Choose a PNG, JPEG or WebP image under 15 MB.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That image could not be opened. Try another file.");
  });
  const maxSide = "quizId" in scope ? 1600 : 400;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.85),
  );
  if (!blob) throw new Error("Could not prepare this image. Try another file.");
  const headers: Record<string, string> = { "content-type": blob.type };
  if ("quizId" in scope) headers["x-quiz-id"] = scope.quizId;
  else {
    headers["x-room-code"] = scope.code;
    headers["x-client-token"] = scope.clientToken;
  }
  const response = await fetch("/api/v1/uploads", {
    method: "POST",
    headers,
    body: blob,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error?.message ?? "Upload failed. Please try again.",
    );
  return result.url;
}
