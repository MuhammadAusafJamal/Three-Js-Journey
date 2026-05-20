import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('canvas');

// Scene
const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 2, 10);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setSize(innerWidth, innerHeight);

// OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 10;
controls.maxDistance = 30;
controls.target.set(0, 0, 0);

// Torus Knot as particles
const box = new THREE.TorusKnotGeometry(2, 0.5, 200, 20);
const bufferbox = new THREE.BufferGeometry();
bufferbox.setAttribute('position', box.attributes.position);

const material = new THREE.PointsMaterial({
    size: 0.05,
    color: 0xff9900,
    transparent: true,
    depthWrite: false,
});
const pointsObj = new THREE.Points(bufferbox, material);
scene.add(pointsObj);

// Firefly positions
const count = 1000;
const positions = new Float32Array(count * 3);
// Store original X and Z so bobbing only affects Y
const originalPositions = new Float32Array(count * 3);

for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const x = (Math.random() - 0.5) * 50;
    const y = Math.random() * 15;
    const z = (Math.random() - 0.5) * 50;
    positions[i3] = x;
    positions[i3 + 1] = y;
    positions[i3 + 2] = z;
    originalPositions[i3] = x;
    originalPositions[i3 + 1] = y;
    originalPositions[i3 + 2] = z;
}

const fireflyGeo = new THREE.BufferGeometry();
fireflyGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

// Firefly glow texture
function createFireflyTexture() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.15, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.2)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
}

const fireflyMat = new THREE.PointsMaterial({
    size: 0.5,
    color: 'yellow',
    map: createFireflyTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
});
const fireflies = new THREE.Points(fireflyGeo, fireflyMat);
scene.add(fireflies);

// Resize handler
addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
});

// Clock
const clock = new THREE.Clock();
const simulation = { speed: 1.0 };

// Animate
const animateCanvas = () => {
    const delta = clock.getDelta() * simulation.speed;
    const time = clock.getElapsedTime(); // updates every frame

    // Rotate torus knot particles
    pointsObj.rotation.y += delta * 0.5;
    pointsObj.rotation.x += delta * 0.2;

    // Bob fireflies up and down dynamically
    const posArray = fireflyGeo.attributes.position.array;
    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        // X and Z stay fixed, only Y bobs using sine wave
        // each firefly has a unique phase (i * 0.5) so they don't all move together
        posArray[i3 + 1] = originalPositions[i3 + 1] + Math.sin(time + i * 0.5) * 1.5;
    }
    fireflyGeo.attributes.position.needsUpdate = true;

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animateCanvas);
};
animateCanvas();