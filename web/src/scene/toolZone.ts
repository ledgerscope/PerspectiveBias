// Desk-space (x, z) footprint of the reconciliation tool cluster: the
// payments tray, rubber stamp and stapler all live together near one front
// corner of the desk so they're easy to find and reach. Scattered/stacked
// invoices and cheques are kept out of this footprint (see `resolveClearXZ`)
// so paperwork can never spawn on top of - and visually bury - these
// interactive props. Kept close enough to desk-center (rather than out near
// the table's edge) that all three stay inside the default camera's view
// frustum - the "always visible" tools would otherwise be clipped off-screen
// at the default framing.
export const TRAY_XZ: [number, number] = [0.75, 0.55];
export const STAMP_XZ: [number, number] = [0.5, 0.15];
export const STAPLER_XZ: [number, number] = [0.95, 0.15];

const TOOL_ZONE_CENTER: [number, number] = [0.73, 0.28];
const TOOL_ZONE_RADIUS = 0.42;

function isInToolZone(x: number, z: number, margin: number): boolean {
  const dx = x - TOOL_ZONE_CENTER[0];
  const dz = z - TOOL_ZONE_CENTER[1];
  const effectiveRadius = TOOL_ZONE_RADIUS + margin;
  return dx * dx + dz * dz < effectiveRadius * effectiveRadius;
}

/**
 * Repeatedly calls `sample` for a candidate (x, z) desk position until one
 * lands outside the tool cluster's footprint (or a retry budget runs out).
 * Falls back to pushing the last candidate radially outward from the zone's
 * centre so it's never left sitting on top of the tray/stamp/stapler even
 * in the extremely unlikely worst case.
 *
 * `margin` should be roughly the half-diagonal of whatever's being placed
 * (an A4 sheet, a stack of them, a cheque) - checking only its centre point
 * against the zone radius let sheet corners reach in and visually clip
 * through the tools whenever a paper's centre landed just outside the
 * radius but close enough that its edge still overlapped the tool mesh.
 */
export function resolveClearXZ(
  sample: () => [number, number],
  margin = 0,
  maxAttempts = 20,
): [number, number] {
  let candidate = sample();
  for (let i = 0; i < maxAttempts && isInToolZone(candidate[0], candidate[1], margin); i++) {
    candidate = sample();
  }
  if (isInToolZone(candidate[0], candidate[1], margin)) {
    const dx = candidate[0] - TOOL_ZONE_CENTER[0];
    const dz = candidate[1] - TOOL_ZONE_CENTER[1];
    const len = Math.hypot(dx, dz) || 1;
    const push = TOOL_ZONE_RADIUS + margin + 0.05;
    candidate = [
      TOOL_ZONE_CENTER[0] + (dx / len) * push,
      TOOL_ZONE_CENTER[1] + (dz / len) * push,
    ];
  }
  return candidate;
}
