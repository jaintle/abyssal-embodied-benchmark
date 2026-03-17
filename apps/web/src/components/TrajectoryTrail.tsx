"use client";

/**
 * TrajectoryTrail — gradient tube showing the agent's path in real time.
 *
 * Phase 12 rewrite:
 *   - CatmullRomCurve3 + TubeGeometry replaces THREE.Line for a visible 3D tube
 *   - Custom ShaderMaterial drives gradient opacity (dim at tail, bright at head)
 *   - uFraction uniform controls how much of the tube is shown
 *   - Radius 0.10 m — thin but legible from any zoom level
 *
 * Phase 3 (public demo) upgrades:
 *   - Accepts stepRef (MutableRefObject<number>) instead of currentStep prop
 *   - useFrame reads stepRef every tick → trail tracks ball with zero re-renders
 *   - uFade uniform fades the trail out over 2 s once the episode ends
 *   - Falls back gracefully for < 2 steps
 */

import { useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ReplayStep } from "@abyssal/replay-schema";

/** Set to false to globally disable trail rendering */
export const TRAIL_ENABLED = true;

/** Y height — must match AGENT_Y in AgentPlayback */
const TRAIL_Y = 0.8;

/** How many seconds the trail takes to fade out after the episode ends */
const FADE_DURATION = 2.0;

// ─── Shaders ──────────────────────────────────────────────────────────────────

const TUBE_VERT = /* glsl */ `
  attribute float aAlong;   // 0..1 along tube length (derived from UV.x)
  varying float vAlong;

  void main() {
    vAlong      = aAlong;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TUBE_FRAG = /* glsl */ `
  uniform float uFraction;   // 0..1 — fraction of trail currently shown
  uniform float uFade;       // 1..0 — overall opacity fade (end-of-episode)
  uniform vec3  uColor;

  varying float vAlong;

  void main() {
    // Discard geometry beyond the current step (plus tiny feather)
    if (vAlong > uFraction + 0.004) discard;

    // Relative position within the visible portion: 0 = tail, 1 = head
    float rel = (uFraction > 0.001)
      ? clamp(vAlong / uFraction, 0.0, 1.0)
      : 0.0;

    // Quadratic fade: barely visible at tail, full brightness at head
    float opacity = (rel * rel * 0.82 + 0.06) * uFade;
    vec3  col     = uColor * (0.55 + rel * 0.70);

    gl_FragColor = vec4(col, opacity);
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

export interface TrajectoryTrailProps {
  steps: ReplayStep[];
  /**
   * Ref written every frame by AgentPlayback (via liveStepRef prop).
   * TrajectoryTrail reads this inside useFrame — no React re-renders needed.
   */
  stepRef: MutableRefObject<number>;
  /** Trail colour — defaults to teal. */
  color?: string;
}

export default function TrajectoryTrail({
  steps,
  stepRef,
  color = "#1aafa0",
}: TrajectoryTrailProps) {
  const matRef    = useRef<THREE.ShaderMaterial | null>(null);
  const fadeRef   = useRef(1.0);  // 1 = fully opaque, 0 = invisible
  const lastStep  = useRef(-1);   // detect backward seek (restart) to reset fade

  /**
   * arcFractions[i] = cumulative straight-line distance from step 0 to step i
   * divided by total path length (0..1).  Used to map the step-index domain
   * onto the TubeGeometry's arc-length UV domain so that uFraction always
   * points at the correct position on the tube regardless of how uneven the
   * step distances are (random agent barely moves; PPO heavy is erratic).
   */
  const { mesh, material, arcFractions } = useMemo(() => {
    if (steps.length < 2) return { mesh: null, material: null, arcFractions: null };

    // ── Precompute arc-length fractions per step ──────────────────────────
    const dists = new Float32Array(steps.length);
    dists[0] = 0;
    for (let i = 1; i < steps.length; i++) {
      const dx = steps[i].position[0] - steps[i - 1].position[0];
      const dz = steps[i].position[2] - steps[i - 1].position[2];
      dists[i] = dists[i - 1] + Math.sqrt(dx * dx + dz * dz);
    }
    const totalLen = dists[steps.length - 1];
    const arcFrac = new Float32Array(steps.length);
    if (totalLen > 1e-6) {
      for (let i = 0; i < steps.length; i++) arcFrac[i] = dists[i] / totalLen;
    } else {
      // Degenerate path (agent never moved) — distribute uniformly
      for (let i = 0; i < steps.length; i++) arcFrac[i] = i / (steps.length - 1);
    }

    // ── Build smooth curve from all step positions ────────────────────────
    const points = steps.map(
      (s) => new THREE.Vector3(s.position[0], TRAIL_Y, s.position[2])
    );
    const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);

    // One tube segment per replay step — keeps geometry count proportional
    const tubeSeg = steps.length - 1;
    const geo = new THREE.TubeGeometry(curve, tubeSeg, 0.10, 6, false);

    // Build aAlong attribute from UV.x (runs 0→1 along tube length)
    const posCount = geo.attributes.position.count;
    const along    = new Float32Array(posCount);
    const uvs      = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < posCount; i++) {
      along[i] = uvs.getX(i);
    }
    geo.setAttribute("aAlong", new THREE.BufferAttribute(along, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader:   TUBE_VERT,
      fragmentShader: TUBE_FRAG,
      uniforms: {
        uFraction: { value: 0 },
        uFade:     { value: 1 },
        uColor:    { value: new THREE.Color(color) },
      },
      transparent: true,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    });

    return { mesh: new THREE.Mesh(geo, mat), material: mat, arcFractions: arcFrac };
  }, [steps, color]);

  // Keep matRef current so useFrame below always sees the latest material
  if (material) matRef.current = material;

  useFrame((_, delta) => {
    if (!matRef.current || steps.length < 2 || !arcFractions) return;

    // stepRef holds a float: integer part = current step index,
    // fractional part = sub-step interpolation from AgentPlayback.
    const floatStep = stepRef.current;
    const maxStep   = steps.length - 1;
    const finished  = floatStep >= maxStep;

    // Map float step → arc-length fraction by lerping between adjacent entries
    const idx0     = Math.min(Math.floor(floatStep), maxStep);
    const idx1     = Math.min(idx0 + 1, maxStep);
    const subT     = floatStep - idx0;                       // 0..1 within the step
    const fraction = arcFractions[idx0] + (arcFractions[idx1] - arcFractions[idx0]) * subT;

    // Fade out slowly once the episode is complete.
    // If the step moved backward (restart / seek back), reset to full opacity.
    if (finished) {
      fadeRef.current = Math.max(0, fadeRef.current - delta / FADE_DURATION);
    } else {
      if (floatStep < lastStep.current) {
        // Backward seek or restart — snap fade back to 1
        fadeRef.current = 1.0;
      }
      // While actively playing, trail is always fully opaque
      fadeRef.current = 1.0;
    }
    lastStep.current = floatStep;

    matRef.current.uniforms.uFraction.value = fraction;
    matRef.current.uniforms.uFade.value     = fadeRef.current;
  });

  if (!TRAIL_ENABLED || !mesh) return null;

  return <primitive object={mesh} />;
}
