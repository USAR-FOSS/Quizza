import { COLOR_BG, type OptionColor } from "@/lib/quiz-constants";
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
}: {
  name: string;
  color: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border-2 border-ink font-display font-extrabold text-white",
        COLOR_BG[(color as OptionColor) ?? "grape"] ?? "bg-grape",
        sizes[size],
        className,
      )}
      aria-hidden
    >
      {initial}
    </span>
  );
}
