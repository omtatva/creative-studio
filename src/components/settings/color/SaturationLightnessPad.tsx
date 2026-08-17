"use client";

import { useCallback, useRef } from "react";
import { clamp } from "@/lib/utils/color";

interface SaturationLightnessPadProps {
  hue: number;
  saturation: number; // 0-100 (x axis)
  lightness: number; // 0-100 (y axis, 100 = top)
  onChange: (s: number, l: number) => void;
}

/** 2D saturation/lightness picker at a fixed hue — combined with HueSlider and the opacity slider, this is the "full color picker, unlimited colors" surface. */
export function SaturationLightnessPad({ hue, saturation, lightness, onChange }: SaturationLightnessPadProps) {
  const padRef = useRef<HTMLDivElement>(null);

  const updateFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const pad = padRef.current;
      if (!pad) return;
      const rect = pad.getBoundingClientRect();
      const x = clamp((clientX - rect.left) / rect.width, 0, 1);
      const y = clamp((clientY - rect.top) / rect.height, 0, 1);
      onChange(Math.round(x * 100), Math.round((1 - y) * 100));
    },
    [onChange]
  );

  function handlePointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromEvent(e.clientX, e.clientY);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (e.buttons !== 1) return;
    updateFromEvent(e.clientX, e.clientY);
  }

  return (
    <div
      ref={padRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      className="relative h-40 w-full cursor-crosshair rounded-theme"
      style={{
        backgroundColor: `hsl(${hue}, 100%, 50%)`,
        backgroundImage: "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
      }}
    >
      <div
        className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
        style={{
          left: `${saturation}%`,
          top: `${100 - lightness}%`,
          backgroundColor: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
        }}
      />
    </div>
  );
}
