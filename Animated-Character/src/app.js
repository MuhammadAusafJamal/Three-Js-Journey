import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import GUI from 'lil-gui';
import RAPIER from '@dimforge/rapier3d-compat';

/* ------------------------------------------------------------------ *
 *  Animated Character
 *  - Rapier physics world + a physics ground plane
 *  - RobotExpressive character with many animations
 *  - Ray-caster: click the robot to cycle its animations
 *  - Mini-game: click the ground -> the robot throws a physics ball
 *    to knock down a pyramid of primitive blocks
 * ------------------------------------------------------------------ */

await RAPIER.init();

/* ----------------------------- Core ------------------------------- */
const canvas = document.querySelector('canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#bfe3ff');
scene.fog = new THREE.FogExp2('#bfe3ff', 0.038);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 8, 17);

const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const clock = new THREE.Clock();
const simulation = { speed: 1, gravity: -20, throwPower: 24, debug: false };

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.minDistance = 8;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI / 2.2;
controls.target.set(0, 1.5, 0);

addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
});

// Lights
scene.add(new THREE.HemisphereLight('#bfe3ff', '#557040', 0.9));

const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
sun.position.set(8, 16, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
sun.shadow.camera.left = -20;
sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20;
sun.shadow.camera.bottom = -20;
sun.shadow.bias = -0.0004;
scene.add(sun);

// Textures
const texLoader = new THREE.TextureLoader();
const maxAniso = renderer.capabilities.getMaxAnisotropy();
function loadTex(url, repeat = 1) {
    const t = texLoader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = maxAniso;
    return t;
}

// Physics
const world = new RAPIER.World({ x: 0, y: simulation.gravity, z: 0 });

// Everything that needs its mesh kept in sync with a physics body.
const bodies = [];
function track(mesh, body, extra = {}) {
    const entry = { mesh, body, ...extra };
    bodies.push(entry);
    return entry;
}

// Ground plane
const GROUND = 60;
const grassTexture = loadTex('/texture/grass.jpeg');
grassTexture.wrapS = THREE.RepeatWrapping;
grassTexture.wrapT = THREE.RepeatWrapping;
grassTexture.repeat.set(10, 10);
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND, GROUND),
    new THREE.MeshStandardMaterial({ map: grassTexture, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// A fixed (static) physics body whose top surface sits exactly at y = 0.
const groundBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0)
);
world.createCollider(
    RAPIER.ColliderDesc.cuboid(GROUND / 2, 0.5, GROUND / 2).setFriction(1),
    groundBody
);

// Mini-game: blocks 
const BLOCK = 1;                 // edge length of each cube
const PYRAMID = { x: 5, z: 0 };  // where the stack sits
const palette = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#b983ff', '#ff9f45'];

const blockGeo = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
let blocks = [];
let won = false;

function spawnBlock(x, y, z, color) {
    const mesh = new THREE.Mesh(
        blockGeo,
        new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05 })
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z)
    );
    world.createCollider(
        RAPIER.ColliderDesc.cuboid(BLOCK / 2, BLOCK / 2, BLOCK / 2)
            .setFriction(0.9)
            .setRestitution(0.05),
        body
    );

    const entry = track(mesh, body, { kind: 'block' });
    blocks.push(entry);
    return entry;
}

// Build a 4-3-2-1 pyramid (10 blocks) standing on the ground.
function buildPyramid() {
    let i = 0;
    for (let row = 0; row < 4; row++) {
        const count = 4 - row;
        const y = BLOCK / 2 + row * BLOCK;
        const offset = -((count - 1) * BLOCK) / 2;
        for (let c = 0; c < count; c++) {
            spawnBlock(PYRAMID.x, y, PYRAMID.z + offset + c * BLOCK, palette[i % palette.length]);
            i++;
        }
    }
}

function removeEntry(entry) {
    scene.remove(entry.mesh);
    entry.mesh.material.dispose();
    world.removeRigidBody(entry.body);
    const idx = bodies.indexOf(entry);
    if (idx !== -1) bodies.splice(idx, 1);
}

