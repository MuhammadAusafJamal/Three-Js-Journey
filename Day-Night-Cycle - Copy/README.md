# Solar System

**Made by Muhammad Ausaf Jamal**

🔗 Live demo: <https://three-js-journey-solar-system.vercel.app/>

An interactive 3D model of the Solar System built with [Three.js](https://threejs.org/). You can drag to orbit around the Sun, scroll to zoom in and out, and watch the planets and their moons spin around in real time.

---

## What this project does (in simple words)

When you open the page:

1. **A loading screen appears** showing the title "Solar System" and a progress bar with a percentage. This waits until all the planet images (textures) are downloaded.
2. **Once everything is loaded**, the loading screen fades away and the camera flies in from far away down to the Solar System — a smooth intro animation.
3. **You see the Sun in the middle**, glowing, with all 8 planets orbiting around it on faint circular paths.
4. **You can move the view** — drag with the mouse to rotate around, and scroll to zoom closer or further out.
5. **Everything keeps moving** — planets orbit the Sun, they spin on their own axis, moons orbit their planets, and cloud layers drift slowly.

---

## What's in the scene

| Thing | Details |
|-------|---------|
| **Sun** | A big textured sphere in the center, with a soft orange glow around it and a point light that lights up all the planets. |
| **8 Planets** | Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune — each with its own real texture, size, distance from the Sun, orbit speed, and axial tilt. |
| **Orbit paths** | A thin glowing ring is drawn for each planet so you can see its orbit. |
| **Moons** | Earth has 1 moon, Mars has 2, Jupiter has 4, Neptune has 1 — each orbiting its planet at its own speed. |
| **Earth extras** | Earth has a separate slowly-rotating cloud layer, plus normal/specular/night-map textures included. |
| **Venus clouds** | Venus has a thick atmosphere layer on top of its surface. |
| **Saturn's rings** | A flat ring around Saturn made from a ring texture, with the UVs fixed so the texture wraps correctly from inner to outer edge. |
| **Stars background** | An 8K starfield image wrapped around the whole scene as the background. |
| **Lighting** | A bright point light at the Sun + a tiny bit of ambient light so the dark sides of planets aren't pitch black. |

---

## How it works (technical bits, kept short)

- **`index.html`** — the page: a `<canvas>` for the 3D scene, a title overlay, and the loading screen markup. Loads `src/app.js`.
- **`src/app.js`** — all the 3D logic:
  - Sets up the Three.js **scene, camera, renderer, and OrbitControls**.
  - A **`planetsData` array** holds the settings for every planet (name, size, distance, speed, tilt, moons, rings, cloud textures). Adding or tweaking a planet is just editing this array.
  - A **`LoadingManager`** tracks texture download progress and drives the loading bar; when done it fades the loader and runs the GSAP camera fly-in.
  - **`createPlanet()`** builds each planet: its orbit ring, a pivot object it rotates around, the planet mesh with a `MeshStandardMaterial`, optional cloud sphere, optional Saturn ring (with manual UV fix), and any moons.
  - The **animation loop** uses a clock + a `simulation.speed` multiplier to advance every planet's orbit, self-rotation, cloud rotation, and moon orbits each frame.
  - Handles **window resize** so the scene always fills the screen.
- **`src/style.css`** — black full-screen background, the title overlay styling, and the loading-screen / progress-bar styling.
- **`src/textures/`** — all the planet, moon, Sun, ring, and star images (mostly 8K resolution).

---

## Tech used

- **[Three.js](https://threejs.org/)** — 3D rendering
- **[GSAP](https://greensock.com/gsap/)** — the smooth intro camera animation and loader fade
- **[lil-gui](https://lil-gui.georgealways.com/)** — included for debug controls
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
