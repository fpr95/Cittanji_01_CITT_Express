// ---------------------------------------------------------------------------
// Página de revisión de personajes: /preview.html
//
// Muestra a todos en fila, sobre peanas, con la misma luz del juego y con la
// animación de reposo corriendo. Sirve para juzgar el aspecto sin tener que
// jugar hasta cada casa.
//
// Carga los personajes desde el mismo código que usa el juego, así que lo que
// se ve aquí es exactamente lo que aparece en el planeta.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createNpc, createMascot } from './npc.js';
import { createPlayer } from './player.js';
import { createLadybug } from './ladybug.js';
import { STOPS } from './config.js';

const CAST = [
  { id: 'estudiante', label: 'Estudiante', sub: 'el mensajero (jugador)' },
  { id: 'nico', label: 'Nico', sub: 'Casa de Inducción' },
  { id: 'dani', label: 'Dani + Tux', sub: 'Casa de Linux' },
  { id: 'milenka', label: 'Milenka', sub: 'Casa de Defensa' },
  { id: 'fernando', label: 'Fernando', sub: 'Casa de Pentest' },
  { id: 'clip', label: 'El Clip', sub: 'Casa Legacy' },
  { id: 'ave', label: 'Ave azul', sub: 'mascota del planeta' },
  { id: 'chinita', label: 'Chinita', sub: 'el bug que roba' },
];

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe6f0);

// Misma luz que el juego, para que los colores se juzguen igual.
scene.add(new THREE.HemisphereLight(0xdcf1ff, 0x9aa98c, 1.15));
const sun = new THREE.DirectionalLight(0xfff4dc, 2.4);
sun.position.set(6, 12, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006;
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 10, bottom: -4, near: 1, far: 40 });
scene.add(sun);
scene.add(new THREE.DirectionalLight(0xbcd9ff, 0.4).translateZ(-10));

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 2.6, 13);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.3, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.52;

// --- suelo -------------------------------------------------------------------
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(40, 48),
  new THREE.MeshStandardMaterial({ color: 0xcdd6e4, roughness: 1 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// --- reparto -----------------------------------------------------------------
const SPACING = 2.6;
const actors = [];
const scratch = new THREE.Scene(); // algunos constructores exigen una escena

CAST.forEach((entry, i) => {
  const pedestal = new THREE.Group();
  pedestal.position.x = (i - (CAST.length - 1) / 2) * SPACING;
  scene.add(pedestal);

  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.15, 0.16, 36),
    new THREE.MeshStandardMaterial({ color: 0xeef2f8, roughness: 0.9 })
  );
  disc.position.y = 0.08;
  disc.receiveShadow = true;
  pedestal.add(disc);

  const spinner = new THREE.Group();
  spinner.position.y = 0.16;
  pedestal.add(spinner);

  let update = null;

  if (entry.id === 'estudiante') {
    const player = createPlayer(scratch);
    player.mesh.position.set(0, 0, 0);
    player.mesh.quaternion.identity();
    spinner.add(player.mesh);
    // Un paso en el sitio deja ver el ciclo de caminata.
    let t = 0;
    update = (dt) => {
      t += dt;
      player.step(dt, { move: Math.sin(t * 0.7) > 0 ? 1 : 0, turn: 0 }, []);
      player.mesh.position.set(0, 0, 0);
      player.mesh.quaternion.identity();
    };
  } else if (entry.id === 'ave') {
    const m = createMascot();
    spinner.add(m.group);
    update = () => m.update(performance.now() * 0.001);
  } else if (entry.id === 'chinita') {
    const bug = createLadybug(scratch, {
      obstacles: [],
      depotDir: new THREE.Vector3(0, 1, 0),
    });
    bug.mesh.position.set(0, 0, 0);
    bug.mesh.quaternion.identity();
    spinner.add(bug.mesh);
    spinner.position.y = 0.9; // vuela
    let f = 0;
    update = (dt) => {
      f += dt * 22;
      bug.mesh.userData.flapWings(f);
      bug.mesh.position.set(0, Math.sin(f * 0.26) * 0.1, 0);
      bug.mesh.quaternion.identity();
    };
  } else {
    const npc = createNpc({ kind: entry.id, rnd: Math.random });
    spinner.add(npc.group);
    update = (dt) => npc.update(performance.now() * 0.001, dt);
  }

  actors.push({ spinner, update });
});

// Sombras para todo el reparto.
scene.traverse((o) => {
  if (!o.isMesh) return;
  const m = o.material;
  if (m && (m.transparent || m.depthWrite === false)) return;
  o.castShadow = true;
  if (o !== floor) o.receiveShadow = true;
});

// --- etiquetas ---------------------------------------------------------------
document.getElementById('names').innerHTML = CAST.map(
  (c) => `<div class="name"><b>${c.label}</b><span>${c.sub}</span></div>`
).join('');

// --- controles ---------------------------------------------------------------
let spinning = true;
const spinBtn = document.getElementById('spin');
spinBtn.addEventListener('click', () => {
  spinning = !spinning;
  spinBtn.classList.toggle('on', spinning);
});

const BACKDROPS = [0xdfe6f0, 0x2b3242, 0xa8def5, 0xf2ece1];
let bgIndex = 0;
document.getElementById('bg').addEventListener('click', () => {
  bgIndex = (bgIndex + 1) % BACKDROPS.length;
  scene.background.setHex(BACKDROPS[bgIndex]);
  floor.material.color.setHex(BACKDROPS[bgIndex]).multiplyScalar(0.92);
});

// --- bucle -------------------------------------------------------------------
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  for (const a of actors) {
    if (spinning) a.spinner.rotation.y += dt * 0.5;
    a.update?.(dt);
  }
  controls.update();
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Deja constancia de que las casas y los personajes siguen cuadrando.
console.log(
  'Casas:',
  STOPS.map((s) => `${s.name} -> ${s.npcName}`).join(', ')
);