function resetGame() {
    [...blocks].forEach(removeEntry);
    blocks = [];
    // also clear any flying balls
    [...bodies].filter((b) => b.kind === 'ball').forEach(removeEntry);
    won = false;
    winEl.classList.remove('show');
    buildPyramid();
    totalEl.textContent = blocks.length;
    scoreEl.textContent = '0';
}

// Balls
const ballGeo = new THREE.SphereGeometry(0.4, 24, 24);
const ballMat = new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.3, metalness: 0.6 });
const MAX_BALLS = 8;

function throwBall(from, dir) {
    const mesh = new THREE.Mesh(ballGeo, ballMat);
    mesh.castShadow = true;
    scene.add(mesh);

    const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(from.x, from.y, from.z)
    );
    world.createCollider(
        RAPIER.ColliderDesc.ball(0.4).setRestitution(0.45).setDensity(4),
        body
    );

    const v = simulation.throwPower;
    body.setLinvel({ x: dir.x * v, y: dir.y * v + 2.5, z: dir.z * v }, true);

    track(mesh, body, { kind: 'ball' });

    // keep only the most recent balls around
    const balls = bodies.filter((b) => b.kind === 'ball');
    if (balls.length > MAX_BALLS) removeEntry(balls[0]);
}

// Character & anim
let robot = null;
let mixer = null;
const actions = {};
let activeAction = null;
let currentBase = 'Idle';
let oneShotPlaying = false;

// kinematic character controller + movement state
let robotBody = null;
let robotCollider = null;
let charCtrl = null;
const CAP_HALF = 0.7;   // capsule half-height (cylinder part)
const CAP_RADIUS = 0.4; // capsule radius
const CAP_OFFSET = CAP_HALF + CAP_RADIUS; // feet -> capsule centre
const MOVE = { walk: 4.5, run: 8, jump: 9 };

const keys = Object.create(null);
const moveDir = new THREE.Vector3();
const camForward = new THREE.Vector3();
const camRight = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);
let vY = 0;
let grounded = true;
let wantJump = false;
let locoCurrent = null;
let targetYaw = Math.PI / 2;

const loopingStates = ['Idle', 'Walking', 'Running', 'Dance'];
// non-looping clips (emotes + poses) play once and clamp on the last frame
const oneShotClips = ['Jump', 'Yes', 'No', 'Wave', 'Punch', 'ThumbsUp', 'Death', 'Sitting', 'Standing'];
// the sequence the ray-caster steps through on each click of the robot
const clickCycle = ['Wave', 'Dance', 'ThumbsUp', 'Yes', 'No', 'Idle'];
let clickIndex = 0;

function fadeToAction(name, duration) {
    const next = actions[name];
    if (!next) return;
    if (activeAction && activeAction !== next) activeAction.fadeOut(duration);
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(duration).play();
    activeAction = next;
    animEl.textContent = name;
}

function playOneShot(name) {
    oneShotPlaying = true;
    locoCurrent = null; // let locomotion re-evaluate after the emote ends
    fadeToAction(name, 0.2);
    const onFinished = (e) => {
        if (e.action !== actions[name]) return;
        mixer.removeEventListener('finished', onFinished);
        oneShotPlaying = false;
        fadeToAction(currentBase, 0.25);
    };
    mixer.addEventListener('finished', onFinished);
}

function playAnimation(name) {
    if (!actions[name]) return;
    if (loopingStates.includes(name)) {
        currentBase = name;
        fadeToAction(name, 0.3);
    } else {
        playOneShot(name);
    }
}

function cycleAnimation() {
    const name = clickCycle[clickIndex % clickCycle.length];
    clickIndex++;
    playAnimation(name);
}
// Loading the model
const loaderEl = document.getElementById('loader');
const progressBar = document.querySelector('.loader-progressBar');
const percentEl = document.querySelector('.loader-percentage');

const manager = new THREE.LoadingManager();
manager.onProgress = (_url, loaded, total) => {
    const pct = total ? Math.round((loaded / total) * 100) : 0;
    progressBar.style.width = pct + '%';
    percentEl.textContent = pct + '%';
};
manager.onLoad = () => {
    progressBar.style.width = '100%';
    percentEl.textContent = '100%';
    setTimeout(() => loaderEl.remove(), 350);
};

