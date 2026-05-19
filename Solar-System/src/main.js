import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { gsap } from 'gsap';
import GUI from 'lil-gui';

// ====================== Texture imports ======================
import sunUrl          from './textures/stars/8k_sun.jpg';
import milkyWayUrl     from './textures/stars/8k_stars_milky_way.jpg';
import mercuryUrl      from './textures/mercury/8k_mercury.jpg';
import venusSurfaceUrl from './textures/venus/8k_venus_surface.jpg';
import venusAtmosUrl   from './textures/venus/4k_venus_atmosphere.jpg';
import earthDayUrl     from './textures/earth/8k_earth_daymap.jpg';
import earthNightUrl   from './textures/earth/8k_earth_nightmap.jpg';
import earthCloudsUrl  from './textures/earth/8k_earth_clouds.jpg';
import earthNormalUrl  from './textures/earth/8k_earth_normal_map.jpg';
import earthSpecUrl    from './textures/earth/8k_earth_specular_map.jpg';
import marsUrl         from './textures/mars/8k_mars.jpg';
import jupiterUrl      from './textures/jupiter/8k_jupiter.jpg';
import saturnUrl       from './textures/saturn/8k_saturn.jpg';
import saturnRingUrl   from './textures/saturn/8k_saturn_ring_alpha.png';
import uranusUrl       from './textures/uranus/2k_uranus.jpg';
import neptuneUrl      from './textures/neptune/2k_neptune.jpg';
import moonUrl         from './textures/stars/8k_moon.jpg';

// ====================== Renderer / Scene ======================
const canvas = document.querySelector('canvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 12000);
camera.position.set(0, 220, 480);

const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// CSS2D label overlay
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
document.body.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 25;
controls.maxDistance = 1800;
controls.target.set(0, 0, 0);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

// ====================== Loading manager ======================
const loaderEl = document.getElementById('loader');
const loaderFill = loaderEl.querySelector('.loader-fill');
const loaderPct = loaderEl.querySelector('.loader-pct');

const manager = new THREE.LoadingManager();
manager.onProgress = (_url, loaded, total) => {
  const pct = Math.round((loaded / total) * 100);
  loaderFill.style.width = `${pct}%`;
  loaderPct.textContent = `${pct}%`;
};

const loader = new THREE.TextureLoader(manager);
const maxAniso = renderer.capabilities.getMaxAnisotropy();

function loadTex(url, { srgb = true } = {}) {
  const t = loader.load(url);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

// Milky Way background
const bg = loader.load(milkyWayUrl);
bg.mapping = THREE.EquirectangularReflectionMapping;
bg.colorSpace = THREE.SRGBColorSpace;
scene.background = bg;
scene.environment = bg;

// Shared moon texture
const moonTex = loadTex(moonUrl);

// ====================== Solar system & galaxy groups ======================
const solarSystem = new THREE.Group();
scene.add(solarSystem);

const galaxy = new THREE.Group();
galaxy.visible = false;
scene.add(galaxy);

// ====================== Lighting ======================
scene.add(new THREE.AmbientLight(0xffffff, 0.15));
const sunLight = new THREE.PointLight(0xfff4d6, 2.4, 0, 0);
solarSystem.add(sunLight);

// ====================== Sun ======================
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(14, 64, 64),
  new THREE.MeshBasicMaterial({ map: loadTex(sunUrl) })
);
solarSystem.add(sun);

const sunGlow = new THREE.Mesh(
  new THREE.SphereGeometry(17, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xff9020, transparent: true, opacity: 0.18, side: THREE.BackSide })
);
sun.add(sunGlow);

// ====================== Planet factory ======================
function makeLabel(text, className = 'planet-label') {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  return new CSS2DObject(div);
}

