"use client";

/**
 * TrajectoryTrail — gradient tube showing the agent's path up to currentStep.
 *
 * Phase 12 rewrite:
 *   - CatmullRomCurve3 + TubeGeometry replaces THREE.Line for a visible 3D tube
 *   - Custom ShaderMaterial drives gradient opacity (dim at tail, bright at head)
 *   - uFraction uniform controls how much of the tube is shown — no geometry
 *     rebuild needed as currentStep advances, only one float uniform write
 *   - Radius 0.10 m — thin but legible from any zoom level
 *   - Falls back to null for < 2 steps (TubeGeometry needs at least 2 points)
 */

import { useMemo, useEffect, useRef } from "react";
import * as THREE from "three";
import type { ReplayStep } from "@abyssal/replay-schema";

/** Set to false to globally disable trail rendering */
export const TRAIL_ENABLED = true;

/** Y height — must match AGENT_Y in AgentPlayback */
const TRAIL_Y = 0.8;

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
    float opacity = rel * rel * 0.82 + 0.06;
    vec3  col     = uColor * (0.55 + rel * 0.70);

    gl_FragColor = vec4(col, opacity);
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface TrajectoryTrailProps {
  steps: ReplayStep[];
  currentStep: number;
  /** Trail colour — defaults to the original teal (#1aafa0). */
  color?: string;
}

export default function TrajectoryTrail({
  steps,
  currentStep,
  color = "#1aafa0",
}: TrajectoryTrailProps) {
  const matRef = useRef<THREE.ShaderMaterial | null>(null);

  const { mesh, material } = useMemo(() => {
    if (steps.length < 2) return { mesh: null, material: null };

    // Build smooth curve from all step positions
    const points = steps.map(
      (s) => new THREE.Vector3(s.position[0], TRAIL_Y, s.position[2])
    );
    const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);

    // One tube segment per replay step — keeps geometry count proportional
    const tubeSeg = steps.length - 1;
    const geo = new THREE.TubeGeometry(curve, tubeSeg, 0.10, 6, false);

    // Build aAlong attribute: UV.x already runs 0→1 along the tube length
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
        uColor:    { value: new THREE.Color(color) },
      },
      transparent: true,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    });

    return { mesh: new THREE.Mesh(geo, mat), material: mat };
  }, [steps, color]);

  // Keep matRef current so the useEffect below sees the latest material
  if (material) matRef.current = material;

  // Update uFraction whenever currentStep changes — no geometry rebuild
  useEffect(() => {
    if (!matRef.current || steps.length < 2) return;
    const fraction = Math.min(1, currentStep / (steps.length - 1));
    matRef.current.uniforms.uFraction.value = fraction;
  }, [currentStep, steps.length]);

  if (!TRAIL_ENABLED || !mesh) return null;

  return <primitive object={mesh} />;
}
