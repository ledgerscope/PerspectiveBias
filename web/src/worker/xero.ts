import type { Invoice, InvoiceLineItem } from "../xero/types";
import type { Env } from "./env";

const AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const INVOICES_URL = "https://api.xero.com/api.xro/2.0/Invoices";

/** Scopes needed to list invoices and to get a refresh token for offline use. */
const SCOPES = [
  "openid",
  "profile",
  "email",
  "accounting.transactions.read",
  "accounting.contacts.read",
  "offline_access",
].join(" ");

const TOKENS_KEY = "xero:tokens";
const STATE_KEY_PREFIX = "xero:oauth-state:";
const STATE_TTL_SECONDS = 600;

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
  tenantId: string;
  tenantName?: string;
}

interface XeroTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface XeroConnection {
  tenantId: string;
  tenantName?: string;
  tenantType?: string;
}

function basicAuthHeader(env: Env): string {
  return `Basic ${btoa(`${env.XERO_CLIENT_ID}:${env.XERO_CLIENT_SECRET}`)}`;
}

function redirectUri(env: Env, requestUrl: string): string {
  return env.XERO_REDIRECT_URI || `${new URL(requestUrl).origin}/api/xero/callback`;
}

/** Kicks off the OAuth2 Authorization Code flow by redirecting to Xero. */
export async function handleConnect(request: Request, env: Env): Promise<Response> {
  if (!env.XERO_CLIENT_ID) {
    return new Response("XERO_CLIENT_ID is not configured on this Worker.", { status: 500 });
  }

  const state = crypto.randomUUID();
  await env.XERO_TOKENS.put(`${STATE_KEY_PREFIX}${state}`, "1", {
    expirationTtl: STATE_TTL_SECONDS,
  });

  const authorizeUrl = new URL(AUTHORIZE_URL);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", env.XERO_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri(env, request.url));
  authorizeUrl.searchParams.set("scope", SCOPES);
  authorizeUrl.searchParams.set("state", state);

  return Response.redirect(authorizeUrl.toString(), 302);
}

/** Handles the redirect back from Xero, exchanging the code for tokens. */
export async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    return new Response(`Xero authorization failed: ${error}`, { status: 400 });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return new Response("Missing 'code' or 'state' query parameter.", { status: 400 });
  }

  const stateKey = `${STATE_KEY_PREFIX}${state}`;
  const stateValid = await env.XERO_TOKENS.get(stateKey);
  if (!stateValid) {
    return new Response("Invalid or expired OAuth state - please try connecting again.", {
      status: 400,
    });
  }
  await env.XERO_TOKENS.delete(stateKey);

  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(env),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(env, request.url),
    }),
  });

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text();
    return new Response(`Xero token exchange failed (${tokenResponse.status}): ${body}`, {
      status: 502,
    });
  }

  const tokens = (await tokenResponse.json()) as XeroTokenResponse;

  const connectionsResponse = await fetch(CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!connectionsResponse.ok) {
    const body = await connectionsResponse.text();
    return new Response(`Fetching Xero connections failed (${connectionsResponse.status}): ${body}`, {
      status: 502,
    });
  }
  const connections = (await connectionsResponse.json()) as XeroConnection[];
  const tenant = connections[0];
  if (!tenant) {
    return new Response("No Xero organisation is connected to this app.", { status: 502 });
  }

  const stored: StoredTokens = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    tenantId: tenant.tenantId,
    tenantName: tenant.tenantName,
  };
  await env.XERO_TOKENS.put(TOKENS_KEY, JSON.stringify(stored));

  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Xero connected</title></head>` +
      `<body style="font-family: sans-serif; padding: 2rem;">` +
      `<h1>Connected to Xero${tenant.tenantName ? `: ${escapeHtml(tenant.tenantName)}` : ""}</h1>` +
      `<p>You can close this tab and go back to the app.</p>` +
      `<p><a href="/">Return to the app</a></p>` +
      `</body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/** Reports whether an OAuth connection has been established (no secrets returned). */
