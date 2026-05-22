# Three.js Journey

**By Muhammad Ausaf Jamal**

My learning journey with [Three.js](https://threejs.org/) — a collection of small 3D web projects I'm building to get comfortable with WebGL, scenes, cameras, lighting, textures, animation, and everything in between.

Each folder in this repo is its own self-contained project with its own README. As I learn more, more projects will show up here.

---

## Projects

| Project | What it is | Live demo |
|---------|------------|-----------|
| [Solar System](./Solar-System) | An interactive 3D Solar System — drag to orbit the Sun, zoom in and out, and watch all 8 planets and their moons spin in real time. Has a loading screen, a camera fly-in intro, Saturn's rings, cloud layers, and an 8K starfield background. | https://three-js-journey-solar-system.vercel.app/ |
| [Day / Night Cycle](./Day-Night-Cycle) | A 3D scene where the sun rises and sets in a loop over a cottage in a forest — the sky shifts through day, sunset, and night while shadows sweep across the ground. A moon lights the night side, fireflies glow into life after dark, and a lil-gui panel lets you tweak everything live. | https://three-js-journey-day-night-cycle-with-particles.vercel.app |

> More coming soon as the journey continues.

---

## Tech used across projects

- **[Three.js](https://threejs.org/)** — 3D rendering
- **[Vite](https://vitejs.dev/)** — dev server and bundler
- **[GSAP](https://greensock.com/gsap/)** — animations
- **[lil-gui](https://lil-gui.georgealways.com/)** — debug controls

---

## Running a project

Open the folder you want, then:

```bash
npm install      # install dependencies
npm run dev      # start the dev server
npm run build    # build for production
npm run preview  # preview the production build
```

Then open the URL Vite prints in your terminal.
