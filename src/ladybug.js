// ---------------------------------------------------------------------------
// La chinita: un bug que ronda el planeta y roba encomiendas.
//
// Se mueve sobre la esfera igual que el mensajero (un vector `up` para la
// posición y un `fwd` tangente), pero vuela unos centímetros sobre el suelo.
//
// Dificultad media, calibrada así:
//   - es más lenta que el jugador, así que en línea recta nunca alcanza
//   - solo persigue cuando el jugador lleva un paquete; el regreso es seguro
//   - esquiva los edificios, así que se la puede despistar rodeando una casa
//   - nunca entra en la plaza de la central: siempre se puede salir con el
//     paquete en la mano
//   - tras robar se aleja unos segundos, para no encadenar dos robos
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { PLANET, LADYBUG } from './config.js';
import {
  orient,
  moveOnSphere,
  randomTangent,
  reorthogonalize,
  tangentTowards,
} from './sphereMath.js';

const R = PLANET.radius;

export function createLadybug(scene, world) {
  const mesh = buildLadybug();
  scene.add(mesh);

  // Solo esquiva lo grande (casas y edificios); sobrevuela árboles y rocas.
  const bigObstacles = world.obstacles.filter((o) => o.r > 1.0 / R);

  const up = randomTangent(world.depotDir, Math.random); // arranca lejos del inicio
  const fwd = new THREE.Vector3();
  tangentTowards(up, world.depotDir, fwd);
  if (fwd.lengthSq() === 0) fwd.copy(randomTangent(up));

  const state = { up, fwd, mode: 'wander', retreatLeft: 0, wanderLeft: 0 };

  const _t = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _wander = new THREE.Vector3();
  const _lead = new THREE.Vector3();
  let bank = 0;
  let flap = 0;

  /** Gira hacia (o en contra de) una dirección, con tope de giro por segundo. */
  function steer(targetDir, dt, away = false) {
    tangentTowards(up, targetDir, _t);
    if (_t.lengthSq() === 0) return;
    _right.crossVectors(up, fwd).negate().normalize();
    let ang = Math.atan2(_t.dot(_right), _t.dot(fwd));
    if (away) ang = ang > 0 ? ang - Math.PI : ang + Math.PI;
    const max = LADYBUG.turn * dt;
    const delta = Math.max(-max, Math.min(max, -ang));
    fwd.applyAxisAngle(up, delta);
    bank = THREE.MathUtils.lerp(bank, -delta / Math.max(max, 1e-5), 0.2);
  }

  /**
   * Un paso de la chinita.
   * Devuelve true exactamente en el fotograma en que roba el paquete.
   */
  function update(dt, player, carrying) {
    const toPlayer = player.up.angleTo(up) * R;

    if (state.retreatLeft > 0) {
      state.retreatLeft -= dt;
      state.mode = 'retreat';
      steer(player.up, dt, true);
    } else if (carrying) {
      // Mientras el jugador lleve algo, la chinita va a por él desde donde
      // esté. De lejos simplemente se acerca; de cerca intercepta.
      state.mode = toPlayer < LADYBUG.chaseRadius ? 'chase' : 'approach';
      // Intercepta: apunta a donde el jugador VA a estar, no a donde está.
      // Es lo que convierte la persecución en algo que hay que esquivar de
      // verdad, en vez de una carrera en línea recta que nunca gana.
      const leadArc =
        state.mode === 'chase' ? Math.min(toPlayer * LADYBUG.lead, 6) / R : 0;
      _lead
        .copy(player.up)
        .multiplyScalar(Math.cos(leadArc))
        .addScaledVector(player.fwd, Math.sin(leadArc))
        .normalize();
      steer(_lead, dt);
    } else {
      state.mode = 'wander';
      state.wanderLeft -= dt;
      if (state.wanderLeft <= 0) {
        state.wanderLeft = LADYBUG.wanderChange * (0.6 + Math.random() * 0.8);
        _wander.copy(randomTangent(up, Math.random));
      }
      steer(_wander.lengthSq() ? _wander : world.depotDir, dt);
    }

    // La plaza de la central es zona segura: empieza a desviarse antes de
    // llegar, y más abajo hay además un límite duro.
    const toDepot = world.depotDir.angleTo(up) * R;
    if (toDepot < LADYBUG.safeZone + 3) steer(world.depotDir, dt, true);

    moveOnSphere(up, fwd, (LADYBUG.speed * dt) / R);

    // Límite duro de la plaza: girar no basta, con inercia se colaría igual.
    const safeAng = LADYBUG.safeZone / R;
    if (up.angleTo(world.depotDir) < safeAng) {
      _t.copy(up).addScaledVector(world.depotDir, -up.dot(world.depotDir));
      if (_t.lengthSq() < 1e-10) _t.copy(randomTangent(world.depotDir));
      else _t.normalize();
      up.copy(world.depotDir)
        .multiplyScalar(Math.cos(safeAng))
        .addScaledVector(_t, Math.sin(safeAng))
        .normalize();
    }

    // Rodea los edificios en vez de atravesarlos.
    const selfAng = 0.5 / R;
    for (const o of bigObstacles) {
      const minAng = o.r + selfAng;
      if (up.angleTo(o.dir) < minAng) {
        _t.copy(up).addScaledVector(o.dir, -up.dot(o.dir));
        if (_t.lengthSq() < 1e-10) _t.copy(randomTangent(o.dir));
        else _t.normalize();
        up.copy(o.dir)
          .multiplyScalar(Math.cos(minAng))
          .addScaledVector(_t, Math.sin(minAng))
          .normalize();
      }
    }

    reorthogonalize(up, fwd);

    // Vuelo: altura con cabeceo suave e inclinación en las curvas.
    flap += dt * 22;
    const hover = LADYBUG.hover + Math.sin(flap * 0.26) * 0.14;
    mesh.position.copy(up).multiplyScalar(R + hover);
    orient(mesh, up, fwd);
    mesh.rotateZ(bank * 0.5);
    mesh.userData.flapWings(flap);

    // Robo: solo si lleva paquete y no acaba de robarle.
    if (carrying && state.retreatLeft <= 0 && toPlayer < LADYBUG.hitRadius) {
      state.retreatLeft = LADYBUG.retreat;
      return true;
    }
    return false;
  }

  return { mesh, state, update };
}

