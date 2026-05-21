# Day / Night Cycle with Particles

**Made by Muhammad Ausaf Jamal**

🔗 Live demo: <https://three-js-journey-day-night-cycle.vercel.app/>

A small 3D scene built with [Three.js](https://threejs.org/) where the sun rises and sets in a loop. As the sun moves across the sky, the sky color, the lighting, and the shadows all change — a moon takes over for the night, and fireflies glow into life once it gets dark.

---

## What this project does (in simple words)

When you open the page:

1. **You see a little landscape** — a grassy ground with a cottage in the middle and a forest of trees scattered around it.
2. **The sun travels across the sky** in a circle, over and over. One full day takes about 100 seconds (and you can change that).
3. **The sky changes color** as the sun moves — it blends through day, afternoon, sunset, dusk, and night.
4. **Shadows move with the sun** — they stretch and sweep across the ground as the sun rises and sets.
5. **At night the moon shows up** on the opposite side of the sky, giving off a soft blue light so the scene is never fully dark.
6. **Fireflies appear at night** — once the sun drops below the horizon, hundreds of glowing yellow points fade in and drift around the cottage, then fade out again at dawn.
7. **You can move the view** — drag with the mouse to rotate around, and scroll to zoom in and out.
8. **A control panel** in the corner lets you tweak almost everything live (see below).

---

## What's in the scene

| Thing | Details |
|-------|---------|
| **Ground** | A large plane with a tiled grass texture that catches shadows. |
| **Cottage** | A textured 3D house model (loaded from an OBJ + MTL file), scaled and dropped onto the ground at the center. |
| **Trees** | 50 low-poly tree models scattered randomly around the landscape, kept clear of the cottage. |
| **Fireflies** | 1000 glowing point particles ringed around the cottage that fade in at night and gently bob up and down. |
| **Sun** | A big textured sphere that moves in a circular arc. It carries the main light. |
| **Moon** | A textured sphere on the opposite side of the sky, with its own soft glow for night. |
| **Sun light** | A warm directional light that follows the sun and casts sharp shadows. |
| **Moon light** | A dim blue directional light for the night side. |
| **Ambient light** | A fill light that turns warm during the day and cool at night so nothing goes pitch black. |
| **Sky** | The background color blends between day, afternoon, sunset, dusk, and night depending on how high the sun is. |

---

## Control panel (lil-gui)

A panel in the top-right corner lets you change things in real time:

- **Cycle** — day length (duration in seconds), pause the cycle, and scrub the time of day by hand.
- **Sun Light** — intensity, color, shadows on/off.
- **Moon Light** — intensity, color, shadows on/off.
- **Ambient Light** — separate day and night colors and intensities.
- **Sky Colors** — pick the day, afternoon, sunset, dusk, and night sky colors.
- **Scene** — recolor the ground.

---

## How it works (technical bits, kept short)

- **`index.html`** — the page: a `<canvas>` for the 3D scene and a title overlay. Loads `src/app.js`.
- **`src/app.js`** — all the 3D logic:
  - Sets up the Three.js **scene, camera, renderer, and OrbitControls**, with soft shadows turned on.
  - Loads the **cottage and tree models** with `OBJLoader` / `MTLLoader`. The cottage OBJ ships with extra baked-in geometry (a ground plane and Blender light planes), so everything except the house mesh is stripped out before it is scaled and placed.
  - Scatters **50 cloned trees** around the ground, skipping a clear radius around the cottage.
  - Builds the **grass ground**, the **sun and moon**, the **fireflies**, and all the **lights**.
  - A **GSAP tween** runs the `cycle.angle` from `0` to `360°` forever — that single value drives the whole day.
  - **`updateCycle()`** runs every frame the angle changes: it positions the sun and moon, moves the lights, blends the ambient light, picks the sky color, and fades the fireflies in and out based on how high the sun is.
  - The **animation loop** bobs the fireflies up and down (only while they are visible) and renders the scene.
  - A **`lil-gui` panel** is wired to a `params` object so every setting can be changed live.
  - Handles **window resize** so the scene always fills the screen.
- **`src/style.css`** — full-screen background and the title overlay styling.
- **`public/textures/`** — the cottage and tree models, their textures, and the sun and moon images.
- **`public/texture/`** — the tiled grass texture.

---

## Tech used

- **[Three.js](https://threejs.org/)** — 3D rendering
- **[GSAP](https://greensock.com/gsap/)** — drives the day/night cycle
- **[lil-gui](https://lil-gui.georgealways.com/)** — the live control panel
- **[Vite](https://vitejs.dev/)** — dev server and build tool

---

## Run it locally

```bash
npm install      # install dependencies
npm run dev      # start the dev server
npm run build    # build for production
npm run preview  # preview the production build
```

Then open the URL Vite prints in your terminal.
