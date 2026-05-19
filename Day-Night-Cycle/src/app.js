import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from 'gsap';
import GUI from 'lil-gui';
import sunUrl from './textures/stars/8k_sun.jpg';
import moonUrl from './textures/stars/8k_moon.jpg';

const canvas = document.querySelector('canvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 20, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const loader = new THREE.TextureLoader();
const maxAniso = renderer.capabilities.getMaxAnisotropy();
function loadTex(url, { srgb = true } = {}) {
    const t = loader.load(url);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 25;
controls.maxDistance = 1800;
controls.target.set(0, 0, 0);

//Ground
const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a7d44 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Primitives
const boxMat = new THREE.MeshStandardMaterial({ color: 0xc0784a, side: THREE.FrontSide });
const box = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), boxMat);
box.position.set(-6, 2, 0);
box.castShadow = true;
box.receiveShadow = true;
scene.add(box);

const coneMat = new THREE.MeshStandardMaterial({ color: 0x2d6a2d, side: THREE.FrontSide });
const cone = new THREE.Mesh(new THREE.ConeGeometry(2, 6, 8), coneMat);
cone.position.set(5, 3, 0);
cone.castShadow = true;
cone.receiveShadow = true;
scene.add(cone);

const sphereMat = new THREE.MeshStandardMaterial({ color: 0xe0c060, side: THREE.FrontSide });
const sphere = new THREE.Mesh(new THREE.SphereGeometry(2, 32, 32), sphereMat);
sphere.position.set(0, 2, -5);
sphere.castShadow = true;
sphere.receiveShadow = true;
scene.add(sphere);

// Sun
const sun = new THREE.Mesh(
    new THREE.SphereGeometry(14, 64, 64),
    new THREE.MeshBasicMaterial({ map: loadTex(sunUrl) })
);
scene.add(sun);

// Moon
const moonMat = new THREE.MeshStandardMaterial({
    map: loadTex(moonUrl),
    roughness: 0.9,
    metalness: 0.0,
});
const moon = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 32), moonMat);
moon.castShadow = true;
moon.receiveShadow = true;
scene.add(moon);
// After moon is added to scene, add this:
const moonSelfLight = new THREE.PointLight(0xd0d8ff, 1.2, 80);
scene.add(moonSelfLight);

//Lights
const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff4d6, 1.5);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 200;
sunLight.shadow.camera.left = sunLight.shadow.camera.bottom = -30;
sunLight.shadow.camera.right = sunLight.shadow.camera.top = 30;
scene.add(sunLight);

// Moon light — dim blue-grey, only active at night
const moonLight = new THREE.DirectionalLight(0x8899bb, 0.3);
moonLight.castShadow = true;
moonLight.shadow.mapSize.width = 1024;
moonLight.shadow.mapSize.height = 1024;
moonLight.shadow.camera.near = 0.5;
moonLight.shadow.camera.far = 200;
moonLight.shadow.camera.left = moonLight.shadow.camera.bottom = -30;
moonLight.shadow.camera.right = moonLight.shadow.camera.top = 30;
scene.add(moonLight);

// ── Sky colors
const skyColors = {
    day: new THREE.Color(0x87ceeb),
    sunset: new THREE.Color(0xff7043),
    night: new THREE.Color(0x05050f),
};
scene.background = skyColors.day.clone();

// ── Cycle
const cycle = { angle: 0 };
const RADIUS = 50;

let gsapTween = gsap.to(cycle, {
    angle: Math.PI * 2,
    duration: 20,
    ease: 'none',
    repeat: -1,
    onUpdate: updateCycle,
});

function updateCycle() {
    const a = cycle.angle;

    // Sun arc
    sun.position.set(Math.cos(a) * RADIUS, Math.sin(a) * RADIUS, 0);
    sunLight.position.copy(sun.position);

    // Moon opposite
    moon.position.set(-sun.position.x, -sun.position.y, 0);
    moonLight.position.copy(moon.position);
    moonSelfLight.position.copy(moon.position); // ← add this

    const sunHeight = Math.sin(a); // -1 (below) → 1 (zenith)

    // sunLight shadow camera — make it bigger
    sunLight.shadow.camera.left = sunLight.shadow.camera.bottom = -60;
    sunLight.shadow.camera.right = sunLight.shadow.camera.top = 60;

    // moonLight shadow camera — same
    moonLight.shadow.camera.left = moonLight.shadow.camera.bottom = -60;
    moonLight.shadow.camera.right = moonLight.shadow.camera.top = 60;

    // Ambient: warm by day, cool blue-grey by night
    const nightColor = new THREE.Color(params.nightAmbientColor);
    const dayColor = new THREE.Color(params.dayAmbientColor);
    ambientLight.color.lerpColors(nightColor, dayColor, THREE.MathUtils.clamp((sunHeight + 1) / 2, 0, 1));
    ambientLight.intensity = THREE.MathUtils.mapLinear(sunHeight, -1, 1, params.nightAmbientIntensity, params.dayAmbientIntensity);

    // Sky
    if (sunHeight > 0.1) {
        scene.background.lerpColors(skyColors.sunset, skyColors.day, sunHeight);
    } else if (sunHeight > -0.1) {
        scene.background.lerpColors(skyColors.night, skyColors.sunset, (sunHeight + 0.1) / 0.2);
    } else {
        scene.background.set(skyColors.night);
    }
}

