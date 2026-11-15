"use client";

import { useState } from "react";
import { ImagePlus, Loader2, Music } from "lucide-react";
import { uploadMedia } from "@/lib/upload-client";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";

export function ImageUpload({
  quizId,
  label = "Upload media",
  allowCrop = false,
  allowAudio = false,
  onUpload,
}: {
  quizId: string;
  label?: string;
  allowCrop?: boolean;
  allowAudio?: boolean;
  onUpload: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cropFile, setCropFile] = useState<File | null>(null);

  const startUpload = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      onUpload(await uploadMedia(file, { quizId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const acceptTypes = allowAudio
    ? "image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,audio/ogg"
    : "image/png,image/jpeg,image/webp";

  return (
    <div>
      <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-xl border-2 border-ink/20 bg-white px-3 py-2 text-sm font-bold transition hover:border-grape focus-within:ring-2 focus-within:ring-grape">
        {busy ? (
          <Loader2 className="size-4 animate-spin text-grape" />
        ) : allowAudio ? (
          <Music className="size-4 text-grape" />
        ) : (
          <ImagePlus className="size-4 text-grape" />
        )}
        {busy ? "Uploading media…" : label}
        <input
          type="file"
          aria-label={label}
          accept={acceptTypes}
          disabled={busy}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;

            // If it's an image and crop is allowed, open cropper dialog first
            if (allowCrop && file.type.startsWith("image/")) {
              setCropFile(file);
              return;
            }

            await startUpload(file);
          }}
        />
      </label>
      {cropFile && (
        <ImageCropDialog
          file={cropFile}
          onCrop={async (cropped) => {
            setCropFile(null);
            await startUpload(cropped);
          }}
          onCancel={() => setCropFile(null)}
        />
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-grape-dark">
          {error}
        </p>
      )}
    </div>
  );
}
