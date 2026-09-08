import { useMemo, useRef, useState } from "react";
import { RigidBody } from "@react-three/rapier";
import type { ThreeEvent } from "@react-three/fiber";
import { createPhoneDialTexture, type PhoneDialState } from "./textureUtils";
import { useXeroStatus } from "./useXeroStatus";
import { TABLE_DIMENSIONS } from "./layout";

const BASE_RADIUS = 0.11;
const BASE_HEIGHT = 0.05;
const DIAL_RADIUS = 0.085;
const CLICK_MAX_MOVEMENT = 6; // px - matches Paper.tsx's click-vs-drag threshold

/**
 * An old-style rotary phone sitting on a back corner of the desk, doubling
 * as the "connect to Xero" control - clicking it kicks off the OAuth2
 * Authorization Code flow (a full navigation to `/api/xero/connect`, since
 * that has to leave the app for Xero's login screen). The dial face shows
 * a plain-text "XERO" wordmark plus a status dot/caption reflecting whether
 * an org is already connected, so the control stays "in world" rather than
 * a plain HTML button breaking the desk illusion.
 *
 * Uses the same pointerdown/move/up click-vs-drag distance check as
 * `Paper.tsx` rather than a bare `onClick`, so orbiting the camera through
 * the phone never misfires a navigation.
 */
export function RotaryPhone() {
  const { connected, liveDisabled } = useXeroStatus();
  const [hovered, setHovered] = useState(false);
  const dragState = useRef({ pointerId: null as number | null, downX: 0, downY: 0, moved: false });

  const dialState: PhoneDialState = liveDisabled ? "disabled" : connected ? "connected" : "disconnected";
  const dialTexture = useMemo(() => createPhoneDialTexture(dialState), [dialState]);

  const { width, depth, surfaceY } = TABLE_DIMENSIONS;
  const position: [number, number, number] = [
    width / 2 - 0.32,
    surfaceY,
    -(depth / 2) + 0.32,
  ];

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
    if (!state.moved) {
      // A genuine click (not a camera-orbit drag that happened to end over
      // the phone) - kick off the Xero OAuth redirect.
      window.location.href = "/api/xero/connect";
    }
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
        {/* Base */}
        <mesh position={[0, BASE_HEIGHT / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[BASE_RADIUS, BASE_RADIUS * 1.15, BASE_HEIGHT, 32]} />
          <meshStandardMaterial color="#20242b" roughness={0.5} metalness={0.2} />
        </mesh>

        {/* Dial face */}
        <mesh position={[0, BASE_HEIGHT + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[DIAL_RADIUS, 48]} />
          <meshStandardMaterial map={dialTexture} roughness={0.6} />
        </mesh>

        {/* Handset cradle bumps */}
        {[-0.06, 0.06].map((x) => (
          <mesh key={x} position={[x, BASE_HEIGHT + 0.015, 0]} castShadow>
            <cylinderGeometry args={[0.015, 0.015, 0.03, 12]} />
            <meshStandardMaterial color="#15181d" roughness={0.5} />
          </mesh>
        ))}

        {/* Handset resting across the cradle: two "earpiece" spheres joined
            by a bar, the classic rotary-phone receiver silhouette. */}
        <group position={[0, BASE_HEIGHT + 0.05, 0]}>
          <mesh position={[-0.09, 0, 0]} castShadow>
            <sphereGeometry args={[0.028, 16, 16]} />
            <meshStandardMaterial color="#20242b" roughness={0.4} />
          </mesh>
          <mesh position={[0.09, 0, 0]} castShadow>
            <sphereGeometry args={[0.028, 16, 16]} />
            <meshStandardMaterial color="#20242b" roughness={0.4} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.014, 0.014, 0.2, 16]} />
            <meshStandardMaterial color="#20242b" roughness={0.4} />
          </mesh>
        </group>
      </group>
    </RigidBody>
  );
}
