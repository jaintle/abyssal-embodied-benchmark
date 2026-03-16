"use client";

/**
 * SeabedFloor — infinite-looking sand plane behind the terrain mesh.
 *
 * Problem: TerrainMesh is a finite ~140×140 unit patch.  At any camera
 * distance the squared edge is visible as a cliff drop into void.
 *
 * Solution: render a large 600×600 flat plane at TERRAIN_BASE_Y - 0.05,
 * slightly below the terrain, coloured to match the low-valley floor
 * (sandy sediment) of the terrain palette.  Three.js FogExp2 already
 * reaches ≈98% opacity at ~100 m, so the plane's boundary is solidly
 * invisible from any reachable camera angle.  No edge-fade shader needed.
 *
 * The plane sits below the terrain mesh so it never z-fights:
 *   TerrainMesh min Y  ≈  TERRAIN_BASE_Y - amplitude/2  (from worldgen config)
 *   SeabedFloor Y      =  TERRAIN_BASE_Y - 0.05
 * This places the floor slightly under the deepest terrain valleys, so
 * the seabed surface is always visible in those areas too.
 */

import { useMemo } from "react";
import * as THREE from "three";
import { TERRAIN_BASE_Y } from "./TerrainMesh";

export default function SeabedFloor() {
  // Sandy sediment — matches TerrainMesh COL_LOW converted to sRGB:
  //   linear [0.74, 0.65, 0.43]  ≈  sRGB #c8bc82
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#c8bc82"),
        roughness: 0.97,
        metalness: 0.0,
      }),
    []
  );

  return (
    <mesh
      position={[0, TERRAIN_BASE_Y - 0.05, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow={false}
    >
      {/* 600×600 — well beyond the ~100 m fog wall, no edge visible */}
      <planeGeometry args={[600, 600]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
