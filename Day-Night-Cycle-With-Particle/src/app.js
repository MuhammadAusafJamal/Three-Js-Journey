import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { gsap } from 'gsap';
import GUI from 'lil-gui';

const canvas = document.querySelector('canvas');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 15, 60);

const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Texture Loader
const loader = new THREE.TextureLoader();
const maxAniso = renderer.capabilities.getMaxAnisotropy();
function loadTex(url, { srgb = true } = {}) {
    const t = loader.load(url);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
}

// Load Model
try {
    const mtlLoader = new MTLLoader();
    const materials = await mtlLoader.loadAsync('/textures/85-cottage_obj/cottage_obj.mtl');
    const treeMaterials = await mtlLoader.loadAsync('/textures/61-low_poly_tree/low_poly_tree/Lowpoly_tree_sample.mtl');
    materials.preload();
    treeMaterials.preload();

    const cottageLoader = new OBJLoader();
    cottageLoader.setMaterials(materials);
    const cottageObject = await cottageLoader.loadAsync('/textures/85-cottage_obj/cottage_obj.obj');

    const treeLoader = new OBJLoader();
    treeLoader.setMaterials(treeMaterials);
    const treeTemplate = await treeLoader.loadAsync('/textures/61-low_poly_tree/low_poly_tree/Lowpoly_tree_sample.obj');

    const diffuseTex = loadTex('/textures/34-cottage_textures/cottage_textures/cottage_diffuse.png');
    const normalTex = loadTex('/textures/34-cottage_textures/cottage_textures/cottage_normal.png', { srgb: false });

    const junkMeshes = [];
    cottageObject.traverse(child => {
        if (child.isMesh && !child.name.startsWith('Cube')) junkMeshes.push(child);
    });
    junkMeshes.forEach(mesh => { mesh.geometry.dispose(); mesh.removeFromParent(); });

    cottageObject.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.material = new THREE.MeshStandardMaterial({
                map: diffuseTex,
                normalMap: normalTex,
                roughness: 0.8,
                metalness: 0.0,
            });
        }
    });

    const box3 = new THREE.Box3().setFromObject(cottageObject);
    const size = new THREE.Vector3();
    box3.getSize(size);
    const scaleFactor = 50 / size.y;
    cottageObject.scale.setScalar(scaleFactor);
    cottageObject.updateMatrixWorld(true);

    const box3Scaled = new THREE.Box3().setFromObject(cottageObject);
    const scaledCenter = new THREE.Vector3();
    box3Scaled.getCenter(scaledCenter);
    cottageObject.position.set(-scaledCenter.x, -box3Scaled.min.y, -scaledCenter.z);
    scene.add(cottageObject);

    const treeBox = new THREE.Box3().setFromObject(treeTemplate);
    const treeSize = new THREE.Vector3();
    treeBox.getSize(treeSize);
    const treeScaleFactor = 20 / treeSize.y;

    const TREE_COUNT = 50;
    const PLANE_RANGE = 200;
    const MIN_DIST_HOUSE = 60;

    for (let i = 0; i < TREE_COUNT; i++) {
        const tree = treeTemplate.clone();
        let x, z;
        do {
            x = (Math.random() - 0.5) * PLANE_RANGE * 2;
            z = (Math.random() - 0.5) * PLANE_RANGE * 2;
        } while (Math.sqrt(x * x + z * z) < MIN_DIST_HOUSE);

        tree.scale.setScalar(treeScaleFactor);
        tree.updateMatrixWorld(true);

        const treeBoxScaled = new THREE.Box3().setFromObject(tree);
        tree.position.set(x, -treeBoxScaled.min.y, z);
        tree.rotation.y = Math.random() * Math.PI * 2;

        tree.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        scene.add(tree);
    }

    console.log('Models loaded ✓');
} catch (err) {
    console.error('Model load failed:', err);
}

// Orbit Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.minDistance = 10;
controls.maxDistance = 300;
controls.maxPolarAngle = Math.PI / 2.5;
controls.target.set(0, 0, 0);

// Ground
const grassTexture = loadTex('/texture/grass.jpeg');
grassTexture.wrapS = THREE.RepeatWrapping;
grassTexture.wrapT = THREE.RepeatWrapping;
grassTexture.repeat.set(10, 10);

const grassMaterial = new THREE.MeshStandardMaterial({
    map: grassTexture,
    roughness: 0.8,
    metalness: 0.1,
});

const grassGeometry = new THREE.PlaneGeometry(500, 500);
grassGeometry.rotateX(-Math.PI / 2);
const grassMesh = new THREE.Mesh(grassGeometry, grassMaterial);
grassMesh.receiveShadow = true;
scene.add(grassMesh);

// Fireflies
const count = 1000;
const positions = new Float32Array(count * 3);
const originalPositions = new Float32Array(count * 3);

