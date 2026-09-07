import { useEffect, useState } from "react";
import { fetchInvoices } from "../xero/invoiceSource";
import type { DataMode, Invoice } from "../xero/types";

export interface UseInvoicesResult {
  invoices: Invoice[];
  mode: DataMode | "loading";
  error?: string;
}

/**
 * Loads invoices once on mount: tries the live Xero API first, transparently
 * falling back to the bundled offline fixture if the network/API call fails
 * or times out (handles the "wifi is unreliable" case from the office).
 */
export function useInvoices(): UseInvoicesResult {
  const [result, setResult] = useState<UseInvoicesResult>({ invoices: [], mode: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchInvoices().then((res) => {
      if (!cancelled) {
        setResult({ invoices: res.invoices, mode: res.mode, error: res.error });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return result;
}
