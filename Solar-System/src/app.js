import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from 'gsap';
//TEXTURES
import GalaxyEnMapUrl from './textures/stars/8k_stars.jpg';
import SunTexture from './textures/stars/8k_sun.jpg'
import mercuryUrl from './textures/mercury/8k_mercury.jpg';
import venusSurfaceUrl from './textures/venus/8k_venus_surface.jpg';
import venusAtmosUrl from './textures/venus/4k_venus_atmosphere.jpg';
import earthDayUrl from './textures/earth/8k_earth_daymap.jpg';
import earthNightUrl from './textures/earth/8k_earth_nightmap.jpg';
import earthCloudsUrl from './textures/earth/8k_earth_clouds.jpg';
import earthNormalUrl from './textures/earth/8k_earth_normal_map.jpg';
import earthSpecUrl from './textures/earth/8k_earth_specular_map.jpg';
import marsUrl from './textures/mars/8k_mars.jpg';
import jupiterUrl from './textures/jupiter/8k_jupiter.jpg';
import saturnUrl from './textures/saturn/8k_saturn.jpg';
import saturnRingUrl from './textures/saturn/8k_saturn_ring_alpha.png';
import uranusUrl from './textures/uranus/2k_uranus.jpg';
import neptuneUrl from './textures/neptune/2k_neptune.jpg';
import moonUrl from './textures/stars/8k_moon.jpg';

//Variables
const planetsData = [
    { name: 'Mercury', size: 1.6, textureUrl: mercuryUrl, distance: 28, speed: 4.7, tilt: 0.03 },
    {
        name: 'Venus', size: 2.8, textureUrl: venusSurfaceUrl, cloudUrl: venusAtmosUrl, cloudOpacity: 0.85,
        distance: 44, speed: 3.5, tilt: 3.09
    },
    {
        name: 'Earth', size: 3.0, textureUrl: earthDayUrl, cloudUrl: earthCloudsUrl, cloudOpacity: 0.45,
        normalUrl: earthNormalUrl, specularUrl: earthSpecUrl, nightUrl: earthNightUrl,
        distance: 62, speed: 2.9, tilt: 0.41,
        moons: [{ size: 0.85, color: 0xc8c8c8, distance: 5.5, speed: 12 }]
    },
    {
        name: 'Mars', size: 2.2, textureUrl: marsUrl, distance: 82, speed: 2.4, tilt: 0.44,
        moons: [
            { size: 0.30, color: 0x8a8070, distance: 3.2, speed: 18 },
            { size: 0.25, color: 0x6a6258, distance: 4.5, speed: 14 },
        ]
    },
    {
        name: 'Jupiter', size: 8.5, textureUrl: jupiterUrl, distance: 125, speed: 1.3, tilt: 0.05,
        moons: [
            { size: 0.70, color: 0xe8d889, distance: 12.0, speed: 9.0 },
            { size: 0.60, color: 0xc8c8d8, distance: 14.5, speed: 6.5 },
            { size: 0.95, color: 0x988878, distance: 17.5, speed: 4.5 },
            { size: 0.85, color: 0x5a4a3a, distance: 21.0, speed: 3.5 },
        ]
    },
    {
        name: 'Saturn', size: 7.0, textureUrl: saturnUrl, distance: 170, speed: 0.97, tilt: 0.47,
        rings: { inner: 8, outer: 16, textureUrl: saturnRingUrl }
    },
    { name: 'Uranus', size: 5.0, textureUrl: uranusUrl, distance: 215, speed: 0.68, tilt: 1.71 },
    {
        name: 'Neptune', size: 4.8, textureUrl: neptuneUrl, distance: 255, speed: 0.54, tilt: 0.49,
        moons: [{ size: 0.7, color: 0xc8b88a, distance: 7, speed: 5 }]
    },
];
const orbitRings = [];


const canvas = document.querySelector('canvas');

// Scene
const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 20, 100);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setSize(innerWidth, innerHeight);

//OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true
controls.dampingFactor = 0.05;
controls.minDistance = 25;
controls.maxDistance = 1800;
controls.target.set(0, 0, 0);

// Loading Manager & Loader
const loaderEl = document.getElementById('loader');
const loaderFill = loaderEl.querySelector('.loader-progressBar');
const loaderPct = loaderEl.querySelector('.loader-percentage');
const manager = new THREE.LoadingManager();
manager.onProgress = (_url, loaded, total) => {
    const pct = Math.round((loaded / total) * 100);
    loaderFill.style.width = `${pct}%`;
    loaderPct.textContent = `${pct}%`;
};
controls.enabled = false;
manager.onLoad = () => {
    gsap.to(loaderEl, {
        opacity: 0, duration: 0.6, ease: 'power2.out',
        onComplete: () => loaderEl.remove(),
    });
    gsap.from(camera.position, {
        x: 0, y: 700, z: 1300,
        duration: 3.0, ease: 'power2.inOut',
        onComplete: () => { controls.enabled = true; },
    });
};

