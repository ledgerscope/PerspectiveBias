import { useEffect, useState } from "react";

export interface XeroStatus {
  connected: boolean;
  /** True when the Worker has Xero live mode disabled (XERO_DISABLE_LIVE). */
  liveDisabled?: boolean;
  tenantName?: string | null;
}

/**
 * Fetches `/api/xero/status` once on mount so in-scene UI (the rotary phone
 * prop) can reflect whether a Xero org is already connected. Fails soft to
 * "not connected" if the endpoint isn't reachable at all (e.g. plain
 * `vite dev` without the Worker running) - same fail-soft spirit as invoice
 * fetching.
 */
export function useXeroStatus(): XeroStatus {
  const [status, setStatus] = useState<XeroStatus>({ connected: false });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/xero/status")
      .then((res) => (res.ok ? (res.json() as Promise<XeroStatus>) : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        // Status endpoint unavailable - stay in the default "not connected" state.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
