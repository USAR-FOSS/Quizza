import { cn } from "@/lib/utils";

/** Quip, our little question card. SVG keeps the illustration crisp and light. */
export function QuizBuddy({
  className,
  mood = "happy",
}: {
  className?: string;
  mood?: "happy" | "thinking" | "wave" | "locked" | "celebrate";
}) {
  return (
    <svg
      viewBox="0 0 240 220"
      fill="none"
      aria-hidden="true"
      className={cn("w-44", className)}
    >
      <ellipse cx="122" cy="201" rx="68" ry="10" fill="#201C35" opacity=".08" />
      <path
        d={
          mood === "wave" || mood === "celebrate"
            ? "m61 132-25-15-9-25m149 45 25-30 9-22"
            : "m61 132-25 8-9-12m149 9 25-12 9 10"
        }
        stroke="#201C35"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m85 175-8 24H62m90-24 8 24h15"
        stroke="#201C35"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <g transform="rotate(-8 120 110)">
        <rect x="59" y="39" width="135" height="145" rx="30" fill="#201C35" />
        <rect
          x="50"
          y="29"
          width="135"
          height="145"
          rx="30"
          fill={
            mood === "celebrate"
              ? "#D5F48A"
              : mood === "locked"
                ? "#F9C569"
                : "#C9BAFF"
          }
          stroke="#201C35"
          strokeWidth="4"
        />
        <path
          d="m144 30 41 41h-25a16 16 0 0 1-16-16V30Z"
          fill="#F5F0FF"
          stroke="#201C35"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <ellipse cx="92" cy="100" rx="7" ry="11" fill="#201C35" />
        <ellipse cx="140" cy="100" rx="7" ry="11" fill="#201C35" />
        <circle cx="77" cy="118" r="9" fill="#F2A2AD" />
        <circle cx="155" cy="118" r="9" fill="#F2A2AD" />
        {mood === "happy" || mood === "wave" || mood === "celebrate" ? (
          <path
            d="M103 122q13 18 27 0"
            stroke="#201C35"
            strokeWidth="4"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M110 132h13"
            stroke="#201C35"
            strokeWidth="4"
            strokeLinecap="round"
          />
        )}
      </g>
      <path
        d="m30 42 4-15 5 15 14 5-14 5-5 14-4-14-14-5 14-5Z"
        fill="#D5F66B"
        stroke="#201C35"
        strokeWidth="3"
      />
      <path d="m204 57 3-9 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="#F9C569" />
      <path
        d="m202 161 5 5m-3-19 8-2"
        stroke="#201C35"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
