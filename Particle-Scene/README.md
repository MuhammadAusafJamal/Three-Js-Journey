# Particles Scene

**Made by Muhammad Ausaf Jamal**

🔗 Live demo: <https://three-js-journey-particles-scene.vercel.app/>

A small 3D scene built with [Three.js](https://threejs.org/) made entirely out of points (particles). A glowing shape spins in the middle while hundreds of fireflies drift around it.

---

## What this project does (in simple words)

When you open the page:

1. **You see a glowing orange shape** in the center — it's a twisted knot drawn as thousands of tiny dots instead of a solid surface.
2. **The shape slowly rotates** on its own.
3. **Hundreds of yellow fireflies** float around the scene, gently bobbing up and down.
4. **Each firefly moves on its own** — they all rise and fall at different times, so it looks natural instead of everything moving together.
5. **You can move the view** — drag with the mouse to rotate around, and scroll to zoom in and out (within a set range).

---

## What's in the scene

| Thing | Details |
|-------|---------|
| **Torus knot** | A twisted knot shape, drawn as points using `PointsMaterial` instead of solid faces. Glows orange and rotates slowly. |
| **Fireflies** | 1000 yellow points scattered around the scene. Each one has a soft round glow and bobs up and down. |
| **Firefly glow** | The glow is a small texture drawn on the fly with a 2D canvas — a white radial gradient that fades to transparent. |
| **Additive blending** | Where fireflies overlap, their light adds up and looks brighter — like real glowing dots. |

---

## How it works (technical bits, kept short)

- **`index.html`** — the page: a `<canvas>` for the 3D scene and a title overlay. Loads `src/app.js`.
- **`src/app.js`** — all the 3D logic:
  - Sets up the Three.js **scene, camera, renderer, and OrbitControls**.
  - Takes a **`TorusKnotGeometry`** and reuses just its points to draw it as a particle cloud.
  - Creates **1000 fireflies** at random positions, keeping a copy of their starting spots so only the up/down motion changes.
  - **`createFireflyTexture()`** draws a soft round glow on a 2D canvas and uses it as the firefly texture.
  - The **animation loop** uses a clock to rotate the knot and to bob each firefly with a sine wave — each firefly gets a unique offset so they move out of sync.
  - Handles **window resize** so the scene always fills the screen.
- **`src/style.css`** — full-screen background and the title overlay styling.

---

## Tech used

- **[Three.js](https://threejs.org/)** — 3D rendering
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
