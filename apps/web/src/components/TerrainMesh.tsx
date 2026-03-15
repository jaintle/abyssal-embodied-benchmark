"use client";

/**
 * TerrainMesh — renders the procedural seabed from a TerrainGrid.
 *
 * Coordinate system (unchanged):
 *   X — east | Y — up | Z — north
 *   Terrain Y ∈ [TERRAIN_BASE_Y - amplitude/2, TERRAIN_BASE_Y + amplitude/2]
 *
 * Phase 10 material upgrade:
 *   Vertex colours computed per-vertex from normalised height:
 *     - Low valleys:  bright sandy sediment     (0.74, 0.65, 0.43)
 *     - Mid slopes:   wet compact sand/silt     (0.40, 0.30, 0.18)
 *     - High exposed: dark volcanic reef rock   (0.17, 0.11, 0.07)
 *   Combined with CausticsLayer additive projection this gives convincing
 *   tropical seabed variation with zero texture atlas cost.
 */

import { useMemo } from "react";
import * as THREE from "three";
import type { TerrainGrid } from "@abyssal/worldgen";

/** World-space Y offset of terrain mid-level (metres below waterline). */
export const TERRAIN_BASE_Y = -6;

interface TerrainMeshProps {
  grid: TerrainGrid;
}

// ─── Colour palette (linear 0-1) ──────────────────────────────────────────────
const COL_LOW:  [number, number, number] = [0.74, 0.65, 0.43]; // bright sandy sediment
const COL_MID:  [number, number, number] = [0.40, 0.30, 0.18]; // wet compact sand / silt
const COL_HIGH: [number, number, number] = [0.17, 0.11, 0.07]; // dark volcanic reef rock

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TerrainMesh({ grid }: TerrainMeshProps) {
  const geometry = useMemo(() => {
    const { resolution, width, depth, heights } = grid;
    const N = resolution;

    // ── Normalise heights for colour mapping ──────────────────────────────
    let minH = Infinity;
    let maxH = -Infinity;
    for (let i = 0; i < heights.length; i++) {
      if (heights[i] < minH) minH = heights[i];
      if (heights[i] > maxH) maxH = heights[i];
    }
    const range = Math.max(maxH - minH, 0.001);

    // ── Build vertex and colour buffers ──────────────────────────────────
    const positions = new Float32Array(N * N * 3);
    const colors    = new Float32Array(N * N * 3);
    let vi = 0;

    for (let row = 0; row < N; row++) {
      for (let col = 0; col < N; col++) {
        const idx = row * N + col;
        const x   = -width / 2 + (col / (N - 1)) * width;
        const z   = -depth / 2 + (row / (N - 1)) * depth;
        const y   = TERRAIN_BASE_Y + heights[idx];

        positions[vi++] = x;
        positions[vi++] = y;
        positions[vi++] = z;

        // 0 = lowest valley, 1 = highest peak
        const t = (heights[idx] - minH) / range;

        let r: number, g: number, b: number;
        if (t < 0.45) {
          const u = t / 0.45;
          r = lerp(COL_LOW[0], COL_MID[0], u);
          g = lerp(COL_LOW[1], COL_MID[1], u);
          b = lerp(COL_LOW[2], COL_MID[2], u);
        } else {
          const u = (t - 0.45) / 0.55;
          r = lerp(COL_MID[0], COL_HIGH[0], u);
          g = lerp(COL_MID[1], COL_HIGH[1], u);
          b = lerp(COL_MID[2], COL_HIGH[2], u);
        }

        colors[idx * 3]     = r;
        colors[idx * 3 + 1] = g;
        colors[idx * 3 + 2] = b;
      }
    }

    // ── Build index buffer (two triangles per quad) ──────────────────────
    const indexCount = (N - 1) * (N - 1) * 6;
    const indices    = new Uint32Array(indexCount);
    let ii = 0;

    for (let row = 0; row < N - 1; row++) {
      for (let col = 0; col < N - 1; col++) {
        const a = row * N + col;
        const b = row * N + col + 1;
        const c = (row + 1) * N + col;
        const d = (row + 1) * N + col + 1;
        indices[ii++] = a; indices[ii++] = c; indices[ii++] = b;
        indices[ii++] = b; indices[ii++] = c; indices[ii++] = d;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color",    new THREE.BufferAttribute(colors, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    return geo;
  }, [grid]);

  return (
    <mesh geometry={geometry} receiveShadow={false}>
      <meshStandardMaterial
        vertexColors
        roughness={0.92}
        metalness={0.04}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}
