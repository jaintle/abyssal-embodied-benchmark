"use client";

/**
 * UnderwaterAtmosphere — shared scene-level atmosphere for all Canvas scenes.
 *
 * Replaces the inline fog/lights/background setup that was duplicated across
 * WorldScene, ReplayScene, and ComparisonScene.
 *
 * Visual model:
 *   - FogExp2: exponential falloff matches actual light absorption through
 *     water.  Linear fog (old) reads as dry air with a hard cutoff wall.
 *   - HemisphereLight: sky colour = scattered blue surface light; ground
 *     colour = dark seabed bounce.  Gives free depth-gradient shading without
 *     per-pixel cost.
 *   - DirectionalLight: simulates the sun refracted through the surface,
 *     biased toward the back to suggest forward scattering.
 *
 * Also owns renderer configuration (tone mapping, output colour space).
 *
 * STABILITY NOTE — why we set scene.background / scene.fog imperatively:
 *   Using <color> and <fogExp2> JSX elements with `args` containing
 *   `new THREE.Color()` creates a new Color instance on every render.
 *   R3F detects the changed args reference and tears down / recreates the
 *   underlying THREE.js object every frame.  During the brief teardown window
 *   there is no background or fog, producing a black canvas.
 *   Setting scene properties directly in useEffect avoids the teardown loop
 *   entirely — the objects are created once and mutated in place.
 */

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { UnderwaterMediumConfig } from "@/lib/underwaterMedium";
import { DEFAULT_MEDIUM } from "@/lib/underwaterMedium";

interface UnderwaterAtmosphereProps {
  config?: UnderwaterMediumConfig;
}

export default function UnderwaterAtmosphere({
  config = DEFAULT_MEDIUM,
}: UnderwaterAtmosphereProps) {
  const { gl, scene } = useThree();

  // ── Stable colour instances (recreated only when hex string changes) ──────
  const bgColor  = useMemo(() => new THREE.Color(config.backgroundColor), [config.backgroundColor]);
  const fogColor = useMemo(() => new THREE.Color(config.fogColor),        [config.fogColor]);

  // ── Set scene.background + scene.fog imperatively ────────────────────────
  useEffect(() => {
    scene.background = bgColor;
    scene.fog        = new THREE.FogExp2(fogColor, config.fogDensity);
    return () => {
      scene.background = null;
      scene.fog        = null;
    };
  }, [scene, bgColor, fogColor, config.fogDensity]);

  // ── Configure WebGL renderer ──────────────────────────────────────────────
  useEffect(() => {
    if (gl instanceof THREE.WebGLRenderer) {
      gl.toneMapping         = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = config.exposure;
      gl.outputColorSpace    = THREE.SRGBColorSpace;
    }
  }, [gl, config.exposure]);

  // ── Lights ────────────────────────────────────────────────────────────────
  // Use props (string colours) not args — props call .color.set(string) which
  // is stable.  Using args={[new THREE.Color(), ...]} would recreate the light
  // every frame (same args-instability issue as background/fog above).
  return (
    <>
      {/*
       * Hemisphere light: sky = surface scatter, ground = seabed bounce.
       */}
      <hemisphereLight
        color={config.hemisphereSkyCColor}
        groundColor={config.hemisphereGroundColor}
        intensity={config.hemisphereIntensity}
      />

      {/*
       * Directional light — sun entering from above and slightly behind the
       * camera.  Position is world-space direction only (Three.js ignores
       * distance for DirectionalLight).
       */}
      <directionalLight
        color={config.sunColor}
        intensity={config.sunIntensity}
        position={config.sunPosition}
        castShadow={false}
      />
    </>
  );
}
