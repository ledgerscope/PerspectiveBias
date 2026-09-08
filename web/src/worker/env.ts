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
}
