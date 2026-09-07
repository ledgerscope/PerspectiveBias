import type { Invoice, InvoiceFetchResult } from "./types";

/**
 * Fetches invoices from the live Xero API.
 *
 * This expects a small backend/proxy at `/api/xero/invoices` that holds the
 * OAuth2 token and forwards the request to Xero (the Xero API cannot be
 * called directly from the browser due to CORS + secret handling). For the
 * internal demo, if that endpoint isn't available, the caller falls back to
 * the offline fixture automatically.
 */
async function fetchLiveInvoices(signal: AbortSignal): Promise<Invoice[]> {
  const response = await fetch("/api/xero/invoices", { signal });
  if (!response.ok) {
    throw new Error(`Xero API responded with ${response.status}`);
  }
  const data = (await response.json()) as Invoice[];
  return data;
}

async function fetchOfflineInvoices(): Promise<Invoice[]> {
  const response = await fetch("/offline-invoices.json");
  if (!response.ok) {
    throw new Error("Offline invoice fixture is missing");
  }
  return (await response.json()) as Invoice[];
}

/**
 * Fetches invoices, preferring the live Xero connection but transparently
 * falling back to the bundled offline fixture when the network/API call
 * fails or times out (unreliable office wifi).
 */
export async function fetchInvoices(
  { timeoutMs = 4000 }: { timeoutMs?: number } = {},
): Promise<InvoiceFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const invoices = await fetchLiveInvoices(controller.signal);
    clearTimeout(timeout);
    return { invoices, mode: "live" };
  } catch (err) {
    clearTimeout(timeout);
    try {
      const invoices = await fetchOfflineInvoices();
      return {
        invoices,
        mode: "offline",
        error: err instanceof Error ? err.message : String(err),
      };
    } catch (offlineErr) {
      // Both sources failed - surface an empty result with the error.
      return {
        invoices: [],
        mode: "offline",
        error:
          offlineErr instanceof Error ? offlineErr.message : String(offlineErr),
      };
    }
  }
}
