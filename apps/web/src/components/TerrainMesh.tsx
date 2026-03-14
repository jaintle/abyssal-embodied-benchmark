"use client";

/**
 * TerrainMesh — renders the procedural seabed from a TerrainGrid.
 *
 * Builds a custom BufferGeometry in XZ world space so there is no need
 * for a rotation transform and grid-to-vertex mapping is unambiguous.
 *
 * Coordinate system:
 *   X — east
 *   Y — up (increasing = shallower)
 *   Z — north
 *   Terrain Y ∈ [TERRAIN_BASE_Y - amplitude/2, TERRAIN_BASE_Y + amplitude/2]
 */

import { useMemo } from "react";
import * as THREE from "three";
import type { TerrainGrid } from "@abyssal/worldgen";

/** World-space Y offset of terrain mid-level (metres below waterline). */
export const TERRAIN_BASE_Y = -6;

interface TerrainMeshProps {
  grid: TerrainGrid;
}

export default function TerrainMesh({ grid }: TerrainMeshProps) {
  const geometry = useMemo(() => {
    const { resolution, width, depth, heights } = grid;
    const N = resolution;

    // ── Build vertex buffer ─────────────────────────────────────────────
    const positions = new Float32Array(N * N * 3);
    // Pre-compute for normals; we'll fill after computeVertexNormals
    let vi = 0;

    for (let row = 0; row < N; row++) {
      for (let col = 0; col < N; col++) {
        const x = -width / 2 + (col / (N - 1)) * width;
        const z = -depth / 2 + (row / (N - 1)) * depth;
        const y = TERRAIN_BASE_Y + heights[row * N + col];

        positions[vi++] = x;
        positions[vi++] = y;
        positions[vi++] = z;
      }
    }

    // ── Build index buffer (two triangles per quad) ──────────────────────
    const indexCount = (N - 1) * (N - 1) * 6;
    // Use Uint32Array — safe up to 65536*65536 vertices
    const indices = new Uint32Array(indexCount);
    let ii = 0;

    for (let row = 0; row < N - 1; row++) {
      for (let col = 0; col < N - 1; col++) {
        const a = row * N + col;
        const b = row * N + col + 1;
        const c = (row + 1) * N + col;
        const d = (row + 1) * N + col + 1;

        // Triangle 1
        indices[ii++] = a;
        indices[ii++] = c;
        indices[ii++] = b;
        // Triangle 2
        indices[ii++] = b;
        indices[ii++] = c;
        indices[ii++] = d;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    return geo;
  }, [grid]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        color="#0d3b52"
        roughness={0.95}
        metalness={0.05}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}
