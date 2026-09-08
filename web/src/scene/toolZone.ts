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

function isInToolZone(x: number, z: number): boolean {
  const dx = x - TOOL_ZONE_CENTER[0];
  const dz = z - TOOL_ZONE_CENTER[1];
  return dx * dx + dz * dz < TOOL_ZONE_RADIUS * TOOL_ZONE_RADIUS;
}

/**
 * Repeatedly calls `sample` for a candidate (x, z) desk position until one
 * lands outside the tool cluster's footprint (or a retry budget runs out).
 * Falls back to pushing the last candidate radially outward from the zone's
 * centre so it's never left sitting on top of the tray/stamp/stapler even
 * in the extremely unlikely worst case.
 */
export function resolveClearXZ(
  sample: () => [number, number],
  maxAttempts = 20,
): [number, number] {
  let candidate = sample();
  for (let i = 0; i < maxAttempts && isInToolZone(candidate[0], candidate[1]); i++) {
    candidate = sample();
  }
  if (isInToolZone(candidate[0], candidate[1])) {
    const dx = candidate[0] - TOOL_ZONE_CENTER[0];
    const dz = candidate[1] - TOOL_ZONE_CENTER[1];
    const len = Math.hypot(dx, dz) || 1;
    const push = TOOL_ZONE_RADIUS + 0.05;
    candidate = [
      TOOL_ZONE_CENTER[0] + (dx / len) * push,
      TOOL_ZONE_CENTER[1] + (dz / len) * push,
    ];
  }
  return candidate;
}
