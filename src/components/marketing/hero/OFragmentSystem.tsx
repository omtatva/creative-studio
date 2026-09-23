"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { MotionValue } from "framer-motion";
import { getFragmentSet, type FragmentSet } from "./fragments";
import { getPhaseProgress } from "./useScrollProgress";

interface OFragmentSystemProps {
  fragmentCount: number;
  progress?: MotionValue<number>;
  /** When set, ignores `progress`/scroll and holds a fixed phase — used by the smaller Section 2 instance (a static "REORGANIZATION" pose) instead of re-deriving its own scroll range. */
  frozenPhase?: { phase: number; localT: number };
  showConnections?: boolean;
}

const PRIMARY_COLOR = "#6366f1"; // rgb(99 102 241) — matches --color-primary
const ACCENT_COLOR = "#14b8a6"; // rgb(20 184 166) — matches --color-secondary
const STRUCTURAL_COLOR = "#818cf8"; // lighter indigo — the faint "this is one object" skeleton
const SPIRAL_MAX = 0.85; // radians — how far a fully-broken fragment swings around Y from its radial line, so BREAK reads as an unfurl, not an explosion

// Scratch objects reused across every fragment/every frame — avoids
// allocating a Vector3/Euler/Quaternion per instance per frame, which
// at 32 fragments * 60fps would otherwise churn the GC continuously.
const dummy = new THREE.Object3D();
const fromEuler = new THREE.Euler();
const toEuler = new THREE.Euler();
const fromQuat = new THREE.Quaternion();
const toQuat = new THREE.Quaternion();
const lerpedQuat = new THREE.Quaternion();
const fromPos = new THREE.Vector3();
const toPos = new THREE.Vector3();
const lerpedPos = new THREE.Vector3();
const spiralAxis = new THREE.Vector3(0, 1, 0);

interface Blend {
  from: "solid" | "broken" | "reformed";
  to: "solid" | "broken" | "reformed";
  t: number;
  /** How "broken apart" the object is right now (0 = whole, 1 = fully scattered) — drives the spiral-unfurl rotation, independent of which two states are being lerped. */
  breakAmount: number;
  structuralOpacity: number;
  intelligenceOpacity: number;
}

/**
 * Which pair of named states (and blend weight) is active for a given
 * phase/localT, plus the two connection-line opacities. The story:
 * SOLID (structural lines visible, "one object") → BREAK (structural
 * fades, spiral-unfurl outward) → INTELLIGENCE (intelligence lines
 * ramp in, "AI connecting") → REORGANIZATION (intelligence fades as
 * structural ramps back in, converging on the new form) → REBUILD
 * (structural visible again, "one object" — just a different shape).
 */
function resolveBlend(phase: number, localT: number): Blend {
  if (phase <= 0) return { from: "solid", to: "solid", t: 0, breakAmount: 0, structuralOpacity: 0.5, intelligenceOpacity: 0 };
  if (phase === 1) return { from: "solid", to: "broken", t: localT, breakAmount: localT, structuralOpacity: 0.5 * (1 - localT), intelligenceOpacity: 0 };
  if (phase === 2) return { from: "broken", to: "broken", t: 0, breakAmount: 1, structuralOpacity: 0, intelligenceOpacity: localT };
  if (phase === 3) return { from: "broken", to: "reformed", t: localT, breakAmount: 1 - localT, structuralOpacity: localT * 0.5, intelligenceOpacity: 1 - localT };
  return { from: "reformed", to: "reformed", t: 0, breakAmount: 0, structuralOpacity: 0.5, intelligenceOpacity: 0 };
}

