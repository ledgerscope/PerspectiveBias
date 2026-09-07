import type { DataMode } from "../xero/types";

interface StatusOverlayProps {
  mode: DataMode | "loading";
  error?: string;
  invoiceCount: number;
}

const MODE_LABEL: Record<DataMode | "loading", string> = {
  loading: "Loading...",
  live: "Live (Xero)",
  offline: "Offline (cached)",
};

const MODE_COLOR: Record<DataMode | "loading", string> = {
  loading: "#888888",
  live: "#2ecc71",
  offline: "#f39c12",
};

/**
 * Overlay UI: shows whether we're showing live Xero data or the offline
 * fallback, and reminds the user of the desk interactions.
 */
export function StatusOverlay({ mode, error, invoiceCount }: StatusOverlayProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 10,
        fontFamily: "system-ui, sans-serif",
        color: "#eeeeee",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(0,0,0,0.55)",
          borderRadius: 8,
          padding: "6px 12px",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: MODE_COLOR[mode],
            display: "inline-block",
          }}
        />
        <span>
          {MODE_LABEL[mode]} - {invoiceCount} invoice{invoiceCount === 1 ? "" : "s"}
        </span>
      </div>
      {error && mode === "offline" && (
        <div
          style={{
            background: "rgba(0,0,0,0.55)",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 12,
            maxWidth: 320,
          }}
        >
          Live data unavailable ({error}), showing cached invoices.
        </div>
      )}
      <div
        style={{
          marginTop: 8,
          background: "rgba(0,0,0,0.55)",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          maxWidth: 320,
          lineHeight: 1.5,
        }}
      >
        Drag papers around the desk &middot; drag through a stack to knock it
        over &middot; click a paper to hold it up &middot; click again to put
        it down &middot; press <strong>space</strong> to reset the desk
      </div>
    </div>
  );
}
