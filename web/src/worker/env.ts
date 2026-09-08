/** Bindings/vars available to the Worker (see wrangler.jsonc). */
export interface Env {
  /** Static assets binding (the built `dist/` produced by `vite build`). */
  ASSETS: Fetcher;
  /** KV namespace used to persist the Xero OAuth2 tokens + tenant id. */
  XERO_TOKENS: KVNamespace;
  /** Xero app client id (set via `wrangler secret put XERO_CLIENT_ID`). */
  XERO_CLIENT_ID: string;
  /** Xero app client secret (set via `wrangler secret put XERO_CLIENT_SECRET`). */
  XERO_CLIENT_SECRET: string;
  /**
   * OAuth2 redirect URI registered on the Xero app. Must exactly match what's
   * configured in the Xero developer portal. Falls back to
   * `${request origin}/api/xero/callback` if unset.
   */
  XERO_REDIRECT_URI?: string;
  /**
   * Dev/debug escape hatch: when set to "true", `/api/xero/connect` never
   * redirects to Xero and `/api/xero/invoices` always reports "not
   * connected" without touching KV or requiring client id/secret to be
   * configured at all. This lets local dev (and Copilot's own debugging)
   * run entirely against the bundled offline fixture - the frontend already
   * falls back to it automatically whenever this endpoint isn't available.
   * Leave unset (or "false") in production so live mode works normally.
   */
  XERO_DISABLE_LIVE?: string;
}
