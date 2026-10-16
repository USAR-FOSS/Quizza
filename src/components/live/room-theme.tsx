import type { CSSProperties } from "react";
import { isMediaUrl } from "@/lib/media";
import { COVER_ICON_MAP } from "@/components/ui/quiz-icons";

const palettes: Record<string, [string, string, string]> = {
  grape: ["#6746d9", "#faf9f6", "#eee8fa"],
  coral: ["#ac3457", "#fff7f5", "#f9e4e5"],
  mint: ["#176747", "#f4faf5", "#e1eee5"],
  sky: ["#225d9f", "#f5f9fd", "#e1ebf5"],
  sun: ["#885607", "#fffbf0", "#f5ecd6"],
  lime: ["#4b641a", "#f9fbf1", "#eaf0d7"],
};

export function RoomTheme({
  theme,
  className,
  children,
}: {
  theme: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [accent, paper, surface] = palettes[theme] ?? palettes.grape;
  return (
    <div
      className={className}
      style={
        {
          "--color-grape": accent,
          "--color-grape-dark": accent,
          "--color-paper": paper,
          "--color-paper-2": surface,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

export function QuizCover({
  quiz,
}: {
  quiz: {
    title: string;
    coverImage?: string | null;
    iconImage?: string | null;
    coverIcon?: string;
  };
}) {
  const Icon =
    COVER_ICON_MAP[quiz.coverIcon ?? "shapes"] ?? COVER_ICON_MAP.shapes;
  return (
    <div className="relative mb-5 overflow-hidden rounded-2xl border border-ink/10 bg-grape/10">
      {quiz.coverImage && isMediaUrl(quiz.coverImage) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={quiz.coverImage}
          alt={`Cover for ${quiz.title}`}
          className="max-h-48 w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="h-16 bg-[radial-gradient(circle_at_20%_50%,#ffffff70_0_20%,transparent_20%)]" />
      )}
      <div className="absolute bottom-2 left-3 flex size-11 items-center justify-center overflow-hidden rounded-xl border-2 border-ink bg-paper shadow-pop">
        {quiz.iconImage && isMediaUrl(quiz.iconImage) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={quiz.iconImage}
            alt=""
            className="size-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <Icon className="size-6" />
        )}
      </div>
    </div>
  );
}