// Texture Loader
const loader = new THREE.TextureLoader(manager);
function loadTexture(url, { srgb = true } = {}) {
    const texture = loader.load(url);
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

// Groups
const solarSystem = new THREE.Group();
scene.add(solarSystem);

//Sun & Planets etx
const sun = new THREE.Mesh(
    new THREE.SphereGeometry(14, 64, 64),
    new THREE.MeshBasicMaterial({ map: loadTexture(SunTexture) })
);
const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(17, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xff9020, transparent: true, opacity: 0.18, side: THREE.BackSide })
);
solarSystem.add(sun);
sun.add(sunGlow);
const sunLight = new THREE.PointLight(0xfff4d6, 2.4, 0, 0);
solarSystem.add(sunLight);

function createPlanet(d) {
    const orbitGeo = new THREE.RingGeometry(d.distance - 0.15, d.distance + 0.15, 256);
    const orbit = new THREE.Mesh(orbitGeo, new THREE.MeshBasicMaterial({
        color: 0x6688aa, side: THREE.DoubleSide, opacity: 0.2, transparent: true,
    }));
    orbit.rotation.x = -Math.PI / 2;
    solarSystem.add(orbit);
    orbitRings.push(orbit);

    const pivot = new THREE.Object3D();
    solarSystem.add(pivot);

    // Keep MeshStandardMaterial but only safe props
    const material = new THREE.MeshStandardMaterial({
        map: loadTexture(d.textureUrl),
        roughness: d.roughness ?? 0.85,
        metalness: 0.02,
    });

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(d.size, 64, 64), material);
    mesh.position.x = d.distance;
    mesh.rotation.z = d.tilt;
    pivot.add(mesh);

    if (d.cloudUrl) {
        const cloudTex = loadTexture(d.cloudUrl);
        const cloudMesh = new THREE.Mesh(
            new THREE.SphereGeometry(d.size * 1.015, 64, 64),
            new THREE.MeshStandardMaterial({
                map: cloudTex, alphaMap: cloudTex,
                transparent: true, opacity: d.cloudOpacity ?? 0.5, depthWrite: false,
            })
        );
        mesh.add(cloudMesh);
        mesh.userData.clouds = cloudMesh;
    }

    if (d.rings) {
        const ringGeo = new THREE.RingGeometry(d.rings.inner, d.rings.outer, 128);

        // Fix UVs radially (this was the actual root cause)
        const pos = ringGeo.attributes.position;
        const uv = ringGeo.attributes.uv;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            const t = (v.length() - d.rings.inner) / (d.rings.outer - d.rings.inner);
            uv.setXY(i, t, 1);
        }
        uv.needsUpdate = true;

        const ringTex = loadTexture(d.rings.textureUrl);
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
            map: ringTex, alphaMap: ringTex,
            side: THREE.DoubleSide, transparent: true, depthWrite: false,
        }));
        ring.rotation.x = -Math.PI / 2;
        mesh.add(ring);
    }

    const moons = (d.moons || []).map(m => {
        const mp = new THREE.Object3D();
        mp.rotation.y = Math.random() * Math.PI * 2;
        mp.rotation.z = (Math.random() - 0.5) * 0.4;
        mesh.add(mp);
        const moonMesh = new THREE.Mesh(
            new THREE.SphereGeometry(m.size, 32, 32),
            new THREE.MeshStandardMaterial({ map: loadTexture(moonUrl), roughness: 0.95 })
        );
        moonMesh.position.x = m.distance;
        moonMesh.rotation.y = Math.random() * Math.PI * 2;
        mp.add(moonMesh);
        return { pivot: mp, mesh: moonMesh, speed: m.speed };
    });

    return { pivot, mesh, moons };
}
const planets = planetsData.map(d => ({ ...d, ...createPlanet(d) }));
planets.forEach(p => { p.pivot.rotation.y = Math.random() * Math.PI * 2; });

//Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.15));

// Background Texture (Stars)
const bg = loader.load(GalaxyEnMapUrl);
bg.mapping = THREE.EquirectangularReflectionMapping;
bg.colorSpace = THREE.SRGBColorSpace;
scene.background = bg;

// Resize handler
addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
});

//Loops
const clock = new THREE.Clock();
const simulation = { speed: 1.0 };

// Animate
const animateCanvas = () => {
    const delte = clock.getDelta() * simulation.speed;
    planets.forEach(p => {
        p.pivot.rotation.y += delte * p.speed * 0.05;
        p.mesh.rotation.y += delte * 0.5;
        if (p.mesh.userData.clouds) p.mesh.userData.clouds.rotation.y += delte * 0.07;
        p.moons.forEach(m => {
            m.pivot.rotation.y += delte * m.speed * 0.1;
            m.mesh.rotation.y += delte * 0.5;
        });
    });

    renderer.render(scene, camera);
    requestAnimationFrame(animateCanvas);
};
animateCanvas();