const orbitRings = [];

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

  const matOpts = {
    map: loadTex(d.textureUrl),
    roughness: d.roughness ?? 0.85,
    metalness: 0.02,
  };
  if (d.normalUrl) {
    matOpts.normalMap = loadTex(d.normalUrl, { srgb: false });
    matOpts.normalScale = new THREE.Vector2(0.85, 0.85);
  }
  if (d.specularUrl) {
    matOpts.metalnessMap = loadTex(d.specularUrl, { srgb: false });
    matOpts.metalness = 1.0;
    matOpts.roughness = 0.55;
  }
  const material = new THREE.MeshStandardMaterial(matOpts);

  if (d.nightUrl) {
    const nightTex = loadTex(d.nightUrl);
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uNightMap = { value: nightTex };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWorldPosFrag;
          varying vec3 vWorldNormalFrag;`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vWorldPosFrag = worldPosition.xyz;
          vWorldNormalFrag = normalize(mat3(modelMatrix) * objectNormal);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uNightMap;
          varying vec3 vWorldPosFrag;
          varying vec3 vWorldNormalFrag;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec3 sunDir = normalize(-vWorldPosFrag);
          float dayness = max(dot(normalize(vWorldNormalFrag), sunDir), 0.0);
          float nightFactor = 1.0 - smoothstep(0.0, 0.2, dayness);
          vec3 nightLights = texture2D(uNightMap, vMapUv).rgb;
          totalEmissiveRadiance += nightLights * nightFactor * 2.5;`);
    };
  }

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(d.size, 64, 64), material);
  mesh.position.x = d.distance;
  mesh.rotation.z = d.tilt;
  pivot.add(mesh);

  // Planet name label
  const label = makeLabel(d.name);
  label.position.set(0, d.size + 1.5, 0);
  mesh.add(label);

  if (d.cloudUrl) {
    const cloudTex = loadTex(d.cloudUrl);
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
    const pos = ringGeo.attributes.position;
    const uv = ringGeo.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      uv.setXY(i, (v.length() - d.rings.inner) / (d.rings.outer - d.rings.inner), 0.5);
    }
    const ringTex = loadTex(d.rings.textureUrl);
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
      new THREE.MeshStandardMaterial({ map: moonTex, color: m.color, roughness: 0.95 })
    );
    moonMesh.position.x = m.distance;
    moonMesh.rotation.y = Math.random() * Math.PI * 2;
    mp.add(moonMesh);
    return { pivot: mp, mesh: moonMesh, speed: m.speed };
  });

  return { pivot, mesh, moons };
}

const planetsData = [
  { name: 'Mercury', size: 1.6, textureUrl: mercuryUrl, distance: 28,  speed: 4.7,  tilt: 0.03 },
  { name: 'Venus',   size: 2.8, textureUrl: venusSurfaceUrl, cloudUrl: venusAtmosUrl, cloudOpacity: 0.85,
    distance: 44, speed: 3.5, tilt: 3.09 },
  { name: 'Earth',   size: 3.0, textureUrl: earthDayUrl, cloudUrl: earthCloudsUrl, cloudOpacity: 0.45,
    normalUrl: earthNormalUrl, specularUrl: earthSpecUrl, nightUrl: earthNightUrl,
    distance: 62, speed: 2.9, tilt: 0.41,
    moons: [{ size: 0.85, color: 0xc8c8c8, distance: 5.5, speed: 12 }] },
  { name: 'Mars',    size: 2.2, textureUrl: marsUrl, distance: 82, speed: 2.4, tilt: 0.44,
    moons: [
      { size: 0.30, color: 0x8a8070, distance: 3.2, speed: 18 },
      { size: 0.25, color: 0x6a6258, distance: 4.5, speed: 14 },
    ] },
  { name: 'Jupiter', size: 8.5, textureUrl: jupiterUrl, distance: 125, speed: 1.3, tilt: 0.05,
    moons: [
      { size: 0.70, color: 0xe8d889, distance: 12.0, speed: 9.0 },
      { size: 0.60, color: 0xc8c8d8, distance: 14.5, speed: 6.5 },
      { size: 0.95, color: 0x988878, distance: 17.5, speed: 4.5 },
      { size: 0.85, color: 0x5a4a3a, distance: 21.0, speed: 3.5 },
    ] },
  { name: 'Saturn',  size: 7.0, textureUrl: saturnUrl, distance: 170, speed: 0.97, tilt: 0.47,
    rings: { inner: 8, outer: 16, textureUrl: saturnRingUrl } },
  { name: 'Uranus',  size: 5.0, textureUrl: uranusUrl, distance: 215, speed: 0.68, tilt: 1.71 },
  { name: 'Neptune', size: 4.8, textureUrl: neptuneUrl, distance: 255, speed: 0.54, tilt: 0.49,
    moons: [{ size: 0.7, color: 0xc8b88a, distance: 7, speed: 5 }] },
];

