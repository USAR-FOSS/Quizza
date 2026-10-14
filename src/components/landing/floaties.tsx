"use client";

import { motion } from "motion/react";

/**
 * Decorative shapes that drift gently behind the hero. Purely cosmetic and
 * aria-hidden. Respects reduced-motion via the global CSS rule.
 */
const shapes = [
  { top: "14%", left: "7%", size: 56, color: "bg-grape", radius: "rounded-2xl", rot: -12, delay: 0 },
  { top: "24%", left: "84%", size: 40, color: "bg-coral", radius: "rounded-full", rot: 8, delay: 0.5 },
  { top: "66%", left: "6%", size: 48, color: "bg-sun", radius: "rounded-xl", rot: 10, delay: 0.3 },
  { top: "74%", left: "86%", size: 44, color: "bg-mint", radius: "rounded-2xl", rot: -6, delay: 0.8 },
  { top: "44%", left: "91%", size: 32, color: "bg-sky", radius: "rounded-full", rot: 14, delay: 1.1 },
  { top: "52%", left: "3%", size: 36, color: "bg-lime", radius: "rounded-lg", rot: -10, delay: 0.45 },
];

export function Floaties() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {shapes.map((s, i) => (
        <motion.span
          key={i}
          className={`absolute block border-2 border-ink ${s.color} ${s.radius}`}
          style={{ top: s.top, left: s.left, width: s.size, height: s.size, rotate: `${s.rot}deg` }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1, y: [0, -16, 0] }}
          transition={{
            opacity: { delay: s.delay, duration: 0.5 },
            scale: { delay: s.delay, duration: 0.5, ease: [0.68, -0.55, 0.27, 1.55] },
            y: {
              delay: s.delay,
              duration: 5 + i * 0.4,
              repeat: Infinity,
              ease: "easeInOut",
            },
          }}
        />
      ))}
    </div>
  );
}