const gltfLoader = new GLTFLoader(manager);
gltfLoader.load('/models/RobotExpressive.glb', (gltf) => {
    robot = gltf.scene;
    robot.position.set(-5, 0, 0);
    robot.rotation.y = targetYaw; // face the pyramid (+X)
    robot.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
        }
    });
    scene.add(robot);

    // kinematic capsule body so the robot collides with the ground/blocks
    robotBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(-5, CAP_OFFSET, 0)
    );
    robotCollider = world.createCollider(
        RAPIER.ColliderDesc.capsule(CAP_HALF, CAP_RADIUS),
        robotBody
    );
    charCtrl = world.createCharacterController(0.01);
    charCtrl.enableAutostep(0.5, 0.2, true);
    charCtrl.enableSnapToGround(0.5);
    charCtrl.setApplyImpulsesToDynamicBodies(true); // let the robot shove blocks

    mixer = new THREE.AnimationMixer(robot);
    gltf.animations.forEach((clip) => {
        const action = mixer.clipAction(clip);
        if (oneShotClips.includes(clip.name)) {
            action.loop = THREE.LoopOnce;
            action.clampWhenFinished = true;
        }
        actions[clip.name] = action;
    });

    fadeToAction('Idle', 0);

    buildGUI(gltf.animations.map((c) => c.name));
});

// Ray-caster / input
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPoint = new THREE.Vector3();
const handPos = new THREE.Vector3();
const down = { x: 0, y: 0, t: 0 };

renderer.domElement.addEventListener('pointerdown', (e) => {
    down.x = e.clientX;
    down.y = e.clientY;
    down.t = performance.now ? performance.now() : 0;
});

renderer.domElement.addEventListener('pointerup', (e) => {
    // ignore drags (orbiting the camera) — only react to real clicks
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (moved > 6) return;

    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);

    // 1) clicked the robot -> change its animation
    if (robot) {
        const hits = raycaster.intersectObject(robot, true);
        if (hits.length) {
            cycleAnimation();
            return;
        }
    }

    // 2) clicked the ground -> robot throws a ball toward that point
    const hit = raycaster.intersectObject(ground, false);
    if (hit.length && robot) {
        groundPoint.copy(hit[0].point);
        playAnimation('Punch'); // throwing motion
        animEl.textContent = 'Punch (throw!)';

        handPos.copy(robot.position).add(new THREE.Vector3(0, 2.4, 0));
        const dir = groundPoint.clone().sub(handPos).normalize();
        handPos.add(dir.clone().multiplyScalar(1.0));
        throwBall(handPos, dir);
    }
});

// Keyboard movement
addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') {
        e.preventDefault();
        wantJump = true;
    }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

function updateRobotMovement(dt) {
    // build a camera-relative move direction on the XZ plane
    camera.getWorldDirection(camForward);
    camForward.y = 0;
    camForward.normalize();
    camRight.crossVectors(camForward, worldUp).normalize();

    moveDir.set(0, 0, 0);
    if (keys['KeyW'] || keys['ArrowUp']) moveDir.add(camForward);
    if (keys['KeyS'] || keys['ArrowDown']) moveDir.sub(camForward);
    if (keys['KeyD'] || keys['ArrowRight']) moveDir.add(camRight);
    if (keys['KeyA'] || keys['ArrowLeft']) moveDir.sub(camRight);

    const moving = moveDir.lengthSq() > 0;
    if (moving) moveDir.normalize();
    const running = keys['ShiftLeft'] || keys['ShiftRight'];
    const speed = running ? MOVE.run : MOVE.walk;

    // gravity + jump (vertical velocity, integrated through the controller)
    vY += simulation.gravity * dt;
    if (wantJump && grounded) {
        vY = MOVE.jump;
        playOneShot('Jump');
    }
    wantJump = false;

    const desired = {
        x: moveDir.x * speed * dt,
        y: vY * dt,
        z: moveDir.z * speed * dt,
    };
    charCtrl.computeColliderMovement(robotCollider, desired);
    grounded = charCtrl.computedGrounded();
    if (grounded && vY < 0) vY = 0;

    const m = charCtrl.computedMovement();
    const p = robotBody.translation();
    robotBody.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z });

    // face the direction of travel
    if (moving) targetYaw = Math.atan2(moveDir.x, moveDir.z);

    // locomotion animation (unless an emote/throw is currently playing)
    if (!oneShotPlaying) {
        const desiredAnim = moving ? (running ? 'Running' : 'Walking') : null;
        if (desiredAnim) {
            if (locoCurrent !== desiredAnim) {
                fadeToAction(desiredAnim, 0.2);
                locoCurrent = desiredAnim;
            }
        } else if (locoCurrent) {
            fadeToAction(currentBase, 0.25);
            locoCurrent = null;
        }
    }
}

