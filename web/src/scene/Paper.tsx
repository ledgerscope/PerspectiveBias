import { useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { RigidBodyType } from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { PaperLayout } from "./layout";
import { createInvoiceTexture } from "./textureUtils";

const A4_WIDTH = 0.21;
const A4_HEIGHT = 0.297;
const PAPER_THICKNESS = 0.003;
const HOLD_DISTANCE = 0.9; // meters in front of the camera when "held up"
const HOLD_SCREEN_FRACTION = 0.82; // fraction of the viewport the held paper should fill
const HOLD_SCALE_LAMBDA = 8; // ease-in/out speed for the hold scale animation
const CLICK_MAX_MOVEMENT = 6; // px - below this, a pointer up counts as a click not a drag

interface PaperProps {
  layout: PaperLayout;
  heldId: string | null;
  onHold: (id: string | null) => void;
  resetToken: number;
  surfaceY: number;
  onDragStateChange: (dragging: boolean) => void;
}

/**
 * A single physical invoice "paper" on the desk. Can be:
 *  - dragged around the table (kinematic while the mouse is down),
 *  - knocked into by other dragged papers (normal rapier collisions),
 *  - clicked (without dragging) to lift it up to the camera ("hold to
 *    face"), and clicked again to drop it,
 *  - reset back to its original table position on a global `resetToken`
 *    bump (space bar).
 *
 * Rendered as a plain box (the paper's body/edges) plus a separate textured
 * plane laid on top facing +Y, rather than a single box with a 6-slot
 * material array - the multi-material box attach approach was unreliable
 * for showing the invoice texture, this plane approach mirrors the
 * (working) wall photo technique.
 */
export function Paper({
  layout,
  heldId,
  onHold,
  resetToken,
  surfaceY,
  onDragStateChange,
}: PaperProps) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const visualRef = useRef<THREE.Group>(null);
  const holdScaleRef = useRef(1);
  const { camera } = useThree();

  const texture = useMemo(() => createInvoiceTexture(layout.invoice), [layout.invoice]);

  const dragState = useRef<{
    dragging: boolean;
    pointerId: number | null;
    downX: number;
    downY: number;
    moved: boolean;
    heldAtDown: boolean;
  }>({
    dragging: false,
    pointerId: null,
    downX: 0,
    downY: 0,
    moved: false,
    heldAtDown: false,
  });

  const lastResetToken = useRef(resetToken);
  const isHeld = heldId === layout.id;

  // Reset to original table position/rotation whenever resetToken changes.
  useFrame(() => {
    if (resetToken !== lastResetToken.current) {
      lastResetToken.current = resetToken;
      const body = bodyRef.current;
      if (body) {
        body.setBodyType(RigidBodyType.KinematicPositionBased, true);
        body.setTranslation(
          { x: layout.position[0], y: layout.position[1] + surfaceY, z: layout.position[2] },
          true,
        );
        const quat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(...layout.rotation),
        );
        body.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true);
        body.setBodyType(RigidBodyType.Dynamic, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  });

  // While held, float the paper up in front of the camera each frame, and
  // scale it up so it reads as "held to your face" - near enough full
  // screen - rather than a small floating card. The scale target is derived
  // from the camera's actual FOV/aspect each frame so it fills a consistent
  // fraction of the viewport at any window size, and eases in/out smoothly
  // via THREE.MathUtils.damp rather than snapping.
  useFrame((_state, delta) => {
    const body = bodyRef.current;
    if (!body) return;
    let targetScale = 1;
    if (isHeld) {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      const target = camera.position.clone().add(forward.multiplyScalar(HOLD_DISTANCE));
      body.setBodyType(RigidBodyType.KinematicPositionBased, true);
      body.setTranslation({ x: target.x, y: target.y, z: target.z }, true);
      // Face the camera, printed side out. The invoice texture lives on the
      // local +Y face, but Matrix4.lookAt() orients local -Z toward the
      // look target, so rotate -90deg about local X first to remap the
      // printed (+Y) face onto that forward direction.
      const lookQuat = new THREE.Quaternion();
      const m = new THREE.Matrix4().lookAt(camera.position, target, camera.up);
      lookQuat.setFromRotationMatrix(m);
      const faceAdjust = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      lookQuat.multiply(faceAdjust);
      body.setRotation({ x: lookQuat.x, y: lookQuat.y, z: lookQuat.z, w: lookQuat.w }, true);

      const cam = camera as THREE.PerspectiveCamera;
      if (cam.isPerspectiveCamera) {
        const vFov = THREE.MathUtils.degToRad(cam.fov);
        const viewHeight = 2 * Math.tan(vFov / 2) * HOLD_DISTANCE;
        const viewWidth = viewHeight * cam.aspect;
        targetScale = Math.min(
          (HOLD_SCREEN_FRACTION * viewHeight) / A4_HEIGHT,
          (HOLD_SCREEN_FRACTION * viewWidth) / A4_WIDTH,
        );
      }
    }
    // Scale only the visual mesh group, not the RigidBody itself, so the
    // collider (used for on-table physics/collisions) stays A4-sized; the
    // held paper is fully kinematic anyway so this purely visual scale-up
    // doesn't affect physics.
    const group = visualRef.current;
    if (group) {
      holdScaleRef.current = THREE.MathUtils.damp(holdScaleRef.current, targetScale, HOLD_SCALE_LAMBDA, delta);
      group.scale.setScalar(holdScaleRef.current);
    }
  });

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragState.current.dragging = true;
    dragState.current.pointerId = e.pointerId;
    dragState.current.downX = e.clientX;
    dragState.current.downY = e.clientY;
    dragState.current.moved = false;
    dragState.current.heldAtDown = isHeld;
    if (isHeld) return; // still track the click for release, but don't start a table drag
    const body = bodyRef.current;
    if (!body) return;
    onDragStateChange(true); // suspend camera orbit while interacting with this paper
    body.setBodyType(RigidBodyType.KinematicPositionBased, true);
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (isHeld) return; // held papers don't get dragged around the table
    const state = dragState.current;
    if (!state.dragging || state.pointerId !== e.pointerId) return;
    const dx = e.clientX - state.downX;
    const dy = e.clientY - state.downY;
    if (Math.hypot(dx, dy) > CLICK_MAX_MOVEMENT) state.moved = true;

    const body = bodyRef.current;
    if (!body) return;
    const point = e.point; // world-space intersection with the paper's own plane at pickup time
    const current = body.translation();
    body.setNextKinematicTranslation({ x: point.x, y: current.y, z: point.z });
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    const state = dragState.current;
    if (state.pointerId !== e.pointerId) return;
    state.dragging = false;
    state.pointerId = null;
    if (!state.heldAtDown) onDragStateChange(false);
    const body = bodyRef.current;
    if (body) {
      body.setBodyType(RigidBodyType.Dynamic, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    if (!state.moved) {
      // Treat as a click: toggle hold state.
      onHold(isHeld ? null : layout.id);
    }
  };

  return (
    <RigidBody
      ref={bodyRef}
      position={[layout.position[0], layout.position[1] + surfaceY, layout.position[2]]}
      rotation={layout.rotation}
      colliders="cuboid"
      mass={0.01}
      linearDamping={2}
      angularDamping={2}
      type="dynamic"
    >
      <group ref={visualRef}>
        <mesh
          ref={meshRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[A4_WIDTH, PAPER_THICKNESS, A4_HEIGHT]} />
          <meshStandardMaterial color="#f2f2ec" roughness={0.9} />
        </mesh>
        {/* Invoice content, printed-side up, laid just above the paper body.
            receiveShadow is left off here - at this tiny offset above the box
            it self-shadows into moire/hatching that hides the texture. */}
        <mesh position={[0, PAPER_THICKNESS / 2 + 0.0003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[A4_WIDTH, A4_HEIGHT]} />
          <meshStandardMaterial map={texture} roughness={0.9} />
        </mesh>
      </group>
    </RigidBody>
  );
}
