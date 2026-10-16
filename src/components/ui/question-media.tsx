"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { isMediaUrl, mediaKind } from "@/lib/media";

export function QuestionMedia({ url }: { url?: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || !isMediaUrl(url)) return null;
  const kind = mediaKind(url);
  return (
    <figure className="mt-5 overflow-hidden rounded-2xl border-2 border-ink/15 bg-paper-2">
      {failedUrl === url ? (
        <p className="flex items-center justify-center gap-2 p-6 text-sm text-ink-soft">
          <ImageOff className="size-5" />
          This media couldn’t load.
        </p>
      ) : kind === "video" ? (
        <video
          src={url}
          controls
          preload="metadata"
          playsInline
          className="max-h-72 w-full"
          onError={() => setFailedUrl(url)}
        />
      ) : kind === "audio" ? (
        <audio
          src={url}
          controls
          preload="metadata"
          className="w-full p-3"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        // Arbitrary host-provided URLs load directly, without a server image proxy.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Question illustration"
          referrerPolicy="no-referrer"
          className="max-h-72 w-full object-contain"
          onError={() => setFailedUrl(url)}
        />
      )}
    </figure>
  );
}
