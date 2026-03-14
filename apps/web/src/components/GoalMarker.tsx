"use client";

/**
 * GoalMarker — renders the navigation target.
 *
 * Visual design:
 *   - Emissive core sphere (signals target clearly)
 *   - Thin wireframe outer sphere (defines acceptance radius)
 *   - A subtle vertical pole from seabed level to marker
 *
 * No animation at this stage — static marker only.
 */

import * as THREE from "three";
import type { GoalSpec } from "@abyssal/worldgen";

interface GoalMarkerProps {
  goal: GoalSpec;
}

export default function GoalMarker({ goal }: GoalMarkerProps) {
  const [x, y, z] = goal.position;
  const ar = goal.acceptanceRadius;

  return (
    <group name="goal-marker" position={[x, y, z]}>
      {/* Emissive core — clearly visible target */}
      <mesh>
        <sphereGeometry args={[0.4, 16, 12]} />
        <meshStandardMaterial
          color="#00ffa0"
          emissive="#00ffa0"
          emissiveIntensity={1.2}
          roughness={0.1}
          metalness={0.0}
        />
      </mesh>

      {/* Acceptance-radius wireframe */}
      <mesh>
        <sphereGeometry args={[ar, 16, 12]} />
        <meshBasicMaterial
          color="#00ffa0"
          wireframe
          transparent
          opacity={0.25}
        />
      </mesh>

      {/* Vertical pole to seabed (y=-6) for orientation */}
      <mesh
        position={[0, (-6 - y) / 2, 0]}
        rotation={[0, 0, 0]}
      >
        <cylinderGeometry args={[0.04, 0.04, Math.abs(-6 - y) + y, 6]} />
        <meshBasicMaterial
          color="#00ffa0"
          transparent
          opacity={0.35}
        />
      </mesh>
    </group>
  );
}
