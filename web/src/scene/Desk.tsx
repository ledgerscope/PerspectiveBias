import { RigidBody } from "@react-three/rapier";
import { TABLE_DIMENSIONS } from "./layout";

/**
 * The desk/table surface papers rest and slide on. A static (fixed) rigid
 * body so dynamic paper bodies can collide/rest on it.
 */
export function Desk() {
  const { width, depth, height, thickness } = TABLE_DIMENSIONS;
  const legHeight = height - thickness / 2;

  return (
    <group>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, height, 0]} receiveShadow castShadow>
          <boxGeometry args={[width, thickness, depth]} />
          <meshStandardMaterial color="#8a6240" roughness={0.7} />
        </mesh>
      </RigidBody>

      {/* Simple cosmetic legs, non-physical (desk top collider is enough). */}
      {[
        [width / 2 - 0.08, depth / 2 - 0.08],
        [-(width / 2 - 0.08), depth / 2 - 0.08],
        [width / 2 - 0.08, -(depth / 2 - 0.08)],
        [-(width / 2 - 0.08), -(depth / 2 - 0.08)],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, legHeight / 2, z]} castShadow>
          <boxGeometry args={[0.06, legHeight, 0.06]} />
          <meshStandardMaterial color="#4a3626" roughness={0.8} />
        </mesh>
      ))}

      {/* Floor */}
      <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#6b6b63" roughness={1} />
      </mesh>
    </group>
  );
}
