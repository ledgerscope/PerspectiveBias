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
