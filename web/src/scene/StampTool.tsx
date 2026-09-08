import { useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { getHeldTargetPosition } from "./holdTarget";

const APPEAR_LAMBDA = 10;
const TRAVEL_DURATION = 0.45; // seconds, desk -> invoice
const IMPACT_PAUSE = 0.18; // seconds, brief hold pressed against the paper
const RETURN_DURATION = 0.45; // seconds, invoice -> desk

type Phase = "idle" | "toInvoice" | "impact" | "returning";

interface StampToolProps {
  /** Whether an invoice + at least one cheque are currently selected. */
  visible: boolean;
  /** Desk-relative resting spot. */
  homePosition: [number, number, number];
  /** Called the instant the stamp touches the held invoice. */
  onApplyStamp: () => void;
}

/**
 * The green rubber stamp prop. Pops onto the desk once an invoice and a
 * matching cheque are both selected; clicking it animates the stamp from
 * its desk spot onto the currently-held invoice and back, applying a green
 * "PAID" mark at the moment of impact.
 */
export function StampTool({ visible, homePosition, onApplyStamp }: StampToolProps) {
  const groupRef = useRef<THREE.Group>(null);
  const appearScaleRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const phaseTimeRef = useRef(0);
  const posRef = useRef(new THREE.Vector3(...homePosition));
  const { camera } = useThree();

  useFrame((_state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const targetAppear = visible ? 1 : 0;
    appearScaleRef.current = THREE.MathUtils.damp(appearScaleRef.current, targetAppear, APPEAR_LAMBDA, delta);
    group.scale.setScalar(Math.max(appearScaleRef.current, 0.0001));

    const home = new THREE.Vector3(...homePosition);
    const phase = phaseRef.current;

    if (phase === "idle") {
      posRef.current.copy(home);
      group.rotation.set(0, 0, 0);
    } else {
      phaseTimeRef.current += delta;
      if (phase === "toInvoice") {
        const t = Math.min(1, phaseTimeRef.current / TRAVEL_DURATION);
        const eased = 1 - Math.pow(1 - t, 3);
        const target = getHeldTargetPosition(camera, -0.05, -0.02);
        posRef.current.lerpVectors(home, target, eased);
        group.rotation.x = -eased * 0.5; // tip forward as it presses in
        if (t >= 1) {
          onApplyStamp();
          phaseRef.current = "impact";
          phaseTimeRef.current = 0;
        }
      } else if (phase === "impact") {
        group.rotation.x = -0.5;
        if (phaseTimeRef.current >= IMPACT_PAUSE) {
          phaseRef.current = "returning";
          phaseTimeRef.current = 0;
        }
      } else if (phase === "returning") {
        const t = Math.min(1, phaseTimeRef.current / RETURN_DURATION);
        const eased = t * t * (3 - 2 * t);
        const target = getHeldTargetPosition(camera, -0.05, -0.02);
        posRef.current.lerpVectors(target, home, eased);
        group.rotation.x = -0.5 * (1 - eased);
        if (t >= 1) {
          phaseRef.current = "idle";
          phaseTimeRef.current = 0;
        }
      }
    }

    group.position.copy(posRef.current);
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!visible || phaseRef.current !== "idle") return;
    phaseRef.current = "toInvoice";
    phaseTimeRef.current = 0;
  };

  return (
    <group ref={groupRef} position={homePosition}>
      <group onPointerDown={handleClick}>
        {/* Rubber base */}
        <mesh position={[0, 0.012, 0]} castShadow>
          <cylinderGeometry args={[0.028, 0.03, 0.02, 24]} />
          <meshStandardMaterial color="#1e8f3c" roughness={0.6} />
        </mesh>
        {/* Handle stem */}
        <mesh position={[0, 0.05, 0]} castShadow>
          <cylinderGeometry args={[0.01, 0.012, 0.06, 16]} />
          <meshStandardMaterial color="#2b2b2b" roughness={0.5} />
        </mesh>
        {/* Handle grip */}
        <mesh position={[0, 0.088, 0]} castShadow>
          <sphereGeometry args={[0.02, 16, 16]} />
          <meshStandardMaterial color="#111111" roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}
