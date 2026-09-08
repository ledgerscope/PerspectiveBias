import * as THREE from "three";

// Meters in front of the camera when a paper/cheque is "held up" to view.
// Shared by Paper, Cheque and the desk tools so anything that needs to
// animate to "where the held invoice currently is" converges on the exact
// same point without any cross-component ref plumbing.
export const HOLD_DISTANCE = 0.9;

/**
 * The camera-relative point papers glide to while "held". With a non-zero
 * offset, returns a point shifted right/up relative to the camera's own
 * orientation - used to place a matched cheque beside the held invoice.
 */
export function getHeldTargetPosition(
  camera: THREE.Camera,
  offsetRight = 0,
  offsetUp = 0,
): THREE.Vector3 {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const target = camera.position.clone().addScaledVector(forward, HOLD_DISTANCE);
  if (offsetRight !== 0 || offsetUp !== 0) {
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    target.addScaledVector(right, offsetRight).addScaledVector(up, offsetUp);
  }
  return target;
}
