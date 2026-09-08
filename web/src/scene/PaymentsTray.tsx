import { useMemo } from "react";
import { RigidBody } from "@react-three/rapier";
import * as THREE from "three";

const TRAY_WIDTH = 0.34;
const TRAY_DEPTH = 0.26;
const TRAY_WALL = 0.02;
const TRAY_BASE_HEIGHT = 0.012;
const TRAY_WALL_HEIGHT = 0.03;

function createLabelTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.fillStyle = "#2b2b2b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f2f2f2";
  ctx.font = "bold 34px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface PaymentsTrayProps {
  position: [number, number, number];
}

/**
 * A shallow desk tray labelled "Payments" - the destination for
 * invoice+cheque bundles once they've been stapled together.
 */
export function PaymentsTray({ position }: PaymentsTrayProps) {
  const labelTexture = useMemo(() => createLabelTexture("Payments"), []);

  return (
    <group position={position}>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, TRAY_BASE_HEIGHT / 2, 0]} receiveShadow castShadow>
          <boxGeometry args={[TRAY_WIDTH, TRAY_BASE_HEIGHT, TRAY_DEPTH]} />
          <meshStandardMaterial color="#3d3d3d" roughness={0.6} />
        </mesh>
      </RigidBody>
      {/* Low rim walls, cosmetic only (no separate collider needed for a thin lip). */}
      {[
        [0, TRAY_DEPTH / 2 - TRAY_WALL / 2, TRAY_WIDTH, TRAY_WALL] as const,
        [0, -(TRAY_DEPTH / 2 - TRAY_WALL / 2), TRAY_WIDTH, TRAY_WALL] as const,
      ].map(([x, z, w, d], i) => (
        <mesh key={`z-${i}`} position={[x, TRAY_WALL_HEIGHT / 2, z]} castShadow>
          <boxGeometry args={[w, TRAY_WALL_HEIGHT, d]} />
          <meshStandardMaterial color="#3d3d3d" roughness={0.6} />
        </mesh>
      ))}
      {[
        [TRAY_WIDTH / 2 - TRAY_WALL / 2, 0, TRAY_WALL, TRAY_DEPTH] as const,
        [-(TRAY_WIDTH / 2 - TRAY_WALL / 2), 0, TRAY_WALL, TRAY_DEPTH] as const,
      ].map(([x, z, w, d], i) => (
        <mesh key={`x-${i}`} position={[x, TRAY_WALL_HEIGHT / 2, z]} castShadow>
          <boxGeometry args={[w, TRAY_WALL_HEIGHT, d]} />
          <meshStandardMaterial color="#3d3d3d" roughness={0.6} />
        </mesh>
      ))}
      {/* "Payments" label plaque on the front wall. */}
      <mesh position={[0, TRAY_WALL_HEIGHT / 2, TRAY_DEPTH / 2 + 0.001]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[TRAY_WIDTH * 0.85, TRAY_WALL_HEIGHT * 0.8]} />
        <meshStandardMaterial map={labelTexture} roughness={0.8} />
      </mesh>
    </group>
  );
}

export { TRAY_WIDTH, TRAY_DEPTH };
