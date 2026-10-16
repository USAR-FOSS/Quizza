"use client";
import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { Avatar } from "./avatar";

export function AvatarChoice({
  name,
  color,
  file,
  onChange,
}: {
  name: string;
  color: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      setPreview(typeof reader.result === "string" ? reader.result : undefined);
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);
  return (
    <div className="my-4 flex items-center gap-3 rounded-2xl bg-paper-2 p-3">
      <Avatar
        name={name}
        color={color}
        src={file ? preview : undefined}
        size="lg"
      />
      <div>
        <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-lg px-1 py-2 text-sm font-bold focus-within:ring-2 focus-within:ring-grape">
          <Camera className="size-4" />
          {file ? "Change photo" : "Add your photo"}
          <input
            className="absolute inset-0 w-full opacity-0"
            aria-label="Upload player photo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              onChange(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
        <p className="text-xs text-ink-soft">
          Optional. Your room will see it.
        </p>
        {file && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="mt-1 text-xs underline"
          >
            Remove photo
          </button>
        )}
      </div>
    </div>
  );
}