export async function handleStatus(env: Env): Promise<Response> {
  const raw = await env.XERO_TOKENS.get(TOKENS_KEY);
  if (!raw) {
    return Response.json({ connected: false });
  }
  const stored = JSON.parse(raw) as StoredTokens;
  return Response.json({
    connected: true,
    tenantName: stored.tenantName ?? null,
    accessTokenExpiresAt: new Date(stored.expiresAt).toISOString(),
  });
}

/** Returns a valid (refreshed if necessary) access token + tenant id, or null if never connected. */
async function getValidTokens(env: Env): Promise<StoredTokens | null> {
  const raw = await env.XERO_TOKENS.get(TOKENS_KEY);
  if (!raw) return null;
  const stored = JSON.parse(raw) as StoredTokens;

  // Refresh a little ahead of actual expiry to avoid races.
  if (Date.now() < stored.expiresAt - 60_000) {
    return stored;
  }

  const refreshResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(env),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: stored.refreshToken,
    }),
  });

  if (!refreshResponse.ok) {
    // Refresh token is dead (revoked/expired) - the connection needs to be redone.
    await env.XERO_TOKENS.delete(TOKENS_KEY);
    return null;
  }

  const tokens = (await refreshResponse.json()) as XeroTokenResponse;
  const updated: StoredTokens = {
    ...stored,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
  await env.XERO_TOKENS.put(TOKENS_KEY, JSON.stringify(updated));
  return updated;
}

interface XeroLineItem {
  Description?: string;
  Quantity?: number;
  UnitAmount?: number;
}

interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber?: string;
  Contact?: { Name?: string };
  Date?: string;
  DateString?: string;
  DueDate?: string;
  DueDateString?: string;
  Status: string;
  CurrencyCode: string;
  SubTotal: number;
  TotalTax: number;
  Total: number;
  LineItems?: XeroLineItem[];
}

const KNOWN_STATUSES: ReadonlySet<Invoice["status"]> = new Set([
  "DRAFT",
  "SUBMITTED",
  "AUTHORISED",
  "PAID",
  "VOIDED",
]);

/** Xero returns dates as `/Date(1700000000000+0000)/` unless a *String field is present. */
function toIsoDate(dateString: string | undefined, netDate: string | undefined): string {
  if (dateString) return dateString;
  const match = netDate?.match(/\/Date\((\d+)/);
  if (match) return new Date(Number(match[1])).toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function toInvoice(raw: XeroInvoice): Invoice {
  const lineItems: InvoiceLineItem[] = (raw.LineItems ?? []).map((li) => ({
    description: li.Description ?? "",
    quantity: li.Quantity ?? 0,
    unitAmount: li.UnitAmount ?? 0,
  }));

  const status = KNOWN_STATUSES.has(raw.Status as Invoice["status"])
    ? (raw.Status as Invoice["status"])
    : "AUTHORISED";

  return {
    id: raw.InvoiceID,
    invoiceNumber: raw.InvoiceNumber ?? "",
    contactName: raw.Contact?.Name ?? "",
    date: toIsoDate(raw.DateString, raw.Date),
    dueDate: toIsoDate(raw.DueDateString, raw.DueDate),
    status,
    currencyCode: raw.CurrencyCode,
    subTotal: raw.SubTotal,
    totalTax: raw.TotalTax,
    total: raw.Total,
    lineItems,
  };
}

/** Fetches the most recent invoices from the connected Xero org. */
export async function handleInvoices(env: Env): Promise<Response> {
  const tokens = await getValidTokens(env);
  if (!tokens) {
    return new Response(
      "Not connected to Xero yet. Visit /api/xero/connect to authorize this app.",
      { status: 401 },
    );
  }

  const invoicesUrl = new URL(INVOICES_URL);
  invoicesUrl.searchParams.set("order", "Date DESC");
  invoicesUrl.searchParams.set("page", "1");

  const response = await fetch(invoicesUrl, {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      "Xero-tenant-id": tokens.tenantId,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    return new Response(`Xero API responded with ${response.status}: ${body}`, {
      status: 502,
    });
  }

  const data = (await response.json()) as { Invoices?: XeroInvoice[] };
  const invoices = (data.Invoices ?? []).slice(0, 50).map(toInvoice);

  return Response.json(invoices);
}
