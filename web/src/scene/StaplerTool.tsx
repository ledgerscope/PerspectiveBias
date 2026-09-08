import { useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { getHeldTargetPosition } from "./holdTarget";

const APPEAR_LAMBDA = 10;
const CHOMP_DURATION = 0.28;

interface StaplerToolProps {
  /** Whether an invoice + at least one cheque are currently selected. */
  visible: boolean;
  homePosition: [number, number, number];
  /** Called once, right as the jaw closes, with the world position the bundle should fly from. */
  onStaple: (startPosition: [number, number, number]) => void;
}

/**
 * The big red stapler prop. Appears alongside the stamp once an invoice and
 * a matching cheque are selected. Clicking it "chomps" (a quick jaw
 * animation) and staples the selected cheque(s) to the held invoice, which
 * then float off into the payments tray.
 */
export function StaplerTool({ visible, homePosition, onStaple }: StaplerToolProps) {
  const groupRef = useRef<THREE.Group>(null);
  const jawRef = useRef<THREE.Group>(null);
  const appearScaleRef = useRef(0);
  const chompingRef = useRef(false);
  const chompTimeRef = useRef(0);
  const firedRef = useRef(false);
  const flightStartRef = useRef<[number, number, number]>([0, 0, 0]);
  const { camera } = useThree();

  useFrame((_state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const targetAppear = visible ? 1 : 0;
    appearScaleRef.current = THREE.MathUtils.damp(appearScaleRef.current, targetAppear, APPEAR_LAMBDA, delta);
    group.scale.setScalar(Math.max(appearScaleRef.current, 0.0001));

    const jaw = jawRef.current;
    if (jaw) {
      if (chompingRef.current) {
        chompTimeRef.current += delta;
        const t = chompTimeRef.current / CHOMP_DURATION;
        if (t < 0.5) {
          jaw.rotation.x = -THREE.MathUtils.lerp(0, 0.35, t * 2);
        } else if (t < 1) {
          jaw.rotation.x = -THREE.MathUtils.lerp(0.35, 0, (t - 0.5) * 2);
        } else {
          jaw.rotation.x = 0;
          chompingRef.current = false;
        }
        // Fire exactly once as soon as the jaw passes the midpoint (closed)
        // - checked independently of the animation branches above so a big
        // frame delta (e.g. a slow/backgrounded tab) can't skip past a
        // narrow window and silently drop the staple action.
        if (!firedRef.current && t >= 0.5) {
          firedRef.current = true;
          onStaple(flightStartRef.current);
        }
        if (t >= 1) {
          firedRef.current = false;
        }
      } else {
        jaw.rotation.x = 0;
      }
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!visible || chompingRef.current) return;
    const target = getHeldTargetPosition(camera);
    flightStartRef.current = [target.x, target.y, target.z];
    chompingRef.current = true;
    chompTimeRef.current = 0;
  };

  return (
    <group ref={groupRef} position={homePosition} rotation={[0, 0.3, 0]}>
      <group onPointerDown={handleClick}>
        {/* Base */}
        <mesh position={[0, 0.006, 0]} castShadow>
          <boxGeometry args={[0.11, 0.012, 0.032]} />
          <meshStandardMaterial color="#7a0000" roughness={0.4} />
        </mesh>
        {/* Hinged top jaw, pivoted at the back edge */}
        <group ref={jawRef} position={[-0.05, 0.012, 0]}>
          <mesh position={[0.05, 0.012, 0]} castShadow>
            <boxGeometry args={[0.1, 0.02, 0.03]} />
            <meshStandardMaterial color="#c81e1e" roughness={0.35} />
          </mesh>
          {/* Silver strike plate at the front */}
          <mesh position={[0.095, 0.006, 0]} castShadow>
            <boxGeometry args={[0.012, 0.012, 0.034]} />
            <meshStandardMaterial color="#cfcfcf" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
