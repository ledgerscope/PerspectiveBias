# Xero Invoice Desk Visualizer - Project Plan

## Concept

A fun, web-based 3D visualization tool for accounting data. The user is
dropped into a virtual office cubicle: a photo-covered cubicle wall behind a
desk, with a table covered in A4 "invoice" papers pulled from Xero. Invoices
are physical, interactive objects the user can paw through by hand.

## Interaction Model

| Input                | Behavior                                                                 |
|-----------------------|---------------------------------------------------------------------------|
| Mouse drag on a paper  | Pick up and drag the paper across the table (physics-based, other papers/stacks react to collisions) |
| Mouse drag on a stack  | Knocks the stack over, papers scatter across the table                   |
| Left click on a paper  | Paper animates up to "hold to face" position directly in front of the camera, rendered large/legible with full invoice detail |
| Left click elsewhere (paper held) | Releases the held paper back to the table |
| Space bar              | Resets all papers/stacks back to their original table layout (animated tween, not a hard cut) |

## Visual / Rendering

- **Engine**: WebGL via [react-three-fiber](https://docs.pmnd.rs/react-three-fiber) (React + Three.js), with `@react-three/rapier` (or `cannon-es`) for lightweight physics (paper sliding, stack toppling, collisions).
- **Cubicle wall**: a textured plane behind the desk with a grid of random images (placeholder photos/posters), procedurally arranged at scene load.
- **Papers**: thin flat planes (A4 aspect ratio, 210:297) with a rendered invoice texture (canvas-drawn from Xero invoice data: invoice number, contact, amount, due date, line items). Slight random rotation/z-offset per paper for a "messy desk" look.
- **Stacks**: groups of papers with small vertical offsets that behave as a single rigid body until "knocked," at which point they separate into individually simulated papers.
- **Fallback**: if WebGL is unavailable, degrade to a static 2D canvas renderer showing the same scattered layout without physics (drag still works, no toppling).

## Data Layer

- **Live mode**: OAuth2 Authorization Code flow against the Xero API to fetch a
  small working set of recent invoices (e.g. last 50) for the connected org.
- **Offline mode**: a bundled `offline-invoices.json` fixture (representative
  fake invoice data) checked into the repo. Used automatically when:
  - the Xero API call fails or times out (unreliable wifi case), or
  - no OAuth token is available (first run / demo mode without credentials).
- A small **status indicator** in the corner of the UI always shows "Live"
  (green) or "Offline / cached" (amber) so the team knows which dataset is
  showing.
- Data layer is an abstraction (`InvoiceSource` interface) so the rendering
  code never cares whether the data came from Xero or the fixture file.

## Tech Stack

- **Build**: Vite + React + TypeScript
- **3D**: three.js via `@react-three/fiber`, `@react-three/drei` for helpers, `@react-three/rapier` for physics
- **State**: React state/hooks; no heavy state library needed at this scale
- **Data**: `fetch` against Xero API + local JSON fixture fallback
- **Testing**: Vitest for data-layer/unit tests; manual/visual QA for the 3D scene

## Project Structure (proposed)

```
web/
  src/
    scene/         # Three.js/R3F components (Cubicle, Desk, Paper, Stack, Camera rig)
    xero/           # InvoiceSource abstraction, XeroClient, offline fixture loader
    components/     # UI overlay (status indicator, instructions)
    App.tsx
  public/
    offline-invoices.json
    wall-images/    # placeholder images for the cubicle wall
  package.json
  vite.config.ts
```

## Milestones

1. **Plan doc** (this document) - done
2. **Scaffold**: Vite + React + TS app boots, empty R3F canvas renders
3. **Desk scene prototype**: cubicle wall + table + scattered draggable/knockable papers, hold-to-face click, spacebar reset - using offline fixture data only
4. **Xero data layer**: live OAuth2 fetch with automatic fallback to offline fixture + live/offline indicator - done (Cloudflare Worker backend in `web/src/worker/`, see `web/README.md`)
5. **Polish pass**: lighting, wall image variety, paper texture fidelity, performance check with ~50 papers
6. **Internal demo**: share build/PR with the team

## Open Items / Future Ideas

- Persisting paper positions between sessions (not required for demo)
- Sound effects (paper rustle on drag/knock) - nice-to-have, not in scope v1
- Multi-tenant Xero org switching - out of scope for internal demo
