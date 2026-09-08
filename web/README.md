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

The client never talks to Xero directly (CORS + OAuth secret handling), so a
live deployment needs a small backend/proxy exposing
`GET /api/xero/invoices` that holds the Xero OAuth2 token and returns an
array of `Invoice` objects (see `src/xero/types.ts`). That backend is not
included in this prototype; without it the app runs entirely on the bundled
offline fixture, which is by design (this is also the "wifi dropped"
fallback path).

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

## Project structure

```
src/
  scene/        3D scene: cubicle wall, desk, physics-backed paper, layout/texture helpers
  xero/         Invoice types + live/offline data source abstraction
  components/   UI overlay (live/offline status, controls hint)
public/
  offline-invoices.json   bundled fixture invoices used offline/for the demo
```

## Known limitations (prototype)

- Cubicle wall photos are procedurally generated placeholders, not real
  images - drop files into `public/wall-images` and update `CubicleWall.tsx`
  to use real photos.
- No Xero OAuth backend is included; live mode requires standing one up
  separately.
- Paper orientation while "held to face" is a simple look-at rotation and
  may need visual tuning per camera angle.
