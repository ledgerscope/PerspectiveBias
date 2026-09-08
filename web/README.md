# Invoice Desk Visualizer

A fun, 3D web-based visualization of accounting data: a virtual office
cubicle where invoices pulled from Xero are scattered across a desk as
physical A4 paper you can drag, stack, knock over, and pick up to read.

See [`PROJECT_PLAN.md`](../PROJECT_PLAN.md) at the repo root for the full
concept, architecture, and milestones.

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL. The app will try to fetch live invoices
from `/api/xero/invoices` (a backend/proxy you provide - see below) and will
automatically fall back to the bundled `public/offline-invoices.json` fixture
if that call fails or times out, which is expected out of the box since no
Xero backend proxy is included yet.

## Controls

- **Drag** a paper: click and hold, then move the mouse to slide it across
  the desk.
- **Drag through a stack**: knocks the stack over as the dragged paper
  collides with it.
- **Left click** a paper (without dragging): lifts it up in front of the
  camera so you can read it; click again to put it back down.
- **Space bar**: resets every paper back to its original position on the
  desk.

## Xero live data

The client never talks to Xero directly (CORS + OAuth secret handling), so
requests go through a small backend/proxy built into the Cloudflare Worker
(`src/worker/`) that holds the Xero OAuth2 token and exposes:

- `GET /api/xero/connect` - starts the OAuth2 Authorization Code flow by
  redirecting to Xero's login/consent screen.
- `GET /api/xero/callback` - the registered OAuth2 redirect URI; exchanges
  the code for tokens, looks up the connected tenant, and stores both in a
  Workers KV namespace.
- `GET /api/xero/status` - reports whether a Xero org is currently connected
  (no secrets returned), useful for debugging.
- `GET /api/xero/invoices` - used by the frontend; refreshes the access
  token if needed and returns the most recent invoices as an array of
  `Invoice` objects (see `src/xero/types.ts`).

If nothing is connected yet (or the Xero call fails/times out), `/api/xero/invoices`
returns a non-2xx response and the app automatically falls back to the bundled
offline fixture - this is also the "wifi dropped" fallback path in production.

### Developing/debugging without touching Xero

Set `XERO_DISABLE_LIVE=true` (already the default in `.dev.vars.example`) to
skip Xero entirely: `/api/xero/connect` won't redirect anywhere and
`/api/xero/invoices` always reports "not connected", so the app runs purely on
the bundled offline fixture with no client id/secret, KV namespace, or OAuth
round-trip needed at all. This is the recommended default for local dev and
for anyone (including Copilot) debugging the app - flip it to `false`/unset it
only when you actually want to exercise a real Xero connection.

### One-time setup (real Xero connection)

1. **Create a Xero app** at the [Xero developer portal](https://developer.xero.com/app/manage)
   (an "Web app" / Auth Code Flow app), and set its redirect URI to match
   `XERO_REDIRECT_URI` below (e.g. `https://bounce.ledgerscope.com/api/xero/callback`).
2. **Create the KV namespace** used to store tokens, then paste the printed
   id into `wrangler.jsonc` under `kv_namespaces[0].id`:
   ```bash
   wrangler kv namespace create XERO_TOKENS
   ```
3. **Set the redirect URI** the Worker will use, in `wrangler.jsonc` under
   `vars.XERO_REDIRECT_URI` - it must exactly match what's registered on the
   Xero app (currently set to `https://bounce.ledgerscope.com/api/xero/callback`).
4. **Set the client id/secret as Worker secrets** (never commit these or
   paste them into chat/issues - `wrangler secret put` reads them from a
   local prompt):
   ```bash
   wrangler secret put XERO_CLIENT_ID
   wrangler secret put XERO_CLIENT_SECRET
   ```
   For local `wrangler dev` runs, copy `.dev.vars.example` to `.dev.vars`
   (gitignored), fill in the same two values, and set `XERO_DISABLE_LIVE=false`.
5. **Deploy**, then visit `/api/xero/connect` once in a browser to complete
   the OAuth consent screen and store a token. After that, `/api/xero/invoices`
   will serve live data (refreshing the token automatically) until the Xero
   refresh token is revoked.

## Cloudflare Worker deployment

This app is configured to deploy as a Cloudflare Worker (static assets) named
`perspectivebias`, using [`wrangler.jsonc`](./wrangler.jsonc):

```bash
npm run build       # produces the static site in dist/
npm run deploy      # builds, then runs `wrangler deploy`
npm run cf:dev       # builds, then runs `wrangler dev` for a local Worker preview
```

`wrangler deploy` requires Cloudflare credentials in the environment (e.g. a
`CLOUDFLARE_API_TOKEN` with Workers deploy permissions, plus `CLOUDFLARE_ACCOUNT_ID`
if the account isn't already selected), or being logged in via `wrangler login`.
The Worker serves `dist/` as static assets with `not_found_handling` set to
`single-page-application`, so unmatched routes fall back to `index.html`.

### Troubleshooting: `Missing entry-point to Worker script or to assets directory`

`wrangler.jsonc` and the build output (`dist/`) live in this `web/` directory,
not the repo root. If `wrangler deploy` runs from the repo root (or any
directory other than `web/`), it won't find this config, falls back to
guessing a project setup, and fails with this error. If you're deploying via
Cloudflare's dashboard Git integration (Workers Builds) for the
`perspectivebias` Worker, make sure **Settings > Build** has:

- **Root directory**: `web`
- **Build command**: `npm run build`
- **Deploy command**: `npx wrangler deploy`

If invoking `wrangler` manually or from a script, either `cd web` first or
pass `--config web/wrangler.jsonc`.

## Project structure

```
src/
  scene/        3D scene: cubicle wall, desk, physics-backed paper, layout/texture helpers
  xero/         Invoice types + live/offline data source abstraction
  components/   UI overlay (live/offline status, controls hint)
  worker/       Cloudflare Worker: Xero OAuth2 + /api/xero/* endpoints
public/
  offline-invoices.json   bundled fixture invoices used offline/for the demo
```

## Known limitations (prototype)

- Cubicle wall photos are procedurally generated placeholders, not real
  images - drop files into `public/wall-images` and update `CubicleWall.tsx`
  to use real photos.
- Paper orientation while "held to face" is a simple look-at rotation and
  may need visual tuning per camera angle.
- The Xero OAuth backend supports a single connected organisation at a time
  (tokens are stored under one KV key); multi-tenant org switching is out of
  scope for this demo.
