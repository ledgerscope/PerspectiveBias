import type { Cheque, Invoice } from "../xero/types";
import { rngFromString } from "./hash";
import { TABLE_DIMENSIONS } from "./layout";
import { resolveClearXZ } from "./toolZone";

// Real-world personal/business cheques are long and narrow (~6in x 2.75in),
// nothing like A4 - roughly a 2.2:1 landscape strip.
export const CHEQUE_WIDTH = 0.152;
export const CHEQUE_HEIGHT = 0.069;

const BANK_WORDS_A = [
  "First",
  "Harbour",
  "Union",
  "National",
  "Summit",
  "Pioneer",
  "Coastal",
  "Meridian",
  "Anchor",
  "Cornerstone",
];
const BANK_WORDS_B = ["Trust", "Savings", "Federal", "Community", "Reserve", "Mutual"];

/**
 * Turns a subset of unpaid invoices into "incoming payment" cheques so
 * there's something to physically match up with an invoice on the desk.
 * Deterministic from each invoice's id, so the same invoice list always
 * produces the same cheques (which ones exist, and whether a large invoice
 * got split into two part-payment cheques).
 */
export function generateCheques(invoices: Invoice[]): Cheque[] {
  const cheques: Cheque[] = [];

  for (const invoice of invoices) {
    if (invoice.status === "VOIDED") continue;
    const rand = rngFromString(`${invoice.id}-cheque`);
    const isPaid = invoice.status === "PAID";
    // Roughly half of the *unpaid* invoices get a cheque sitting on the desk
    // waiting to be matched/stapled; the rest are still "awaiting payment"
    // with nothing to reconcile yet. A PAID invoice, by definition, was
    // already settled by a cheque, so it always gets one (or a split pair)
    // - there's no such thing as a paid invoice with no payment behind it.
    if (!isPaid && rand() >= 0.55) continue;

    const bank = `${BANK_WORDS_A[Math.floor(rand() * BANK_WORDS_A.length)]} ${
      BANK_WORDS_B[Math.floor(rand() * BANK_WORDS_B.length)]
    } Bank`;
    const chequeNumberBase = 1000 + Math.floor(rand() * 8999);

    // Large invoices are sometimes split into two part-payment cheques -
    // makes "at least one cheque selected" genuinely mean *one or more*.
    const split = invoice.total > 5000 && rand() < 0.4;
    if (split) {
      const firstShare = 0.4 + rand() * 0.2; // 40-60% on the first cheque
      const amounts = [
        Math.round(invoice.total * firstShare * 100) / 100,
        Math.round(invoice.total * (1 - firstShare) * 100) / 100,
      ];
      amounts.forEach((amount, i) => {
        cheques.push({
          id: `${invoice.id}-cheque-${i + 1}`,
          invoiceId: invoice.id,
          chequeNumber: String(chequeNumberBase + i),
          amount,
          currencyCode: invoice.currencyCode,
          payerName: invoice.contactName,
          bankName: bank,
          date: invoice.dueDate,
          memo: `${invoice.invoiceNumber} (part ${i + 1} of 2)`,
        });
      });
    } else {
      cheques.push({
        id: `${invoice.id}-cheque-1`,
        invoiceId: invoice.id,
        chequeNumber: String(chequeNumberBase),
        amount: invoice.total,
        currencyCode: invoice.currencyCode,
        payerName: invoice.contactName,
        bankName: bank,
        date: invoice.dueDate,
        memo: invoice.invoiceNumber,
      });
    }
  }

  return cheques;
}

export interface ChequeLayout {
  id: string;
  cheque: Cheque;
  position: [number, number, number];
  rotation: [number, number, number];
}

const PAPER_HEIGHT_ABOVE_TABLE = 0.006;

// Cheque half-diagonal (CHEQUE_WIDTH x CHEQUE_HEIGHT) - same reasoning as
// layout.ts's invoice margin, just smaller since cheques are much slimmer.
const CHEQUE_CLEARANCE_MARGIN = 0.09;

/** Scatters cheques individually across the desk, away from the invoice stacks. */
export function generateChequeLayout(cheques: Cheque[]): ChequeLayout[] {
  return cheques.map((cheque, i) => {
    const rand = rngFromString(`${cheque.id}-layout-${i}`);
    const [x, z] = resolveClearXZ(
      () => [(rand() - 0.5) * (TABLE_DIMENSIONS.width - 0.5), (rand() - 0.5) * (TABLE_DIMENSIONS.depth - 0.5)],
      CHEQUE_CLEARANCE_MARGIN,
    );
    return {
      id: cheque.id,
      cheque,
      position: [x, PAPER_HEIGHT_ABOVE_TABLE + rand() * 0.01, z],
      rotation: [0, rand() * Math.PI * 2, 0],
    };
  });
}
