import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RigidBody } from "@react-three/rapier";
import { RoundedBox } from "@react-three/drei";
import type { ThreeElements, ThreeEvent } from "@react-three/fiber";
import { createPhoneDialTexture, type PhoneDialState } from "./textureUtils";
import { useXeroStatus } from "./useXeroStatus";
import { TABLE_DIMENSIONS } from "./layout";

// Body footprint (a rounded box rather than the old plain cylinder, closer
// to a classic bakelite rotary phone's chunky, softly-cornered case).
const BODY_WIDTH = 0.24;
const BODY_DEPTH = 0.24;
const BODY_HEIGHT = 0.16;
const BODY_CORNER_RADIUS = 0.045;
const DIAL_RADIUS = 0.06;
// Dial sits recessed into the front-top face, tilted up toward the viewer
// rather than lying perfectly flat, the way real desk-phone dials are raked.
// The tilt is steep enough that the dial's own boundary dips below the
// case's flat-top surface height on its near side - a small raised "boss"
// (see DIAL_RISER_* below) bridges that gap so the plate reads as sitting
// proud of the case rather than being swallowed by it.
const DIAL_TILT = 0.65; // rad, added on top of the flat "-PI/2" (facing up)
const DIAL_ROTATION_X = -Math.PI / 2 + DIAL_TILT;
// Outward face normal of the tilted dial plate, used to offset the raised
// boss so its far (embedded) end disappears into the case and its near end
// sits flush under the ring - see the geometry note above `Handset`.
const DIAL_NORMAL: [number, number, number] = [0, -Math.sin(DIAL_ROTATION_X), Math.cos(DIAL_ROTATION_X)];
const DIAL_MOUNT_Y = BODY_HEIGHT + 0.055;
const DIAL_MOUNT_Z = BODY_DEPTH * 0.02;
const DIAL_RISER_HEIGHT = 0.08;
const DIAL_RISER_RADIUS = DIAL_RADIUS + 0.02;
const CLICK_MAX_MOVEMENT = 6; // px - matches Paper.tsx's click-vs-drag threshold

// Glossy black bakelite/plastic body colour + brass trim, matched to a
// classic rotary phone rather than the old flat dark-grey plastic.
const BODY_COLOR = "#15161b";
const GOLD_COLOR = "#c9a24a";

const goldMaterialProps: ThreeElements["meshStandardMaterial"] = {
  color: GOLD_COLOR,
  roughness: 0.3,
  metalness: 0.85,
};

/**
 * A coiled handset cord resting on the desk beside the phone base, built as
 * a tube following a decaying helix curve so it reads as a loosely-piled
 * spiral cord rather than a straight wire. Rendered outside the phone's
 * `RigidBody` (see `RotaryPhone` below) so its wide, spread-out footprint
 * doesn't get swallowed into the auto-generated cuboid collider used for
 * click detection - that would otherwise turn empty desk space next to the
 * phone into an invisible wall.
 */
function CoiledCord() {
  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const turns = 6;
    const segments = turns * 24;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = t * Math.PI * 2 * turns;
      const radius = 0.036 * (1 - t * 0.65) + 0.01;
      points.push(
        new THREE.Vector3(
          Math.cos(angle) * radius,
          0.005 * Math.sin(angle * 3), // slight vertical waviness, cord isn't perfectly flat
          Math.sin(angle) * radius,
        ),
      );
    }
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.TubeGeometry(curve, segments, 0.005, 6, false);
  }, []);

  return (
    <mesh geometry={geometry} position={[-0.16, 0.003, 0.08]} castShadow receiveShadow>
      <meshStandardMaterial color={BODY_COLOR} roughness={0.6} metalness={0.1} />
    </mesh>
  );
}

/**
 * The handset (receiver): two rounded earpiece/mouthpiece ends joined by a
 * gently arched handle, resting across the cradle horns - the classic
 * rotary-phone receiver silhouette, with brass collars where the handle
 * meets each end.
 */