for (let i = 0; i < count; i++) {
    const i3 = i * 3;

    // Spread across entire plane
    const x = (Math.random() - 0.5) * 500;
    const z = (Math.random() - 0.5) * 500;

    // Height above ground
    const y = 2 + Math.random() * 12;

    positions[i3] = originalPositions[i3] = x;
    positions[i3 + 1] = originalPositions[i3 + 1] = y;
    positions[i3 + 2] = originalPositions[i3 + 2] = z;
}

const fireflyGeo = new THREE.BufferGeometry();
fireflyGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

function createFireflyTexture() {
    const SIZE = 500;
    const c = document.createElement('canvas');
    c.width = SIZE;
    c.height = SIZE;
    const ctx = c.getContext('2d');
    const r = SIZE / 2;
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.15, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.2)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, SIZE, SIZE);
    return new THREE.CanvasTexture(c);
}

const fireflyMat = new THREE.PointsMaterial({
    size: 1.2,
    color: 'yellow',
    map: createFireflyTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,           // ← start invisible, fade in at night
});
const fireflies = new THREE.Points(fireflyGeo, fireflyMat);
scene.add(fireflies);

// Sun
const sun = new THREE.Mesh(
    new THREE.SphereGeometry(14, 64, 64),
    new THREE.MeshBasicMaterial({ map: loadTex('/textures/stars/8k_sun.jpg') })
);
scene.add(sun);

// Moon
const moonMat = new THREE.MeshStandardMaterial({
    map: loadTex('/textures/stars/8k_moon.jpg'),
    roughness: 0.9,
    metalness: 0.0,
});
const moon = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 32), moonMat);
moon.castShadow = true;
moon.receiveShadow = true;
scene.add(moon);

const moonSelfLight = new THREE.PointLight(0xd0d8ff, 1.2, 80);
scene.add(moonSelfLight);

// Lights
const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff4d6, 1.5);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 500;
sunLight.shadow.camera.left = -100;
sunLight.shadow.camera.right = 100;
sunLight.shadow.camera.top = 100;
sunLight.shadow.camera.bottom = -100;
sunLight.shadow.bias = -0.001;
sunLight.shadow.normalBias = 0.02;
scene.add(sunLight);

const moonLight = new THREE.DirectionalLight(0x8899bb, 0.3);
moonLight.castShadow = true;
moonLight.shadow.mapSize.width = 2048;
moonLight.shadow.mapSize.height = 2048;
moonLight.shadow.camera.near = 1;
moonLight.shadow.camera.far = 500;
moonLight.shadow.camera.left = -100;
moonLight.shadow.camera.right = 100;
moonLight.shadow.camera.top = 100;
moonLight.shadow.camera.bottom = -100;
moonLight.shadow.bias = -0.001;
moonLight.shadow.normalBias = 0.02;
scene.add(moonLight);

// Sky Colors — more stops for smoother blending
const skyColors = {
    day: new THREE.Color(0x87ceeb), // light blue
    afternoon: new THREE.Color(0x5599cc), // deeper blue
    sunset: new THREE.Color(0xff6633), // orange-red
    dusk: new THREE.Color(0x331144), // deep purple
    night: new THREE.Color(0x0d1b2a), // dark blue-grey, NOT pitch black
};
scene.background = skyColors.day.clone();

const cycle = { angle: 0 };
const RADIUS = 300;

const params = {
    cycleDuration: 100,
    pauseCycle: false,
    sunIntensity: 1.5,
    sunColor: '#fff4d6',
    sunShadows: true,
    moonIntensity: 2,
    moonColor: '#8899bb',
    moonShadows: true,
    dayAmbientColor: '#c8d8e8',
    dayAmbientIntensity: 0.5,
    nightAmbientColor: '#1a2a3a',
    nightAmbientIntensity: 0.15,
    groundColor: '#3a7d44',
};

