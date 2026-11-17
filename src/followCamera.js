// ---------------------------------------------------------------------------
// Cámara de seguimiento. Dos detalles importantes:
//  1. El "arriba" de la cámara también se interpola, si no la imagen daría
//     tumbos al rodear el planeta.
//  2. El suavizado usa 1 - exp(-k*dt), no un lerp fijo, para que el resultado
//     no dependa de los fotogramas por segundo del equipo.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { CAMERA, PLANET } from './config.js';

export function createFollowCamera() {
  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov,
    window.innerWidth / window.innerHeight,
    0.1,
    400
  );

  const camPos = new THREE.Vector3(0, PLANET.radius + CAMERA.height, CAMERA.back);
  const camUp = new THREE.Vector3(0, 1, 0);
  const _target = new THREE.Vector3();
  const _look = new THREE.Vector3();

  function update(dt, player, instant = false) {
    const { up, fwd } = player;

    _target
      .copy(player.mesh.position)
      .addScaledVector(up, CAMERA.height)
      .addScaledVector(fwd, -CAMERA.back);

    const k = instant ? 1 : 1 - Math.exp(-CAMERA.lag * dt);
    camPos.lerp(_target, k);
    camUp.lerp(up, k).normalize();

    camera.position.copy(camPos);
    camera.up.copy(camUp);

    _look
      .copy(player.mesh.position)
      .addScaledVector(up, 1.2)
      .addScaledVector(fwd, 3.5);
    camera.lookAt(_look);
  }

  function resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return { camera, update, resize };
}
