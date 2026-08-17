"use client";

import { useCallback, useRef } from "react";
import { clamp } from "@/lib/utils/color";

interface OpacitySliderProps {
  hex: string;
  opacity: number; // 0-100
  onChange: (opacity: number) => void;
}

/** Dedicated opacity control — a checkerboard-backed gradient from transparent to the fully opaque current color. */
export function OpacitySlider({ hex, opacity, onChange }: OpacitySliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const updateFromEvent = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      onChange(Math.round(ratio * 100));
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
      style={{
        backgroundImage: `linear-gradient(to right, transparent, ${hex}), repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%)`,
        backgroundSize: "100% 100%, 8px 8px",
      }}
    >
      <div
        className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
        style={{ left: `${opacity}%`, backgroundColor: hex, opacity: opacity / 100 }}
      />
    </div>
  );
}