// GUI
const scoreEl = document.getElementById('score');
const totalEl = document.getElementById('total');
const animEl = document.getElementById('anim');
const winEl = document.getElementById('win');

let debugLines = null;

function buildGUI(animationNames) {
    const gui = new GUI({ title: 'Controls' });

    const game = gui.addFolder('Mini-game');
    game.add({ reset: resetGame }, 'reset').name('🔄 Reset blocks');
    game.add(simulation, 'throwPower', 8, 45, 1).name('Throw power');

    const phys = gui.addFolder('Physics');
    phys.add(simulation, 'speed', 0, 2, 0.05).name('Sim speed');
    phys.add(simulation, 'gravity', -40, 0, 1).name('Gravity Y')
        .onChange((v) => world.gravity.y = v);
    phys.add(simulation, 'debug').name('Show colliders')
        .onChange((v) => { if (debugLines) debugLines.visible = v; });

    const char = gui.addFolder('Character');
    const api = { play: 'Idle' };
    char.add(api, 'play', animationNames).name('Play animation')
        .onChange((name) => playAnimation(name));
    char.close();
}

// Collider debug rendering
debugLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ vertexColors: true })
);
debugLines.frustumCulled = false;
debugLines.visible = false;
scene.add(debugLines);

function updateDebug() {
    const { vertices, colors } = world.debugRender();
    debugLines.geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    debugLines.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
}

// Score
const upVec = new THREE.Vector3();
function updateScore() {
    let downCount = 0;
    for (const b of blocks) {
        upVec.set(0, 1, 0).applyQuaternion(b.mesh.quaternion);
        if (upVec.y < 0.6 || b.mesh.position.y < 0.25) downCount++;
    }
    scoreEl.textContent = downCount;

    if (!won && blocks.length && downCount === blocks.length) {
        won = true;
        winEl.classList.add('show');
        if (mixer) playAnimation('Dance');
        animEl.textContent = 'Dance';
    }
}

// main Loop for animation and physics updates  
function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 1 / 30) * simulation.speed;

    if (mixer) mixer.update(delta);

    if (delta > 0) {
        if (charCtrl) updateRobotMovement(delta);

        world.timestep = delta;
        world.step();

        for (const b of bodies) {
            const t = b.body.translation();
            const r = b.body.rotation();
            b.mesh.position.set(t.x, t.y, t.z);
            b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        }

        if (robot && robotBody) {
            const rt = robotBody.translation();
            robot.position.set(rt.x, rt.y - CAP_OFFSET, rt.z);
            let dy = targetYaw - robot.rotation.y;
            dy = Math.atan2(Math.sin(dy), Math.cos(dy));
            robot.rotation.y += dy * Math.min(1, delta * 12);
        }
    }

    if (blocks.length) updateScore();
    if (debugLines.visible) updateDebug();

    // keep the camera loosely centred on the robot
    if (robot) {
        const follow = Math.min(1, delta * 3);
        controls.target.x += (robot.position.x - controls.target.x) * follow;
        controls.target.y += (robot.position.y + 1.5 - controls.target.y) * follow;
        controls.target.z += (robot.position.z - controls.target.z) * follow;
    }

    controls.update();
    renderer.render(scene, camera);
}

buildPyramid();
totalEl.textContent = blocks.length;
animate();
