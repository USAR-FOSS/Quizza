"use client";

import { useState } from "react";
import { ImageOff, Volume2 } from "lucide-react";
import { isMediaUrl, mediaKind } from "@/lib/media";

export function QuestionMedia({ url }: { url?: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || !isMediaUrl(url)) return null;
  const kind = mediaKind(url);
  return (
    <figure className="mt-5 overflow-hidden rounded-2xl border-2 border-ink/15 bg-paper-2">
      {failedUrl === url ? (
        <div className="flex items-center justify-center gap-2 p-6 text-sm text-ink-soft">
          <ImageOff className="size-5" />
          Media unavailable.
          <button type="button" className="font-bold underline" onClick={() => setFailedUrl(null)}>Retry</button>
        </div>
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
        <div className="flex flex-col items-center justify-center p-6 text-center">
          <div className="mb-3 flex size-14 items-center justify-center rounded-2xl border-2 border-ink bg-sun/40 shadow-pop">
            <Volume2 className="size-7 text-ink" />
          </div>
          <p className="font-display text-base font-extrabold text-ink">
            Audio prompt
          </p>
          <p className="mb-4 text-xs font-semibold text-ink-soft">
            Listen to the sound clip before submitting your answer
          </p>
          <audio
            src={url}
            controls
            preload="metadata"
            className="w-full max-w-md accent-grape"
            onError={() => setFailedUrl(url)}
          />
        </div>
      ) : (
        // Arbitrary host-provided URLs load directly, without a server image proxy.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt="Question illustration"
          referrerPolicy="no-referrer"
          loading="eager"
          className="max-h-72 min-h-24 w-full object-contain"
          onError={() => setFailedUrl(url)}
        />
      )}
    </figure>
  );
}
