// ---------------------------------------------------------------------------
// CITT Express - arranque y bucle principal.
//
// Juego educativo: en cada casa un NPC hace una pregunta de ciberseguridad y,
// si se acierta, entrega un fragmento de una clave. Al completar las 5, los
// fragmentos se ensamblan.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STOPS, SKY, PLANET } from './config.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createLadybug } from './ladybug.js';
import { createFollowCamera } from './followCamera.js';
import { createPostFX } from './postfx.js';
import { createUI } from './ui.js';
import { createGame } from './game.js';

// Equipos modestos: menos resolución, sin sombras y sin efectos de entrada.
const LOW_END =
  (navigator.hardwareConcurrency || 4) <= 4 || window.innerWidth < 760;

const renderer = new THREE.WebGLRenderer({
  antialias: !LOW_END,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOW_END ? 1 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
// Las sombras suaves son lo que más acerca el resultado a un aspecto de
// juego hecho a mano: dan peso a los personajes y relieve a las casas.
renderer.shadowMap.enabled = !LOW_END;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- cielo diurno -----------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY.color);
// La niebla comparte el color del cielo: el borde del planeta se funde con él.
scene.fog = new THREE.Fog(SKY.color, SKY.fogNear, SKY.fogFar);

const { camera, update: updateCamera, resize: resizeCamera } = createFollowCamera();

// --- luces -----------------------------------------------------------------
// Luz de día: cielo claro arriba, rebote verdoso del pasto abajo.
scene.add(new THREE.HemisphereLight(0xdcf1ff, 0x74a158, 1.15));

const sun = new THREE.DirectionalLight(0xfff4dc, 2.4);
sun.position.set(42, 58, 26);
sun.castShadow = true;
// Una sola sombra ortográfica cubre el planeta entero: con el mapa a 2048 el
// texel mide ~2 cm, suficiente a esta escala.
{
  const extent = PLANET.radius + 5;
  const c = sun.shadow.camera;
  c.left = -extent;
  c.right = extent;
  c.top = extent;
  c.bottom = -extent;
  c.near = 35;
  c.far = 140;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.06;
}
scene.add(sun);

// Luz de contra suave, para que la silueta no se pierda contra el cielo.
const rim = new THREE.DirectionalLight(0xbcd9ff, 0.42);
rim.position.set(-40, -18, -34);
scene.add(rim);

const sunDisc = new THREE.Mesh(
  new THREE.SphereGeometry(7, 24, 18),
  new THREE.MeshBasicMaterial({ color: 0xfff8e0, fog: false })
);
sunDisc.position.copy(sun.position).multiplyScalar(2.6);
scene.add(sunDisc);

// --- nubes -------------------------------------------------------------------
// Racimos de esferas fundidos en una geometría e instanciados: una sola
// llamada de dibujo para todo el cielo.
const clouds = buildClouds();
scene.add(clouds);

function buildClouds() {
  const puff = (r, x, y, z) => {
    const g = new THREE.SphereGeometry(r, 12, 9);
    g.translate(x, y, z);
    return g;
  };
  const geo = mergeGeometries(
    [
      puff(1.0, 0, 0, 0),
      puff(0.72, -1.05, -0.12, 0.1),
      puff(0.66, 0.95, -0.14, -0.1),
      puff(0.55, 0.1, 0.45, 0.25),
      puff(0.48, -0.5, 0.3, -0.3),
    ],
    false
  );

  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, fog: false }),
    SKY.clouds
  );

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const upAxis = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < SKY.clouds; i++) {
    dir.randomDirection();
    const h = PLANET.radius + 11 + Math.random() * 9;
    pos.copy(dir).multiplyScalar(h);
    q.setFromUnitVectors(upAxis, dir); // acostada paralela a la superficie
    const s = 1.5 + Math.random() * 1.6;
    scl.set(s, s * 0.55, s);
    mesh.setMatrixAt(i, m.compose(pos, q, scl));
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

// --- sombras por objeto ------------------------------------------------------
/** Reparte cast/receive. Lo translúcido (haces, humo, alas) queda fuera. */
function setupShadows(root, { cast = true, receive = true } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m && (m.transparent || m.depthWrite === false)) {
      o.castShadow = false;
      o.receiveShadow = false;
      return;
    }
    o.castShadow = cast;
    o.receiveShadow = receive;
  });
}

// --- entrada -----------------------------------------------------------------
const keys = new Set();
const BLOCKED = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

window.addEventListener('keydown', (e) => {
  if (BLOCKED.includes(e.code)) e.preventDefault();
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

const held = (...codes) => codes.some((c) => keys.has(c));

function readInput() {
  return {
    move: (held('KeyW', 'ArrowUp') ? 1 : 0) - (held('KeyS', 'ArrowDown') ? 1 : 0),
    turn: (held('KeyA', 'ArrowLeft') ? 1 : 0) - (held('KeyD', 'ArrowRight') ? 1 : 0),
  };
}

// --- arranque por etapas, con barra de carga real ----------------------------
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

let game = null;
const ui = createUI(STOPS, { onStart: () => game && game.start() });

let world = null;
let player = null;
let ladybug = null;
let fx = null;

/** El logo de la torre. Si no carga, la torre usa un disco liso. */
function loadLogo() {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      'citt_logo.jpg',
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        resolve(tex);
      },
      undefined,
      () => resolve(null)
    );
  });
}

async function boot() {
  ui.setLoading(0.06, 'Cargando el logo de la central');
  const logoTexture = await loadLogo();

  ui.setLoading(0.18, 'Creando el planeta');
  await nextFrame();

  world = createWorld(scene, { logoTexture });
  ui.setLoading(0.5, 'Levantando la ciudad y trazando caminos');
  await nextFrame();

  player = createPlayer(scene);
  updateCamera(0, player, true); // coloca la cámara sin interpolar
  ladybug = createLadybug(scene, world);
  ui.setLoading(0.64, 'Soltando a la chinita');
  await nextFrame();

  if (renderer.shadowMap.enabled) {
    setupShadows(world.group);
    setupShadows(player.mesh);
    setupShadows(ladybug.mesh);
    // El planeta y el suelo solo reciben: proyectar su propia sombra no
    // aporta nada y duplica trabajo.
    world.planet.castShadow = false;
    world.planet.receiveShadow = true;
  }
  ui.setLoading(0.76, 'Encendiendo luces y efectos');
  await nextFrame();

  fx = createPostFX(renderer, scene, camera);
  if (LOW_END) fx.enabled = false;
  ui.setFxState(fx.enabled);

  // Compilar los shaders aquí evita el tirón del primer fotograma.
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  ui.setLoading(1, 'Listo');
  await nextFrame();

  game = createGame(world, player, ui, ladybug);

  ui.hideLoading();
  ui.showStart();
  start();
}

// --- bucle -------------------------------------------------------------------
let last = performance.now();

function start() {
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.05); // tras una pausa larga, no saltar medio planeta
    const t = now * 0.001;

    const input = game && game.acceptsInput ? readInput() : { move: 0, turn: 0 };
    player.step(dt, input, world.obstacles);
    game.update(dt);
    world.update(t, dt);
    updateCamera(dt, player);

    clouds.rotation.y += dt * 0.006;
    fx.render();
  });
}

// --- eventos de ventana -------------------------------------------------------
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  resizeCamera(w, h);
  if (fx) fx.setSize(w, h);
});

// Al volver de otra pestaña, reinicia el reloj para no acumular un dt enorme.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) last = performance.now();
});

// P alterna el post-procesado: sirve para comparar en clase el antes y después.
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' && fx) ui.setFxState(fx.toggle());
});

boot();