export function OFragmentSystem({ fragmentCount, progress, frozenPhase, showConnections = true }: OFragmentSystemProps) {
  const { fragments, structuralConnections, intelligenceConnections }: FragmentSet = useMemo(() => getFragmentSet(fragmentCount), [fragmentCount]);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const structuralLineRef = useRef<THREE.LineSegments>(null);
  const intelligenceLineRef = useRef<THREE.LineSegments>(null);
  const positionsRef = useRef<Float32Array>(new Float32Array(fragmentCount * 3));

  // Crystal-shard fragment: an elongated octahedron reads as a
  // deliberate faceted shard instead of a generic brick/cube.
  const fragmentGeometry = useMemo(() => {
    const geometry = new THREE.OctahedronGeometry(0.15, 0);
    geometry.scale(0.62, 1.35, 0.62);
    return geometry;
  }, []);

  const structuralPositionAttr = useRef(new THREE.BufferAttribute(new Float32Array(structuralConnections.length * 6), 3));
  const structuralLineGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    structuralPositionAttr.current = new THREE.BufferAttribute(new Float32Array(structuralConnections.length * 6), 3);
    geometry.setAttribute("position", structuralPositionAttr.current);
    return geometry;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralConnections.length]);

  const intelligencePositionAttr = useRef(new THREE.BufferAttribute(new Float32Array(intelligenceConnections.length * 6), 3));
  const intelligenceDistanceAttr = useRef(new THREE.BufferAttribute(new Float32Array(intelligenceConnections.length * 2), 1));
  const intelligenceLineGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    intelligencePositionAttr.current = new THREE.BufferAttribute(new Float32Array(intelligenceConnections.length * 6), 3);
    intelligenceDistanceAttr.current = new THREE.BufferAttribute(new Float32Array(intelligenceConnections.length * 2), 1);
    geometry.setAttribute("position", intelligencePositionAttr.current);
    geometry.setAttribute("lineDistance", intelligenceDistanceAttr.current);
    return geometry;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intelligenceConnections.length]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const { phase, localT } = frozenPhase ?? getPhaseProgress(progress?.get() ?? 0);
    const { from, to, t, breakAmount, structuralOpacity, intelligenceOpacity } = resolveBlend(phase, localT);
    const positions = positionsRef.current;

    fragments.forEach((fragment, index) => {
      const fromState = fragment[from];
      const toState = fragment[to];

      fromPos.set(fromState.position[0], fromState.position[1], fromState.position[2]);
      toPos.set(toState.position[0], toState.position[1], toState.position[2]);
      lerpedPos.copy(fromPos).lerp(toPos, t);

      // Spiral-unfurl: swing the (already radially-scattered) position
      // around Y by an amount proportional to how "broken" the object
      // currently is, so pieces arc outward/inward instead of moving
      // in a straight line — deterministic per-fragment jitter keeps
      // it from looking perfectly mechanical.
      if (breakAmount > 0) {
        const jitter = 0.85 + (index % 7) * 0.045;
        lerpedPos.applyAxisAngle(spiralAxis, breakAmount * SPIRAL_MAX * jitter);
      }

      fromEuler.set(fromState.rotation[0], fromState.rotation[1], fromState.rotation[2]);
      toEuler.set(toState.rotation[0], toState.rotation[1], toState.rotation[2]);
      fromQuat.setFromEuler(fromEuler);
      toQuat.setFromEuler(toEuler);
      lerpedQuat.slerpQuaternions(fromQuat, toQuat, t);

      const scale = THREE.MathUtils.lerp(fromState.scale, toState.scale, t);

      dummy.position.copy(lerpedPos);
      dummy.quaternion.copy(lerpedQuat);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);

      positions[index * 3] = lerpedPos.x;
      positions[index * 3 + 1] = lerpedPos.y;
      positions[index * 3 + 2] = lerpedPos.z;
    });
    mesh.instanceMatrix.needsUpdate = true;

    if (showConnections) {
      if (structuralLineRef.current) {
        const buf = structuralPositionAttr.current.array as Float32Array;
        structuralConnections.forEach(([a, b], pairIndex) => {
          const base = pairIndex * 6;
          buf[base] = positions[a * 3] ?? 0;
          buf[base + 1] = positions[a * 3 + 1] ?? 0;
          buf[base + 2] = positions[a * 3 + 2] ?? 0;
          buf[base + 3] = positions[b * 3] ?? 0;
          buf[base + 4] = positions[b * 3 + 1] ?? 0;
          buf[base + 5] = positions[b * 3 + 2] ?? 0;
        });
        structuralPositionAttr.current.needsUpdate = true;
        (structuralLineRef.current.material as THREE.LineBasicMaterial).opacity = structuralOpacity;
      }

      if (intelligenceLineRef.current) {
        const buf = intelligencePositionAttr.current.array as Float32Array;
        const distBuf = intelligenceDistanceAttr.current.array as Float32Array;
        // THREE.LineDashedMaterial has no `dashOffset` property (only
        // scale/dashSize/gapSize) — the "energy traveling along the
        // line" look comes from shifting the lineDistance values
        // themselves by a time-based amount each frame instead.
        const travel = state.clock.elapsedTime * 0.6;
        intelligenceConnections.forEach(([a, b], pairIndex) => {
          const base = pairIndex * 6;
          const ax = positions[a * 3] ?? 0;
          const ay = positions[a * 3 + 1] ?? 0;
          const az = positions[a * 3 + 2] ?? 0;
          const bx = positions[b * 3] ?? 0;
          const by = positions[b * 3 + 1] ?? 0;
          const bz = positions[b * 3 + 2] ?? 0;
          buf[base] = ax;
          buf[base + 1] = ay;
          buf[base + 2] = az;
          buf[base + 3] = bx;
          buf[base + 4] = by;
          buf[base + 5] = bz;
          // Per-segment distance reset (not cumulative across all
          // segments) so the dash pattern starts fresh on every line
          // instead of drifting further out of phase for later pairs,
          // then offset by `travel` so the pattern appears to move.
          const dx = bx - ax;
          const dy = by - ay;
          const dz = bz - az;
          const segLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
          distBuf[pairIndex * 2] = -travel;
          distBuf[pairIndex * 2 + 1] = segLength - travel;
        });
        intelligencePositionAttr.current.needsUpdate = true;
        intelligenceDistanceAttr.current.needsUpdate = true;
        const material = intelligenceLineRef.current.material as THREE.LineDashedMaterial;
        material.opacity = intelligenceOpacity * 0.85;
      }
    }

    const material = mesh.material as THREE.MeshPhysicalMaterial;
    material.emissiveIntensity = phase === 4 ? 0.18 + localT * 0.5 : 0.12 + breakAmount * 0.1;

    // Gentle continuous idle rotation, plus mouse-reactive tilt layered on top — damped so it feels alive and calm, not twitchy.
    if (groupRef.current) {
      const idleSpin = state.clock.elapsedTime * 0.045;
      const targetRotY = idleSpin + state.pointer.x * 0.12;
      const targetRotX = state.pointer.y * 0.08;
      groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, targetRotY, 3, delta || 0.016);
      groupRef.current.rotation.x = THREE.MathUtils.damp(groupRef.current.rotation.x, targetRotX, 3, delta || 0.016);
    }
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, fragmentCount]}>
        <primitive object={fragmentGeometry} attach="geometry" />
        <meshPhysicalMaterial
          color={PRIMARY_COLOR}
          emissive={PRIMARY_COLOR}
          emissiveIntensity={0.12}
          metalness={0.55}
          roughness={0.28}
          clearcoat={0.6}
          clearcoatRoughness={0.2}
          transmission={0.12}
          thickness={0.4}
          ior={1.4}
        />
      </instancedMesh>
      {showConnections && (
        <>
          <lineSegments ref={structuralLineRef} geometry={structuralLineGeometry}>
            <lineBasicMaterial color={STRUCTURAL_COLOR} transparent opacity={0} />
          </lineSegments>
          <lineSegments ref={intelligenceLineRef} geometry={intelligenceLineGeometry}>
            <lineDashedMaterial color={ACCENT_COLOR} transparent opacity={0} dashSize={0.12} gapSize={0.09} />
          </lineSegments>
        </>
      )}
    </group>
  );
}
