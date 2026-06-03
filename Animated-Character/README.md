# Animated Character

**Made by Muhammad Ausaf Jamal**

🔗 Live demo: <https://three-js-journey-animated-character.vercel.app/>

An interactive 3D scene built with [Three.js](https://threejs.org/) and the
[Rapier](https://rapier.rs/) physics engine. A little robot stands on a grassy
field — walk it around with the keyboard, click it to run through its animations,
or click the ground to make it hurl a physics ball at a pyramid of blocks.
Knock them all down to win.

---

## Controls

| Input | Action |
|-------|--------|
| **W A S D** / arrow keys | Move the robot (camera-relative) |
| **Shift** (while moving) | Run instead of walk |
| **Space** | Jump |
| **Click the robot** | Cycle to its next animation |
| **Click the ground** | Robot throws a physics ball at that spot |
| **Mouse drag / scroll** | Orbit / zoom the camera |

Walk into the block pyramid to shove it over, or knock it down with thrown balls.

---

## Course objectives covered

| Objective | How it's done |
|-----------|---------------|
| Plane + physics | A grass plane with a static Rapier ground collider (top surface at `y = 0`). |
| Character model with multiple animations | `RobotExpressive.glb` (a free Three.js model with ~14 animation clips). |
| Ray-caster to trigger animations | `pointerup` → `Raycaster` against the robot → cycles its animation list. |
| **Bonus** mini-game with physics + primitives | Walk/throw to topple a pyramid of primitive cubes; score + win state. |

---

## How it works (short version)

- **`index.html`** — the `<canvas>`, a loading bar, and the game HUD (score,
  current animation, hints).
- **`src/app.js`** — all the logic:
  - Sets up the **scene, camera, renderer, OrbitControls** and lights (with soft
    shadows).
  - `await RAPIER.init()` boots the WebAssembly physics engine, then a **Rapier
    world** is created with gravity.
  - The **ground** is a textured plane backed by a fixed cuboid collider.
  - **`buildPyramid()`** spawns a 4-3-2-1 stack of dynamic cube bodies.
  - **`GLTFLoader`** loads `RobotExpressive.glb`; an **`AnimationMixer`** drives
    its clips. Looping states (Idle/Walking/Running/Dance) cross-fade; one-shot
    emotes (Jump/Wave/Punch…) play once and return to the base state.
  - The robot is a **kinematic capsule** driven by a Rapier
    **`KinematicCharacterController`**, so it collides with the ground and can
    physically shove the blocks. WASD moves it, Space makes it jump (gravity +
    jump velocity applied through the controller).
  - A **ray-caster** on `pointerup` decides whether you clicked the robot
    (→ next animation) or the ground (→ throw a ball).
  - **`throwBall()`** spawns a dynamic sphere from the robot's hand with an
    initial velocity toward the clicked point.
  - Every frame the **world steps** and each tracked body's transform is copied
    onto its mesh; `updateScore()` checks how many blocks have toppled (by tilt
    or by falling) and triggers the win state.
  - A **lil-gui** panel exposes throw power, simulation speed, gravity, a
    *Reset blocks* button, a manual animation picker, and a *Show colliders*
    debug toggle (drawn with Rapier's `world.debugRender()`).

---

## Tech used

- **[Three.js](https://threejs.org/)** — 3D rendering
- **[Rapier](https://rapier.rs/)** (`@dimforge/rapier3d-compat`) — physics
- **[lil-gui](https://lil-gui.georgealways.com/)** — live control panel
- **[Vite](https://vitejs.dev/)** — dev server and build tool

The character is [RobotExpressive](https://github.com/mrdoob/three.js/tree/master/examples/models/gltf/RobotExpressive)
from the official Three.js examples.

---

## Run it locally

```bash
npm install      # install dependencies
npm run dev      # start the dev server
npm run build    # build for production
npm run preview  # preview the production build
```

Then open the URL Vite prints in your terminal.