const planets = planetsData.map(d => ({ ...d, ...createPlanet(d) }));
planets.forEach(p => { p.pivot.rotation.y = Math.random() * Math.PI * 2; });

// ====================== Galaxy view ======================
const galaxyMaterials = [];

function buildGalaxy() {
  const positions = [];
  const colors = [];
  const COUNT = 40000;
  const innerColor = new THREE.Color(0xffaa55);
  const outerColor = new THREE.Color(0x4488ff);
  const arms = 4;
  for (let i = 0; i < COUNT; i++) {
    const t = Math.pow(Math.random(), 0.6);
    const r = t * 1100 + 30;
    const armIdx = i % arms;
    const angle = (armIdx / arms) * Math.PI * 2 + t * 6 + (Math.random() - 0.5) * 0.5;
    const dy = (Math.random() - 0.5) * 70 * (1 - t * 0.7);
    positions.push(
      Math.cos(angle) * r + (Math.random() - 0.5) * 30,
      dy,
      Math.sin(angle) * r + (Math.random() - 0.5) * 30,
    );
    const c = innerColor.clone().lerp(outerColor, t);
    colors.push(c.r, c.g, c.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 2.2, vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  galaxy.add(new THREE.Points(geo, mat));
  galaxyMaterials.push(mat);

  // Bright core
  const coreGeo = new THREE.SphereGeometry(35, 32, 32);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffe0a0, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  galaxy.add(core);
  galaxyMaterials.push(coreMat);
}
buildGalaxy();

// "You are here" tiny sun marker on one of the spiral arms
const tinySun = new THREE.Mesh(
  new THREE.SphereGeometry(4, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 0 })
);
tinySun.position.set(550, 10, -180);
galaxy.add(tinySun);
galaxyMaterials.push(tinySun.material);

const tinyHalo = new THREE.Mesh(
  new THREE.SphereGeometry(11, 24, 24),
  new THREE.MeshBasicMaterial({
    color: 0xffd07a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })
);
tinySun.add(tinyHalo);
galaxyMaterials.push(tinyHalo.material);

const tinyLabel = makeLabel('SOL · YOU ARE HERE', 'tiny-sun-label');
tinyLabel.position.set(0, 8, 0);
tinySun.add(tinyLabel);

// ====================== Mode switching ======================
const SOLAR_TO_GALAXY_THRESHOLD = 1500;
let mode = 'solar';
let switching = false;

function enterGalaxyMode() {
  if (switching || mode === 'galaxy') return;
  switching = true;
  mode = 'galaxy';
  document.body.classList.add('galaxy-mode');
  controls.enabled = false;

  galaxy.visible = true;
  tinySun.scale.set(1, 1, 1);

  const tl = gsap.timeline({
    onComplete: () => {
      solarSystem.visible = false;
      switching = false;
      controls.enabled = true;
      controls.maxDistance = 4000;
    },
  });
  tl.to(solarSystem.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 1.4, ease: 'power2.in' }, 0)
    .to(camera.position, { x: 0, y: 900, z: 1800, duration: 2.2, ease: 'power2.inOut' }, 0)
    .to(controls.target, { x: 0, y: 0, z: 0, duration: 2.2, ease: 'power2.inOut' }, 0)
    .to(galaxyMaterials, { opacity: 1, duration: 1.6, ease: 'power2.out' }, 0.5);
}