function updateCycle() {
    const a = cycle.angle;
    const sunHeight = Math.sin(a); // -1 to 1

    // Sun & moon positions
    sun.position.set(Math.cos(a) * RADIUS, Math.sin(a) * RADIUS, 0);
    sunLight.position.copy(sun.position);
    moon.position.set(-sun.position.x, -sun.position.y, 0);
    moonLight.position.copy(moon.position);
    moonSelfLight.position.copy(moon.position);

    // Light intensities
    sunLight.intensity = Math.max(0, sunHeight * params.sunIntensity);
    moonLight.intensity = Math.max(0, -sunHeight * params.moonIntensity);

    sunLight.shadow.camera.updateProjectionMatrix();
    moonLight.shadow.camera.updateProjectionMatrix();

    // Ambient light — blue-grey at night, warm by day
    const nightColor = new THREE.Color(params.nightAmbientColor);
    const dayColor = new THREE.Color(params.dayAmbientColor);
    ambientLight.color.lerpColors(nightColor, dayColor, THREE.MathUtils.clamp((sunHeight + 1) / 2, 0, 1));
    ambientLight.intensity = THREE.MathUtils.mapLinear(sunHeight, -1, 1, params.nightAmbientIntensity, params.dayAmbientIntensity);

    // Sky — smooth multi-stop blend
    // sunHeight: 1=noon, 0=horizon, -1=midnight
    if (sunHeight > 0.5) {
        // Full day — afternoon blue
        scene.background.lerpColors(skyColors.afternoon, skyColors.day, (sunHeight - 0.5) * 2);
    } else if (sunHeight > 0.05) {
        // Day fading to afternoon
        scene.background.lerpColors(skyColors.sunset, skyColors.afternoon, (sunHeight - 0.05) / 0.45);
    } else if (sunHeight > -0.05) {
        // Sunset / sunrise band
        scene.background.lerpColors(skyColors.dusk, skyColors.sunset, (sunHeight + 0.05) / 0.1);
    } else if (sunHeight > -0.3) {
        // Dusk fading to night
        scene.background.lerpColors(skyColors.night, skyColors.dusk, (sunHeight + 0.3) / 0.25);
    } else {
        // Full night — blue-grey, never pure black
        scene.background.set(skyColors.night);
    }

    // Fireflies — fade in when sun below horizon, fade out when sun rises
    // sunHeight < -0.1 = night, sunHeight > 0.1 = day
    const fireflyOpacity = THREE.MathUtils.clamp(
        THREE.MathUtils.mapLinear(sunHeight, -0.05, -0.2, 0, 1),
        0, 1
    );
    fireflyMat.opacity = fireflyOpacity;
}

let gsapTween = gsap.to(cycle, {
    angle: Math.PI * 2,
    duration: params.cycleDuration,
    ease: 'none',
    repeat: -1,
    onUpdate: updateCycle,
});

// GUI
const gui = new GUI({ title: 'Day / Night Cycle' });

const cycleFolder = gui.addFolder('Cycle');
cycleFolder.add(params, 'cycleDuration', 10, 300, 1).name('Duration (s)').onChange(v => {
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

const sunFolder = gui.addFolder('Sun Light');
sunFolder.add(params, 'sunIntensity', 0, 5, 0.1).name('Intensity').onChange(updateCycle);
sunFolder.addColor(params, 'sunColor').name('Color').onChange(v => sunLight.color.set(v));
sunFolder.add(params, 'sunShadows').name('Shadows').onChange(v => { sunLight.castShadow = v; });

const moonFolder = gui.addFolder('Moon Light');
moonFolder.add(params, 'moonIntensity', 0, 2, 0.05).name('Intensity').onChange(updateCycle);
moonFolder.addColor(params, 'moonColor').name('Color').onChange(v => moonLight.color.set(v));
moonFolder.add(params, 'moonShadows').name('Shadows').onChange(v => { moonLight.castShadow = v; });

const ambFolder = gui.addFolder('Ambient Light');
ambFolder.addColor(params, 'dayAmbientColor').name('Day color').onChange(updateCycle);
ambFolder.add(params, 'dayAmbientIntensity', 0, 2, 0.05).name('Day intensity').onChange(updateCycle);
ambFolder.addColor(params, 'nightAmbientColor').name('Night color').onChange(updateCycle);
ambFolder.add(params, 'nightAmbientIntensity', 0, 0.5, 0.01).name('Night intensity').onChange(updateCycle);

const skyFolder = gui.addFolder('Sky Colors');
skyFolder.addColor(skyColors, 'day').name('Day');
skyFolder.addColor(skyColors, 'afternoon').name('Afternoon');
skyFolder.addColor(skyColors, 'sunset').name('Sunset');
skyFolder.addColor(skyColors, 'dusk').name('Dusk');
skyFolder.addColor(skyColors, 'night').name('Night');

const objFolder = gui.addFolder('Scene');
objFolder.addColor(params, 'groundColor').name('Ground').onChange(v => grassMaterial.color.set(v));

// Resize
addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
});

// Clock
const clock = new THREE.Clock();
const simulation = { speed: 1.0 };

// Animation Loop
const animateCanvas = () => {
    const delta = clock.getDelta() * simulation.speed;
    const time = clock.getElapsedTime();

    // Bob fireflies only when visible
    if (fireflyMat.opacity > 0) {
        const posArray = fireflyGeo.attributes.position.array;
        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            posArray[i3 + 1] = originalPositions[i3 + 1] + Math.sin(time + i * 0.5) * 1.5;
        }
        fireflyGeo.attributes.position.needsUpdate = true;
    }

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animateCanvas);
};
animateCanvas();