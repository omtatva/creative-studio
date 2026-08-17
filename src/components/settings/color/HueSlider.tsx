"use client";

import { useCallback, useRef } from "react";
import { clamp } from "@/lib/utils/color";

interface HueSliderProps {
  hue: number; // 0-360
  onChange: (hue: number) => void;
}

/** Horizontal 0-360 hue strip with a draggable handle — one of the three axes (hue/saturation-lightness/opacity) of the full color picker. */
export function HueSlider({ hue, onChange }: HueSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const updateFromEvent = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      onChange(Math.round(ratio * 360));
    },
    [onChange]
  );

  function handlePointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromEvent(e.clientX);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (e.buttons !== 1) return;
    updateFromEvent(e.clientX);
  }

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      className="relative h-4 w-full cursor-pointer rounded-full"
      style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
    >
      <div
        className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
        style={{ left: `${(hue / 360) * 100}%`, backgroundColor: `hsl(${hue}, 100%, 50%)` }}
      />
    </div>
  );
}
