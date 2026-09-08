import { useEffect, useRef, useState } from "react";
import { RigidBody } from "@react-three/rapier";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { TABLE_DIMENSIONS } from "./layout";

// A squat, heavy smoked-glass body - the classic "hotel lobby" ashtray
// silhouette: a wide flared bowl sitting on a slightly narrower foot.
const OUTER_RADIUS = 0.09;
const BODY_HEIGHT = 0.03;
const INNER_RADIUS = OUTER_RADIUS * 0.6;
const NOTCH_COUNT = 4;
const CLICK_MAX_MOVEMENT = 6; // px - matches RotaryPhone/Paper's click-vs-drag threshold
const BANNER_TIMEOUT_MS = 4000;

const GLASS_COLOR = "#9aa5ad";
const ASH_BOWL_COLOR = "#3d3d3d";
const ASH_PILE_COLOR = "#a9a9a4";
const BUTT_PAPER_COLOR = "#f2efe4";
const BUTT_ASH_COLOR = "#8f8b83";

/**
 * A couple of stubbed-out cigarette butts resting across the rim, purely
 * decorative flavour to sell the "traditional ashtray" read.
 */
function CigaretteButt({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  return (
    <group position={position} rotation={[0, rotationY, Math.PI / 2 + 0.15]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.0035, 0.0035, 0.05, 8]} />
        <meshStandardMaterial color={BUTT_PAPER_COLOR} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.021, 0]} castShadow>
        <cylinderGeometry args={[0.0038, 0.0038, 0.008, 8]} />
        <meshStandardMaterial color={BUTT_ASH_COLOR} roughness={0.9} />
      </mesh>
    </group>
  );
}

/**
 * A traditional smoked-glass ashtray prop sitting on the desk corner
 * opposite the rotary phone. Clicking it (a genuine click, not a
 * camera-orbit drag ending over it - same pointerdown/move/up distance
 * check `RotaryPhone` and `Paper` use) pops up a small banner noting it's
 * available for a fee, a lightweight nod to the "smoker-friendly desk"
 * personalisation without wiring up any real purchase flow.
 */
export function Ashtray() {
  const [hovered, setHovered] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const dragState = useRef({ pointerId: null as number | null, downX: 0, downY: 0, moved: false });
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { width, depth, surfaceY } = TABLE_DIMENSIONS;
  // Mirrored on x only from RotaryPhone's back-right corner spot, so the
  // ashtray sits on the opposite (back-left) side of the table at the same
  // depth - directly across from the phone rather than diagonally, which
  // also keeps it within the default camera's view frustum.
  const position: [number, number, number] = [
    -(width / 2 - 0.32),
    surfaceY,
    -(depth / 2) + 0.32,
  ];

  const openBanner = () => {
    setShowBanner(true);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setShowBanner(false), BANNER_TIMEOUT_MS);
  };

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    dragState.current.pointerId = e.pointerId;
    dragState.current.downX = e.clientX;
    dragState.current.downY = e.clientY;
    dragState.current.moved = false;
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    const state = dragState.current;
    if (state.pointerId !== e.pointerId) return;
    const dx = e.clientX - state.downX;
    const dy = e.clientY - state.downY;
    if (Math.hypot(dx, dy) > CLICK_MAX_MOVEMENT) state.moved = true;
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    const state = dragState.current;
    if (state.pointerId !== e.pointerId) return;
    state.pointerId = null;
    if (!state.moved) openBanner();
  };

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = "pointer";
  };

  const handlePointerOut = () => {
    setHovered(false);
    document.body.style.cursor = "auto";
  };

  return (
    <RigidBody type="fixed" colliders="cuboid" position={position}>
      <group
        scale={hovered ? 1.06 : 1}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        {/* Outer bowl: flared smoked-glass body, wider at the rim than the
            foot, the classic heavy glass ashtray silhouette. */}
        <mesh position={[0, BODY_HEIGHT / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[OUTER_RADIUS, OUTER_RADIUS * 0.8, BODY_HEIGHT, 32]} />
          <meshStandardMaterial
            color={GLASS_COLOR}
            roughness={0.15}
            metalness={0.05}
            transparent
            opacity={0.55}
          />
        </mesh>

        {/* Sunken ash bowl: a smaller, darker disc inset near the top so the
            glass body reads as hollowed-out rather than solid. */}
        <mesh position={[0, BODY_HEIGHT - 0.006, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[INNER_RADIUS, INNER_RADIUS * 0.8, 0.012, 32]} />
          <meshStandardMaterial color={ASH_BOWL_COLOR} roughness={0.9} />
        </mesh>

        {/* A little pile of ash sitting in the bowl. */}
        <mesh position={[0.012, BODY_HEIGHT - 0.001, -0.008]} scale={[1, 0.4, 1]} castShadow>
          <sphereGeometry args={[0.022, 12, 8]} />
          <meshStandardMaterial color={ASH_PILE_COLOR} roughness={1} />
        </mesh>

        {/* Rim notches: shallow cigarette-rest grooves cut into the flared
            lip at even intervals, the detail that reads as "ashtray" rather
            than just "bowl". */}
        {Array.from({ length: NOTCH_COUNT }, (_, i) => {
          const angle = (i / NOTCH_COUNT) * Math.PI * 2;
          const r = OUTER_RADIUS * 0.92;
          return (
            <mesh
              key={i}
              position={[Math.cos(angle) * r, BODY_HEIGHT - 0.004, Math.sin(angle) * r]}
              rotation={[0, -angle, 0]}
              castShadow
            >
              <boxGeometry args={[0.03, 0.008, 0.014]} />
              <meshStandardMaterial color={ASH_BOWL_COLOR} roughness={0.8} />
            </mesh>
          );
        })}

        <CigaretteButt position={[-0.03, BODY_HEIGHT - 0.001, 0.05]} rotationY={0.5} />
        <CigaretteButt position={[0.045, BODY_HEIGHT - 0.001, -0.04]} rotationY={-1.1} />

        {showBanner && (
          <Html position={[0, BODY_HEIGHT + 0.22, 0]} center distanceFactor={2.4} zIndexRange={[100, 0]}>
            <div
              style={{
                background: "rgba(0,0,0,0.8)",
                color: "#ffffff",
                fontFamily: "system-ui, sans-serif",
                fontSize: 14,
                lineHeight: 1.4,
                padding: "8px 14px",
                borderRadius: 8,
                whiteSpace: "nowrap",
                boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                pointerEvents: "none",
              }}
            >
              Available for a fee of &euro;10
            </div>
          </Html>
        )}
      </group>
    </RigidBody>
  );
}
