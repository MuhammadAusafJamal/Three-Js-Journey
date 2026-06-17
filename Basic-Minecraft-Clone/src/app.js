import './style.css';
import * as THREE from 'three';
import GUI from 'lil-gui';
import RAPIER from '@dimforge/rapier3d-compat';

/* ==================================================================== *
 *  Basic Minecraft Clone
 *  - Procedural voxel terrain (grass / dirt / stone / sand / water + trees)
 *  - First-person player on a Rapier kinematic capsule (gravity, jump, fly)
 *  - Place / destroy blocks (raycast), block switching (1-9 / wheel), sounds
 *  - Advanced blocks: glass, water, TNT (explodes into dynamic debris)
 *  - Day / night cycle with an orbiting sun & moon, shadows, sky colours
 *  - Perf: one InstancedMesh per block type, exposed-block culling,
 *    shared geometry / materials, colliders only on exposed solids
 * ==================================================================== */

await RAPIER.init();

/* ------------------------------------------------------------------ Core */
const canvas = document.querySelector('canvas');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(10, 20, 26);                 // overview shown behind the start menu
camera.lookAt(0, 6, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const clock = new THREE.Clock();

addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
});

/* ----------------------------------------------------- Tunable settings */
const settings = {
    gravity: -26,
    walkSpeed: 5.2,
    runSpeed: 9,
    jump: 9.2,
    reach: 6,            // how far you can interact (blocks)
    dayLength: 120,      // seconds for a full day/night cycle
    timeOfDay: 0.27,     // 0..1  (0 = midnight, 0.5 = midday)
    autoTime: true,
    fly: false,
    shadows: true,
};

/* -------------------------------------------------- Procedural textures */
// Every texture is a 16×16 pixel-art canvas → crisp, no network, Minecraft-y.
const TILE = 16;
const clamp255 = (v) => Math.max(0, Math.min(255, v | 0));

function makeCanvas(paint) {
    const c = document.createElement('canvas');
    c.width = c.height = TILE;
    paint(c.getContext('2d'));
    return c;
}
function px(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
}
// Fill the tile with a base colour plus per-pixel brightness noise.
function noisyFill(ctx, base, jitter, seed = 1) {
    let s = seed * 9301 + 49297;
    const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const col = new THREE.Color(base);
    for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
            const d = (rand() - 0.5) * jitter * 255;
            px(ctx, x, y, `rgb(${clamp255(col.r * 255 + d)},${clamp255(col.g * 255 + d)},${clamp255(col.b * 255 + d)})`);
        }
}

const tex = {
    grassTop: makeCanvas((c) => noisyFill(c, '#5fa83a', 0.18, 3)),
    dirt: makeCanvas((c) => noisyFill(c, '#7a5230', 0.22, 7)),
    grassSide: makeCanvas((c) => {
        noisyFill(c, '#7a5230', 0.22, 7);
        for (let y = 0; y < 5; y++)
            for (let x = 0; x < TILE; x++)
                px(c, x, y, (y === 4 && x % 3 === 0) ? '#4e8c2f' : '#5fa83a');
    }),
    stone: makeCanvas((c) => {
        noisyFill(c, '#8a8a8f', 0.16, 11);
        for (let i = 0; i < 14; i++) px(c, (i * 7) % 16, (i * 5) % 16, '#6f6f74');
    }),
    sand: makeCanvas((c) => noisyFill(c, '#dbcb87', 0.12, 5)),
    log: makeCanvas((c) => {
        noisyFill(c, '#6b4a2a', 0.14, 13);
        for (let y = 0; y < TILE; y++) { px(c, 3, y, '#4f361f'); px(c, 12, y, '#4f361f'); }
    }),
    logTop: makeCanvas((c) => {
        noisyFill(c, '#9c7142', 0.1, 17);
        for (let r = 2; r <= 7; r += 2)
            for (let a = 0; a < 64; a++) {
                const ang = (a / 64) * Math.PI * 2;
                px(c, 8 + Math.round(Math.cos(ang) * r), 8 + Math.round(Math.sin(ang) * r), '#6b4a2a');
            }
    }),
    leaves: makeCanvas((c) => {
        noisyFill(c, '#3f7d2e', 0.28, 19);
        for (let i = 0; i < 40; i++) px(c, (i * 11) % 16, (i * 13) % 16, '#2d5c20');
    }),
    glass: makeCanvas(() => { }),   // painted below (needs a transparent base)
    water: makeCanvas((c) => noisyFill(c, '#2f6dd0', 0.1, 23)),
    tntSide: makeCanvas((ctx) => {
        noisyFill(ctx, '#c23b2b', 0.1, 29);
        for (let x = 0; x < 16; x++) { px(ctx, x, 6, '#f2ede0'); px(ctx, x, 9, '#f2ede0'); }
        ctx.fillStyle = '#1b1b1b';
        ctx.font = 'bold 6px monospace';
        ctx.fillText('TNT', 1, 8.5);
    }),
    tntTop: makeCanvas((c) => noisyFill(c, '#3a3a3a', 0.12, 31)),
};
// glass needs a transparent base, so paint it directly on its context
{
    const ctx = tex.glass.getContext('2d');
    ctx.clearRect(0, 0, 16, 16);
    ctx.strokeStyle = 'rgba(220,240,255,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, 15, 15);
    ctx.strokeStyle = 'rgba(220,240,255,0.45)';
    ctx.beginPath(); ctx.moveTo(2, 13); ctx.lineTo(7, 2); ctx.stroke();
}

