// ---------------------------------------------------------------------------
// Simulación headless. Todo el juego menos el renderer funciona sin WebGL,
// así que un piloto automático puede recorrer el planeta y completar la ruta.
//
//   node test/simulate.mjs
//
// Comprueba, entre otras cosas, que la bandera final sea SIEMPRE la misma
// aunque el orden de las entregas cambie en cada partida, que la Casa de
// Inducción sea siempre la primera, y que la chinita moleste sin bloquear.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { createWorld } from '../src/world.js';
import { createPlayer } from '../src/player.js';
import { createLadybug } from '../src/ladybug.js';
import { createGame } from '../src/game.js';
import { readFileSync } from 'node:fs';
import {
  fullKey,
  PLANET,
  WORLD,
  PLAYER,
  STOPS,
  LADYBUG,
  decodeKey,
  keyTail,
} from '../src/config.js';
import { tangentTowards } from '../src/sphereMath.js';

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failures++;
};

// ---------------------------------------------------------------------------
// Una partida completa, conducida por piloto automático.
// El piloto NO esquiva a la chinita: es el peor caso razonable.
// ---------------------------------------------------------------------------
function playOnce() {
  const scene = new THREE.Scene();
  const world = createWorld(scene);
  const player = createPlayer(scene);
  const ladybug = createLadybug(scene, world);

  const slots = new Array(world.stops.length).fill(null);
  const order = [];
  let questions = 0;
  let finalKey = null;
  let finalEncoded = null;
  let finalStats = null;

  const ui = {
    setLoading() {}, hideLoading() {}, showStart() {}, hideStart() {},
    setObjective() {}, setDistance() {}, setCompass() {}, setProgress() {},
    setTimer() {}, toast() {}, setFxState() {}, bugAlert() {},
    fillSlot(i, frag) { slots[i] = frag; },
    showQuestion(stop, { onAnswer, onContinue }) {
      questions++;
      // Una errada a propósito, para ejercitar el camino de reintento.
      onAnswer((stop.question.correct + 1) % 4);
      const ok = onAnswer(stop.question.correct);
      if (!ok) throw new Error('la alternativa correcta fue rechazada');
      order.push(stop.id);
      onContinue();
    },
    showFinal(encoded, _s, stats) {
      // El juego solo entrega la cadena codificada; decodificarla es parte
      // del desafio. La prueba la decodifica por su cuenta para verificarla.
      finalEncoded = encoded;
      finalKey = decodeKey(encoded);
      finalStats = stats;
    },
  };

  const game = createGame(world, player, ui, ladybug);
  game.start();

  const _t = new THREE.Vector3();
  const _right = new THREE.Vector3();
  function steer() {
    const target = game.state.carrying ? game.state.assigned.dir : world.depotDir;
    tangentTowards(player.up, target, _t);
    _right.crossVectors(player.up, player.fwd).negate().normalize();
    // ang > 0: el objetivo queda hacia la derecha de la pantalla.
    const ang = Math.atan2(_t.dot(_right), _t.dot(player.fwd));
    return {
      turn: Math.max(-1, Math.min(1, -ang * 2.5)),
      move: Math.abs(ang) < 1.1 ? 1 : 0.25,
    };
  }

  const dt = 1 / 60;
  const maxSteps = 60 * 60 * 12;
  let steps = 0;
  let offSphere = 0;
  let inside = 0;
  let bugInPlaza = 0;
  const selfAng = PLAYER.radius / PLANET.radius;

  while (game.state.phase !== 'done' && steps < maxSteps) {
    player.step(dt, steer(), world.obstacles);
    game.update(dt);
    steps++;

    if (Math.abs(player.up.length() - 1) > 1e-6) offSphere++;
    for (const o of world.obstacles) {
      if (player.up.angleTo(o.dir) < o.r + selfAng - 1e-6) inside++;
    }
    // La plaza de la central tiene que ser zona segura.
    if (ladybug.state.up.angleTo(world.depotDir) * PLANET.radius < 5) bugInPlaza++;
  }

  return {
    scene, player, world, game, ladybug, slots, order, questions,
    finalKey, finalEncoded, finalStats,
    steps, offSphere, inside, bugInPlaza, dt,
  };
}

// ---------------------------------------------------------------------------
// Partida de referencia: estructura del mundo y recorrido.
// ---------------------------------------------------------------------------
const run = playOnce();
const { world, game } = run;

// Todo lo que debe verse tiene que colgar de la escena. Parece obvio, pero un
// constructor puede olvidarse de añadir su malla y el juego sigue corriendo
// perfectamente: simplemente ese personaje no aparece en pantalla.
function inScene(scene, object) {
  let node = object;
  while (node) {
    if (node === scene) return true;
    node = node.parent;
  }
  return false;
}
check('el mensajero esta en la escena', inScene(run.scene, run.player.mesh));
check('la chinita esta en la escena', inScene(run.scene, run.ladybug.mesh));
check('el mundo esta en la escena', inScene(run.scene, run.world.group));
check(
  'los NPC estan en la escena',
  world.stops.every((s) => inScene(run.scene, s.npc.group))
);

check('hay 5 casas de entrega', world.stops.length === 5, `(${world.stops.length})`);
check('cada casa tiene su NPC', world.stops.every((s) => s.npc && s.npc.group));
check(
  'cada casa tiene pregunta con 4 alternativas',
  world.stops.every(
    (s) => s.question && s.question.options.length === 4 &&
      s.question.correct >= 0 && s.question.correct < 4
  )
);
check(
  'la Casa de Linux trae el pinguino',
  !!world.stops.find((s) => s.id === 'linux'),
);
check('el mundo expone su animacion', typeof world.update === 'function');
check('la mascota sigue en la central', !!world.mascot);

