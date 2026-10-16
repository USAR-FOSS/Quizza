"use client";

import { useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { uploadImage } from "@/lib/upload-client";

export function ImageUpload({
  quizId,
  label = "Upload image",
  onUpload,
}: {
  quizId: string;
  label?: string;
  onUpload: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div>
      <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-xl border-2 border-ink/20 bg-white px-3 py-2 text-sm font-bold transition hover:border-grape focus-within:ring-2 focus-within:ring-grape">
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <ImagePlus className="size-4" />
        )}
        {busy ? "Preparing your image…" : label}
        <input
          type="file"
          aria-label={label}
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              onUpload(await uploadImage(file, { quizId }));
            } catch (err) {
              setError(err instanceof Error ? err.message : "Upload failed.");
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {error && (
        <p role="alert" className="mt-2 text-sm text-grape-dark">
          {error}
        </p>
      )}
    </div>
  );
}
