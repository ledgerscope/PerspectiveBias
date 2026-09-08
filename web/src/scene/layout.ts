import type { Invoice } from "../xero/types";

export interface PaperLayout {
  id: string;
  invoice: Invoice;
  position: [number, number, number];
  rotation: [number, number, number];
}

const TABLE_WIDTH = 3.6; // meters, roughly desk-sized
const TABLE_DEPTH = 2.0;
const TABLE_HEIGHT = 0.9; // y of the desk's centerline (legs support up to here)
const TABLE_THICKNESS = 0.06;
// Top face of the desk slab - papers must be placed at/above this, not at
// TABLE_HEIGHT itself, otherwise they spawn embedded inside the slab.
const TABLE_SURFACE_Y = TABLE_HEIGHT + TABLE_THICKNESS / 2;
// Small clearance above the surface so papers start just above the desk and
// settle down onto it under gravity, rather than starting flush/intersecting.
const PAPER_HEIGHT_ABOVE_TABLE = 0.006;

// Simple seeded PRNG so the "random" scatter/stacks are stable across
// reloads (until a fresh invoice list changes the count).
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// The first STACKED_INVOICE_COUNT invoices (in fetch order) are always
// piled into STACK_COUNT even stacks rather than scattered individually -
// e.g. "the first 20 invoices should be in two stacks of 10".
const STACKED_INVOICE_COUNT = 20;
const STACK_COUNT = 2;

/**
 * Lays invoices out across the table: the first `STACKED_INVOICE_COUNT`
 * invoices form `STACK_COUNT` neat stacks (slight vertical offset + tight
 * position jitter so they still look hand-placed), and every remaining
 * invoice is scattered individually at a random position/rotation so
 * there's still something satisfying to knock over.
 */
export function generateInitialLayout(invoices: Invoice[]): PaperLayout[] {
  const rand = seededRandom(1337);
  const layouts: PaperLayout[] = [];

  const stackedCount = Math.min(STACKED_INVOICE_COUNT, invoices.length);
  const stackCount = stackedCount > 0 ? Math.min(STACK_COUNT, stackedCount) : 0;
  const baseStackSize = stackCount > 0 ? Math.floor(stackedCount / stackCount) : 0;
  let extra = stackCount > 0 ? stackedCount % stackCount : 0;
  let idx = 0;

  for (let s = 0; s < stackCount; s++) {
    const stackSize = baseStackSize + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    const cx = (rand() - 0.5) * (TABLE_WIDTH - 0.6);
    const cz = (rand() - 0.5) * (TABLE_DEPTH - 0.6);
    const baseRotY = rand() * Math.PI * 2;
    for (let p = 0; p < stackSize && idx < invoices.length; p++, idx++) {
      const invoice = invoices[idx];
      layouts.push({
        id: invoice.id,
        invoice,
        position: [
          cx + (rand() - 0.5) * 0.03,
          PAPER_HEIGHT_ABOVE_TABLE + p * 0.012,
          cz + (rand() - 0.5) * 0.03,
        ],
        rotation: [0, baseRotY + (rand() - 0.5) * 0.15, 0],
      });
    }
  }

  for (; idx < invoices.length; idx++) {
    const invoice = invoices[idx];
    layouts.push({
      id: invoice.id,
      invoice,
      position: [
        (rand() - 0.5) * (TABLE_WIDTH - 0.4),
        PAPER_HEIGHT_ABOVE_TABLE + rand() * 0.01,
        (rand() - 0.5) * (TABLE_DEPTH - 0.4),
      ],
      rotation: [0, rand() * Math.PI * 2, 0],
    });
  }

  return layouts;
}

export const TABLE_DIMENSIONS = {
  width: TABLE_WIDTH,
  depth: TABLE_DEPTH,
  height: TABLE_HEIGHT,
  thickness: TABLE_THICKNESS,
  surfaceY: TABLE_SURFACE_Y,
};