const maxAniso = renderer.capabilities.getMaxAnisotropy();
function toTexture(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;     // crisp pixels
    t.minFilter = THREE.NearestMipmapNearestFilter;
    t.anisotropy = maxAniso;
    return t;
}
const T = Object.fromEntries(Object.entries(tex).map(([k, v]) => [k, toTexture(v)]));

/* ---------------------------------------------------- Block definitions */
// material order for a BoxGeometry: +X, -X, +Y(top), -Y(bottom), +Z, -Z
const mat = (map, opts = {}) => new THREE.MeshLambertMaterial({ map, ...opts });
const sixSame = (map, opts) => { const m = mat(map, opts); return [m, m, m, m, m, m]; };

const grassMats = (() => { const s = mat(T.grassSide); return [s, s, mat(T.grassTop), mat(T.dirt), s, s]; })();
const logMats = (() => { const s = mat(T.log), cap = mat(T.logTop); return [s, s, cap, cap, s, s]; })();
const tntMats = (() => { const s = mat(T.tntSide), cap = mat(T.tntTop); return [s, s, cap, cap, s, s]; })();

// type → { materials, solid, transparent }
const BLOCKS = {
    grass: { mats: grassMats, solid: true, icon: tex.grassTop },
    dirt: { mats: sixSame(T.dirt), solid: true, icon: tex.dirt },
    stone: { mats: sixSame(T.stone), solid: true, icon: tex.stone },
    sand: { mats: sixSame(T.sand), solid: true, icon: tex.sand },
    log: { mats: logMats, solid: true, icon: tex.log },
    leaves: { mats: sixSame(T.leaves, { transparent: true, alphaTest: 0.1 }), solid: true, transparent: true, icon: tex.leaves },
    glass: { mats: sixSame(T.glass, { transparent: true, opacity: 0.55, depthWrite: false }), solid: true, transparent: true, icon: tex.glass },
    water: { mats: sixSame(T.water, { transparent: true, opacity: 0.62, depthWrite: false }), solid: false, transparent: true, icon: tex.water },
    tnt: { mats: tntMats, solid: true, icon: tex.tntSide },
};
const TYPES = Object.keys(BLOCKS);
const HOTBAR = ['grass', 'dirt', 'stone', 'sand', 'log', 'leaves', 'glass', 'water', 'tnt'];

/* ------------------------------------------------- InstancedMesh per type */
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const dummy = new THREE.Object3D();
const tmpMat = new THREE.Matrix4();
const CAPACITY = 9000;

class InstancedField {
    constructor(type) {
        const def = BLOCKS[type];
        this.type = type;
        this.mesh = new THREE.InstancedMesh(boxGeo, def.mats, CAPACITY);
        this.mesh.count = 0;
        this.mesh.castShadow = !def.transparent;
        this.mesh.receiveShadow = true;
        this.mesh.frustumCulled = false;            // we manage visibility ourselves
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.keys = [];                              // instanceIndex → block key
        scene.add(this.mesh);
    }
    add(k, x, y, z) {
        if (this.mesh.count >= CAPACITY) return -1;
        const i = this.mesh.count++;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(i, dummy.matrix);
        this.keys[i] = k;
        this.mesh.instanceMatrix.needsUpdate = true;
        return i;
    }
    remove(i) {
        const last = --this.mesh.count;
        if (i !== last) {                            // swap the last instance into the hole
            this.mesh.getMatrixAt(last, tmpMat);
            this.mesh.setMatrixAt(i, tmpMat);
            const movedKey = this.keys[last];
            this.keys[i] = movedKey;
            const rec = world.get(movedKey);
            if (rec) rec.index = i;
        }
        this.keys.length = this.mesh.count;
        this.mesh.instanceMatrix.needsUpdate = true;
    }
}
const fields = Object.fromEntries(TYPES.map((t) => [t, new InstancedField(t)]));

