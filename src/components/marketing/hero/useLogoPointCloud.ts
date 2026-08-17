"use client";

import { useEffect, useState } from "react";

export interface LogoPointCloud {
  /** x,y,z per point, centered and normalized to roughly a -1.6..1.6 scene range. */
  positions: Float32Array;
  /** r,g,b per point (0..1), sampled directly from the source logo pixel — the reassembled shape uses the real logo gradient, not an invented one. */
  colors: Float32Array;
  count: number;
}

const LOGO_SRC = "/marketing/omtatva-logo.png";
const SAMPLE_GRID = 220;

/**
 * Loads the actual Omtatva logo (public/marketing/omtatva-logo.png —
 * the authoritative reference, copied in as-is, never redrawn) and
 * samples its pixels client-side via an offscreen canvas to build a
 * point cloud that traces the EXACT glyph shape and its real blue
 * gradient. This is what the hero's particles converge toward during
 * the "reassembly" phase — the recognizable Omtatva mark comes
 * directly from the source image's own pixels, not an approximation.
 * Runs once on mount; same-origin `public/` asset, so no CORS taint
 * on `getImageData`.
 */
export function useLogoPointCloud(targetPointCount = 720): LogoPointCloud | null {
  const [cloud, setCloud] = useState<LogoPointCloud | null>(null);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.src = LOGO_SRC;

    image.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = SAMPLE_GRID;
      canvas.height = SAMPLE_GRID;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const scale = Math.min(SAMPLE_GRID / image.width, SAMPLE_GRID / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const offsetX = (SAMPLE_GRID - drawWidth) / 2;
      const offsetY = (SAMPLE_GRID - drawHeight) / 2;
      ctx.clearRect(0, 0, SAMPLE_GRID, SAMPLE_GRID);
      ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

      const { data } = ctx.getImageData(0, 0, SAMPLE_GRID, SAMPLE_GRID);
      const candidates: Array<{ x: number; y: number; r: number; g: number; b: number }> = [];

      for (let y = 0; y < SAMPLE_GRID; y++) {
        for (let x = 0; x < SAMPLE_GRID; x++) {
          const i = (y * SAMPLE_GRID + x) * 4;
          const r = data[i] ?? 255;
          const g = data[i + 1] ?? 255;
          const b = data[i + 2] ?? 255;
          const alpha = data[i + 3] ?? 0;
          const isTransparent = alpha < 80;
          const isNearWhiteBackground = r > 235 && g > 235 && b > 235;
          if (isTransparent || isNearWhiteBackground) continue;
          candidates.push({ x, y, r: r / 255, g: g / 255, b: b / 255 });
        }
      }

      if (candidates.length === 0) return;

      // Deterministic even subsample down to the target count — not random, so the shape is identical on every load.
      const stride = Math.max(1, Math.floor(candidates.length / targetPointCount));
      const sampled = candidates.filter((_, i) => i % stride === 0).slice(0, targetPointCount);

      const positions = new Float32Array(sampled.length * 3);
      const colors = new Float32Array(sampled.length * 3);
      sampled.forEach((point, i) => {
        const nx = (point.x / SAMPLE_GRID - 0.5) * 3.0;
        const ny = -(point.y / SAMPLE_GRID - 0.5) * 3.0;
        positions[i * 3] = nx;
        positions[i * 3 + 1] = ny;
        positions[i * 3 + 2] = ((i % 5) - 2) * 0.03;
        colors[i * 3] = point.r;
        colors[i * 3 + 1] = point.g;
        colors[i * 3 + 2] = point.b;
      });

      setCloud({ positions, colors, count: sampled.length });
    };

    return () => {
      cancelled = true;
    };
  }, [targetPointCount]);

  return cloud;
}
