"use client";

/**
 * ObstacleField — renders each seeded obstacle as a coral/rock formation
 * with seaweed fronds growing from its base.
 *
 * Physics note (important):
 *   The Python Gymnasium environment treats obstacles as fixed, static
 *   spheres for collision detection.  The visual representation here is
 *   PURELY cosmetic and intentionally decoupled.  The benchmark semantics
 *   and determinism are unaffected.
 *
 * Visual design per obstacle:
 *   1. Coral / rock mound — rounded boulder, slightly flattened (Y × 0.72)
 *   2. Seaweed fronds     — 4 PlaneGeometry strips, vertex-shader sway
 *   3. Contact shadow     — radial-gradient disc on seabed
 *
 * Performance:
 *   All seaweed fronds share ONE ShaderMaterial (one uTime write per frame).
 */

import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ObstacleData } from "@abyssal/worldgen";
import { TERRAIN_BASE_Y } from "./TerrainMesh";

// ─── Constants ────────────────────────────────────────────────────────────────

const FRONDS_PER_OBSTACLE = 4;

// ─── Shadow disc shaders ──────────────────────────────────────────────────────

const SHADOW_VERT = /* glsl */ `
  varying vec2 vUV;
  void main() {
    vUV         = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SHADOW_FRAG = /* glsl */ `
  varying vec2 vUV;
  void main() {
    vec2  d    = vUV * 2.0 - 1.0;
    float dist = length(d);
    float a    = (1.0 - smoothstep(0.3, 1.0, dist)) * 0.35;
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
  }
`;

// ─── Seaweed shaders ──────────────────────────────────────────────────────────

const WEED_VERT = /* glsl */ `
  uniform float uTime;

  varying float vHeightFrac;
  varying vec2  vUV;

  void main() {
    vec3 pos = position;

    // World position drives sway phase — fronds at different XZ positions
    // naturally sway out-of-phase with each other (no per-frond uniforms)
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    float phase   = worldPos.x * 0.55 + worldPos.z * 0.35;

    // Sway grows with height — base is anchored, tip moves most
    float h    = clamp(pos.y, 0.0, 1.0);
    float sway = sin(h * 2.8 + uTime * 1.6 + phase)        * h * 0.34
               + sin(h * 5.5 + uTime * 2.3 + phase * 1.4)  * h * 0.12;
    pos.x += sway;

    vHeightFrac = h;
    vUV         = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const WEED_FRAG = /* glsl */ `
  varying float vHeightFrac;
  varying vec2  vUV;

  void main() {
    // Dark base → bright olive-green tip
    vec3 base = vec3(0.04, 0.16, 0.07);
    vec3 tip  = vec3(0.09, 0.40, 0.15);
    vec3 col  = mix(base, tip, vHeightFrac);

    // Taper at left/right edges so the frond has a leaf silhouette
    float edge  = abs(vUV.x - 0.5) * 2.0;
    float alpha = (1.0 - smoothstep(0.60, 1.0, edge)) * 0.88;
    alpha      *= 1.0 - vHeightFrac * 0.30;   // gentle fade toward tip

    gl_FragColor = vec4(col, alpha);
  }
`;

// ─── Coral colours (one per slot, cycles across obstacles) ───────────────────

const CORAL_COLORS = [
  "#3a2235",   // dark purple-brown
  "#2e3a28",   // dark greenish basalt
  "#1e2e38",   // dark wet slate
  "#332218",   // dark sandstone brown
];

// ─── Seeded pseudo-random ─────────────────────────────────────────────────────

function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ObstacleFieldProps {
  obstacles: ObstacleData[];
}

export default function ObstacleField({ obstacles }: ObstacleFieldProps) {
  const weedMatRef = useRef<THREE.ShaderMaterial | null>(null);

  // ── Shared shadow material ────────────────────────────────────────────────
  const shadowMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader:   SHADOW_VERT,
        fragmentShader: SHADOW_FRAG,
        transparent:    true,
        depthWrite:     false,
      }),
    []
  );

  // ── Shared seaweed material — one uTime write per frame ──────────────────
  const weedMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader:   WEED_VERT,
        fragmentShader: WEED_FRAG,
        uniforms:       { uTime: { value: 0 } },
        transparent:    true,
        depthWrite:     false,
        side:           THREE.DoubleSide,
      }),
    []
  );

  useEffect(() => { weedMatRef.current = weedMat; }, [weedMat]);

  // ── Per-obstacle seaweed frond layout (stable across renders) ────────────
  const frondData = useMemo(
    () =>
      obstacles.flatMap((obs) => {
        const rand   = seededRand(obs.index * 53 + 3571);
        const frondH = obs.radius * 1.5 + 0.6;
        return Array.from({ length: FRONDS_PER_OBSTACLE }, (_, fi) => {
          const angle = (fi / FRONDS_PER_OBSTACLE) * Math.PI * 2 + rand() * 0.8;
          const dist  = obs.radius * (0.25 + rand() * 0.35);
          return {
            px:  obs.position[0] + Math.cos(angle) * dist,
            py:  TERRAIN_BASE_Y,
            pz:  obs.position[2] + Math.sin(angle) * dist,
            ry:  rand() * Math.PI * 2,
            h:   frondH,
            key: `${obs.index}-${fi}`,
          };
        });
      }),
    [obstacles]
  );

  // ── Animate seaweed time uniform ─────────────────────────────────────────
  useFrame(({ clock }) => {
    if (weedMatRef.current) {
      weedMatRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  return (
    <group name="obstacle-field">

      {/* ── Per-obstacle: rounded boulder + contact shadow ──────────────── */}
      {obstacles.map((obs) => (
        <group key={obs.index}>

          {/* Boulder — rounded, Y-scale 0.72 so it reads as a rock not a disc */}
          <mesh
            position={[obs.position[0], obs.position[1], obs.position[2]]}
            scale={[obs.radius, obs.radius * 0.72, obs.radius]}
          >
            <sphereGeometry args={[1.0, 16, 10]} />
            <meshStandardMaterial
              color={CORAL_COLORS[obs.index % CORAL_COLORS.length]}
              roughness={0.93}
              metalness={0.04}
            />
          </mesh>

          {/* Contact shadow on seabed */}
          <mesh
            position={[obs.position[0], TERRAIN_BASE_Y + 0.04, obs.position[2]]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={1}
          >
            <circleGeometry args={[obs.radius * 1.9, 16]} />
            <primitive object={shadowMat} attach="material" />
          </mesh>

        </group>
      ))}

      {/* ── Seaweed fronds (all share one ShaderMaterial) ───────────────── */}
      {frondData.map((fd) => (
        <mesh
          key={fd.key}
          position={[fd.px, fd.py, fd.pz]}
          rotation={[0, fd.ry, 0]}
        >
          {/* 6 Y-segments gives smooth sway curve */}
          <planeGeometry args={[0.50, fd.h, 1, 6]} />
          <primitive object={weedMat} attach="material" />
        </mesh>
      ))}

    </group>
  );
}
