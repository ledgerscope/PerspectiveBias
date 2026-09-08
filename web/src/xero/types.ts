export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitAmount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  contactName: string;
  date: string; // ISO date
  dueDate: string; // ISO date
  status: "DRAFT" | "SUBMITTED" | "AUTHORISED" | "PAID" | "VOIDED";
  currencyCode: string;
  subTotal: number;
  totalTax: number;
  total: number;
  lineItems: InvoiceLineItem[];
}

export type DataMode = "live" | "offline";

export interface InvoiceFetchResult {
  invoices: Invoice[];
  mode: DataMode;
  error?: string;
}

/**
 * A real-world-style cheque sitting on the desk, representing an incoming
 * payment for one (unpaid) invoice. Split payments give an invoice two
 * cheques instead of one.
 */
export interface Cheque {
  id: string;
  invoiceId: string;
  chequeNumber: string;
  amount: number;
  currencyCode: string;
  payerName: string; // the invoice's contact - whoever wrote the cheque
  bankName: string;
  date: string; // ISO date
  memo: string;
}
