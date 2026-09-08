import * as THREE from "three";

// Meters in front of the camera when a paper/cheque is "held up" to view.
// Shared by Paper, Cheque and the desk tools so anything that needs to
// animate to "where the held invoice currently is" converges on the exact
// same point without any cross-component ref plumbing.
export const HOLD_DISTANCE = 0.9;

// Held invoices sit off to the left of the viewport rather than dead-centre,
// so most of the desk (and the tray/tool cluster on the right) stays
// visible while reading/reconciling it. Shared by Paper (the invoice
// itself), Cheque (matched cheques float just to the right of it) and the
// stamp/stapler (which need to travel to the same on-screen spot).
export const HELD_LEFT_OFFSET = -0.42;

// The held invoice's real-world dimensions and how much of the viewport it
// fills - shared with Cheque.tsx so it can compute the invoice's actual
// on-screen size (e.g. to find its corners) without duplicating the sizing
// math that Paper.tsx uses to scale itself.
export const A4_WIDTH = 0.21;
export const A4_HEIGHT = 0.297;
export const HOLD_SCREEN_FRACTION = 0.82;

/**
 * The camera-relative point papers glide to while "held". With a non-zero
 * offset, returns a point shifted right/up relative to the camera's own
 * orientation - used to place a matched cheque beside the held invoice.
 * `offsetForward` shifts *toward* (negative) or away from (positive) the
 * camera along its view direction, on top of the base HOLD_DISTANCE - used
 * to keep a floating cheque visibly in front of the invoice plane rather
 * than co-planar with it.
 */
export function getHeldTargetPosition(
  camera: THREE.Camera,
  offsetRight = 0,
  offsetUp = 0,
  offsetForward = 0,
): THREE.Vector3 {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const target = camera.position.clone().addScaledVector(forward, HOLD_DISTANCE + offsetForward);
  if (offsetRight !== 0 || offsetUp !== 0) {
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    target.addScaledVector(right, offsetRight).addScaledVector(up, offsetUp);
  }
  return target;
}

/** The camera's current forward/right/up basis vectors (right/up perpendicular to forward). */
export function getCameraBasis(camera: THREE.Camera) {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  return { forward, right, up };
}

/**
 * The held invoice's actual displayed half-width/half-height in world units
 * at its current distance from the camera - mirrors the "contain" scaling
 * Paper.tsx applies so the invoice fills HOLD_SCREEN_FRACTION of the
 * viewport. Lets other components (e.g. a cheque animating to the
 * invoice's top-left corner) find that corner without needing a ref into
 * Paper's internal state.
 */
export function getHeldInvoiceHalfExtents(camera: THREE.PerspectiveCamera) {
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const viewHeight = 2 * Math.tan(vFov / 2) * HOLD_DISTANCE;
  const viewWidth = viewHeight * camera.aspect;
  const scale = Math.min(
    (HOLD_SCREEN_FRACTION * viewHeight) / A4_HEIGHT,
    (HOLD_SCREEN_FRACTION * viewWidth) / A4_WIDTH,
  );
  return { halfWidth: (A4_WIDTH * scale) / 2, halfHeight: (A4_HEIGHT * scale) / 2 };
}