/* ------------------------------------------------------ Voxel world data */
// world: Map "x,y,z" → { type, index, collider }
//   index    = InstancedMesh slot, or -1 if currently culled (buried)
//   collider = Rapier collider, or null
const world = new Map();
const key = (x, y, z) => `${x},${y},${z}`;
const parseKey = (k) => k.split(',').map(Number);

const physics = new RAPIER.World({ x: 0, y: settings.gravity, z: 0 });
const terrainBody = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());

const isSolidType = (t) => BLOCKS[t].solid;
const isOpaqueType = (t) => !BLOCKS[t].transparent && t !== 'water';

function opaqueAt(x, y, z) {
    const r = world.get(key(x, y, z));
    return !!r && isOpaqueType(r.type);
}
// A block is hidden only when every one of its 6 neighbours is opaque.
const NEIGHBORS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
function isCovered(x, y, z) {
    for (const [dx, dy, dz] of NEIGHBORS)
        if (!opaqueAt(x + dx, y + dy, z + dz)) return false;
    return true;
}

const addCollider = (x, y, z) => physics.createCollider(
    RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setTranslation(x, y, z).setFriction(1),
    terrainBody
);

// Reconcile a block's render slot + collider with whether it is exposed.
function refreshBlock(k) {
    const rec = world.get(k);
    if (!rec) return;
    const [x, y, z] = parseKey(k);
    const covered = isCovered(x, y, z);
    const field = fields[rec.type];

    if (covered && rec.index !== -1) {
        field.remove(rec.index);
        rec.index = -1;
    } else if (!covered && rec.index === -1) {
        rec.index = field.add(k, x, y, z);
    }
    const wantCollider = !covered && isSolidType(rec.type);
    if (wantCollider && !rec.collider) {
        rec.collider = addCollider(x, y, z);
    } else if (!wantCollider && rec.collider) {
        physics.removeCollider(rec.collider, false);
        rec.collider = null;
    }
}

function setBlock(x, y, z, type) {
    const k = key(x, y, z);
    if (world.has(k)) return;
    world.set(k, { type, index: -1, collider: null });
    refreshBlock(k);
    for (const [dx, dy, dz] of NEIGHBORS) refreshBlock(key(x + dx, y + dy, z + dz));
    blockCountDirty = true;
}

function removeBlock(x, y, z) {
    const k = key(x, y, z);
    const rec = world.get(k);
    if (!rec) return null;
    if (rec.index !== -1) fields[rec.type].remove(rec.index);
    if (rec.collider) physics.removeCollider(rec.collider, false);
    world.delete(k);
    for (const [dx, dy, dz] of NEIGHBORS) refreshBlock(key(x + dx, y + dy, z + dz));
    blockCountDirty = true;
    return rec.type;
}

/* -------------------------------------------------- Procedural terrain gen */
function makeNoise(seed) {
    const hash = (x, z) => {
        let h = (x * 374761393 + z * 668265263 + seed * 69069) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    };
    const smooth = (t) => t * t * (3 - 2 * t);
    const base = (x, z) => {
        const x0 = Math.floor(x), z0 = Math.floor(z);
        const tx = smooth(x - x0), tz = smooth(z - z0);
        const a = hash(x0, z0), b = hash(x0 + 1, z0), c = hash(x0, z0 + 1), d = hash(x0 + 1, z0 + 1);
        return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), tz);
    };
    return (x, z) => {                              // fractal: 4 octaves
        let v = 0, amp = 1, freq = 1, sum = 0;
        for (let o = 0; o < 4; o++) { v += base(x * freq, z * freq) * amp; sum += amp; amp *= 0.5; freq *= 2; }
        return v / sum;
    };
}

const HALF = 24;                  // world spans -HALF .. HALF-1  (48×48)
const WATER_LEVEL = 2;
let seedCounter = 1337;

