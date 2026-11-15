"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { generateQRMatrix, qrToSvgPath } from "@/lib/qr";
import { cn } from "@/lib/utils";

interface QRCodeProps {
  value: string;
  size?: number;
  className?: string;
  foreground?: string;
  background?: string;
  label?: string;
}

/**
 * High-performance, zero-dependency SVG QR Code component.
 * Renders crisp vector paths without external native canvas or DOM dependencies.
 */
export function QRCode({
  value,
  size = 220,
  className,
  foreground = "#1e1e24", // ink
  background = "#ffffff",
  label = "Scan QR code to join room",
}: QRCodeProps) {
  const { path, matrixSize } = useMemo(() => {
    try {
      const matrix = generateQRMatrix(value);
      const { path, size } = qrToSvgPath(matrix);
      return { path, matrixSize: size };
    } catch {
      return { path: "", matrixSize: 21 };
    }
  }, [value]);

  const padding = 2; // quiet zone in module units
  const totalSize = matrixSize + padding * 2;

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center justify-center rounded-2xl border-2 border-ink bg-white p-4 shadow-pop",
        className,
      )}
    >
      <svg
        role="img"
        aria-label={label}
        viewBox={`-${padding} -${padding} ${totalSize} ${totalSize}`}
        width={size}
        height={size}
        style={{ shapeRendering: "crispEdges" }}
        className="max-w-full"
      >
        <rect
          x={-padding}
          y={-padding}
          width={totalSize}
          height={totalSize}
          fill={background}
        />
        <path d={path} fill={foreground} />
      </svg>
    </div>
  );
}

interface ShareCardProps {
  url: string;
  code: string;
  className?: string;
}

/**
 * Interactive share widget with QR code, formatted join code, and one-click copy.
 */
export function QRShareWidget({ url, code, className }: ShareCardProps) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is restricted
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-3xl border-2 border-ink bg-paper p-6 text-center shadow-pop-lg",
        className,
      )}
    >
      <QRCode value={url} size={200} />
      <p className="mt-4 font-mono text-3xl font-extrabold tracking-widest text-ink sm:text-4xl">
        {code}
      </p>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        Scan with camera or visit{" "}
        <span className="font-mono text-xs font-bold text-grape">{url}</span>
      </p>
      <button
        onClick={copyLink}
        className="mt-4 inline-flex items-center gap-2 rounded-xl border-2 border-ink bg-paper px-4 py-2 font-display text-sm font-bold text-ink shadow-pop transition-transform hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
      >
        {copied ? (
          <>
            <Check className="size-4 text-mint" strokeWidth={3} />
            Link copied!
          </>
        ) : (
          <>
            <Copy className="size-4" />
            Copy room link
          </>
        )}
      </button>
    </div>
  );
}
