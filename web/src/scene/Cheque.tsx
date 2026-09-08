import { useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { RigidBodyType } from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { ChequeLayout } from "./chequeLayout";
import { CHEQUE_WIDTH, CHEQUE_HEIGHT } from "./chequeLayout";
import { createChequeTexture } from "./textureUtils";
import {
  getHeldTargetPosition,
  getCameraBasis,
  getHeldInvoiceHalfExtents,
  HELD_LEFT_OFFSET,
  HOLD_DISTANCE,
} from "./holdTarget";

const CHEQUE_THICKNESS = 0.002;
const SELECTED_SCREEN_FRACTION = 0.34; // smaller than a fully-held invoice - it sits *beside* it
const SELECTED_SCALE_LAMBDA = 8;
const SELECTED_MOVE_LAMBDA = 9;
const CLICK_MAX_MOVEMENT = 6; // px
const GLOW_COLOR = new THREE.Color("#0a6b2b");
// Floating/stapling cheques sit this much closer to the camera than the
// invoice's own hold plane, so they always render visibly in front of it
// rather than co-planar (which could look tucked behind depending on draw
// order).
const IN_FRONT_OFFSET = -0.015;
// How long the "being stapled" animation (rotate to vertical + snap to the
// invoice's top-left corner) takes before the fly-to-tray flight begins.
export const STAPLE_ANIM_DURATION = 1;

interface ChequeProps {
  layout: ChequeLayout;
  /** The invoice currently held up to the camera, if any. */
  heldInvoiceId: string | null;
  /** Whether this cheque has been pulled up to float beside its matched invoice. */
  isSelected: boolean;
  /** Stacking index among all currently-selected cheques (for side-by-side offset). */
  selectedIndex: number;
  /**
   * Whether this cheque is currently in the "being stapled" animation -
   * rotating to vertical and snapping to the held invoice's top-left corner
   * for STAPLE_ANIM_DURATION seconds before flying off to the tray.
   */
  isStapling: boolean;
  onToggleSelect: (chequeId: string) => void;
  resetToken: number;
  surfaceY: number;
  onDragStateChange: (dragging: boolean) => void;
}

/**
 * A cheque sitting on the desk. Glows while its matching invoice is held (so
 * it's easy to spot), and can be clicked to float up beside the held
 * invoice (click again, or drop the invoice, to send it back to the desk).
 * Otherwise behaves like a regular draggable/physical paper, just
 * cheque-shaped rather than A4.
 */
export function Cheque({
  layout,
  heldInvoiceId,
  isSelected,
  selectedIndex,
  isStapling,
  onToggleSelect,
  resetToken,
  surfaceY,
  onDragStateChange,
}: ChequeProps) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const visualRef = useRef<THREE.Group>(null);
  const baseMeshRef = useRef<THREE.Mesh>(null);
  const faceMeshRef = useRef<THREE.Mesh>(null);
  const baseMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const faceMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const glowMeshRef = useRef<THREE.Mesh>(null);
  const glowMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const glowOpacityRef = useRef(0);
  const floatScaleRef = useRef(1);
  const floatPosRef = useRef<THREE.Vector3 | null>(null);
  const floatQuatRef = useRef<THREE.Quaternion | null>(null);
  const wasSelectedRef = useRef(false);
  const wasStaplingRef = useRef(false);
  const staplingElapsedRef = useRef(0);
  const staplingStartPosRef = useRef<THREE.Vector3 | null>(null);
  const staplingStartQuatRef = useRef<THREE.Quaternion | null>(null);
  const { camera } = useThree();

  const texture = useMemo(() => createChequeTexture(layout.cheque), [layout.cheque]);

  const matches = heldInvoiceId === layout.cheque.invoiceId;
  const baseColor = useMemo(() => new THREE.Color("#f4f1e6"), []);

  const dragState = useRef<{
    dragging: boolean;
    pointerId: number | null;
    downX: number;
    downY: number;
    moved: boolean;
    selectedAtDown: boolean;
  }>({
    dragging: false,
    pointerId: null,
    downX: 0,
    downY: 0,
    moved: false,
    selectedAtDown: false,
  });

  const lastResetToken = useRef(resetToken);

  // Reset to the original desk position/rotation on a global reset bump.
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
        const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...layout.rotation));
        body.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true);
        body.setBodyType(RigidBodyType.Dynamic, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  });

  useFrame((_state, delta) => {
    const body = bodyRef.current;
    if (!body) return;

    // Solid glow (no pulsing) while this cheque matches the held invoice
    // but hasn't been pulled up yet - a dark, saturated green that stays
    // constant so it reads clearly against the desk clutter instead of a
    // brighter but pulsing tint that was easy to miss.
    // Applied to *both* materials: the printed face (what the camera
    // actually sees from above - the plane sits right on top of the box and
    // fully occludes it) and the underlying box (visible edge-on / from
    // below), so the glow reads correctly from any angle.
    const targetIntensity = matches && !isSelected ? 1 : 0;
    for (const material of [baseMaterialRef.current, faceMaterialRef.current]) {
      if (!material) continue;
      if (targetIntensity > 0) {
        material.emissive.copy(GLOW_COLOR);
        material.emissiveIntensity = 1.4;
      } else {
        material.emissiveIntensity = THREE.MathUtils.damp(material.emissiveIntensity, 0, 10, delta);
      }
    }
    // The emissive tint above still gets washed out by the lit paper
    // texture/scene lighting, especially zoomed out, so layer an *unlit*
    // solid-green overlay plane on top of the face - its rendered colour is
    // exactly the material colour (not affected by scene light), so it
    // always reads as a clear, solid dark green regardless of zoom or
    // lighting. It's slightly larger than the cheque so it also forms a
    // thin visible border/halo around the edges.
    glowOpacityRef.current = THREE.MathUtils.damp(
      glowOpacityRef.current,
      targetIntensity > 0 ? 0.82 : 0,
      10,
      delta,
    );
    if (glowMaterialRef.current) glowMaterialRef.current.opacity = glowOpacityRef.current;
    if (glowMeshRef.current) glowMeshRef.current.visible = glowOpacityRef.current > 0.01;

    // While floating up beside/onto the held invoice (selected or mid-staple
    // rotation), the cheque's camera-facing plane and the invoice's own
    // camera-facing plane are only near-parallel (each independently "looks
    // at" the camera from a slightly different lateral offset), not exactly
    // coplanar - a small lookAt tilt that the flat forward-offset alone
    // doesn't reliably outrun once the two overlap on screen (e.g. tucked
    // into the invoice's corner while stapling). Skipping the depth test and
    // forcing a high render order for as long as it needs to visually sit
    // "on top" guarantees it never gets clipped by the invoice underneath,
    // regardless of the exact tilt at any given frame.
    // A *glowing but not-yet-selected* cheque needs the same treatment: the
    // held invoice is deliberately positioned over a big chunk of the desk
    // (left-hand side), so a matching cheque that happens to be scattered
    // underneath that screen area would otherwise be fully hidden behind the
    // invoice's own paper - useless as a "look, here it is" highlight if the
    // user can't actually see it.
    const forceOnTop = matches || isStapling;
    for (const mesh of [baseMeshRef.current, faceMeshRef.current, glowMeshRef.current]) {
      if (mesh) mesh.renderOrder = forceOnTop ? 10 : 0;
    }
    for (const material of [baseMaterialRef.current, faceMaterialRef.current, glowMaterialRef.current]) {
      if (material) material.depthTest = !forceOnTop;
    }

    let targetScale = 1;
    if (isStapling) {
      if (!wasStaplingRef.current) {
        // Just entered the "being stapled" animation - start from wherever
        // it currently is (its floating position, since it must have been
        // selected already to trigger the staple).
        const t = body.translation();
        const r = body.rotation();
        staplingStartPosRef.current = floatPosRef.current
          ? floatPosRef.current.clone()
          : new THREE.Vector3(t.x, t.y, t.z);
        staplingStartQuatRef.current = floatQuatRef.current
          ? floatQuatRef.current.clone()
          : new THREE.Quaternion(r.x, r.y, r.z, r.w);
        staplingElapsedRef.current = 0;
      }
      staplingElapsedRef.current = Math.min(STAPLE_ANIM_DURATION, staplingElapsedRef.current + delta);
      const t = staplingElapsedRef.current / STAPLE_ANIM_DURATION;
      const eased = 1 - Math.pow(1 - t, 3);

      const cam = camera as THREE.PerspectiveCamera;
      // Target: the invoice's top-left corner, rotated 90deg (about the
      // camera's own view axis, i.e. a screen-space roll) so the normally
      // landscape cheque reads as a vertical strip tucked under the corner
      // - like it's just been physically stapled on at an angle.
      const invoiceTarget = getHeldTargetPosition(camera, HELD_LEFT_OFFSET, 0);
      const { forward, right, up } = getCameraBasis(camera);
      const { halfWidth, halfHeight } = getHeldInvoiceHalfExtents(cam);
      const cornerTarget = invoiceTarget
        .addScaledVector(right, -halfWidth * 0.68)
        .addScaledVector(up, halfHeight * 0.68)
        .addScaledVector(forward, IN_FRONT_OFFSET * 2);

      const pos = new THREE.Vector3().lerpVectors(staplingStartPosRef.current!, cornerTarget, eased);

      const lookQuat = new THREE.Quaternion();
      const m = new THREE.Matrix4().lookAt(camera.position, pos, camera.up);
      lookQuat.setFromRotationMatrix(m);
      const faceAdjust = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      lookQuat.multiply(faceAdjust);
      // World-space roll around the camera's forward axis turns the
      // already-camera-facing rectangle "vertical" on screen, regardless of
      // the mesh's own local axis conventions.
      const rollQuat = new THREE.Quaternion().setFromAxisAngle(forward, Math.PI / 2).multiply(lookQuat);
      const quat = new THREE.Quaternion().slerpQuaternions(staplingStartQuatRef.current!, rollQuat, eased);

      body.setBodyType(RigidBodyType.KinematicPositionBased, true);
      body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
      body.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true);
      floatPosRef.current = pos;
      floatQuatRef.current = quat;

      if (cam.isPerspectiveCamera) {
        const vFov = THREE.MathUtils.degToRad(cam.fov);
        const viewHeight = 2 * Math.tan(vFov / 2) * (HOLD_DISTANCE + IN_FRONT_OFFSET * 2);
        const viewWidth = viewHeight * cam.aspect;
        const baseScale = Math.min(
          (SELECTED_SCREEN_FRACTION * viewHeight) / CHEQUE_HEIGHT,
          (SELECTED_SCREEN_FRACTION * viewWidth) / CHEQUE_WIDTH,
        );
        // Shrink as it tucks into the corner so it reads as "attached to"
        // the invoice rather than still floating at full size.
        targetScale = THREE.MathUtils.lerp(baseScale, baseScale * 0.45, eased);
      }
    } else if (isSelected) {
      if (!wasSelectedRef.current) {
        const t = body.translation();
        const r = body.rotation();
        floatPosRef.current = new THREE.Vector3(t.x, t.y, t.z);
        floatQuatRef.current = new THREE.Quaternion(r.x, r.y, r.z, r.w);
      }

      // Offset to the right/below the held invoice (staggered per selected
      // index so multiple matched cheques fan out rather than overlapping),
      // and slightly toward the camera so it always renders in front of the
      // invoice rather than co-planar with it.
      const target = getHeldTargetPosition(
        camera,
        HELD_LEFT_OFFSET + 0.24,
        -0.16 - selectedIndex * 0.1,
        IN_FRONT_OFFSET,
      );

      const pos = floatPosRef.current!;
      const quat = floatQuatRef.current!;
      pos.set(
        THREE.MathUtils.damp(pos.x, target.x, SELECTED_MOVE_LAMBDA, delta),
        THREE.MathUtils.damp(pos.y, target.y, SELECTED_MOVE_LAMBDA, delta),
        THREE.MathUtils.damp(pos.z, target.z, SELECTED_MOVE_LAMBDA, delta),
      );

      const lookQuat = new THREE.Quaternion();
      const m = new THREE.Matrix4().lookAt(camera.position, pos, camera.up);
      lookQuat.setFromRotationMatrix(m);
      const faceAdjust = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      lookQuat.multiply(faceAdjust);
      const slerpT = 1 - Math.exp(-SELECTED_MOVE_LAMBDA * delta);
      quat.slerp(lookQuat, slerpT);

      body.setBodyType(RigidBodyType.KinematicPositionBased, true);
      body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
      body.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true);

      const cam = camera as THREE.PerspectiveCamera;
      if (cam.isPerspectiveCamera) {
        const vFov = THREE.MathUtils.degToRad(cam.fov);
        const viewHeight = 2 * Math.tan(vFov / 2) * (HOLD_DISTANCE + IN_FRONT_OFFSET);
        const viewWidth = viewHeight * cam.aspect;
        targetScale = Math.min(
          (SELECTED_SCREEN_FRACTION * viewHeight) / CHEQUE_HEIGHT,
          (SELECTED_SCREEN_FRACTION * viewWidth) / CHEQUE_WIDTH,
        );
      }
    } else if (wasSelectedRef.current || wasStaplingRef.current) {
      // Just deselected - hand control back to physics from wherever it was.
      body.setBodyType(RigidBodyType.Dynamic, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    wasSelectedRef.current = isSelected;
    wasStaplingRef.current = isStapling;

    const group = visualRef.current;
    if (group) {
      floatScaleRef.current = THREE.MathUtils.damp(floatScaleRef.current, targetScale, SELECTED_SCALE_LAMBDA, delta);
      group.scale.setScalar(floatScaleRef.current);
    }
  });

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (isStapling) return; // no interaction while it's mid-staple animation
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragState.current.dragging = true;
    dragState.current.pointerId = e.pointerId;
    dragState.current.downX = e.clientX;
    dragState.current.downY = e.clientY;
    dragState.current.moved = false;
    dragState.current.selectedAtDown = isSelected;
    if (isSelected) return; // floating cheques don't get dragged around the table
    const body = bodyRef.current;
    if (!body) return;
    onDragStateChange(true);
    body.setBodyType(RigidBodyType.KinematicPositionBased, true);
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    const state = dragState.current;
    if (!state.dragging || state.pointerId !== e.pointerId) return;
    const dx = e.clientX - state.downX;
    const dy = e.clientY - state.downY;
    if (Math.hypot(dx, dy) > CLICK_MAX_MOVEMENT) state.moved = true;
    if (isSelected) return; // floating cheques don't get dragged around the table, but
    // (as above) a drag/orbit gesture that started on top of one must still
    // count as "moved" so pointer-up doesn't misread it as a deselect click.

    const body = bodyRef.current;
    if (!body) return;
    const point = e.point;
    const current = body.translation();
    body.setNextKinematicTranslation({ x: point.x, y: current.y, z: point.z });
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    const state = dragState.current;
    if (state.pointerId !== e.pointerId) return;
    state.dragging = false;
    state.pointerId = null;
    if (!state.selectedAtDown) onDragStateChange(false);
    const body = bodyRef.current;
    if (body && !isSelected) {
      body.setBodyType(RigidBodyType.Dynamic, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    if (!state.moved && matches && !isStapling) {
      // Only cheques matching the currently-held invoice can be toggled -
      // clicking an unrelated cheque on the desk just leaves it be.
      onToggleSelect(layout.cheque.id);
    }
  };

  return (
    <RigidBody
      ref={bodyRef}
      position={[layout.position[0], layout.position[1] + surfaceY, layout.position[2]]}
      rotation={layout.rotation}
      colliders="cuboid"
      mass={0.006}
      linearDamping={2}
      angularDamping={2}
      type="dynamic"
    >
      <group ref={visualRef}>
        <mesh
          ref={baseMeshRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[CHEQUE_WIDTH, CHEQUE_THICKNESS, CHEQUE_HEIGHT]} />
          <meshStandardMaterial ref={baseMaterialRef} color={baseColor} roughness={0.85} />
        </mesh>
        <mesh ref={faceMeshRef} position={[0, CHEQUE_THICKNESS / 2 + 0.0003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[CHEQUE_WIDTH, CHEQUE_HEIGHT]} />
          <meshStandardMaterial ref={faceMaterialRef} map={texture} roughness={0.85} />
        </mesh>
        {/* Unlit solid-green "matches the held invoice" overlay - sits just
            above the printed face and slightly oversized so it also reads as
            a thin border, and is unaffected by scene lighting so it always
            looks like a clear, solid dark green rather than a washed-out
            tint (this is what the camera-facing side actually shows). */}
        <mesh
          ref={glowMeshRef}
          position={[0, CHEQUE_THICKNESS / 2 + 0.0006, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
          raycast={() => null}
        >
          <planeGeometry args={[CHEQUE_WIDTH * 1.06, CHEQUE_HEIGHT * 1.06]} />
          <meshBasicMaterial
            ref={glowMaterialRef}
            color={GLOW_COLOR}
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
    </RigidBody>
  );
}
