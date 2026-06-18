# Basic Minecraft Clone

**Made by Muhammad Ausaf Jamal**

🔗 Live demo: <https://three-js-journey-basic-minecraft-clone.vercel.app/>

A voxel sandbox built with [Three.js](https://threejs.org/) and the
[Rapier](https://rapier.rs/) physics engine. Spawn into an **endless**,
procedurally generated world of grass, dirt, stone, sand and water — dotted with
trees — then explore it in **first person** to build or dig your way through it.
The terrain streams in as **chunks** around you, so it keeps going in every
direction. A full day/night cycle drifts overhead with an orbiting sun and moon.

---

## Controls

| Input | Action |
|-------|--------|
| **Click "Play"** | Lock the mouse and enter the world |
| **W A S D** | Move (camera-relative) |
| **Mouse** | Look around (first-person) |
| **Space** | Jump |
| **Shift** | Run |
| **F** | Toggle fly/creative mode (**Space** up, **Ctrl** down) |
| **Left-click** | Break the targeted block |
| **Right-click** | Place the selected block |
| **1 – 9** / **scroll wheel** | Choose which block to place |
| **Esc** | Pause (release the mouse) |

> Breaking a **TNT** block ignites it — it blows a crater in the terrain and
> sends physics-driven debris flying.

---

## Objectives covered

| Objective | How it's done |
|-----------|---------------|
| Basic terrain with textures | Procedural height-mapped voxel world, streamed in chunks so it extends endlessly; every block face uses a hand-drawn 16×16 pixel-art canvas texture (no external assets). |
| Character + controls | A Rapier **kinematic capsule** driven by a `KinematicCharacterController` (gravity, jumping, auto-step, ground snapping), viewed through a **first-person** camera placed at eye level and steered by mouse-look. |
| Core blocks | Grass, dirt, stone and sand, each with correct top/side/bottom faces. |
| Place / destroy + sounds | Crosshair `Raycaster` targets blocks; placing and breaking are wired to procedurally-synthesised WebAudio sounds (plus an explosion for TNT). |
| Switch blocks via keys | Pick the block to place with the number keys 1–9 or the scroll wheel. |
| Physics with **Rapier** | The player capsule, static block colliders and exploding TNT debris all run in a single Rapier world. |
| Day / night cycle | An orbiting sun and moon (directional lights + sky billboards), a star field, and animated sky / fog / ambient colours over a configurable day length. |

### Bonus objectives

- **Infinite streaming world** — terrain is generated in 16×16 **chunks** around
  the player; as you walk, new chunks stream in (one per frame, nearest first)
  and distant ones unload, so the world extends forever in every direction with
  a bounded memory/collider footprint. Fog is tuned to the load radius so chunks
  fade in instead of popping at a hard edge.
- **Procedural terrain + trees** — fractal value-noise heightmap with beaches, a
  water table, and scattered procedurally-placed trees (logs + leaf canopies).
  Chunks are generated independently (a tree's canopy is written by whichever
  chunk owns each leaf), so loading order never matters.
- **Advanced blocks** — translucent **glass**, a non-solid **water** block you
  can wade through, and **TNT** that explodes into Rapier dynamic-body debris.
- **Performance** — one **`InstancedMesh` per block type** (the whole world in a
  handful of draw calls), **exposed-block culling** (fully-buried voxels are
  never meshed *or* given a collider), per-frame chunk streaming to avoid hitches,
  shared geometry/materials, and a tightly scoped shadow camera. Drop `RENDER_DIST`
  in `app.js` for more FPS, raise it for a longer view.

---

## How it works (short version)

> Want the **long** version — every system explained, design decisions, and a big
> Q&A of likely questions? See **[EXPLAINER.md](./EXPLAINER.md)**.

- **`index.html`** — the `<canvas>`, the HUD (crosshair, clock, FPS/block
  counter) and the start/pause overlay.
- **`src/app.js`** — everything else:
  - `await RAPIER.init()` boots the WebAssembly physics engine.
  - **Textures** are painted onto 16×16 canvases at startup and sampled with
    `NearestFilter` for crisp pixels.
  - The **world** is a `Map` of `"x,y,z" → { type, instanceIndex, collider }`.
    `loadChunk()` fills a 16×16 chunk's columns from a noise heightmap;
    `refreshBlock()` reconciles each voxel's instanced-mesh slot and Rapier
    collider with whether it is exposed.
  - **`updateChunks()` / `processLoadQueue()`** run each frame: as the player
    crosses chunk borders, missing chunks in the render radius are queued
    (nearest first) and built one per frame, while chunks beyond the radius are
    dropped by `unloadChunk()` — that's what makes the world effectively infinite.
  - **`setBlock` / `removeBlock`** edit the map and refresh the six neighbours,
    so digging reveals the stone underneath and sealing a block frees its mesh
    slot + collider.
  - The **player** is a kinematic capsule; `updatePlayer()` builds a
    camera-relative move vector, applies gravity/jump (or free-fly), resolves it
    through the character controller, then parks the **first-person** camera at
    the capsule's eye level, aimed along the mouse-look yaw/pitch.
  - **TNT** clears a spherical region and spawns short-lived dynamic cube debris
    with an outward blast impulse and a light flash.
  - **`updateSky()`** advances the time-of-day, orbits the sun/moon, toggles
    shadow casting, and lerps the sky, fog and light colours.
  - A **lil-gui** panel exposes the day/night settings, player tuning and a
    *New world* (re-seed) button.

---

## Tech used

- **[Three.js](https://threejs.org/)** — rendering
- **[Rapier](https://rapier.rs/)** (`@dimforge/rapier3d-compat`) — physics
- **[lil-gui](https://lil-gui.georgealways.com/)** — live control panel
- **[Vite](https://vitejs.dev/)** — dev server and build

All block textures and sound effects are generated in code at runtime — there
are no external image or audio assets to download.

---

## Run it locally

```bash
npm install      # install dependencies
npm run dev      # start the dev server
npm run build    # build for production
npm run preview  # preview the production build
```

Then open the URL Vite prints, click **Play**, and start building.