function generateWorld() {
    // wipe any previous world
    for (const k of [...world.keys()]) {
        const rec = world.get(k);
        if (rec.index !== -1) fields[rec.type].remove(rec.index);
        if (rec.collider) physics.removeCollider(rec.collider, false);
    }
    world.clear();

    const noise = makeNoise(seedCounter);
    const noise2 = makeNoise(seedCounter + 99);
    const SCALE = 0.07, AMP = 9;
    const treeAt = (x, z) => noise2(x * 1.7 + 11.3, z * 1.7 + 7.1) > 0.82;

    const heights = new Map();
    for (let x = -HALF; x < HALF; x++)
        for (let z = -HALF; z < HALF; z++)
            heights.set(`${x},${z}`, Math.floor(noise(x * SCALE, z * SCALE) * AMP));

    // 1) fill columns (batch — refresh once at the end)
    for (let x = -HALF; x < HALF; x++) {
        for (let z = -HALF; z < HALF; z++) {
            const h = heights.get(`${x},${z}`);
            const beach = h <= WATER_LEVEL + 1;
            for (let y = 0; y <= h; y++) {
                let type;
                if (y === h) type = beach ? 'sand' : 'grass';
                else if (y >= h - 2) type = beach ? 'sand' : 'dirt';
                else type = 'stone';
                world.set(key(x, y, z), { type, index: -1, collider: null });
            }
            for (let y = h + 1; y <= WATER_LEVEL; y++)   // water fills low columns
                world.set(key(x, y, z), { type: 'water', index: -1, collider: null });

            if (!beach && h > WATER_LEVEL && Math.abs(x) < HALF - 3 && Math.abs(z) < HALF - 3 && treeAt(x, z)) {
                const trunk = 4 + Math.floor(noise2(x, z) * 3);
                for (let t = 1; t <= trunk; t++) world.set(key(x, h + t, z), { type: 'log', index: -1, collider: null });
                const top = h + trunk;
                for (let lx = -2; lx <= 2; lx++)
                    for (let lz = -2; lz <= 2; lz++)
                        for (let ly = 0; ly <= 2; ly++) {
                            if (Math.abs(lx) === 2 && Math.abs(lz) === 2 && ly !== 0) continue;
                            const kk = key(x + lx, top - 1 + ly, z + lz);
                            if (!world.has(kk)) world.set(kk, { type: 'leaves', index: -1, collider: null });
                        }
            }
        }
    }

    // 2) build render slots + colliders for exposed blocks only
    for (const k of world.keys()) refreshBlock(k);
    blockCountDirty = true;
}

/* ------------------------------------------------------------- The player */
const CAP_HALF = 0.6, CAP_RADIUS = 0.3;
const CAP_OFFSET = CAP_HALF + CAP_RADIUS;       // feet → capsule centre
const spawnX = 0, spawnZ = 0;

function highestAt(x, z) {
    for (let yy = 40; yy >= 0; yy--) {
        const r = world.get(key(x, yy, z));
        if (r && isSolidType(r.type)) return yy;
    }
    return 0;
}

const playerBody = physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
const playerCollider = physics.createCollider(RAPIER.ColliderDesc.capsule(CAP_HALF, CAP_RADIUS), playerBody);
const charCtrl = physics.createCharacterController(0.02);
charCtrl.enableAutostep(0.6, 0.25, true);
charCtrl.enableSnapToGround(0.5);
charCtrl.setApplyImpulsesToDynamicBodies(true);
charCtrl.setSlideEnabled(true);

let vY = 0;
function spawnPlayer() {
    const y = highestAt(spawnX, spawnZ) + 1 + CAP_OFFSET;
    playerBody.setTranslation({ x: spawnX, y, z: spawnZ }, true);
    playerBody.setNextKinematicTranslation({ x: spawnX, y, z: spawnZ });
    vY = 0;
}

/* ---------------------------------------------------- Controls & movement */
const keys = Object.create(null);
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);
const moveDir = new THREE.Vector3();
const camDir = new THREE.Vector3();
let grounded = false;

// first-person look + manual pointer lock
let yaw = 0, pitch = 0;

