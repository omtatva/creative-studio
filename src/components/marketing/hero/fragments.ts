/**
 * Pure geometry-data module for the Omtatva "O" hero object — no
 * React/Three imports, so the fragment layout can be reasoned about
 * and tuned independent of rendering. Every fragment's transform is
 * generated from a seeded PRNG keyed on its own index, never
 * `Math.random()`, so the "shattered" arrangement is identical on
 * every mount/reload instead of reshuffling and looking like generic
 * particle noise (the whole point is that it reads as one deliberate,
 * reproducible form breaking apart — see the hero's 5-phase spec).
 *
 * Three states per fragment, matching the SOLID → BREAK → REBUILD
 * story:
 *  - solid:    positioned on the surface of a torus — together the N
 *              fragments read as one continuous "O" ring.
 *              PHASE 3/4/5 use `broken`/`reformed` as their frame; the actual
 *              lerp between the two nearest states happens in
 *              OFragmentSystem's per-frame loop, not here.
 *  - broken:   scattered outward from its solid position (deterministic
 *              per-fragment jitter), used for BREAK/INTELLIGENCE.
 *              OFragmentSystem also layers a live spiral-rotation drift
 *              on top of this at render time, so the break reads as an
 *              intentional "unfurl" rather than a radial explosion.
 *  - reformed: repositioned onto a small Fibonacci-lattice sphere — a
 *              tighter, more faceted arrangement than the flat torus,
 *              so REBUILD visibly reads as "a new, denser symbol",
 *              not just "the same ring put back together".
 *
 * Two separate connection sets, not one — `structuralConnections`
 * (ring-adjacent pairs) stay faintly visible even at rest, so the
 * SOLID state itself reads as "one connected object" rather than
 * loose touching pieces; `intelligenceConnections` (nearest-neighbor
 * once broken) only light up during the INTELLIGENCE/REORGANIZATION
 * phases as the "AI reconnecting the pieces" beat.
 */

export interface FragmentTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}

export interface Fragment {
  solid: FragmentTransform;
  broken: FragmentTransform;
  reformed: FragmentTransform;
}

export const FRAGMENT_COUNT_FULL = 32;
export const FRAGMENT_COUNT_REDUCED = 14;

const TORUS_RADIUS = 1.6;
const TUBE_RADIUS = 0.38;
const REFORMED_RADIUS = 1.05;

/** Deterministic PRNG (mulberry32) — same seed always produces the same sequence, unlike Math.random(). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateFragment(index: number, count: number): Fragment {
  const rand = mulberry32(index * 9973 + 17);
  const theta = (index / count) * Math.PI * 2;
  const phi = rand() * Math.PI * 2;

  // SOLID — a point on the torus surface at (theta, phi).
  const solidX = (TORUS_RADIUS + TUBE_RADIUS * Math.cos(phi)) * Math.cos(theta);
  const solidZ = (TORUS_RADIUS + TUBE_RADIUS * Math.cos(phi)) * Math.sin(theta);
  const solidY = TUBE_RADIUS * Math.sin(phi);
  const baseScale = 0.85 + rand() * 0.3;

  // BROKEN — scattered outward along the fragment's own radial direction, plus jitter.
  const scatterDistance = 2.4 + rand() * 3.4;
  const dirX = Math.cos(theta) * (0.6 + rand() * 0.4);
  const dirY = Math.sin(phi) * (0.5 + rand() * 0.8) + (rand() - 0.5) * 0.6;
  const dirZ = Math.sin(theta) * (0.6 + rand() * 0.4);
  const dirLength = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) || 1;
  const brokenPosition: [number, number, number] = [
    solidX + (dirX / dirLength) * scatterDistance,
    solidY + (dirY / dirLength) * scatterDistance,
    solidZ + (dirZ / dirLength) * scatterDistance,
  ];
  const brokenRotation: [number, number, number] = [rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2];

  // REFORMED — a point on a small Fibonacci-lattice sphere: denser, more faceted than the flat torus.
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const yF = count > 1 ? 1 - (index / (count - 1)) * 2 : 0;
  const radiusAtY = Math.sqrt(Math.max(0, 1 - yF * yF));
  const thetaF = goldenAngle * index;
  const reformedPosition: [number, number, number] = [
    Math.cos(thetaF) * radiusAtY * REFORMED_RADIUS,
    yF * REFORMED_RADIUS,
    Math.sin(thetaF) * radiusAtY * REFORMED_RADIUS,
  ];
  const reformedRotation: [number, number, number] = [Math.asin(Math.max(-1, Math.min(1, yF))), thetaF, phi * 0.5];

  return {
    solid: {
      position: [solidX, solidY, solidZ],
      rotation: [phi, theta + Math.PI / 2, 0],
      scale: baseScale,
    },
    broken: {
      position: brokenPosition,
      rotation: brokenRotation,
      scale: baseScale,
    },
    reformed: {
      position: reformedPosition,
      rotation: reformedRotation,
      scale: baseScale * 0.82,
    },
  };
}

/** Ring-adjacency pairs (i to i+1, wrapping) — the assembled "skeleton" that reads as one connected object at rest, before anything breaks apart. */
function generateStructuralConnections(count: number): Array<[number, number]> {
  return Array.from({ length: count }, (_, i) => [i, (i + 1) % count]);
}

/** Index pairs connecting each fragment to its nearest neighbor (by broken-state distance) — the INTELLIGENCE-phase "neural" lines. */
function generateIntelligenceConnections(fragments: Fragment[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  const seen = new Set<string>();

  fragments.forEach((fragment, i) => {
    let nearest: number | null = null;
    let nearestDistSq = Infinity;
    let secondNearest: number | null = null;
    let secondDistSq = Infinity;

    fragments.forEach((other, j) => {
      if (i === j) return;
      const dx = fragment.broken.position[0] - other.broken.position[0];
      const dy = fragment.broken.position[1] - other.broken.position[1];
      const dz = fragment.broken.position[2] - other.broken.position[2];
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < nearestDistSq) {
        secondNearest = nearest;
        secondDistSq = nearestDistSq;
        nearest = j;
        nearestDistSq = distSq;
      } else if (distSq < secondDistSq) {
        secondNearest = j;
        secondDistSq = distSq;
      }
    });

    [nearest, secondNearest].forEach((j) => {
      if (j === null) return;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) return;
      seen.add(key);
      pairs.push(i < j ? [i, j] : [j, i]);
    });
  });

  return pairs;
}

export interface FragmentSet {
  fragments: Fragment[];
  /** Ring-adjacency pairs, visible (faintly) at rest — "these pieces are one object." */
  structuralConnections: Array<[number, number]>;
  /** Nearest-neighbor-when-broken pairs, the traveling "AI reconnecting" lines during INTELLIGENCE. */
  intelligenceConnections: Array<[number, number]>;
}

const cache = new Map<number, FragmentSet>();

/** Generates (and caches) a deterministic fragment layout for the given count — call with FRAGMENT_COUNT_FULL or FRAGMENT_COUNT_REDUCED. */
export function getFragmentSet(count: number): FragmentSet {
  const cached = cache.get(count);
  if (cached) return cached;

  const fragments = Array.from({ length: count }, (_, index) => generateFragment(index, count));
  const set: FragmentSet = {
    fragments,
    structuralConnections: generateStructuralConnections(count),
    intelligenceConnections: generateIntelligenceConnections(fragments),
  };
  cache.set(count, set);
  return set;
}
