"use client";

import { useEffect, useRef, useState } from "react";
import { Crop, ZoomIn, Check, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";

type AspectRatio = "16:9" | "1:1" | "free";

export function ImageCropDialog({
  file,
  initialAspect = "16:9",
  onCrop,
  onCancel,
}: {
  file: File;
  initialAspect?: AspectRatio;
  onCrop: (croppedFile: File) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [aspect, setAspect] = useState<AspectRatio>(initialAspect);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  useEffect(() => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.src = url;
    img.onload = () => setImage(img);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Render dimensions
    const width = 480;
    const height =
      aspect === "16:9" ? 270 : aspect === "1:1" ? 480 : Math.round(width * (image.height / image.width));
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    // Draw scaled & panned image
    const baseScale = Math.max(width / image.width, height / image.height);
    const currentScale = baseScale * zoom;
    const drawWidth = image.width * currentScale;
    const drawHeight = image.height * currentScale;

    const offsetX = (width - drawWidth) / 2 + panX;
    const offsetY = (height - drawHeight) / 2 + panY;

    ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  }, [image, aspect, zoom, panX, panY]);

  const handleApply = () => {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob(
      (blob) => {
        if (!blob) return;
        const croppedFile = new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), {
          type: "image/webp",
        });
        onCrop(croppedFile);
      },
      "image/webp",
      0.9,
    );
  };

  return (
    <Dialog title="Crop and adjust image" onClose={onCancel}>
      <div className="space-y-5">
        <div className="flex justify-center overflow-hidden rounded-2xl border-2 border-ink bg-paper-2 p-2 shadow-pop">
          <canvas
            ref={canvasRef}
            className="max-h-72 w-auto max-w-full rounded-xl object-contain shadow-sm"
          />
        </div>

        {/* Aspect Ratio Presets */}
        <div>
          <label className="mb-2 block font-display text-xs font-bold uppercase tracking-wider text-ink-soft">
            Aspect Ratio
          </label>
          <div className="flex gap-2">
            {(["16:9", "1:1", "free"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setAspect(r)}
                aria-pressed={aspect === r}
                className={`rounded-xl border-2 px-3 py-1.5 font-display text-xs font-bold transition-transform ${
                  aspect === r
                    ? "border-ink bg-grape text-white shadow-pop"
                    : "border-ink/20 bg-paper text-ink hover:border-ink"
                }`}
              >
                {r === "16:9" ? "16:9 (Cover)" : r === "1:1" ? "1:1 (Square)" : "Original"}
              </button>
            ))}
          </div>
        </div>

        {/* Zoom Slider */}
        <div>
          <div className="flex items-center justify-between font-display text-xs font-bold text-ink-soft">
            <span className="flex items-center gap-1.5 uppercase tracking-wider">
              <ZoomIn className="size-3.5" /> Zoom
            </span>
            <span>{zoom.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="mt-2 w-full accent-grape"
          />
        </div>

        {/* Pan Sliders */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-display text-xs font-bold uppercase tracking-wider text-ink-soft">
              Pan Horizontal
            </label>
            <input
              type="range"
              min={-150}
              max={150}
              value={panX}
              onChange={(e) => setPanX(parseInt(e.target.value, 10))}
              className="mt-2 w-full accent-grape"
            />
          </div>
          <div>
            <label className="block font-display text-xs font-bold uppercase tracking-wider text-ink-soft">
              Pan Vertical
            </label>
            <input
              type="range"
              min={-150}
              max={150}
              value={panY}
              onChange={(e) => setPanY(parseInt(e.target.value, 10))}
              className="mt-2 w-full accent-grape"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-ink bg-paper px-4 font-display text-sm font-bold text-ink shadow-pop transition-transform hover:-translate-y-0.5"
          >
            <X className="size-4" /> Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-ink bg-grape px-5 font-display text-sm font-bold text-white shadow-pop transition-transform hover:-translate-y-0.5"
          >
            <Check className="size-4" /> Apply crop & upload
          </button>
        </div>
      </div>
    </Dialog>
  );
}