const controls = {
    isLocked: false,
    lock() { renderer.domElement.requestPointerLock(); },
};
document.addEventListener('pointerlockchange', () => {
    controls.isLocked = document.pointerLockElement === renderer.domElement;
    const ov = document.getElementById('overlay');
    if (controls.isLocked) { ov.classList.add('hidden'); document.body.classList.add('playing'); sound.resume(); }
    else { ov.classList.remove('hidden'); document.body.classList.remove('playing'); }
});
document.addEventListener('mousemove', (e) => {
    if (!controls.isLocked) return;
    yaw -= e.movementX * 0.0025;
    pitch = THREE.MathUtils.clamp(pitch + e.movementY * 0.0025, -1.5, 1.5);
});

addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'KeyF') { settings.fly = !settings.fly; vY = 0; }
    if (e.code.startsWith('Digit')) {
        const n = +e.code.slice(5) - 1;
        if (n >= 0 && n < HOTBAR.length) selectSlot(n);
    }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

function updatePlayer(dt) {
    // movement is relative to where the camera looks (horizontal yaw only)
    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
    right.crossVectors(forward, worldUp).normalize();

    moveDir.set(0, 0, 0);
    if (keys['KeyW']) moveDir.add(forward);
    if (keys['KeyS']) moveDir.sub(forward);
    if (keys['KeyD']) moveDir.add(right);
    if (keys['KeyA']) moveDir.sub(right);
    const moving = moveDir.lengthSq() > 0;
    if (moving) moveDir.normalize();

    const running = keys['ShiftLeft'] || keys['ShiftRight'];
    const speed = (running ? settings.runSpeed : settings.walkSpeed) * (settings.fly ? 1.6 : 1);

    let desired;
    if (settings.fly) {
        let up = 0;
        if (keys['Space']) up += 1;
        if (keys['ControlLeft'] || keys['ControlRight']) up -= 1;
        desired = { x: moveDir.x * speed * dt, y: up * speed * dt, z: moveDir.z * speed * dt };
    } else {
        vY += settings.gravity * dt;
        if (keys['Space'] && grounded) vY = settings.jump;
        desired = { x: moveDir.x * speed * dt, y: vY * dt, z: moveDir.z * speed * dt };
    }

    charCtrl.computeColliderMovement(playerCollider, desired);
    grounded = charCtrl.computedGrounded();
    if (!settings.fly && grounded && vY < 0) vY = 0;

    const m = charCtrl.computedMovement();
    const p = playerBody.translation();
    const np = { x: p.x + m.x, y: p.y + m.y, z: p.z + m.z };
    playerBody.setNextKinematicTranslation(np);
    if (np.y < -20) { spawnPlayer(); return; }      // fell off the world

    updateCamera(np);
}

// first-person camera: sit at the player's eyes and look along yaw / pitch
const EYE_HEIGHT = 0.6;                              // above the capsule centre
function updateCamera(np) {
    camera.position.set(np.x, np.y + EYE_HEIGHT, np.z);
    const cp = Math.cos(pitch);
    camDir.set(-Math.sin(yaw) * cp, -Math.sin(pitch), -Math.cos(yaw) * cp);
    camera.lookAt(
        camera.position.x + camDir.x,
        camera.position.y + camDir.y,
        camera.position.z + camDir.z,
    );
}

/* ----------------------------------------------- Block targeting / editing */
const raycaster = new THREE.Raycaster();
raycaster.far = settings.reach;
const centre = new THREE.Vector2(0, 0);
const fieldMeshes = TYPES.map((t) => fields[t].mesh);

const highlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 })
);
highlight.visible = false;
scene.add(highlight);

// returns { x,y,z, type, nx,ny,nz } of the targeted block, or null
function getTarget() {
    raycaster.setFromCamera(centre, camera);         // crosshair ray from the eye
    raycaster.far = settings.reach;
    const hit = raycaster.intersectObjects(fieldMeshes, false)[0];
    if (!hit) return null;
    const type = TYPES.find((t) => fields[t].mesh === hit.object);
    const k = fields[type].keys[hit.instanceId];
    if (k === undefined) return null;
    const [x, y, z] = parseKey(k);
    const p = playerBody.translation();              // keep interaction within the player's reach
    if (Math.hypot(x - p.x, y - p.y, z - p.z) > settings.reach + 1.5) return null;
    const n = hit.face.normal;                       // axis-aligned (blocks aren't rotated)
    return { x, y, z, type, nx: Math.round(n.x), ny: Math.round(n.y), nz: Math.round(n.z) };
}

