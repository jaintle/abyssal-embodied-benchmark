"use client";

/**
 * GodRays — volumetric light shafts from the water surface (Phase 11).
 *
 * Technique:
 *   Three large planes (180 × 51 units) arranged at 0°, 60°, 120° around Y.
 *   This "tri-plane" arrangement gives shaft coverage from any horizontal
 *   camera angle without expensive raymarching.
 *
 *   Fragment shader per-plane:
 *     1. Tilts the U coordinate to match sun angle (~12° from vertical).
 *     2. Creates 6-8 shaft stripes via sin-wave interference — a product of
 *        two incommensurate sine waves produces natural-looking bright and
 *        dark bands with no visible pattern period.
 *     3. Adds a fine ripple detail on top of the primary shafts.
 *     4. Applies quadratic depth fade: full brightness at Y=35 (surface),
 *        vanishes toward Y=−16 (below seabed).
 *     5. Soft horizontal edge-fade prevents hard seams between planes.
 *
 *   AdditiveBlending: multiple planes layer additively, brightening
 *   intersections just as real volumetric scatter would.
 *
 * Dimensions:
 *   Plane center at Y = (35 + −16) / 2 = 9.5
 *   Plane height     = 35 − (−16)      = 51 units
 *   Plane width      = 180 units (wider than the 100-unit world)
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { UnderwaterMediumConfig } from "@/lib/underwaterMedium";
import { DEFAULT_MEDIUM } from "@/lib/underwaterMedium";
import { WATER_SURFACE_Y } from "./WaterSurface";

const TERRAIN_FLOOR_Y = -16;   // slightly below lowest terrain point

// ─── Shaders ──────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `
  varying vec2 vUV;
  void main() {
    vUV = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;

  varying vec2 vUV;

  void main() {
    // vUV.y: 0 = bottom (seabed side), 1 = top (surface side)
    // vUV.x: 0..1 across the plane width

    // ── Sun tilt: shift U rightward at depth, matching ~12° shaft angle ──
    float u = vUV.x + (1.0 - vUV.y) * 0.21;

    // ── Primary shaft stripes via incommensurate sine product ─────────────
    float t      = uTime * 0.11;
    float beam   = sin(u * 23.0 + t) * sin(u * 15.3 - t * 0.82);
    beam         = max(0.0, beam);
    beam         = pow(beam, 1.8);

    // ── Fine detail ripple layered on top ─────────────────────────────────
    float ripple = max(0.0, sin(u * 41.0 - uTime * 0.24) * 0.5 + 0.5);
    ripple       = pow(ripple, 4.5) * 0.28;

    // ── Depth fade: quadratic from surface (top) → zero at seabed ────────
    float depthFade = vUV.y * vUV.y;

    // ── Horizontal edge soft fade → no hard seam between planes ──────────
    float edgeFade = smoothstep(0.0, 0.10, vUV.x)
                   * smoothstep(1.0, 0.90, vUV.x);

    float alpha = (beam + ripple) * depthFade * edgeFade * uIntensity;

    // Warm sunlit cyan-white
    vec3 col = vec3(0.50, 0.80, 1.0);

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.32));
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface GodRaysProps {
  config?: UnderwaterMediumConfig;
}

export default function GodRays({ config = DEFAULT_MEDIUM }: GodRaysProps) {
  const planeH  = WATER_SURFACE_Y - TERRAIN_FLOOR_Y;              // 51
  const centerY = (WATER_SURFACE_Y + TERRAIN_FLOOR_Y) / 2;        // 9.5

  // Scale intensity with sun brightness
  const intensity = Math.min(0.28, config.sunIntensity * 0.075);

  const [geometry, mat0, mat1, mat2] = useMemo(() => {
    // PlaneGeometry lies in XY plane (vertical) — no rotation needed
    const geo = new THREE.PlaneGeometry(180, planeH, 1, 1);

    const make = () => new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime:      { value: 0 },
        uIntensity: { value: intensity },
      },
      transparent: true,
      depthWrite:  false,
      side:        THREE.DoubleSide,
      blending:    THREE.AdditiveBlending,
    });

    return [geo, make(), make(), make()] as const;
  }, [planeH, intensity]);

  // Always-current refs so useFrame doesn't capture stale closures
  const m0 = useRef<THREE.ShaderMaterial>(mat0);
  const m1 = useRef<THREE.ShaderMaterial>(mat1);
  const m2 = useRef<THREE.ShaderMaterial>(mat2);
  m0.current = mat0;
  m1.current = mat1;
  m2.current = mat2;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    m0.current.uniforms.uTime.value = t;
    m1.current.uniforms.uTime.value = t;
    m2.current.uniforms.uTime.value = t;
  });

  return (
    <group position={[0, centerY, 0]} renderOrder={5}>
      {/* 0° — faces +Z */}
      <mesh geometry={geometry} material={mat0} rotation={[0, 0, 0]} />
      {/* 60° */}
      <mesh geometry={geometry} material={mat1} rotation={[0, Math.PI / 3, 0]} />
      {/* 120° */}
      <mesh geometry={geometry} material={mat2} rotation={[0, (2 * Math.PI) / 3, 0]} />
    </group>
  );
}