function exitGalaxyMode() {
  if (switching || mode === 'solar') return;
  switching = true;
  mode = 'solar';
  controls.enabled = false;

  const tinyPos = new THREE.Vector3();
  tinySun.getWorldPosition(tinyPos);

  const tl = gsap.timeline({
    onComplete: () => {
      galaxy.visible = false;
      solarSystem.visible = true;
      solarSystem.scale.set(1, 1, 1);
      camera.position.set(0, 220, 480);
      controls.target.set(0, 0, 0);
      controls.maxDistance = 1800;
      document.body.classList.remove('galaxy-mode');
      switching = false;
      controls.enabled = true;
    },
  });
  // Fly toward the tiny sun and zoom into it
  tl.to(controls.target, { x: tinyPos.x, y: tinyPos.y, z: tinyPos.z, duration: 1.8, ease: 'power2.inOut' }, 0)
    .to(camera.position, {
      x: tinyPos.x, y: tinyPos.y + 2, z: tinyPos.z + 8,
      duration: 2.4, ease: 'power3.in',
    }, 0)
    .to(tinySun.scale, { x: 30, y: 30, z: 30, duration: 1.2, ease: 'power2.in' }, 1.0)
    .to(galaxyMaterials, { opacity: 0, duration: 1.0, ease: 'power2.in' }, 1.4);
}

// ====================== Click handler ======================
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

renderer.domElement.addEventListener('click', (e) => {
  if (switching) return;
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  if (mode === 'galaxy') {
    const hit = raycaster.intersectObject(tinySun, true)[0];
    if (hit) exitGalaxyMode();
    return;
  }

  const hit = raycaster.intersectObjects(planets.map(p => p.mesh), false)[0];
  if (!hit) return;
  const target = new THREE.Vector3();
  hit.object.getWorldPosition(target);
  const r = hit.object.geometry.parameters.radius;
  const off = r * 6 + 10;
  gsap.to(camera.position, {
    x: target.x + off, y: target.y + off * 0.5, z: target.z + off,
    duration: 1.4, ease: 'power3.inOut',
  });
  gsap.to(controls.target, {
    x: target.x, y: target.y, z: target.z,
    duration: 1.4, ease: 'power3.inOut',
  });
});

// ====================== Intro (after textures load) ======================
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

// ====================== Loop ======================
const clock = new THREE.Clock();
const sim = { speed: 1.0 };

function animate() {
  const dt = clock.getDelta() * sim.speed;

  if (mode === 'solar') {
    sun.rotation.y += dt * 0.05;
    planets.forEach(p => {
      p.pivot.rotation.y += dt * p.speed * 0.05;
      p.mesh.rotation.y += dt * 0.5;
      if (p.mesh.userData.clouds) p.mesh.userData.clouds.rotation.y += dt * 0.07;
      p.moons.forEach(m => {
        m.pivot.rotation.y += dt * m.speed * 0.1;
        m.mesh.rotation.y += dt * 0.5;
      });
    });

    // Trigger galaxy mode when zoomed out far enough
    if (!switching && camera.position.length() > SOLAR_TO_GALAXY_THRESHOLD) {
      enterGalaxyMode();
    }
  } else if (mode === 'galaxy') {
    galaxy.rotation.y += dt * 0.01;
    // gentle pulse on the tiny sun halo so users notice it
    const pulse = 1 + Math.sin(performance.now() * 0.003) * 0.15;
    tinyHalo.scale.setScalar(pulse);
  }

  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// ====================== Debug GUI (only on /debug, ?debug, or #debug) ======================
const debugMode = /(?:^|[/?#])debug(?:$|[/?#&])/.test(
  location.pathname + location.search + location.hash
);

if (debugMode) {
  const gui = new GUI({ title: 'Debug' });
  const settings = {
    showLabels: true,
    showOrbits: true,
    speed: 1.0,
  };

  gui.add(settings, 'showLabels').name('Planet Labels').onChange((v) => {
    document.body.classList.toggle('hide-labels', !v);
  });
  gui.add(settings, 'showOrbits').name('Orbit Rings').onChange((v) => {
    orbitRings.forEach(o => { o.visible = v; });
  });
  gui.add(settings, 'speed', 0, 10, 0.1).name('Sim Speed').onChange((v) => {
    sim.speed = v;
  });
}