// don't let the player seal themselves inside a block
function intersectsPlayer(x, y, z) {
    const p = playerBody.translation();
    if (Math.round(p.x) !== x || Math.round(p.z) !== z) return false;
    const feetY = p.y - CAP_OFFSET;
    return y >= Math.floor(feetY - 0.1) && y <= Math.round(feetY + 2 * CAP_OFFSET);
}

function onBreak() {
    const t = getTarget();
    if (!t) return;
    if (t.type === 'tnt') { explode(t.x, t.y, t.z); return; }
    const removed = removeBlock(t.x, t.y, t.z);
    if (removed) sound.dig(removed);
}

function onPlace() {
    const t = getTarget();
    if (!t) return;
    const x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
    if (world.has(key(x, y, z)) || intersectsPlayer(x, y, z)) return;
    setBlock(x, y, z, HOTBAR[selected]);
    sound.place(HOTBAR[selected]);
}

renderer.domElement.addEventListener('mousedown', (e) => {
    if (!controls.isLocked) return;
    if (e.button === 0) onBreak();
    else if (e.button === 2) onPlace();
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

/* ------------------------------------------------- TNT + debris physics */
const debris = [];                  // { mesh, body, life }
const debrisGeo = new THREE.BoxGeometry(0.45, 0.45, 0.45);
const flash = new THREE.PointLight('#ffd089', 0, 18, 2);
scene.add(flash);
let flashTime = 0;

function spawnDebris(x, y, z, type) {
    const mesh = new THREE.Mesh(debrisGeo, BLOCKS[type].mats);
    mesh.castShadow = true;
    mesh.position.set(x, y, z);
    scene.add(mesh);
    const body = physics.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z));
    physics.createCollider(RAPIER.ColliderDesc.cuboid(0.22, 0.22, 0.22).setRestitution(0.2).setDensity(2), body);
    const blast = 9 + Math.random() * 6;
    body.setLinvel({ x: (Math.random() - 0.5) * blast, y: blast * 0.7 + Math.random() * 4, z: (Math.random() - 0.5) * blast }, true);
    body.setAngvel({ x: Math.random() * 6, y: Math.random() * 6, z: Math.random() * 6 }, true);
    debris.push({ mesh, body, life: 5 });
}

function explode(cx, cy, cz) {
    sound.explosion();
    flash.position.set(cx, cy + 1, cz);
    flash.intensity = 40;
    flashTime = 0.35;

    const R = 3;
    const found = [];
    for (let x = cx - R; x <= cx + R; x++)
        for (let y = cy - R; y <= cy + R; y++)
            for (let z = cz - R; z <= cz + R; z++) {
                const d = Math.hypot(x - cx, y - cy, z - cz);
                if (d > R + 0.3) continue;
                const rec = world.get(key(x, y, z));
                if (rec && rec.type !== 'water') found.push({ x, y, z, d });
            }
    const chain = [];
    for (const b of found) {
        const type = removeBlock(b.x, b.y, b.z);
        if (type === 'tnt' && !(b.x === cx && b.y === cy && b.z === cz)) chain.push(b);
        else if (type && b.d < R && Math.random() < 0.4) spawnDebris(b.x, b.y, b.z, type);
    }
    chain.forEach((b) => explode(b.x, b.y, b.z));
}

function updateDebris(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i];
        d.life -= dt;
        const t = d.body.translation(), r = d.body.rotation();
        d.mesh.position.set(t.x, t.y, t.z);
        d.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        if (d.life <= 0 || t.y < -25) {
            scene.remove(d.mesh);
            physics.removeRigidBody(d.body);
            debris.splice(i, 1);
        }
    }
    if (flashTime > 0) {
        flashTime -= dt;
        flash.intensity = Math.max(0, flash.intensity - dt * 140);
    }
}