check(
  'ninguna casa invade la central',
  world.stops.every((s) => s.dir.angleTo(world.depotDir) >= WORLD.depotClear)
);

let minSep = Infinity;
for (let i = 0; i < world.stops.length; i++)
  for (let j = i + 1; j < world.stops.length; j++)
    minSep = Math.min(minSep, world.stops[i].dir.angleTo(world.stops[j].dir));
check('las casas estan separadas', minSep > 0.6, `min ${minSep.toFixed(2)} rad`);

const cityCount = world.obstacles.length - 1 - world.stops.length - WORLD.trees;
check('se levanto la mini ciudad', cityCount > 10, `${cityCount} edificios de relleno`);

check('el jugador nunca se sale de la esfera', run.offSphere === 0, `(${run.offSphere})`);
check('el jugador nunca queda dentro de un obstaculo', run.inside === 0, `(${run.inside})`);
check('la chinita nunca entra en la plaza de la central', run.bugInPlaza === 0, `(${run.bugInPlaza})`);
check('se completaron las 5 entregas', game.state.delivered === 5, `(${game.state.delivered})`);
check('se hicieron 5 preguntas', run.questions === 5, `(${run.questions})`);
check('las erradas se contaron', game.state.wrongAnswers === 5, `(${game.state.wrongAnswers})`);
check('todos los casilleros se llenaron', run.slots.every(Boolean));
check('la clave final es la esperada', run.finalKey === fullKey(), `-> ${run.finalKey}`);

// ---------------------------------------------------------------------------
// La clave va codificada en Base64 y no debe aparecer como texto en el codigo.
// Es ofuscacion, no seguridad, pero si se rompe conviene enterarse aqui.
// ---------------------------------------------------------------------------
check(
  'la clave tiene la forma esperada',
  /^CTI\{[\x20-\x7E]+\}$/.test(run.finalKey)
);
check(
  'el Base64 cubre la clave entera, desde CTI hasta la llave de cierre',
  decodeKey(run.finalEncoded).startsWith('CTI{') &&
    decodeKey(run.finalEncoded).endsWith('}') &&
    decodeKey(run.finalEncoded) === run.finalKey
);

const archivos = [
  '../src/config.js', '../src/game.js', '../src/ui.js', '../src/main.js',
  '../index.html', '../README.md',
];
const fuentes = archivos
  .map((f) => readFileSync(new URL(f, import.meta.url), 'utf8'))
  .join('\n');
const clara = fullKey();
const prefijo = clara.slice(0, clara.indexOf('{') + 1);
check(
  'la clave no esta escrita en claro en el repositorio',
  !fuentes.includes(clara) && !fuentes.includes(prefijo)
);

const cuerpo = STOPS.map((s) => s.fragment).join('');
let decodificaSola = false;
try {
  // Sin la cola, lo repartido no debe reconstruir la clave.
  decodificaSola = decodeKey(cuerpo) === fullKey();
} catch {
  decodificaSola = false;
}
check('los fragmentos por si solos no dan la clave', !decodificaSola);
check(
  'la cola no aparece como texto en config.js',
  !readFileSync(new URL('../src/config.js', import.meta.url), 'utf8').includes(
    `'${keyTail()}'`
  )
);

// ---------------------------------------------------------------------------
// Varias partidas: orden, dificultad de la chinita y estabilidad de la clave.
// ---------------------------------------------------------------------------
const RUNS = 12;
const keys = new Set([run.finalKey]);
const orders = new Set([run.order.join('>')]);
const firsts = new Set([run.order[0]]);
let completed = 1;
let totalStolen = run.finalStats.stolen;
let slowest = run.steps;

for (let i = 1; i < RUNS; i++) {
  const r = playOnce();
  if (r.game.state.delivered === 5) completed++;
  keys.add(r.finalKey);
  orders.add(r.order.join('>'));
  firsts.add(r.order[0]);
  totalStolen += r.finalStats.stolen;
  slowest = Math.max(slowest, r.steps);
}

check(`las ${RUNS} partidas se completaron`, completed === RUNS, `(${completed})`);
check(
  'la Casa de Induccion es siempre la primera',
  firsts.size === 1 && firsts.has('induccion'),
  `primeras: ${[...firsts].join(', ')}`
);
check(
  'el resto del orden si varia entre partidas',
  orders.size > 1,
  `${orders.size} ordenes distintos`
);
check(
  'la bandera final es siempre la misma',
  keys.size === 1 && keys.has(fullKey()),
  `${keys.size} clave(s): ${[...keys].join(' | ')}`
);

// Dificultad: el piloto automático no esquiva nunca. Si aun así termina, y la
// chinita roba algo pero no todo el rato, el ajuste es razonable.
const avgStolen = totalStolen / RUNS;
check(
  'la chinita molesta sin bloquear el juego',
  totalStolen >= 3 && completed === RUNS && avgStolen < 6,
  `${avgStolen.toFixed(1)} robos por partida sin esquivar`
);
check(
  'la chinita es mas lenta que el jugador',
  LADYBUG.speed < PLAYER.speed,
  `${LADYBUG.speed} vs ${PLAYER.speed}`
);

console.log(
  `\nRuta de referencia: ${(run.steps * run.dt).toFixed(1)} s simulados, ` +
  `${run.finalStats.stolen} robo(s). Partida mas lenta: ${(slowest / 60).toFixed(0)} s.`
);
process.exit(failures ? 1 : 0);
