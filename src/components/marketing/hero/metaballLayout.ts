import * as THREE from "three";
import type { LogoPointCloud } from "./useLogoPointCloud";

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BlobLayout {
  /** Where each blob sits once the logo is fully formed (real glyph shape, clustered down to `numBlobs` representative points). */
  logoCenters: THREE.Vector3[];
  /** Where each blob sits when dispersed near the machine, before it's "delivered" by the stream. */
  dispersedCenters: THREE.Vector3[];
  /** Per-blob 0..1 stagger offset so blobs arrive at slightly different times instead of moving as one rigid block. */
  arrivalStagger: number[];
}

/**
 * Reduces the fine-grained logo point cloud (hundreds of pixel
 * samples, see useLogoPointCloud.ts) down to a small number of
 * representative "blob" centers suitable for real-time metaball
 * raymarching (smooth-min blending cost scales with blob count, so
 * this needs to stay small — tens, not hundreds). Grid-bucket
 * averaging: bucket the fine points into a coarse grid, one blob per
 * occupied cell, keeping the densest cells first — so the reduced
 * shape still traces the glyph's actual strokes rather than losing
 * them to a uniform subsample.
 */
export function buildBlobLayout(cloud: LogoPointCloud, numBlobs: number, offsetX: number, offsetY = 0): BlobLayout {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < cloud.count; i++) {
    const x = cloud.positions[i * 3] ?? 0;
    const y = cloud.positions[i * 3 + 1] ?? 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const gridSize = Math.max(2, Math.ceil(Math.sqrt(numBlobs * 1.5)));
  const cellW = (maxX - minX) / gridSize || 1;
  const cellH = (maxY - minY) / gridSize || 1;

  const buckets = new Map<string, { x: number; y: number; z: number; n: number }>();
  for (let i = 0; i < cloud.count; i++) {
    const x = cloud.positions[i * 3] ?? 0;
    const y = cloud.positions[i * 3 + 1] ?? 0;
    const z = cloud.positions[i * 3 + 2] ?? 0;
    const gx = Math.min(gridSize - 1, Math.floor((x - minX) / cellW));
    const gy = Math.min(gridSize - 1, Math.floor((y - minY) / cellH));
    const key = `${gx}-${gy}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.x += x;
      existing.y += y;
      existing.z += z;
      existing.n += 1;
    } else {
      buckets.set(key, { x, y, z, n: 1 });
    }
  }

  // Cell insertion order roughly follows the raster-scan order the source
  // pixels were sampled in (top-to-bottom, left-to-right) — keep that
  // order rather than sorting by density, then take an EVEN STRIDE across
  // the full list. Density-sorting would bias toward the glyph's thick
  // bulky areas and drop thin stroke extremities (the flourishes that
  // make it recognizable); even striding preserves overall coverage of
  // the whole shape regardless of how numBlobs compares to cell count.
  const allCells = Array.from(buckets.values()).map((b) => new THREE.Vector3(b.x / b.n + offsetX, b.y / b.n + offsetY, b.z / b.n));

  const rand = mulberry32(4242);
  const logoCenters: THREE.Vector3[] = [];
  for (let i = 0; i < numBlobs; i++) {
    if (allCells.length === 0) {
      logoCenters.push(new THREE.Vector3(offsetX, 0, 0));
      continue;
    }
    const idx = Math.min(allCells.length - 1, Math.floor((i / numBlobs) * allCells.length));
    const source = allCells[idx];
    if (!source) continue;
    const jitter = numBlobs > allCells.length ? 0.05 : 0;
    logoCenters.push(new THREE.Vector3(source.x + (rand() - 0.5) * jitter, source.y + (rand() - 0.5) * jitter, source.z));
  }

  const dispersedRand = mulberry32(909);
  const dispersedCenters = Array.from({ length: numBlobs }, () => {
    const radius = 0.25 + dispersedRand() * 0.7;
    const theta = dispersedRand() * Math.PI * 2;
    const phi = Math.acos(2 * dispersedRand() - 1);
    return new THREE.Vector3(
      -2.6 + radius * Math.sin(phi) * Math.cos(theta),
      offsetY + radius * Math.sin(phi) * Math.sin(theta) * 0.8,
      radius * Math.cos(phi) * 0.6
    );
  });

  const staggerRand = mulberry32(1717);
  const arrivalStagger = Array.from({ length: numBlobs }, () => staggerRand());

  return { logoCenters, dispersedCenters, arrivalStagger };
}