/* ------------------------------------------------------------ Procedural SFX */
const sound = (() => {
    let ctx = null;
    const ensure = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());
    let noiseBuf = null;
    const noise = () => {
        if (!noiseBuf) {
            noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
            const d = noiseBuf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        const s = ctx.createBufferSource(); s.buffer = noiseBuf; return s;
    };
    const burst = (dur, freq, q, gain, type = 'bandpass') => {
        const src = noise(), filt = ctx.createBiquadFilter(), g = ctx.createGain();
        const now = ctx.currentTime;
        filt.type = type; filt.frequency.value = freq; filt.Q.value = q;
        g.gain.setValueAtTime(gain, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + dur);
        src.connect(filt); filt.connect(g); g.connect(ctx.destination);
        src.start(now); src.stop(now + dur);
    };
    const tone = (f0, f1, dur, gain) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        const now = ctx.currentTime;
        o.frequency.setValueAtTime(f0, now);
        o.frequency.exponentialRampToValueAtTime(f1, now + dur);
        g.gain.setValueAtTime(gain, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(now); o.stop(now + dur);
    };
    const pitch = (type) => ({ stone: 700, glass: 2200, sand: 500, water: 350, leaves: 1200, log: 600 }[type] || 900);
    return {
        resume() { ensure(); if (ctx.state === 'suspended') ctx.resume(); },
        dig(type) { ensure(); burst(0.16, pitch(type), 2, 0.5); },
        place(type) { ensure(); burst(0.12, pitch(type) * 0.7, 1.5, 0.45); },
        explosion() { ensure(); burst(0.7, 220, 0.6, 0.9, 'lowpass'); tone(160, 40, 0.6, 0.6); },
    };
})();

/* --------------------------------------------------- Block selection */
// The on-screen hotbar bar was removed; blocks are still chosen with the
// number keys 1–9 and the scroll wheel.
let selected = 0;
const selectSlot = (i) => { selected = i; };

addEventListener('wheel', (e) => {
    if (!controls.isLocked) return;
    selectSlot((selected + (e.deltaY > 0 ? 1 : -1) + HOTBAR.length) % HOTBAR.length);
}, { passive: true });

/* --------------------------------------------------- Day / night & lights */
scene.fog = new THREE.Fog('#bfe3ff', 35, 95);

const hemi = new THREE.HemisphereLight('#bfe3ff', '#4a5a3a', 0.6);
scene.add(hemi);
const ambient = new THREE.AmbientLight('#ffffff', 0.25);
scene.add(ambient);

const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 160;
const SH = 38;
sun.shadow.camera.left = -SH; sun.shadow.camera.right = SH;
sun.shadow.camera.top = SH; sun.shadow.camera.bottom = -SH;
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

const moon = new THREE.DirectionalLight('#9db4ff', 0);
scene.add(moon, moon.target);

const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(6, 32), new THREE.MeshBasicMaterial({ color: '#fff1c2', fog: false }));
const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(4, 32), new THREE.MeshBasicMaterial({ color: '#dfe7ff', fog: false }));
scene.add(sunDisc, moonDisc);

const stars = (() => {
    const N = 800, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(200);
        if (v.y < 0) v.y = -v.y;
        pos.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: '#fff', size: 1.4, sizeAttenuation: false, transparent: true, fog: false }));
})();
scene.add(stars);

const C = {
    daySky: new THREE.Color('#8ec5ff'), nightSky: new THREE.Color('#0a0e1c'), duskSky: new THREE.Color('#ff8a4a'),
    dayFog: new THREE.Color('#bfe3ff'), nightFog: new THREE.Color('#0a0e1c'),
    dayHemi: new THREE.Color('#bfe3ff'), nightHemi: new THREE.Color('#1a2138'),
};
const skyColor = new THREE.Color('#8ec5ff');
scene.background = skyColor;
const ORBIT = 110;

