# Day / Night Cycle

**Made by Muhammad Ausaf Jamal**

🔗 Live demo: <https://three-js-journey-day-night-cycle.vercel.app/>

A small 3D scene built with [Three.js](https://threejs.org/) where the sun rises and sets in a loop. As the sun moves across the sky, the sky color, the lighting, and the shadows all change — and a moon takes over for the night.

---

## What this project does (in simple words)

When you open the page:

1. **You see a little landscape** — a green ground with a box, a cone, and a sphere sitting on it.
2. **The sun travels across the sky** in a circle, over and over. One full day takes about 20 seconds.
3. **The sky changes color** as the sun moves — light blue in the day, orange at sunset, and almost black at night.
4. **Shadows move with the sun** — they stretch and sweep across the ground as the sun rises and sets.
5. **At night the moon shows up** on the opposite side of the sky, giving off a soft blue light so the scene is never fully dark.
6. **You can move the view** — drag with the mouse to rotate around, and scroll to zoom in and out.
7. **A control panel** in the corner lets you tweak almost everything live (see below).

---

## What's in the scene

| Thing | Details |
|-------|---------|
| **Ground** | A flat green plane that everything sits on and that catches shadows. |
| **Shapes** | A box, a cone, and a sphere — simple objects that cast and receive shadows. |
| **Sun** | A big textured sphere that moves in a circular arc. It carries the main light. |
| **Moon** | A textured sphere on the opposite side of the sky, with its own soft glow for night. |
| **Sun light** | A warm directional light that follows the sun and casts sharp shadows. |
| **Moon light** | A dim blue directional light for the night side. |
| **Ambient light** | A fill light that turns warm during the day and cool at night so nothing goes pitch black. |
| **Sky** | The background color blends between day, sunset, and night depending on how high the sun is. |

---

## Control panel (lil-gui)

A panel in the top-right corner lets you change things in real time:

- **Cycle** — day length, pause the cycle, scrub the time of day by hand, change the orbit radius.
- **Sun Light** — intensity, color, shadows on/off.
- **Moon Light** — intensity, color, shadows on/off.
- **Ambient Light** — separate day and night colors and intensities.
- **Sky Colors** — pick the day, sunset, and night sky colors.
- **Objects** — recolor the ground, box, cone, and sphere.

---

## How it works (technical bits, kept short)

- **`index.html`** — the page: a `<canvas>` for the 3D scene and a title overlay. Loads `src/app.js`.
- **`src/app.js`** — all the 3D logic:
  - Sets up the Three.js **scene, camera, renderer, and OrbitControls**, with soft shadows turned on.
  - Builds the **ground and shapes**, the **sun and moon**, and all the **lights**.
  - A **GSAP tween** runs the `cycle.angle` from `0` to `360°` forever — that single value drives the whole day.
  - **`updateCycle()`** runs every frame the angle changes: it positions the sun and moon, moves the lights, blends the ambient light, and picks the sky color based on how high the sun is.
  - A **`lil-gui` panel** is wired to a `params` object so every setting can be changed live.
  - Handles **window resize** so the scene always fills the screen.
- **`src/style.css`** — full-screen background and the title overlay styling.
- **`src/textures/`** — the sun and moon images.

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
