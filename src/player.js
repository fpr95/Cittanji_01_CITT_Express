// ---------------------------------------------------------------------------
// El mensajero: estudiante universitaria o universitario, de rasgos
// deliberadamente neutros. No hay nada en el modelo que indique género:
// pelo de largo medio, polera holgada, jeans anchos, zapatillas y mochila.
//
// Usa el mismo molde funko que los NPC (src/funko.js), así que comparte
// estatura y proporciones con ellos.
//
// La caminata es un ciclo real sobre las articulaciones del molde:
//   - las piernas oscilan en oposición de fase
//   - los brazos acompañan en oposición a la pierna del mismo lado
//   - el cuerpo sube cuando una pierna pasa vertical y baja en la zancada
//   - el torso se inclina hacia la marcha
//
// Ojo con el sentido de giro: el personaje mira hacia -Z, así que rotar un
// brazo en X con ángulo POSITIVO lo lleva hacia adelante. Con ángulo negativo
// se va hacia atrás, que es justo lo que no se quiere al cargar el paquete.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { PLANET, PLAYER } from './config.js';
import { orient, moveOnSphere, randomTangent, reorthogonalize } from './sphereMath.js';
import {
  F,
  mat,
  buildFunkoBase,
  hairShellGeometry,
  roundedBox,
} from './funko.js';

const R = PLANET.radius;

const LOOK = {
  build: 'normal',
  skin: 0xf0c08a,
  top: 0xff7a3d, // polera naranja: se ve bien contra el pasto y el cielo
  pants: 0x4a6ea8, // jeans anchos
  shoes: 0xf4f4f4, // zapatillas blancas
  sole: 0x3a3a42,
};
const HAIR = 0x4a3328;
const PACK = 0x2a9d8f;

// Pose al cargar: brazos adelante, casi horizontales, para sostener la caja.
const CARRY_X = 1.25; // positivo = hacia adelante
const CARRY_Z = 0.26; // un poco hacia adentro, para que las manos se junten