function updateSky(dt) {
    if (settings.autoTime) settings.timeOfDay = (settings.timeOfDay + dt / settings.dayLength) % 1;
    const t = settings.timeOfDay;
    const ang = t * Math.PI * 2 - Math.PI / 2;     // t=0.5 → sun overhead
    const sunY = Math.sin(ang);
    const cx = camera.position.x, cz = camera.position.z;

    sun.position.set(cx + Math.cos(ang) * ORBIT, sunY * ORBIT, cz + Math.sin(ang) * ORBIT * 0.35);
    sun.target.position.set(cx, 0, cz);
    moon.position.set(cx - Math.cos(ang) * ORBIT, -sunY * ORBIT, cz - Math.sin(ang) * ORBIT * 0.35);
    moon.target.position.set(cx, 0, cz);

    sunDisc.position.copy(sun.position).sub(camera.position).multiplyScalar(1.5).add(camera.position);
    sunDisc.lookAt(camera.position);
    moonDisc.position.copy(moon.position).sub(camera.position).multiplyScalar(1.7).add(camera.position);
    moonDisc.lookAt(camera.position);
    stars.position.copy(camera.position);

    const day = THREE.MathUtils.clamp(sunY * 1.6 + 0.35, 0, 1);
    const horizon = THREE.MathUtils.clamp(1 - Math.abs(sunY) * 4, 0, 1);  // peaks at sunrise/set

    sun.intensity = day * 2.6;
    sun.castShadow = settings.shadows && day > 0.05;
    moon.intensity = (1 - day) * 0.5;
    hemi.intensity = 0.25 + day * 0.55;
    ambient.intensity = 0.18 + day * 0.22;

    skyColor.copy(C.nightSky).lerp(C.daySky, day).lerp(C.duskSky, horizon * 0.5);
    scene.fog.color.copy(C.nightFog).lerp(C.dayFog, day).lerp(C.duskSky, horizon * 0.4);
    hemi.color.copy(C.nightHemi).lerp(C.dayHemi, day);

    sunDisc.visible = sunY > -0.15;
    moonDisc.visible = sunY < 0.15;
    stars.material.opacity = THREE.MathUtils.clamp(1 - day * 1.5, 0, 1);

    const hh = Math.floor(t * 24) % 24, mm = Math.floor(t * 24 * 60) % 60;
    clockTimeEl.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    clockIconEl.textContent = day > 0.25 ? '☀️' : (day > 0.05 ? '🌅' : '🌙');
}

/* ------------------------------------------------------------------ HUD refs */
const clockTimeEl = document.getElementById('clock-time');
const clockIconEl = document.getElementById('clock-icon');
const fpsEl = document.getElementById('fps');
const blockCountEl = document.getElementById('blockcount');
let blockCountDirty = true;

/* ------------------------------------------------------------- GUI panel */
function buildGUI() {
    const gui = new GUI({ title: 'World' });
    gui.close();

    const time = gui.addFolder('Day / Night');
    time.add(settings, 'autoTime').name('Auto cycle');
    time.add(settings, 'timeOfDay', 0, 1, 0.001).name('Time of day').listen();
    time.add(settings, 'dayLength', 20, 600, 5).name('Day length (s)');
    time.add(settings, 'shadows').name('Shadows').onChange((v) => { renderer.shadowMap.enabled = v; });

    const move = gui.addFolder('Player');
    move.add(settings, 'walkSpeed', 2, 12, 0.1).name('Walk speed');
    move.add(settings, 'runSpeed', 4, 18, 0.1).name('Run speed');
    move.add(settings, 'jump', 4, 16, 0.1).name('Jump');
    move.add(settings, 'fly').name('Fly mode').listen();
    move.add(settings, 'gravity', -40, -5, 1).name('Gravity').onChange((v) => physics.gravity.y = v);

    gui.add({ regen: () => { seedCounter = (seedCounter * 1103515245 + 12345) >>> 0; generateWorld(); spawnPlayer(); } }, 'regen').name('🌱 New world');
}

/* ------------------------------------------------ Start / pause overlay */
// (the overlay + play state is driven by the 'pointerlockchange' handler above)
document.getElementById('play').addEventListener('click', () => controls.lock());

/* ----------------------------------------------------------- Build & run */
const loaderEl = document.getElementById('loader');
const progressBar = document.querySelector('.loader-progressBar');

progressBar.style.width = '40%';
generateWorld();
progressBar.style.width = '80%';
spawnPlayer();
buildGUI();
progressBar.style.width = '100%';
setTimeout(() => {
    loaderEl.classList.add('hidden');
    loaderEl.addEventListener('transitionend', () => loaderEl.remove(), { once: true });
}, 350);

/* ------------------------------------------------------------- Main loop */
let fpsAccum = 0, fpsFrames = 0;

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 1 / 20);

    if (controls.isLocked && dt > 0) {
        updatePlayer(dt);
        physics.timestep = dt;
        physics.step();
        updateDebris(dt);
    }

    updateSky(dt);

    if (controls.isLocked) {
        const t = getTarget();
        if (t) { highlight.position.set(t.x, t.y, t.z); highlight.visible = true; }
        else highlight.visible = false;
    } else highlight.visible = false;

    fpsAccum += dt; fpsFrames++;
    if (fpsAccum >= 0.5) {
        fpsEl.textContent = Math.round(fpsFrames / fpsAccum);
        fpsAccum = 0; fpsFrames = 0;
    }
    if (blockCountDirty) { blockCountEl.textContent = world.size; blockCountDirty = false; }

    renderer.render(scene, camera);
}
animate();
