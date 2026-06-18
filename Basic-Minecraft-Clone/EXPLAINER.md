# Basic Minecraft Clone — Deep-Dive Explainer

A complete, plain-English walkthrough of how this project works, **why** each
decision was made, and a large **Q&A / interview-prep** section at the end that
tries to anticipate "any question that could be asked."

This is the long companion to the short [README](./README.md). If you only want
to *run* it, read the README. If you want to *understand or defend* every line,
read this.

---

## Table of contents

1. [The 10,000-foot view](#1-the-10000-foot-view)
2. [How the files fit together](#2-how-the-files-fit-together)
3. [The boot sequence (what happens on load)](#3-the-boot-sequence)
4. [Rendering core: scene, camera, renderer](#4-rendering-core)
5. [Procedural textures (no image files)](#5-procedural-textures)
6. [Block definitions & materials](#6-block-definitions--materials)
7. [The voxel world data model](#7-the-voxel-world-data-model)
8. [InstancedMesh — drawing thousands of blocks cheaply](#8-instancedmesh)
9. [Exposed-block culling (`refreshBlock`)](#9-exposed-block-culling)
10. [Infinite terrain via chunk streaming](#10-infinite-terrain-via-chunk-streaming)
11. [Procedural terrain generation (the noise)](#11-procedural-terrain-generation)
12. [The player: physics capsule & character controller](#12-the-player)
13. [First-person camera & controls](#13-first-person-camera--controls)
14. [Block targeting, placing & breaking](#14-block-targeting-placing--breaking)
15. [TNT & dynamic debris](#15-tnt--dynamic-debris)
16. [Procedural sound effects](#16-procedural-sound-effects)
17. [Day/night cycle, lights & sky](#17-daynight-cycle)
18. [The GUI panel](#18-the-gui-panel)
19. [The main loop](#19-the-main-loop)
20. [Performance: every trick used](#20-performance)
21. [Known limitations & future work](#21-known-limitations)
22. [Big Q&A — anticipated questions](#22-big-qa)
23. [Glossary](#23-glossary)

---

## 1. The 10,000-foot view

This is a **voxel sandbox** ("Minecraft-like") that runs entirely in the browser.
The whole thing is:

- **Three.js** for rendering (WebGL).
- **Rapier** (a Rust physics engine compiled to WebAssembly) for collision and
  the exploding-block physics.
- **lil-gui** for the live settings panel.
- **Vite** as the dev server / bundler.

Everything else — terrain, textures, sounds, the character physics — is written
by hand in `src/app.js`. **There are no external image or audio assets.**
Textures are painted onto tiny `<canvas>` elements and sounds are synthesised
with the Web Audio API at runtime.

The world is **effectively infinite**: terrain is generated in 16×16 *chunks*
around the player and streamed in/out as you move.

---

## 2. How the files fit together

| File | Role |
|------|------|
| `index.html` | The `<canvas>`, the HUD overlays (crosshair, clock, FPS/block counter), the start/pause overlay, and the loading screen. Just structure — no logic. |
| `src/style.css` | All styling for those HUD elements and the overlay. |
| `src/app.js` | **The entire game.** ~750 lines. Everything below happens here. |
| `package.json` | Declares the four dependencies and the `dev`/`build`/`preview` scripts. |
| `public/favicon.svg` | The browser tab icon. |

`app.js` is organised top-to-bottom into labelled sections (search for the
`/* ---- Section ---- */` comment banners). It reads almost like a story: set up
rendering → make textures → define blocks → set up the world → generate terrain
→ create the player → wire up controls → physics extras → audio → sky → GUI →
boot → main loop.

---

## 3. The boot sequence

When the page loads, `app.js` runs top to bottom. The important ordering:

1. `await RAPIER.init()` — Rapier is WASM, so it must finish initialising before
   we can create any physics objects. This is a **top-level `await`**, which is
   why the module "pauses" here until physics is ready.
2. All the `const`/`class`/`function` definitions are *declared* (renderer,
   textures, `BLOCKS`, `InstancedField`, `loadChunk`, `updatePlayer`, …).
   Defining a function doesn't run it.
3. Near the bottom, the **Build & run** section actually *executes*:
   - `generateWorld()` — seeds the noise and synchronously builds the spawn
     region (the chunks immediately around `0,0`).
   - `spawnPlayer()` — drops the player on top of the highest solid block at
     spawn.
   - `buildGUI()` — creates the lil-gui panel.
   - The loading screen fades out.
4. `animate()` starts the `requestAnimationFrame` loop.

> **Why `generateWorld()` is defined high up but called low down:** in JS, a
> `function` declaration is hoisted, but the variables it touches
> (`blockCountDirty`, etc.) are `let`s that must have executed first. The call
> site at the bottom guarantees everything exists by the time it runs.

---

## 4. Rendering core

```js
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
```

- **Camera**: 72° field of view, near plane `0.1`, far plane `1000`. The far
  plane is large because the sun/moon discs and the star field sit ~110–200
  units away even though the *terrain* fog ends much closer.
- **Renderer settings worth knowing:**
  - `shadowMap.enabled = true` with `PCFSoftShadowMap` → soft shadows.
  - `toneMapping = ACESFilmicToneMapping` → filmic, slightly punchy colour.
  - `setPixelRatio(Math.min(devicePixelRatio, 2))` → sharp on retina screens but
    capped at 2× so 3× phones don't render 9× the pixels.
- A `resize` listener keeps the canvas, aspect ratio and projection matrix in
  sync with the window.
- A single `THREE.Clock` gives us **delta time** (`dt`) each frame, so movement
  and animation are frame-rate independent.

---

## 5. Procedural textures

Every block texture is a **16×16 pixel-art canvas**, generated in code:

- `makeCanvas(paint)` creates a 16×16 `<canvas>` and hands its 2D context to a
  paint function.
- `noisyFill(ctx, base, jitter, seed)` fills the tile with a base colour plus
  per-pixel brightness "noise" using a tiny deterministic PRNG (linear
  congruential). The `seed` makes each texture reproducible but distinct.
- Specific textures add detail on top: grass has a green fringe on its side
  tiles, logs have bark lines and a ring pattern on the cap, TNT has stripes and
  the letters "TNT", glass is mostly transparent with a highlight streak.

Each canvas becomes a `THREE.CanvasTexture` via `toTexture()`, which sets:

- `colorSpace = SRGBColorSpace` (correct colour),
- `magFilter = NearestFilter` (**crisp, blocky pixels** instead of blurry),
- `minFilter = NearestMipmapNearestFilter` (mipmaps so distant blocks don't
  shimmer),
- max anisotropy (sharper at grazing angles).

### Why a 2D canvas (and not PNGs, raw pixel arrays, or a shader)?

A `<canvas>` here is just a **scratch surface to draw the textures in code**.
WebGL needs a *raster image* (a grid of pixels) to upload as a texture; the only
question is where that grid comes from. The options:

1. **Load a `.png` file**
2. **Draw it at runtime on a 2D canvas** ← what we do
3. **Hand-write raw pixel bytes** (`DataTexture` + a `Uint8Array`)
4. **Generate it with a shader**

Three.js makes option 2 a one-liner: `new THREE.CanvasTexture(canvas)` wraps a
canvas element directly as a GPU texture.

**vs. loading PNGs (1):**

- **No external assets** — the whole game is one self-contained JS bundle. No
  image files to ship, no network requests, no CORS, no asset loader, no
  "image not found" failures.
- **Procedural variety** — `noisyFill` adds seeded per-pixel brightness noise, so
  every face has natural variation we never hand-drew. Reproducible (seeded) but
  distinct per texture.
- **Tiny** — a 16×16 texture described by a few lines of code beats shipping even
  a small image file.

**vs. raw pixel arrays / `DataTexture` (3):**

- Canvas 2D gives you an actual **drawing API**, which is far easier than
  computing pixel indices by hand. The textures lean on it heavily:
  - `ctx.fillRect(x, y, 1, 1)` to set individual pixels (the `px` helper),
  - `ctx.fillText('TNT', …)` to literally **stamp the letters "TNT"** on the TNT
    block,
  - `ctx.strokeRect(…)` + `moveTo/lineTo` for the **glass pane outline and
    highlight streak**.
- Drawing the TNT lettering or glass highlight into a raw byte array would be
  painful; on a canvas it's two calls.

**vs. a shader (4):** generating 16×16 pixel art on the GPU is massive overkill
and much more code. Canvas 2D runs once at startup, so there's no runtime cost.

> **One nuance:** this is canvas 2D used for *authoring textures* — completely
> separate from the **WebGL canvas** Three.js renders the 3D scene into (the
> `<canvas>` in `index.html`). Same element type, different jobs: one is a paint
> surface baked into a GPU texture and then never shown; the other is the screen.

---

## 6. Block definitions & materials

A `BLOCKS` object maps a type name to its config:

```js
grass: { mats: grassMats, solid: true,  icon: tex.grassTop },
water: { mats: ..., solid: false, transparent: true, icon: tex.water },
tnt:   { mats: tntMats, solid: true, icon: tex.tntSide },
…
```

- **`mats`** is an array of **6 materials**, one per cube face, in Three.js's
  BoxGeometry order: `+X, -X, +Y(top), -Y(bottom), +Z, -Z`. That's how grass
  gets a grassy top, dirt bottom, and grassy-edged sides; logs get end-grain
  caps; TNT gets a printed top.
- **`solid`** decides whether the block gets a physics collider (water is *not*
  solid — you wade through it).
- **`transparent`** affects culling and shadows (glass/leaves/water don't fully
  hide their neighbours and don't cast solid shadows).
- **`icon`** was the hotbar thumbnail; the on-screen hotbar was later removed, so
  this field is currently unused but harmless.

`TYPES` is the list of all block keys. `HOTBAR` is the ordered list of
placeable blocks selected with keys `1–9` / scroll wheel.

---

## 7. The voxel world data model

```js
const world = new Map();           // "x,y,z" → { type, index, collider }
const key   = (x,y,z) => `${x},${y},${z}`;
```

- The world is **a flat hash map keyed by a string coordinate**, *not* a 3D
  array. This is the single most important design choice.
- Each value is a small record:
  - `type` — which block ("grass", "stone", …),
  - `index` — its slot in the InstancedMesh, or **`-1` if currently not drawn**
    (because it's buried),
  - `collider` — its Rapier collider, or `null` if it doesn't have one.

> **Why a Map and not a 3D array?** An array would need fixed bounds and would
> waste memory on all the empty air. A Map only stores blocks that actually
> exist, supports negative coordinates for free, and makes an infinite world
> trivial — you just keep adding keys.

---

## 8. InstancedMesh

Drawing 50,000 separate cube meshes would be tens of thousands of draw calls and
would kill performance. Instead we use **one `THREE.InstancedMesh` per block
type**:

```js
class InstancedField {
  constructor(type) {
    this.mesh = new THREE.InstancedMesh(boxGeo, BLOCKS[type].mats, CAPACITY);
    this.mesh.count = 0;
    this.keys = [];   // instance slot → world key
  }
  add(k, x, y, z)  { … sets the matrix of slot i, returns i … }
  remove(i)        { … swaps the last instance into slot i (swap-remove) … }
}
```

- An InstancedMesh draws **N copies of the same geometry in one draw call**, each
  with its own transform matrix. So *all* the grass in view is a single draw
  call, all the stone is another, etc. → roughly **9 draw calls for the entire
  visible world.**
- `CAPACITY` (30,000) is the maximum instances per type — pre-allocated. If a
  type ever exceeds it, `add()` returns `-1` and logs a one-time warning.
- **`remove(i)` uses the swap-remove trick:** to delete slot `i` without leaving
  a hole, copy the *last* instance into slot `i`, then shrink `count` by one.
  Because that moves another block's slot, we update *its* record's `index` to
  point at `i`. O(1) removal, no array shifting.
- `frustumCulled = false` because we manage visibility ourselves (an instance's
  bounding volume would be the whole mesh anyway).

---

## 9. Exposed-block culling

This is the heart of the performance story. **A block that is completely
surrounded by opaque blocks can never be seen, so we don't draw it *or* give it
a collider.**

```js
function isCovered(x,y,z) {            // true if all 6 neighbours are opaque
  for (const [dx,dy,dz] of NEIGHBORS)
    if (!opaqueAt(x+dx,y+dy,z+dz)) return false;
  return true;
}

function refreshBlock(k) {
  const covered = isCovered(...);
  // add/remove the instanced-mesh slot to match `covered`
  // add/remove the Rapier collider to match `covered && solid`
}
```

`refreshBlock` is the **single source of truth** that reconciles a block's
*visual slot* and *collider* with whether it's currently exposed. It's called:

- after generating a chunk (for every new block + its neighbours),
- when a block is placed or removed (for that block + its 6 neighbours),
- when a chunk unloads (for the neighbours of removed blocks).

> **Result:** a solid hill might contain thousands of stone blocks, but only the
> thin *surface shell* is ever meshed or collidable. Dig one block out and its
> previously-buried neighbour instantly appears (its `refreshBlock` runs and
> finds it's now exposed).

`NEIGHBORS` is the list of the 6 axis-aligned offsets. `opaqueAt` treats water
and transparent blocks (glass/leaves) as *not* opaque, so you can see through
them and the block behind glass still renders.

---

## 10. Infinite terrain via chunk streaming

The world is divided into **16×16 columns called chunks** (`CHUNK = 16`). Only
chunks within `RENDER_DIST` (3) chunks of the player exist at any time.

**Key data:**

```js
const loadedChunks = new Map();   // "cx,cz" → [block keys]  (so we can unload)
const loadQueue    = [];          // chunks waiting to be built, nearest first
const chunkOf = v => Math.floor(v / CHUNK);
```

**The four functions:**

- **`loadChunk(cx,cz)`** — builds every block in that chunk (terrain + water +
  trees), records the keys, then `refreshBlock`s them and their neighbours so
  faces shared with already-loaded chunks cull correctly.
- **`unloadChunk(cx,cz)`** — removes that chunk's blocks (mesh slots + colliders),
  then refreshes the surrounding blocks so neighbouring chunks re-expose the
  faces that were hidden against this chunk.
- **`updateChunks()`** — runs every frame but **early-returns unless the player
  crossed into a new chunk** (cheap). On a crossing it queues any missing chunks
  in the render ring (sorted nearest-first) and unloads chunks beyond
  `RENDER_DIST + 1`. That `+1` is **hysteresis**: a one-chunk dead zone so
  standing on a border doesn't load/unload the same chunk every step.
- **`processLoadQueue(1)`** — builds **one queued chunk per frame**. Creating
  Rapier colliders is the expensive part, so spreading it over frames keeps the
  frame rate smooth instead of stuttering when you cross a border.

**Why you never fall through the floor:** with a radius of 3 chunks, you always
have at least ~2 fully-built chunks (32 blocks) of terrain ahead of you. Walking
a single chunk takes ~1 second, but the queue drains far faster than that, so
the ground is always ready before you arrive.

**Why chunks are independent (the tree trick):** a tree near a chunk edge has
leaves that spill into the *next* chunk. If chunk A wrote blocks into chunk B,
unloading B would orphan them. Instead, **each chunk scans a 2-block margin for
tree trunks but only writes the leaf/log cells that fall inside its own
bounds.** Both chunks compute the same tree deterministically from the noise, so
together they form the whole tree and neither writes outside itself. Loading
order never matters and chunks are fully reversible.

**Fog hides the edge:** `scene.fog` is set to end at `RENDER_DIST * CHUNK * 0.95`,
just *inside* the guaranteed-loaded radius, so new chunks fade in through fog
rather than popping into existence at a visible boundary.

---

## 11. Procedural terrain generation

`makeNoise(seed)` returns a **value-noise** function `(x,z) → 0..1`:

- `hash(x,z)` is an integer hash that turns grid coordinates into a pseudo-random
  value (deterministic per seed).
- `base(x,z)` does **bilinear interpolation** between the four surrounding grid
  hashes, with a `smooth()` curve so it isn't blocky.
- The returned function sums **4 octaves** (fractal / fBm): each octave doubles
  the frequency and halves the amplitude, adding finer detail on top of broad
  hills.

In `loadChunk`, for each column:

- `height = floor(noise(x*SCALE, z*SCALE) * AMP)` (SCALE = 0.07 zoom, AMP = 9
  max height).
- Top block is **grass** (or **sand** on beaches near water level), the next
  couple are **dirt** (or sand), everything below is **stone**.
- Columns at/below `WATER_LEVEL` get **water** filled above the terrain.
- A second noise (`noise2`) decides tree placement (`> 0.82`) and trunk height.

Because the noise is a **pure function of world coordinates**, the terrain at any
`(x,z)` is identical no matter when or in what order its chunk loads. That's
exactly what makes infinite streaming possible and seamless.

---

## 12. The player

```js
const playerBody     = physics.createRigidBody(RigidBodyDesc.kinematicPositionBased());
const playerCollider = physics.createCollider(ColliderDesc.capsule(CAP_HALF, CAP_RADIUS), playerBody);
const charCtrl       = physics.createCharacterController(0.02);
```

- The player is a **kinematic capsule** (not a dynamic body). *Kinematic* means
  **we** move it explicitly each frame; physics doesn't push it around. That
  gives precise, game-y controls (no sliding, no tipping over).
- Rapier's **`KinematicCharacterController`** does the hard collision work:
  - `enableAutostep(0.6, 0.25, true)` — automatically step up small ledges
    (≤ 0.6 high) without jumping.
  - `enableSnapToGround(0.5)` — stick to the ground over small bumps/slopes so
    you don't bounce or float going downhill.
  - `setApplyImpulsesToDynamicBodies(true)` — you can shove the TNT debris.
  - `setSlideEnabled(true)` — slide along walls instead of stopping dead.
- `highestAt(x,z)` scans down from y=40 to find the highest solid block, used to
  spawn you on the surface.

Each frame, `updatePlayer(dt)`:

1. Builds a **camera-relative move vector** from WASD (forward/right derived from
   `yaw`).
2. Applies speed (walk/run, ×1.6 in fly mode).
3. **Gravity & jump** (walk mode): `vY += gravity*dt`; jumping sets `vY = jump`
   only when grounded. **Fly mode**: Space/Ctrl move you straight up/down, no
   gravity.
4. Calls `charCtrl.computeColliderMovement(...)` — Rapier figures out how far the
   capsule can actually move given collisions, autostep and ground snap.
5. Reads back `computedMovement()`, applies it via
   `setNextKinematicTranslation`, and updates `grounded`.
6. If you fall below `y = -20` (walked off the edge during a load, say), it
   respawns you.
7. Calls `updateCamera()`.

---

## 13. First-person camera & controls

- **Look:** the `mousemove` handler (only while pointer-locked) adjusts `yaw`
  (left/right) and `pitch` (up/down, clamped to ±1.5 rad ≈ ±86°).
- **`updateCamera(np)`** parks the camera at the capsule's **eye height**
  (`np.y + 0.6`) and aims it along a direction built from yaw/pitch:

  ```js
  camDir.set(-sin(yaw)*cos(pitch), -sin(pitch), -cos(yaw)*cos(pitch));
  camera.lookAt(camera.position + camDir);
  ```

  Positive pitch (mouse moved down) → negative `y` → look down. Intuitive.
- **Pointer lock:** clicking "Play" calls `requestPointerLock()`. The
  `pointerlockchange` handler shows/hides the overlay, toggles a `playing` body
  class (which hides the cursor / shows the crosshair) and resumes audio.
  Pressing **Esc** releases the lock → pauses.
- **Keys:** a `keys` object tracks which are currently held (set on `keydown`,
  cleared on `keyup`), so movement reads them every frame. `F` toggles fly,
  digits select a block.

> This project used to be **third person** with an animated "Steve" model and a
> hotbar bar. It was converted to first person (camera at eye level, body model
> removed) and the on-screen hotbar was removed; block selection now happens via
> keys/scroll only.

---

## 14. Block targeting, placing & breaking

- A `THREE.Raycaster` is shot from the **screen centre** (the crosshair) into the
  scene, limited to `settings.reach` (6 blocks).
- **`getTarget()`** returns the first block the ray hits: it finds *which*
  InstancedMesh was hit, looks up `instanceId → world key` via that field's
  `keys[]` array, parses the coordinate, double-checks it's within reach, and
  returns the block plus the **hit face normal** (rounded to ±1 on one axis).
- A wireframe `highlight` box follows the targeted block each frame.
- **Break (`onBreak`)**: left-click. If it's TNT → `explode()`. Otherwise
  `removeBlock()` and play a dig sound.
- **Place (`onPlace`)**: right-click. The new block goes in the cell *adjacent to
  the hit face* (`target + face normal`). It refuses to place inside an existing
  block or **inside the player** (`intersectsPlayer`, so you can't trap
  yourself).
- **`setBlock` / `removeBlock`** edit the `world` Map and then `refreshBlock`
  the block plus its six neighbours, so exposure/colliders update locally and
  instantly. `setBlock` also attaches the placed block to its chunk's key list so
  it unloads with the chunk.

---

## 15. TNT & dynamic debris

- **`explode(cx,cy,cz)`** clears a roughly **spherical region** (radius 3) by
  iterating a cube and keeping cells within distance: each non-water block in
  range is removed.
- **Chain reactions:** if a removed block was *also* TNT, it's queued and
  explodes too (recursively) — so a wall of TNT goes off in sequence.
- **Debris:** some removed blocks (random 40% within the inner radius) spawn a
  **dynamic Rapier rigid body** — a small cube with restitution and density,
  given a random outward + upward **blast velocity** and spin. These are the only
  *dynamic* physics bodies in the game (everything else is static or kinematic).
- A bright **point-light flash** fires at the blast centre and fades out.
- **`updateDebris(dt)`** copies each debris body's physics transform onto its
  mesh every frame, and removes debris after its `life` runs out (5 s) or it
  falls out of the world. This is the standard "physics body drives the render
  mesh" pattern.

---

## 16. Procedural sound effects

All audio is synthesised with the **Web Audio API** — no sound files:

- A reusable **white-noise buffer** is generated once (random samples).
- `burst()` plays that noise through a **band-pass/low-pass filter** with an
  exponential volume decay → the "tick"/"thud" of digging and placing.
- `tone()` sweeps an oscillator's frequency down → the low boom under an
  explosion.
- `pitch(type)` maps each block type to a characteristic frequency (glass is
  high/bright at 2200 Hz, water is low at 350 Hz, etc.) so different blocks
  *sound* different.
- The `AudioContext` is created lazily and `resume()`d on first interaction
  (browsers block audio until a user gesture — that's why it resumes when you
  click Play).

---

## 17. Day/night cycle

`updateSky(dt)` runs every frame and drives the whole sky:

- `settings.timeOfDay` advances `0 → 1` over `settings.dayLength` seconds (when
  `autoTime` is on). `0` = midnight, `0.5` = midday.
- The **sun** orbits on a big circle (`ORBIT = 110`) following an angle derived
  from time; the **moon** is opposite it. Their **target** is the player, so the
  directional light and its shadow follow you.
- `sunDisc` / `moonDisc` are flat billboards placed along the light direction,
  always facing the camera (`fog: false` so they show through fog).
- A `day` factor (0 at night → 1 at noon) and a `horizon` factor (peaks at
  sunrise/sunset) drive:
  - light intensities (sun bright by day, moon dim by night, hemisphere/ambient
    scaling),
  - **shadow casting only while the sun is up** (saves work at night),
  - **lerped colours** for sky, fog and hemisphere light — including an orange
    `duskSky` tint at the horizon for sunrise/sunset.
- The **star field** (800 random points on a dome) fades in as it gets dark.
- The HUD clock shows `HH:MM` and a ☀️/🌅/🌙 icon.

---

## 18. The GUI panel

`buildGUI()` creates a collapsed **lil-gui** panel with:

- **Day / Night:** auto-cycle toggle, manual time-of-day slider, day length,
  shadows on/off.
- **Player:** walk/run speed, jump strength, fly toggle, gravity.
- **🌱 New world:** advances `seedCounter` (via a simple LCG step), then
  `generateWorld()` + `spawnPlayer()` — regenerates the terrain with a new seed
  around spawn.

---

## 19. The main loop

```js
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 1/20);   // clamp huge frames

  if (controls.isLocked && dt > 0) {
    updatePlayer(dt);
    updateChunks();          // queue/unload chunks as you roam
    processLoadQueue(1);     // build one chunk this frame
    physics.timestep = dt;
    physics.step();          // advance Rapier (debris, etc.)
    updateDebris(dt);
  }

  updateSky(dt);
  // update the targeting highlight
  // update FPS / block-count HUD every 0.5 s
  renderer.render(scene, camera);
}
```

- **`dt` is clamped to 1/20 s.** If the tab is backgrounded and a frame takes
  seconds, we pretend it was 50 ms so the player doesn't teleport through walls
  and physics doesn't explode.
- Player/physics/streaming only run **while pointer-locked** (i.e. actively
  playing); the sky keeps animating even when paused so it looks alive behind the
  menu.
- The block counter reads `world.size` (only when marked dirty) — it goes up and
  down as chunks stream in and out.

---

## 20. Performance — every trick used

| Trick | What it buys |
|-------|--------------|
| **One `InstancedMesh` per block type** | The whole visible world renders in ~9 draw calls instead of tens of thousands. |
| **Exposed-block culling** | Buried blocks get *no* mesh slot and *no* collider. A solid mountain only meshes its surface shell. |
| **Chunk streaming with a bounded radius** | Memory, mesh slots and collider count stay roughly constant no matter how far you walk. |
| **One chunk built per frame** | Spreads the expensive collider creation over several frames → no stutter when crossing a border. |
| **Load/unload hysteresis** | The `+1` chunk dead zone stops border-standing from thrashing chunks. |
| **Swap-remove on instances** | O(1) block removal, no array shifting. |
| **Fog sized to the load radius** | We never even *attempt* to draw beyond what's loaded; chunks fade in. |
| **Shadows only while the sun is up** | No shadow pass at night. |
| **Tight shadow camera (`SH = 38`)** | The shadow map covers only the area around the player, so it stays sharp. |
| **Capped pixel ratio (≤2)** | High-DPI phones don't render absurd pixel counts. |
| **Shared geometry & materials** | All cubes share one `BoxGeometry`; each block type shares its material set. |
| **`dt` clamp** | One stat: prevents physics blow-ups after a stall. |

**The single performance knob:** `RENDER_DIST` in `app.js`. Lower it (e.g. 2)
for more FPS on weak machines; raise it (e.g. 4) for a longer view (and bump
`CAPACITY` if you do).

### Detailed breakdown by category

The same techniques, explained in full and grouped by *what* they optimize, with
where to find them in `app.js`.

#### Rendering / GPU

- **One `InstancedMesh` per block type** (`InstancedField`, the
  `/* InstancedMesh per type */` section). An InstancedMesh draws many copies of
  one geometry in a *single* draw call. So all grass is one draw call, all stone
  another, etc. — the whole visible world renders in **~9 draw calls** instead of
  tens of thousands. This is the single biggest win.
- **Exposed-block culling** (`refreshBlock` + `isCovered`). A block whose six
  neighbours are all opaque is **never meshed** — a solid mountain only renders
  its surface shell. Dig one block out and the newly-exposed neighbour appears
  immediately because its `refreshBlock` runs and finds it exposed.
- **Swap-remove for instances** (`InstancedField.remove`). Deleting a block
  copies the *last* instance into the freed slot and decrements `count` — O(1),
  no array shifting. The moved block's world record has its `index` updated.
- **`frustumCulled = false`** on each instanced mesh. Its bounding box would span
  the whole world (instances are everywhere), so built-in frustum culling is
  useless; we manage visibility ourselves via culling + chunk unloading.
- **Shared geometry & materials.** Every cube shares one `BoxGeometry`; each
  block type shares its 6-material set. No per-block allocations.
- **Capped pixel ratio** (`setPixelRatio(Math.min(devicePixelRatio, 2))`). A 3×
  DPI phone won't render 9× the pixels.
- **Fog sized to the load radius** (`scene.fog`, `VIEW * 0.45 → VIEW * 0.95`).
  Fog reaches full opacity *just inside* the streamed radius, so we never draw
  beyond what's loaded and chunks fade in instead of popping at a hard edge.

#### World / memory

- **Chunk streaming with a bounded radius** (`updateChunks`, `loadChunk`,
  `unloadChunk`). Only chunks within `RENDER_DIST` exist at once; memory, mesh
  slots and collider count stay roughly constant no matter how far you walk.
- **One chunk built per frame** (`processLoadQueue(1)` in the main loop).
  Collider creation is the expensive step, so building a whole ring at once would
  freeze the frame. Spreading it over frames keeps the frame rate smooth; the
  queue still drains far faster than you can walk into unloaded terrain.
- **Load/unload hysteresis** (unload only beyond `RENDER_DIST + 1`). The
  one-chunk dead zone stops a chunk from loading/unloading every step when you
  stand on its border.
- **Sparse `Map` world.** Only blocks that exist are stored — no memory wasted on
  air — which is what makes an unbounded world feasible at all.
- **Colliders only on exposed solids.** Buried blocks and non-solid blocks
  (water) get no Rapier collider, keeping the physics world small.

#### Physics

- **Kinematic player + character controller.** No per-frame force integration for
  the player; collision/stepping/ground-snapping is handled by Rapier's
  purpose-built `KinematicCharacterController`.
- **Debris is the only dynamic physics**, and only a *random subset* of exploded
  blocks spawn debris, each with a 5-second lifetime — so dynamic-body count
  stays tiny.
- **`dt` clamp to 1/20 s** (main loop). Prevents a backgrounded-tab stall from
  stepping physics with a huge delta and tunnelling the player through walls.

#### Lighting

- **Shadows only while the sun is up** (`updateSky` sets `sun.castShadow` from the
  `day` factor). No shadow pass at night.
- **Tight shadow camera** (`SH = 38`). The shadow map covers only the area around
  the player, so it stays sharp instead of being stretched across the world — and
  distant shadows are hidden by fog anyway.

#### Where the bottleneck actually is

The heaviest moment is **chunk loading**: creating Rapier colliders (WASM calls)
and the `refreshBlock` neighbour fan-out for every new block. That's exactly why
chunk builds are throttled to one per frame and why the initial spawn region is
built up-front behind the loading screen.

---

## 21. Known limitations & future work

- **No persistence.** The world isn't saved. If you dig a hole, walk far enough
  that the chunk unloads, then return, the chunk regenerates from the seed — your
  edits are gone. *Fix:* keep a per-chunk "diff" of player edits and re-apply it
  in `loadChunk`.
- **Tree density / variety** is simple (one tree shape).
- **No biomes** — one global terrain rule. Could add a second low-frequency noise
  to pick biome (desert/forest/snow).
- **No saving of debris** across chunk reloads (they're transient by design).
- **`CAPACITY` is a hard cap per type.** If you crank `RENDER_DIST` very high
  without raising it, the rarest case is missing blocks + a console warning.
- **Single-threaded generation.** A Web Worker could build chunks off the main
  thread for an even smoother experience.

---

## 22. Big Q&A

Questions you might be asked about this project, grouped by theme, with answers.

### Architecture & data

**Q: Why store the world in a `Map` keyed by `"x,y,z"` instead of a 3D array?**
A 3D array needs fixed bounds and allocates memory for empty air. A Map only
stores blocks that exist, handles negative coordinates naturally, and makes an
infinite world trivial — you just keep inserting keys. The trade-off is string
keys (hashing cost) vs. integer indexing, which is fine at this scale.

**Q: Isn't building string keys (`"12,5,-3"`) slow?**
It's a small cost and very cache-friendly in JS engines. For a hobby-scale voxel
world it's a non-issue; the bottleneck is rendering/physics, not Map lookups. If
profiling demanded it, you'd switch to a packed integer key (bit-pack x/y/z).

**Q: What is a "chunk" and why 16×16?**
A chunk is a square column group of the world we load/unload as a unit. 16 is the
classic Minecraft size and a good balance: small enough that loading one is cheap
and quick, big enough that we don't manage thousands of tiny chunks.

### Rendering

**Q: What's an `InstancedMesh` and why is it essential here?**
It draws many copies of one geometry in a *single* draw call, each with its own
transform. Without it, thousands of cubes = thousands of draw calls = GPU-bound
and slow. With it, all blocks of a type are one draw call.

**Q: How do you delete one instance from the middle of an InstancedMesh?**
Swap-remove: copy the *last* instance into the slot being removed, then decrement
`count`. Since the moved block now lives in a different slot, I update its world
record's `index`. O(1), no shifting.

**Q: How does clicking a block know *which* block you hit?**
A raycast returns the `instanceId` within the InstancedMesh that was hit. Each
`InstancedField` keeps a parallel `keys[]` array mapping `instanceId → world
key`, so I look up the key, parse it back into coordinates, and confirm it's in
reach.

**Q: Why `NearestFilter` on textures?**
To keep the pixel-art crisp. Linear filtering would blur the 16×16 art into mush.
Mipmaps (`NearestMipmapNearest`) still kick in for distant blocks to avoid
shimmering.

**Q: Why is `frustumCulled` set to false on the meshes?**
Because an InstancedMesh's bounding box would encompass *all* its instances
(spread across the world), making per-mesh frustum culling useless and even
wrong. We do our own visibility management (culling + chunk unloading) instead.

### The infinite world

**Q: How is the world "infinite" if a computer has finite memory?**
Only chunks within `RENDER_DIST` of the player exist at once; far ones are
unloaded. The world is *generated on demand* from a deterministic noise function,
so any coordinate's terrain can be recreated identically whenever you return.
Memory stays bounded.

**Q: Why doesn't the terrain "seam" at chunk borders?**
Because the height comes from a continuous noise function of world coordinates —
adjacent chunks sample the same function, so heights line up exactly. And
exposed-face culling is fixed up across borders by refreshing neighbours when a
chunk loads/unloads.

**Q: How do trees that straddle a chunk border work?**
Each chunk scans a 2-block margin around itself for tree *trunks*, but only writes
the leaf/log cells that fall *inside* its own bounds. Both neighbouring chunks
compute the same tree from the noise and each contributes its share. No chunk
writes outside itself, so loading/unloading order never matters.

**Q: Why load only one chunk per frame? Why not all at once?**
Creating Rapier colliders is the expensive step. Doing a whole ring at once would
freeze the frame (a visible hitch). Building one per frame spreads the cost; the
queue still drains far faster than the player can walk into unloaded territory.

**Q: What's the `+1` in the unload distance for?**
Hysteresis. If load and unload used the same radius, standing exactly on a border
would load and unload the same chunk every step (thrashing). The extra chunk of
margin creates a dead zone so a chunk must be *clearly* far before it's dropped.

**Q: What happens to blocks I placed when a chunk unloads?**
`setBlock` attaches placed blocks to their chunk's key list, so they're removed
with the chunk like any other block. But since the world isn't persisted, when
the chunk reloads it regenerates from the seed and your edit is gone (see
Limitations).

**Q: Could two players see the same world?**
Yes in principle — the world is fully determined by the seed and the noise
functions, so the same seed produces the same world everywhere. Multiplayer would
need networking, not new world logic.

### Physics

**Q: Why is the player *kinematic* instead of a dynamic rigid body?**
Kinematic = we set its position explicitly; physics doesn't apply forces to it.
That gives tight, predictable platformer-style control (no bouncing, sliding, or
tipping). Rapier's character controller still resolves collisions, stepping and
ground-snapping for us.

**Q: What does the `KinematicCharacterController` actually do?**
You give it a *desired* movement vector; it sweeps the capsule through the world,
stops it at walls (sliding along them), steps up small ledges automatically,
snaps it to the ground over bumps, and returns the *allowed* movement. We apply
that.

**Q: How does jumping work?**
A vertical velocity `vY` accumulates gravity each frame. Pressing Space *while
grounded* sets `vY` to the jump strength. The controller reports whether we're
grounded; when we land, `vY` is zeroed.

**Q: Why are only the TNT debris dynamic bodies?**
Everything else doesn't need simulated physics — terrain is static, the player is
kinematic. Debris is the one case where we want real tumbling/bouncing, so those
are full dynamic rigid bodies. Keeping their count low (random subset, 5 s life)
keeps physics cheap.

**Q: Why clamp `dt`?**
If the tab is backgrounded, `requestAnimationFrame` pauses and the next frame's
delta could be seconds. Stepping physics with a huge `dt` would tunnel the player
through walls. Clamping to 1/20 s keeps a stall from breaking the simulation.

### Player / camera / controls

**Q: How is movement made frame-rate independent?**
Everything is multiplied by `dt` (delta time). Speed is in units/second, so at
30 fps or 144 fps you cover the same ground per real second.

**Q: How does camera-relative movement work?**
The forward vector is derived from `yaw`: `(-sin yaw, 0, -cos yaw)`. "Right" is
the cross product of forward and world-up. WASD add/subtract these, so "W" always
means "where I'm looking" regardless of facing.

**Q: Why pointer lock?**
For mouse-look you need raw, unbounded mouse deltas and a hidden cursor. Pointer
lock gives `movementX/Y` without the cursor hitting the screen edge.

### Audio / textures (the "no assets" angle)

**Q: Why generate textures and sounds in code?**
It keeps the project a single self-contained bundle (no asset loading, no CORS,
no file management) and demonstrates the canvas→texture and Web Audio paths. It's
also instant — nothing to download.

**Q: Why does audio only start after clicking Play?**
Browsers suspend `AudioContext` until a user gesture (anti-autoplay policy).
Clicking Play calls `resume()`.

### Day/night & lighting

**Q: How do shadows follow the player across an infinite world?**
The directional light's *target* is set to the player each frame, and the shadow
camera is a tight box (`±38`) around that target. So the shadow map always covers
the area you're in, stays high-resolution, and moves with you.

**Q: Why a tight shadow camera instead of one covering the whole world?**
A shadow map is a fixed-resolution texture. Stretch it over a huge area and
shadows get blocky. A small box around the player keeps them crisp, and you can't
see distant shadows through the fog anyway.

### Trade-offs & "what would you change"

**Q: Biggest limitation?**
No persistence of edits across chunk reloads. The fix is a per-chunk edit diff
applied on load.

**Q: What would you optimise next?**
Move chunk generation into a Web Worker so building never touches the main
thread; pack the world key into an integer; and add greedy meshing if I dropped
InstancedMesh for a custom geometry approach.

**Q: How would you add biomes / caves?**
Biomes: a separate low-frequency noise selects a biome per region, which changes
the surface block and tree rules. Caves: a 3D noise that carves out blocks below
the surface where the noise crosses a threshold.

**Q: Why Three.js + Rapier specifically?**
Three.js is the de-facto WebGL library (great docs, huge ecosystem). Rapier is a
fast, modern physics engine with first-class WASM/JS bindings and a built-in
character controller — exactly what a voxel game needs.

---

## 23. Glossary

- **Voxel** — a "volume pixel"; a unit cube in a 3D grid. Our blocks are voxels.
- **Chunk** — a 16×16 column group loaded/unloaded as a unit.
- **Draw call** — one instruction to the GPU to draw something. Fewer is faster.
- **InstancedMesh** — Three.js object that draws many copies of one geometry in a
  single draw call.
- **Culling** — skipping work for things that can't be seen (here, buried blocks).
- **Kinematic body** — a physics body moved explicitly by code, not by forces.
- **Character controller** — a physics helper that moves a capsule through the
  world with stepping, sliding and ground-snapping.
- **Value noise / fBm** — smooth pseudo-random function used to shape terrain;
  fractal Brownian motion sums several octaves of it.
- **Hysteresis** — using different thresholds for "turn on" vs "turn off" to
  prevent rapid flip-flopping (here, load vs unload distance).
- **Pointer lock** — browser API that hides the cursor and gives raw mouse deltas
  for mouse-look.
- **Tone mapping** — maps high-dynamic-range colour into displayable range; ACES
  gives a filmic look.
- **Delta time (`dt`)** — seconds elapsed since the last frame; used to make
  motion frame-rate independent.

---

*This document describes `src/app.js` as it currently stands: first-person,
no on-screen hotbar, with an infinite chunk-streamed world.*