// ---------------------------------------------------------------------------
// Modelo: cúpula roja con lunares, cabeza negra, antenas y alas.
// ---------------------------------------------------------------------------
function buildLadybug() {
  const group = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xd93434, roughness: 0.42 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.5 });

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2),
    red
  );
  shell.scale.set(1, 0.82, 1.14);

  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(0.44, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    black
  );
  belly.scale.set(1, 0.5, 1.14);

  // Línea central entre los élitros.
  const split = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.9, 8), black);
  split.rotation.x = Math.PI / 2;
  split.position.y = 0.3;

  // Lunares.
  const spotGeo = new THREE.SphereGeometry(0.085, 12, 10);
  for (const [sx, y, z] of [
    [-1, 0.26, -0.12], [1, 0.26, -0.12],
    [-1, 0.2, 0.22], [1, 0.2, 0.22],
    [-1, 0.33, 0.06], [1, 0.33, 0.06],
  ]) {
    const spot = new THREE.Mesh(spotGeo, black);
    spot.position.set(0.24 * sx, y, z);
    spot.scale.set(1, 0.55, 1);
    group.add(spot);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), black);
  head.position.set(0, 0.12, -0.46);
  head.scale.set(1, 0.85, 0.9);

  const eyeGeo = new THREE.SphereGeometry(0.06, 10, 8);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const pupilGeo = new THREE.SphereGeometry(0.03, 8, 8);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0.1 * sx, 0.17, -0.62);
    const pupil = new THREE.Mesh(pupilGeo, black);
    pupil.position.set(0.11 * sx, 0.17, -0.67);
    group.add(eye, pupil);
  }

  // Antenas.
  const antGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.3, 6);
  const tipGeo = new THREE.SphereGeometry(0.055, 10, 8);
  for (const sx of [-1, 1]) {
    const ant = new THREE.Mesh(antGeo, black);
    ant.position.set(0.11 * sx, 0.32, -0.55);
    ant.rotation.set(-0.5, 0, 0.35 * sx);
    const tip = new THREE.Mesh(tipGeo, black);
    tip.position.set(0.19 * sx, 0.46, -0.62);
    group.add(ant, tip);
  }

  // Patas.
  const legGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.3, 6);
  for (const sx of [-1, 1]) {
    for (const z of [-0.22, 0.02, 0.26]) {
      const leg = new THREE.Mesh(legGeo, black);
      leg.position.set(0.34 * sx, -0.08, z);
      leg.rotation.z = 0.9 * sx;
      group.add(leg);
    }
  }

  // Alas translúcidas que baten.
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0xeaf4ff,
    transparent: true,
    opacity: 0.4,
    roughness: 0.2,
    side: THREE.DoubleSide,
  });
  const wingGeo = new THREE.CircleGeometry(0.42, 16, 0, Math.PI);
  const wings = [];
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(wingGeo, wingMat);
    w.position.set(0.12 * sx, 0.4, 0.08);
    group.add(w);
    wings.push(w);
  }

  group.add(shell, belly, split, head);

  group.userData.flapWings = (phase) => {
    const a = Math.sin(phase) * 0.6;
    wings[0].rotation.set(-Math.PI / 2 + 0.3, 0.5 + a, 0.2);
    wings[1].rotation.set(-Math.PI / 2 + 0.3, -0.5 - a, -0.2);
  };

  return group;
}