function Handset() {
  const handleGeometry = useMemo(() => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.088, 0, 0),
      new THREE.Vector3(0, 0.02, 0),
      new THREE.Vector3(0.088, 0, 0),
    );
    return new THREE.TubeGeometry(curve, 24, 0.016, 12, false);
  }, []);

  return (
    // Sits back over the cradle horns (same z as the horns below) rather
    // than centred over the phone, so its arc doesn't hang in front of the
    // dial and block the logo from the player's actual (elevated, angled)
    // desk-view camera - only the handset's own footprint should overlap
    // the horns, leaving the whole front dial face in the clear.
    <group position={[0, BODY_HEIGHT + 0.1, -0.05]}>
      <mesh geometry={handleGeometry} castShadow receiveShadow>
        <meshStandardMaterial color={BODY_COLOR} roughness={0.35} metalness={0.2} />
      </mesh>
      {[-0.088, 0.088].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh scale={[1, 0.85, 1.2]} castShadow receiveShadow>
            <sphereGeometry args={[0.034, 20, 20]} />
            <meshStandardMaterial color={BODY_COLOR} roughness={0.3} metalness={0.25} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <torusGeometry args={[0.017, 0.0035, 8, 24]} />
            <meshStandardMaterial {...goldMaterialProps} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

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
    <>
      <RigidBody type="fixed" colliders="cuboid" position={position}>
        <group
          scale={hovered ? 1.06 : 1}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
        >
          {/* Body: a chunky rounded-box case rather than a plain cylinder,
              closer to a real bakelite rotary phone's silhouette. */}
          <RoundedBox
            args={[BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH]}
            radius={BODY_CORNER_RADIUS}
            smoothness={4}
            position={[0, BODY_HEIGHT / 2, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={BODY_COLOR} roughness={0.35} metalness={0.25} />
          </RoundedBox>

          {/* Raised boss the dial ring sits on: bridges the case's flat top
              up to the steeply-tilted dial plate so the plate reads as a
              proud, mounted control panel rather than being half-swallowed
              by the case (its far end is pushed behind the surface so the
              seam disappears into the body). */}
          <mesh
            position={[
              0,
              DIAL_MOUNT_Y - DIAL_NORMAL[1] * (DIAL_RISER_HEIGHT / 2),
              DIAL_MOUNT_Z - DIAL_NORMAL[2] * (DIAL_RISER_HEIGHT / 2),
            ]}
            // cylinderGeometry's own axis runs along local Y, 90deg away from
            // the disc's local Z-facing normal, so it needs that extra
            // quarter-turn to line its axis up with DIAL_NORMAL above.
            rotation={[DIAL_ROTATION_X + Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[DIAL_RISER_RADIUS, DIAL_RISER_RADIUS, DIAL_RISER_HEIGHT, 32]} />
            <meshStandardMaterial color={BODY_COLOR} roughness={0.4} metalness={0.2} />
          </mesh>

          {/* Brass bezel ring framing the dial, raked up toward the viewer. */}
          <mesh position={[0, DIAL_MOUNT_Y, DIAL_MOUNT_Z]} rotation={[DIAL_ROTATION_X, 0, 0]}>
            <torusGeometry args={[DIAL_RADIUS + 0.006, 0.008, 12, 48]} />
            <meshStandardMaterial {...goldMaterialProps} />
          </mesh>

          {/* Dial face */}
          <mesh
            position={[
              DIAL_NORMAL[0] * 0.003,
              DIAL_MOUNT_Y + DIAL_NORMAL[1] * 0.003,
              DIAL_MOUNT_Z + DIAL_NORMAL[2] * 0.003,
            ]}
            rotation={[DIAL_ROTATION_X, 0, 0]}
          >
            <circleGeometry args={[DIAL_RADIUS, 48]} />
            <meshStandardMaterial map={dialTexture} roughness={0.55} />
          </mesh>

          {/* Cradle horns the handset rests its switch-hook weight on. */}
          {[-0.075, 0.075].map((x) => (
            <group key={x} position={[x, BODY_HEIGHT, -0.05]}>
              <mesh position={[0, 0.028, 0]} castShadow>
                <cylinderGeometry args={[0.011, 0.013, 0.056, 12]} />
                <meshStandardMaterial color={BODY_COLOR} roughness={0.4} metalness={0.15} />
              </mesh>
              <mesh position={[0, 0.056, 0]} castShadow>
                <sphereGeometry args={[0.013, 12, 12]} />
                <meshStandardMaterial color={BODY_COLOR} roughness={0.4} metalness={0.15} />
              </mesh>
            </group>
          ))}

          <Handset />
        </group>
      </RigidBody>

      {/* Coiled cord, purely decorative - kept outside the RigidBody so it
          doesn't widen the click/collision cuboid (see CoiledCord above). */}
      <group position={position}>
        <CoiledCord />
      </group>
    </>
  );
}