// ── GUI
const params = {
    // cycle
    cycleDuration: 20,
    cycleAngle: 0,
    pauseCycle: false,
    orbitRadius: 50,
    // sun light
    sunIntensity: 1.5,
    sunColor: '#fff4d6',
    sunShadows: true,
    // moon light
    moonIntensity: 0.3,
    moonColor: '#8899bb',
    moonShadows: true,
    // ambient
    dayAmbientColor: '#404060',
    dayAmbientIntensity: 0.5,
    nightAmbientColor: '#1a1f33',
    nightAmbientIntensity: 0.08,
    // sky
    dayColor: '#87ceeb',
    sunsetColor: '#ff7043',
    nightColor: '#05050f',
    // objects
    groundColor: '#3a7d44',
    boxColor: '#c0784a',
    coneColor: '#2d6a2d',
    sphereColor: '#e0c060',
    // shadows
    shadowMapSize: 2048,
};

const gui = new GUI({ title: 'Day / Night Cycle' });

// Cycle
const cycleFolder = gui.addFolder('Cycle');
cycleFolder.add(params, 'cycleDuration', 2, 60, 1).name('Duration (s)').onChange(v => {
    gsapTween.kill();
    gsapTween = gsap.to(cycle, {
        angle: cycle.angle + Math.PI * 2,
        duration: v,
        ease: 'none',
        repeat: -1,
        onUpdate: updateCycle,
    });
});
cycleFolder.add(params, 'pauseCycle').name('Pause').onChange(v => {
    v ? gsapTween.pause() : gsapTween.resume();
});
cycleFolder.add(cycle, 'angle', 0, Math.PI * 2, 0.01).name('Manual angle').listen().onChange(updateCycle);
cycleFolder.add(params, 'orbitRadius', 20, 120, 1).name('Orbit radius').onChange(updateCycle);

// Sun light
const sunFolder = gui.addFolder('Sun Light');
sunFolder.add(params, 'sunIntensity', 0, 5, 0.1).name('Intensity').onChange(updateCycle);
sunFolder.addColor(params, 'sunColor').name('Color').onChange(v => sunLight.color.set(v));
sunFolder.add(params, 'sunShadows').name('Cast shadows').onChange(v => { sunLight.castShadow = v; });

// Moon light
const moonFolder = gui.addFolder('Moon Light');
moonFolder.add(params, 'moonIntensity', 0, 2, 0.05).name('Intensity').onChange(updateCycle);
moonFolder.addColor(params, 'moonColor').name('Color').onChange(v => moonLight.color.set(v));
moonFolder.add(params, 'moonShadows').name('Cast shadows').onChange(v => { moonLight.castShadow = v; });

// Ambient
const ambFolder = gui.addFolder('Ambient Light');
ambFolder.addColor(params, 'dayAmbientColor').name('Day color').onChange(updateCycle);
ambFolder.add(params, 'dayAmbientIntensity', 0, 2, 0.05).name('Day intensity').onChange(updateCycle);
ambFolder.addColor(params, 'nightAmbientColor').name('Night color').onChange(updateCycle);
ambFolder.add(params, 'nightAmbientIntensity', 0, 0.5, 0.01).name('Night intensity').onChange(updateCycle);

// Sky colors
const skyFolder = gui.addFolder('Sky Colors');
skyFolder.addColor(params, 'dayColor').name('Day').onChange(v => skyColors.day.set(v));
skyFolder.addColor(params, 'sunsetColor').name('Sunset').onChange(v => skyColors.sunset.set(v));
skyFolder.addColor(params, 'nightColor').name('Night').onChange(v => skyColors.night.set(v));

// Objects
const objFolder = gui.addFolder('Objects');
objFolder.addColor(params, 'groundColor').name('Ground').onChange(v => groundMat.color.set(v));
objFolder.addColor(params, 'boxColor').name('Box').onChange(v => boxMat.color.set(v));
objFolder.addColor(params, 'coneColor').name('Cone').onChange(v => coneMat.color.set(v));
objFolder.addColor(params, 'sphereColor').name('Sphere').onChange(v => sphereMat.color.set(v));

//  Resize
addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
});

// AnimationLoop
const animateCanvas = () => {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animateCanvas);
};
animateCanvas();