// ---------------------------------------------------------------------------
// Lógica de entregas.
//
// Ciclo del juego:
//   1. El jugador va a la central y recoge un paquete.
//   2. Se le asigna una casa. La Casa de Inducción es SIEMPRE la primera;
//      después el orden es aleatorio entre las que falten.
//   3. Al llegar, el NPC le hace una pregunta de alternativas. Si acierta,
//      entrega su fragmento de la clave y el principio que hay detrás.
//   4. Vuelve a la central por el siguiente paquete.
//
// Por el camino ronda una chinita: si toca al mensajero mientras lleva un
// paquete, se lo roba y hay que volver a la central por otro. El destino
// asignado no cambia.
//
// Los fragmentos se ensamblan por su índice, no por el orden de entrega, así
// que la clave final es siempre la misma.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { PLANET, INTERACT, keyTail } from './config.js';
import { tangentTowards } from './sphereMath.js';

const R = PLANET.radius;

// Fases: 'start' (menú) | 'play' | 'question' (tarjeta abierta) | 'done'
export function createGame(world, player, ui, ladybug = null) {
  const stops = world.stops;
  const collected = new Array(stops.length).fill(null);

  const st = {
    phase: 'start',
    carrying: false,
    assigned: null, // destino vigente; sobrevive a un robo
    delivered: 0,
    elapsed: 0,
    stolen: 0,
    wrongAnswers: 0,
  };

  const _t = new THREE.Vector3();
  const _right = new THREE.Vector3();

  /** Distancia caminando (longitud de arco) desde el jugador hasta `dir`. */
  const arcTo = (dir) => player.up.angleTo(dir) * R;

  function assignTarget() {
    const pending = stops.filter((s) => !s.delivered);
    if (!pending.length) return null;
    // La casa marcada `first` en config.js va siempre antes que el resto.
    const forced = pending.find((s) => s.first);
    const pick = forced || pending[Math.floor(Math.random() * pending.length)];
    st.assigned = pick;
    pick.beacon.visible = true;
    return pick;
  }

  function announceTarget() {
    const s = st.assigned;
    if (!s) return;
    ui.setObjective(
      `Entregar en ${s.name}`,
      `Te espera ${s.npcName}`,
      `#${(s.beaconColor || s.roofColor).toString(16).padStart(6, '0')}`
    );
  }

  function announceDepot(reason) {
    ui.setObjective(
      'Vuelve a la central por un paquete',
      reason || `Faltan ${stops.length - st.delivered} entregas`
    );
  }

  function pickUp() {
    st.carrying = true;
    player.setCarrying(true);
    if (!st.assigned) assignTarget();
    announceTarget();
    ui.toast('Paquete recogido. Sigue la baliza de color.');
  }

  /** La chinita se queda con la encomienda. */
  function loseParcel() {
    st.carrying = false;
    st.stolen++;
    player.setCarrying(false);
    ui.bugAlert(); // aviso en la esquina, no detiene el juego
    announceDepot('Un bug se llevó tu paquete');
  }

  function arrive(stop) {
    st.phase = 'question';
    ui.showQuestion(stop, {
      // Devuelve true si la alternativa elegida es la correcta.
      onAnswer(index) {
        const ok = index === stop.question.correct;
        if (!ok) st.wrongAnswers++;
        return ok;
      },
      onContinue() {
        deliver(stop);
      },
    });
  }

  function deliver(stop) {
    st.carrying = false;
    player.setCarrying(false);
    stop.delivered = true;
    stop.beacon.visible = false;
    stop.npc.celebrate();
    st.assigned = null;
    st.delivered++;
    collected[stop.index] = stop.fragment;

    ui.fillSlot(stop.index, stop.fragment);
    ui.setProgress(st.delivered, stops.length);

    // La casa atendida se marca apagando su techo.
    const roof = stop.building.userData.roof;
    if (roof && roof.material) {
      roof.material = roof.material.clone();
      roof.material.color.lerp(new THREE.Color(0x6d7a68), 0.55);
    }

    if (st.delivered >= stops.length) finish();
    else {
      st.phase = 'play';
      announceDepot();
    }
  }

  function finish() {
    st.phase = 'done';
    // Los fragmentos recogidos solo forman la cadena hasta sus dos últimos
    // caracteres. Esa cola se añade aquí, al completar la ruta.
    //
    // El juego NO la decodifica: entregar la cadena codificada es el final
    // del desafío, y descubrir cómo volverla legible le toca al alumnado.
    // Como nadie llama aquí a decodeKey, la clave en claro no llega a existir
    // en el navegador en ningún momento.
    ui.showFinal(collected.join('') + keyTail(), st.elapsed, {
      stolen: st.stolen,
      wrong: st.wrongAnswers,
    });
  }

  function start() {
    st.phase = 'play';
    ui.hideStart();
    ui.setProgress(0, stops.length);
    announceDepot('Está donde empezaste');
  }

  /** Brújula: ángulo horario desde "arriba de la pantalla" hasta el objetivo.
   *  La pantalla mira a lo largo de `fwd`, y su derecha es cross(up, -fwd). */
  function compassAngle(dir) {
    tangentTowards(player.up, dir, _t);
    if (_t.lengthSq() === 0) return 0;
    _right.crossVectors(player.up, player.fwd).negate().normalize();
    return Math.atan2(_t.dot(_right), _t.dot(player.fwd));
  }

  function update(dt) {
    // El mundo sigue vivo aunque haya una tarjeta abierta.
    const t = performance.now() * 0.001;
    for (const s of stops) {
      s.npc.update(t, dt);
      if (!s.beacon.visible) continue;
      s.beacon.userData.cone.position.y = Math.sin(t * 2.2) * 0.35;
      s.beacon.rotateY(dt * 1.6);
    }

    if (st.phase === 'done' || st.phase === 'start') return;

    // La chinita vuela siempre, pero solo roba durante el juego.
    if (ladybug) {
      const vulnerable = st.carrying && st.phase === 'play';
      if (ladybug.update(dt, player, vulnerable)) loseParcel();
    }

    if (st.phase !== 'play') return;

    st.elapsed += dt;
    ui.setTimer(st.elapsed);

    if (!st.carrying) {
      const d = arcTo(world.depotDir);
      ui.setDistance(d);
      ui.setCompass(compassAngle(world.depotDir), d > INTERACT.pickup);
      if (d < INTERACT.pickup) pickUp();
    } else if (st.assigned) {
      const d = arcTo(st.assigned.dir);
      ui.setDistance(d);
      ui.setCompass(compassAngle(st.assigned.dir), d > INTERACT.deliver);
      if (d < INTERACT.deliver) arrive(st.assigned);
    }
  }

  return {
    state: st,
    start,
    update,
    get acceptsInput() {
      return st.phase === 'play';
    },
  };
}