export function createPlayer(scene) {
  const mesh = new THREE.Group(); // posición y orientación sobre la esfera
  mesh.scale.setScalar(PLAYER.scale);
  const rig = new THREE.Group(); // rebote e inclinación
  mesh.add(rig);
  scene.add(mesh);

  const parts = buildFunkoBase(rig, LOOK);
  const { legL, legR, armL, armR, headGroup, width } = parts;

  // --- pelo de largo medio, sin marcar género ------------------------------
  // Primero la envoltura que cubre cráneo, sienes y nuca. Sin ella el pelo
  // solo taparía de la frente hacia arriba y se vería piel por los costados.
  const hairMat = mat(HAIR);
  headGroup.add(new THREE.Mesh(hairShellGeometry(), hairMat));

  // Casquete superior, que llega hasta la línea de las cejas por delante.
  const cap = new THREE.Mesh(
    roundedBox(F.headW * 1.06, F.headH * 0.44, F.headD * 1.06, 5, 0.27),
    hairMat
  );
  cap.position.y = F.headH * 0.38;
  headGroup.add(cap);

  // Flequillo: cruza la frente justo por encima de los ojos.
  const fringe = new THREE.Mesh(
    roundedBox(F.headW * 0.94, 0.19, 0.24, 4, 0.08),
    hairMat
  );
  fringe.position.set(0, F.headH * 0.3, -F.headD / 2 - 0.02);
  headGroup.add(fringe);

  // Mechones que enmarcan la cara, por delante de la envoltura.
  for (const sx of [-1, 1]) {
    const lock = new THREE.Mesh(
      roundedBox(0.19, F.headH * 0.78, 0.3, 4, 0.09),
      hairMat
    );
    lock.position.set(F.headW * 0.46 * sx, -F.headH * 0.2, -F.headD * 0.28);
    headGroup.add(lock);
  }

  // Melena de largo medio: baja por detrás hasta los hombros.
  const back = new THREE.Mesh(
    roundedBox(F.headW * 0.98, F.headH * 0.72, 0.4, 4, 0.17),
    hairMat
  );
  back.position.set(0, -F.headH * 0.42, F.headD * 0.42);
  headGroup.add(back);

  // --- mochila --------------------------------------------------------------
  const packMat = mat(PACK, 0.65);
  const pack = new THREE.Mesh(
    roundedBox(width.body * 0.82, 0.68, 0.3, 4, 0.12),
    packMat
  );
  pack.position.set(0, 0.95, width.depth / 2 + 0.16);
  rig.add(pack);

  const lid = new THREE.Mesh(
    roundedBox(width.body * 0.84, 0.22, 0.33, 3, 0.09),
    mat(0x218075, 0.65)
  );
  lid.position.set(0, 1.22, width.depth / 2 + 0.16);
  rig.add(lid);

  // Correas sobre los hombros, por delante.
  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(
      roundedBox(0.09, 0.62, 0.07, 3, 0.03),
      packMat
    );
    strap.position.set(0.2 * sx, 1.0, -width.depth / 2 - 0.02);
    rig.add(strap);
  }

  // --- paquete transportado -------------------------------------------------
  const parcel = new THREE.Group();
  const box = new THREE.Mesh(
    roundedBox(0.46, 0.42, 0.42, 3, 0.05),
    mat(0xd79a56, 0.8)
  );
  const tape = new THREE.Mesh(
    roundedBox(0.48, 0.1, 0.44, 2, 0.02),
    mat(0xb5793c, 0.85)
  );
  parcel.add(box, tape);
  parcel.visible = false;
  rig.add(parcel);

  // Va justo donde quedan las manos con la pose de carga.
  const PARCEL_CARRY = new THREE.Vector3(0, 1.02, -0.55);
  const PARCEL_REST = new THREE.Vector3(0, 0.86, -0.3);
  // Colocado ya desde el inicio: si se queda en el origen, el paquete cuelga
  // bajo los pies hasta el primer fotograma de animación.
  parcel.position.copy(PARCEL_REST);

  // --- estado ---------------------------------------------------------------
  const up = new THREE.Vector3(0, 1, 0);
  const fwd = new THREE.Vector3(0, 0, -1);
  const state = { up, fwd, carrying: false, speedNow: 0 };

  let walkPhase = 0;
  let lean = 0;
  let carryBlend = 0;

  const _t = new THREE.Vector3();
  const _prev = new THREE.Vector3();
  const lerp = (a, b, t) => a + (b - a) * t;

  /** Un paso de simulación. `input` = { move: -1..1, turn: -1..1 }. */
  function step(dt, input, obstacles) {
    // Posición válida de partida: si el paso acaba en un enredo, se vuelve aquí.
    _prev.copy(up);

    if (input.turn) fwd.applyAxisAngle(up, input.turn * PLAYER.turn * dt);

    const dist = input.move * PLAYER.speed * dt;
    if (dist) moveOnSphere(up, fwd, dist / R); // arco -> ángulo

    // --- colisiones ---------------------------------------------------------
    // Todo obstáculo es un círculo sobre la esfera. Si el jugador entró en uno,
    // se lo empuja al borde por el camino más corto, lo que produce un
    // deslizamiento natural en vez de un bloqueo seco.
    const selfAng = PLAYER.radius / R;
    for (let pass = 0; pass < 4; pass++) {
      let hit = false;
      for (const o of obstacles) {
        const minAng = o.r + selfAng;
        if (up.angleTo(o.dir) < minAng) {
          _t.copy(up).addScaledVector(o.dir, -up.dot(o.dir));
          if (_t.lengthSq() < 1e-10) _t.copy(randomTangent(o.dir));
          else _t.normalize();
          up.copy(o.dir)
            .multiplyScalar(Math.cos(minAng))
            .addScaledVector(_t, Math.sin(minAng))
            .normalize();
          hit = true;
        }
      }
      if (!hit) break;
    }

    // En un rincón entre dos edificios, sacarlo de uno puede meterlo en el
    // otro y las pasadas no convergen. Ahí simplemente no se avanza: es la
    // única forma de garantizar que nunca se queda dentro de una pared.
    for (const o of obstacles) {
      if (up.angleTo(o.dir) < o.r + selfAng - 1e-9) {
        up.copy(_prev);
        break;
      }
    }

    reorthogonalize(up, fwd);
    mesh.position.copy(up).multiplyScalar(R);
    orient(mesh, up, fwd);

    animate(dt, input);
  }

  // --- ciclo de caminata ----------------------------------------------------
  function animate(dt, input) {
    const moving = Math.abs(input.move) > 0.01;
    const sign = Math.sign(input.move) || 1;
    state.speedNow = Math.abs(input.move) * PLAYER.speed;

    const k = 1 - Math.exp(-9 * dt); // suavizado estable con cualquier fps
    carryBlend = lerp(carryBlend, state.carrying ? 1 : 0, k);

    if (moving) {
      walkPhase += dt * 8.5 * Math.abs(input.move);
      const stride = Math.sin(walkPhase);

      // Piernas cortas: una zancada corta se lee mejor que una larga.
      legL.rotation.x = stride * 0.45 * sign;
      legR.rotation.x = -stride * 0.45 * sign;

      // El cuerpo sube cuando una pierna pasa vertical (stride cerca de 0).
      rig.position.y = (1 - Math.abs(stride)) * 0.06;
      rig.rotation.y = stride * 0.05 * sign;
      lean = lerp(lean, -0.12 * input.move, k);

      // Brazos: o acompañan la zancada, o sostienen el paquete por delante.
      const swingL = -stride * 0.42 * sign;
      const swingR = stride * 0.42 * sign;
      const carry = CARRY_X + Math.sin(walkPhase) * 0.04;
      armL.rotation.x = lerp(swingL, carry, carryBlend);
      armR.rotation.x = lerp(swingR, carry, carryBlend);
      armL.rotation.z = lerp(0.1, CARRY_Z, carryBlend);
      armR.rotation.z = lerp(-0.1, -CARRY_Z, carryBlend);
    } else {
      // Reposo: respiración lenta y los brazos vuelven a su sitio.
      walkPhase += dt * 1.6;
      const breathe = Math.sin(walkPhase) * 0.5 + 0.5;

      legL.rotation.x = lerp(legL.rotation.x, 0, k);
      legR.rotation.x = lerp(legR.rotation.x, 0, k);
      rig.position.y = lerp(rig.position.y, breathe * 0.012, k);
      rig.rotation.y = lerp(rig.rotation.y, 0, k);
      lean = lerp(lean, 0, k);

      const idle = breathe * 0.03;
      armL.rotation.x = lerp(armL.rotation.x, lerp(idle, CARRY_X, carryBlend), k);
      armR.rotation.x = lerp(armR.rotation.x, lerp(idle, CARRY_X, carryBlend), k);
      armL.rotation.z = lerp(armL.rotation.z, lerp(0.1, CARRY_Z, carryBlend), k);
      armR.rotation.z = lerp(armR.rotation.z, lerp(-0.1, -CARRY_Z, carryBlend), k);
    }

    rig.rotation.x = lean;
    // La cabeza, que pesa, va un poco retrasada respecto al cuerpo.
    headGroup.rotation.x = -lean * 0.45;

    // El paquete se asienta entre las manos conforme los brazos se levantan.
    parcel.position.lerpVectors(PARCEL_REST, PARCEL_CARRY, carryBlend);
  }

  function setCarrying(v) {
    state.carrying = v;
    parcel.visible = v;
  }

  function reset() {
    up.set(0, 1, 0);
    fwd.set(0, 0, -1);
    setCarrying(false);
    mesh.position.copy(up).multiplyScalar(R);
    orient(mesh, up, fwd);
  }

  reset();
  return { mesh, state, up, fwd, step, setCarrying, reset };
}
