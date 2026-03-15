"use client";

/**
 * ObstacleField — renders all seeded obstacles as sphere meshes.
 *
 * Each obstacle is an independent mesh. We use instanced rendering is
 * intentionally avoided at this stage to keep the code auditable;
 * 12 obstacles is trivially handled by individual draw calls.
 */

import type { ObstacleData } from "@abyssal/worldgen";

interface ObstacleFieldProps {
  obstacles: ObstacleData[];
}

export default function ObstacleField({ obstacles }: ObstacleFieldProps) {
  return (
    <group name="obstacle-field">
      {obstacles.map((obs) => (
        <mesh
          key={obs.index}
          position={[obs.position[0], obs.position[1], obs.position[2]]}
          castShadow
          receiveShadow
        >
          <sphereGeometry args={[obs.radius, 16, 12]} />
          <meshStandardMaterial
            color="#1e4a62"
            roughness={0.75}
            metalness={0.25}
            emissive="#0d2d4a"
            emissiveIntensity={0.5}
          />
        </mesh>
      ))}
    </group>
  );
}
