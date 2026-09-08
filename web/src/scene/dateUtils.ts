import type { Invoice } from "../xero/types";

/**
 * The desk scene treats the latest due date across all loaded invoices as
 * "today" for overdue purposes, rather than the real wall-clock date.
 *
 * The bundled offline fixture (and any live data snapshot) has its dates
 * fixed at the moment it was generated, so comparing against `new Date()`
 * would mean every unpaid invoice silently becomes OVERDUE the further the
 * demo drifts from that snapshot date - and eventually *all* of them would
 * be stamped red. Anchoring "now" to the data's own latest due date keeps
 * the mix of paid/awaiting/overdue stable and meaningful no matter when the
 * app is actually run.
 */
export function getReferenceDate(invoices: Invoice[]): Date {
  let latest = 0;
  for (const invoice of invoices) {
    const t = Date.parse(invoice.dueDate);
    if (!Number.isNaN(t) && t > latest) latest = t;
  }
  return latest > 0 ? new Date(latest) : new Date();
}

/** Whether an invoice should be considered overdue as of `referenceDate`. */
export function isOverdue(invoice: Invoice, referenceDate: Date): boolean {
  if (invoice.status === "PAID" || invoice.status === "VOIDED") return false;
  const due = Date.parse(invoice.dueDate);
  if (Number.isNaN(due)) return false;
  return due < referenceDate.getTime();
}
