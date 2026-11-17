// ---------------------------------------------------------------------------
// Matemática de movimiento sobre una esfera.
//
// Idea central: la posición del jugador se representa con `up`, un vector
// unitario que apunta desde el centro del planeta hacia él. La gravedad es
// radial, así que `up` ES la normal del suelo bajo sus pies. La dirección de
// avance `fwd` es siempre tangente, es decir perpendicular a `up`.
// ---------------------------------------------------------------------------
import * as THREE from 'three';

const _back = new THREE.Vector3();
const _right = new THREE.Vector3();
const _basis = new THREE.Matrix4();

/** Orienta un objeto para que se pare derecho sobre la superficie.
 *  En three.js un objeto "mira" hacia su -Z local y su arriba es su +Y local. */
export function orient(obj, up, fwd) {
  _back.copy(fwd).negate();
  _right.crossVectors(up, _back).normalize();
  obj.quaternion.setFromRotationMatrix(_basis.makeBasis(_right, up, _back));
}

/** El mismo cálculo, devolviendo el quaternion (lo necesita InstancedMesh). */
export function orientQuaternion(up, fwd, out = new THREE.Quaternion()) {
  _back.copy(fwd).negate();
  _right.crossVectors(up, _back).normalize();
  return out.setFromRotationMatrix(_basis.makeBasis(_right, up, _back));
}

/** Un vector unitario tangente al plano de `up`, de dirección aleatoria. */
export function randomTangent(up, rnd = Math.random) {
  const t = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
  if (t.lengthSq() < 1e-6) t.set(1, 0, 0);
  t.addScaledVector(up, -t.dot(up));
  if (t.lengthSq() < 1e-10) {
    // Quedó paralelo a `up`: elige cualquier perpendicular válida.
    t.set(up.y, -up.x, 0);
    if (t.lengthSq() < 1e-10) t.set(0, up.z, -up.y);
  }
  return t.normalize();
}

/** Proyecta la dirección hacia `targetDir` sobre el plano tangente de `up`.
 *  Es la base de la brújula: "¿hacia dónde giro desde donde estoy parado?" */
export function tangentTowards(up, targetDir, out = new THREE.Vector3()) {
  out.copy(targetDir).addScaledVector(up, -targetDir.dot(up));
  if (out.lengthSq() < 1e-10) return out.set(0, 0, 0);
  return out.normalize();
}

/** Avanza `arc` radianes por el círculo máximo que definen (up, fwd).
 *  Rota AMBOS vectores, así `fwd` sigue siendo tangente después del paso. */
export function moveOnSphere(up, fwd, arc) {
  const c = Math.cos(arc);
  const s = Math.sin(arc);
  const ux = up.x * c + fwd.x * s;
  const uy = up.y * c + fwd.y * s;
  const uz = up.z * c + fwd.z * s;
  const fx = fwd.x * c - up.x * s;
  const fy = fwd.y * c - up.y * s;
  const fz = fwd.z * c - up.z * s;
  up.set(ux, uy, uz).normalize();
  fwd.set(fx, fy, fz).normalize();
}

/** Vuelve a hacer `fwd` perpendicular a `up`, corrigiendo el error numérico
 *  que se acumula tras miles de rotaciones. */
export function reorthogonalize(up, fwd) {
  fwd.addScaledVector(up, -fwd.dot(up));
  if (fwd.lengthSq() < 1e-10) fwd.copy(randomTangent(up));
  else fwd.normalize();
}

/** Generador pseudoaleatorio con semilla: el mundo sale idéntico en cada
 *  carga, así toda la clase juega exactamente el mismo planeta. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Puntos casi uniformes sobre la esfera (espiral de Fibonacci).
 *  Se usa para repartir las paradas sin que queden amontonadas. */
export function fibonacciSphere(count) {
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * i + 1) / count;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    pts.push(
      new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r).normalize()
    );
  }
  return pts;
}
