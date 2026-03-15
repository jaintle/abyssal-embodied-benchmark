"use client";

/**
 * CausticsLayer — animated caustic light projection over the seabed.
 *
 * Technique: domain-distortion GLSL fragment shader on a flat XZ-aligned
 * plane, rendered with AdditiveBlending and depthWrite=false.
 * The additive blend means the caustics add blue-tinted light on whatever
 * is below — terrain, obstacles — without occlusion or z-fighting.
 *
 * The pattern uses 2-pass domain distortion (each pass bends the UV space
 * with nested sin/cos waves), then computes sin(p.x + p.y) and raises it
 * to a high power to produce sharp bright lines on a dark field — the
 * characteristic reticulated caustic network.
 *
 * Performance: single draw call, no CPU work per frame.  The time uniform
 * is updated via useFrame (one float write per frame, negligible).
 *
 * Parameters come from the UnderwaterMediumConfig so all visual presets
 * can dial caustic intensity and speed independently.
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { TERRAIN_BASE_Y } from "./TerrainMesh";
import type { UnderwaterMediumConfig } from "@/lib/underwaterMedium";
import { DEFAULT_MEDIUM } from "@/lib/underwaterMedium";

// ─── Shaders ──────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `
  varying vec2 vWorldXZ;

  void main() {
    // World-space XZ position passed to fragment for pattern calculation
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldXZ = worldPos.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  varying vec2 vWorldXZ;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uScale;

  // Domain-distortion caustic pattern (raw — no pow, caller applies exponent).
  // Two passes of bending produce the characteristic reticulated network.
  float causticPattern(vec2 uv, float t) {
    vec2 p = uv;

    // Pass 1 — primary slow drift
    float t1 = t * 0.50;
    p.x += sin(p.y * 2.8 + t1)        * 0.65;
    p.y += cos(p.x * 3.1 + t1 * 0.90) * 0.65;

    // Pass 2 — secondary faster detail
    float t2 = t * 0.82;
    p.x += sin(p.y * 5.0 + t2 * 1.25) * 0.32;
    p.y += cos(p.x * 4.6 + t2 * 1.10) * 0.32;

    // Raw interference value in [0, 1]
    return sin(p.x + p.y) * 0.5 + 0.5;
  }

  void main() {
    // Layer 1: fine high-frequency network (sharp lines, pow 8)
    float raw1 = causticPattern(vWorldXZ * uScale,          uTime);
    // Layer 2: coarser low-frequency web (broader patches, pow 6, offset phase)
    float raw2 = causticPattern(vWorldXZ * uScale * 0.55,   uTime * 0.71 + 1.80);

    float c = pow(raw1, 8.0) * 0.65 + pow(raw2, 6.0) * 0.35;

    // Tropical cyan caustics — warm turquoise cast for photographic preset
    vec3 col = vec3(0.30 + c * 0.25, 0.80 + c * 0.20, 0.82 + c * 0.10) * c;

    // Alpha drives brightness in additive blend mode
    gl_FragColor = vec4(col, c * uIntensity);
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface CausticsLayerProps {
  config?: UnderwaterMediumConfig;
}

export default function CausticsLayer({ config = DEFAULT_MEDIUM }: CausticsLayerProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime:      { value: 0 },
      uIntensity: { value: config.causticsIntensity },
      uScale:     { value: config.causticsScale },
    },
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
    side:        THREE.FrontSide,
  }), [config.causticsIntensity, config.causticsScale]);

  // Update time uniform each frame — pure GPU work, zero allocations
  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value =
        clock.getElapsedTime() * config.causticsSpeed;
    }
  });

  // Plane placed just above the terrain floor, covering the full world extent.
  // Rotation lays the XY plane down to XZ world plane.
  return (
    <mesh
      position={[0, TERRAIN_BASE_Y + 0.08, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={1}
    >
      <planeGeometry args={[140, 140, 1, 1]} />
      <primitive object={material} ref={matRef} attach="material" />
    </mesh>
  );
}
