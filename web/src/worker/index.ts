import type { Env } from "./env";
import { handleCallback, handleConnect, handleInvoices, handleStatus } from "./xero";

export default {
  async fetch(request, env, _ctx): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case "/api/xero/connect":
        return handleConnect(request, env);
      case "/api/xero/callback":
        return handleCallback(request, env);
      case "/api/xero/status":
        return handleStatus(env);
      case "/api/xero/invoices":
        return handleInvoices(env);
      default:
        return env.ASSETS.fetch(request);
    }
  },
} satisfies ExportedHandler<Env>;
