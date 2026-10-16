"use client";

import { useState } from "react";
import { isMediaUrl } from "@/lib/media";
import { COLOR_BG, COLOR_TEXT, type OptionColor } from "@/lib/quiz-constants";
import { cn } from "@/lib/utils";

const sizes = {
  sm: "size-7 text-sm",
  md: "size-10 text-base",
  lg: "size-14 text-xl",
};

/** A colored monogram avatar derived from a nickname. No emoji. */
export function Avatar({
  name,
  color,
  size = "md",
  className,
  src,
}: {
  name: string;
  color: string;
  size?: keyof typeof sizes;
  className?: string;
  src?: string | null;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-ink font-display font-extrabold text-white",
        COLOR_BG[(color as OptionColor) ?? "grape"] ?? "bg-grape",
        COLOR_TEXT[color as OptionColor] ?? "text-white",
        sizes[size],
        className,
      )}
      aria-hidden
    >
      {initial}
      {src &&
        src !== failed &&
        (isMediaUrl(src) ||
          /^data:image\/(png|jpeg|webp);base64,/.test(src)) && (
          // Uploaded images are already resized; no server proxy is needed.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="absolute inset-0 size-full object-cover"
            referrerPolicy="no-referrer"
            onError={() => setFailed(src)}
          />
        )}
    </span>
  );
}
