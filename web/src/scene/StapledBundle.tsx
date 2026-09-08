import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Invoice } from "../xero/types";
import { createInvoiceTexture } from "./textureUtils";
import { rngFromString } from "./hash";

const FLIGHT_DURATION = 0.9; // seconds
const BUNDLE_SCALE = 0.32; // shrink the A4-proportioned card down to tray size

interface StapledBundleProps {
  id: string;
  invoice: Invoice;
  referenceDate: Date;
  /** Absolute world position the bundle starts flying from (where it was held/selected). */
  startPosition: [number, number, number];
  /** Absolute world position (inside the tray) the bundle settles at, already offset per stack index. */
  endPosition: [number, number, number];
  chequeCount: number;
  /**
   * Skips the fly-in animation and renders already resting in its final
   * tray position/orientation - used for invoices that were already PAID
   * when the scene loaded, so they appear pre-reconciled (cheque(s) already
   * stapled on and filed away) rather than animating in from nowhere.
   */
  instant?: boolean;
}

/**
 * A stapled invoice+cheque(s) bundle: flies from wherever it was held on
 * pickup into the payments tray, then rests there permanently as a small
 * flattened stack item (with a couple of cheque-coloured strips peeking out
 * from underneath to show what's stapled behind the invoice).
 */
export function StapledBundle({
  id,
  invoice,
  referenceDate,
  startPosition,
  endPosition,
  chequeCount,
  instant = false,
}: StapledBundleProps) {
  const groupRef = useRef<THREE.Group>(null);
  const startRef = useRef(new THREE.Vector3(...startPosition));
  const endRef = useRef(new THREE.Vector3(...endPosition));
  const elapsedRef = useRef(instant ? FLIGHT_DURATION : 0);
  const texture = useMemo(
    () => createInvoiceTexture(invoice, referenceDate, true),
    [invoice, referenceDate],
  );
  const restRotationY = useMemo(() => (rngFromString(`${id}-rest`)() - 0.5) * 0.6, [id]);
  const restEuler = useMemo(
    () => new THREE.Euler(-Math.PI / 2, 0, restRotationY),
    [restRotationY],
  );

  useFrame((_state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    elapsedRef.current = Math.min(FLIGHT_DURATION, elapsedRef.current + delta);
    const t = elapsedRef.current / FLIGHT_DURATION;
    const eased = 1 - Math.pow(1 - t, 3);

    group.position.lerpVectors(startRef.current, endRef.current, eased);

    // Start "facing camera" (like it was just held) and rotate flat/level
    // as it settles into the tray, with a small resting-angle jitter.
    const startEuler = new THREE.Euler(-Math.PI / 2, 0, 0);
    const startQuat = new THREE.Quaternion().setFromEuler(startEuler);
    const endQuat = new THREE.Quaternion().setFromEuler(restEuler);
    group.quaternion.slerpQuaternions(startQuat, endQuat, eased);

    // A gentle arc upward mid-flight rather than a flat straight-line glide.
    group.position.y += Math.sin(Math.PI * eased) * 0.12;
  });

  const width = 0.21 * BUNDLE_SCALE;
  const height = 0.297 * BUNDLE_SCALE;

  return (
    <group
      ref={groupRef}
      position={instant ? endPosition : startPosition}
      rotation={instant ? [restEuler.x, restEuler.y, restEuler.z] : undefined}
    >
      {/* Cheque strip(s) peeking out from underneath the invoice. */}
      {Array.from({ length: chequeCount }).map((_, i) => (
        <mesh key={i} position={[0.01 * (i + 1), -0.001 * (i + 1), 0.02 * (i + 1)]}>
          <planeGeometry args={[width * 0.9, height * 0.35]} />
          <meshStandardMaterial color="#e8e2c8" roughness={0.85} />
        </mesh>
      ))}
      {/* A small grey staple mark, top-left corner. */}
      <mesh position={[-width * 0.36, 0.0015, -height * 0.4]}>
        <boxGeometry args={[0.012, 0.001, 0.004]} />
        <meshStandardMaterial color="#8a8a8a" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.002, 0]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={texture} roughness={0.9} />
      </mesh>
    </group>
  );
}
