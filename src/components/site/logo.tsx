import { cn } from "@/lib/utils";

/** Wordmark: "quizza" with a dot-of-the-i replaced by a candy blob. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-display text-2xl font-extrabold tracking-tight text-ink",
        className,
      )}
    >
      <span>qu</span>
      <span className="relative mx-[1px] inline-block">
        i
        <span className="absolute -top-[0.28em] left-1/2 size-[0.3em] -translate-x-1/2 rounded-full bg-grape" />
      </span>
      <span>zza</span>
    </span>
  );
}
