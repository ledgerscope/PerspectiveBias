import { useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { RigidBodyType } from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { PaperLayout } from "./layout";
import { createInvoiceTexture } from "./textureUtils";

const A4_WIDTH = 0.21;
const A4_HEIGHT = 0.297;
const PAPER_THICKNESS = 0.001;
const HOLD_DISTANCE = 0.9; // meters in front of the camera when "held up"
const CLICK_MAX_MOVEMENT = 6; // px - below this, a pointer up counts as a click not a drag

interface PaperProps {
  layout: PaperLayout;
  heldId: string | null;
  onHold: (id: string | null) => void;
  resetToken: number;
  tableHeight: number;
}

/**
 * A single physical invoice "paper" on the desk. Can be:
 *  - dragged around the table (kinematic while the mouse is down),
 *  - knocked into by other dragged papers (normal rapier collisions),
 *  - clicked (without dragging) to lift it up to the camera ("hold to
 *    face"), and clicked again to drop it,
 *  - reset back to its original table position on a global `resetToken`
 *    bump (space bar).
 */
export function Paper({ layout, heldId, onHold, resetToken, tableHeight }: PaperProps) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  const texture = useMemo(() => createInvoiceTexture(layout.invoice), [layout.invoice]);

  const dragState = useRef<{
    dragging: boolean;
    pointerId: number | null;
    downX: number;
    downY: number;
    moved: boolean;
    plane: THREE.Plane;
    offset: THREE.Vector3;
  }>({
    dragging: false,
    pointerId: null,
    downX: 0,
    downY: 0,
    moved: false,
    plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -(tableHeight + 0.02)),
    offset: new THREE.Vector3(),
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
          { x: layout.position[0], y: layout.position[1] + tableHeight, z: layout.position[2] },
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

  // While held, float the paper up in front of the camera each frame.
  useFrame(() => {
    const body = bodyRef.current;
    if (!body) return;
    if (isHeld) {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      const target = camera.position.clone().add(forward.multiplyScalar(HOLD_DISTANCE));
      body.setBodyType(RigidBodyType.KinematicPositionBased, true);
      body.setTranslation({ x: target.x, y: target.y, z: target.z }, true);
      // Face the camera.
      const lookQuat = new THREE.Quaternion();
      const m = new THREE.Matrix4().lookAt(camera.position, target, camera.up);
      lookQuat.setFromRotationMatrix(m);
      // Rotate an extra 180deg so the printed side faces the camera.
      const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      lookQuat.multiply(flip);
      body.setRotation({ x: lookQuat.x, y: lookQuat.y, z: lookQuat.z, w: lookQuat.w }, true);
    }
  });

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (isHeld) return; // held papers are released via click handling below
    const body = bodyRef.current;
    if (!body) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragState.current.dragging = true;
    dragState.current.pointerId = e.pointerId;
    dragState.current.downX = e.clientX;
    dragState.current.downY = e.clientY;
    dragState.current.moved = false;
    body.setBodyType(RigidBodyType.KinematicPositionBased, true);
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
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
      position={[layout.position[0], layout.position[1] + tableHeight, layout.position[2]]}
      rotation={layout.rotation}
      colliders="cuboid"
      mass={0.01}
      linearDamping={2}
      angularDamping={2}
      type="dynamic"
    >
      <mesh
        ref={meshRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[A4_WIDTH, PAPER_THICKNESS, A4_HEIGHT]} />
        <meshStandardMaterial attach="material-2" map={texture} roughness={0.9} />
        <meshStandardMaterial attach="material-0" color="#f5f5f0" roughness={0.9} />
        <meshStandardMaterial attach="material-1" color="#f5f5f0" roughness={0.9} />
        <meshStandardMaterial attach="material-3" color="#f5f5f0" roughness={0.9} />
        <meshStandardMaterial attach="material-4" color="#ffffff" roughness={0.9} />
        <meshStandardMaterial attach="material-5" color="#e8e8e0" roughness={0.9} />
      </mesh>
    </RigidBody>
  );
}
