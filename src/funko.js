// ---------------------------------------------------------------------------
// El molde compartido de los personajes.
//
// Lo usan tanto los NPC (src/npc.js) como el mensajero (src/player.js), que es
// lo que garantiza que todos tengan la misma estatura y las mismas
// proporciones: una colección pareja en vez de figuras sueltas.
//
// Las proporciones son lo que define el estilo, no el detalle:
//   - la cabeza ocupa ~42% de la altura total y es una caja redondeada
//   - no hay cuello: la cabeza se apoya directo sobre el cuerpo
//   - el cuerpo es pequeño y los brazos y piernas son cortos y rectos
//   - los ojos son dos óvalos negros macizos, sin blanco ni pupila
//   - no hay nariz ni boca (salvo un detalle puntual)
//   - colores planos y acabado de vinilo mate
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Vinilo mate: poca rugosidad para un brillo suave, nada de metal. */
export const mat = (color, rough = 0.55, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });

/**
 * Caja redondeada con el radio acotado.
 *
 * RoundedBoxGeometry no comprueba nada: si el radio supera la mitad del lado
 * más corto, la pieza sale deformada y más pequeña de lo pedido. Pasa fácil
 * con piezas aplastadas (un casquete, una barba), y el síntoma es que deja de
 * cubrir lo que debería. Aquí se limita siempre.
 */
export function roundedBox(w, h, d, segments = 4, radius = 0.1) {
  const safe = Math.min(radius, Math.min(w, h, d) / 2 - 0.001);
  return new RoundedBoxGeometry(w, h, d, segments, safe);
}

// --- medidas del molde ------------------------------------------------------
export const F = {
  headW: 1.02,
  headH: 0.96,
  headD: 0.92,
  headBottom: 1.26,
  bodyTop: 1.3,
  bodyBottom: 0.5,
  legTop: 0.56,
  shoulderY: 1.18,
  armLen: 0.52,
};
F.headY = F.headBottom + F.headH / 2; // centro de la cabeza

// Contexturas. Solo cambian anchos: la altura se mantiene para que el grupo
// se vea parejo.
export const BUILDS = {
  slim: { body: 0.62, depth: 0.42, shoulder: 0.4, legX: 0.15, legW: 0.25, arm: 0.18 },
  normal: { body: 0.72, depth: 0.46, shoulder: 0.44, legX: 0.17, legW: 0.28, arm: 0.2 },
  wide: { body: 0.86, depth: 0.52, shoulder: 0.51, legX: 0.19, legW: 0.32, arm: 0.23 },
};

/**
 * Construye el cuerpo base dentro de `rig` y devuelve las piezas articuladas.
 *
 * Las piernas y los brazos son grupos con el pivote en la cadera y en el
 * hombro, así que se pueden rotar para animar una caminata. Los NPC
 * simplemente no los rotan.
 *
 * Ojo con el sentido: el personaje mira hacia -Z. Para levantar un brazo
 * HACIA ADELANTE hay que rotarlo en X con ángulo POSITIVO.
 */
export function buildFunkoBase(rig, o) {
  const b = BUILDS[o.build] || BUILDS.normal;
  const skinMat = mat(o.skin, 0.6);
  const topMat = mat(o.top);
  const pantsMat = mat(o.pants, 0.62);
  const shoeMat = mat(o.shoes, 0.5);
  const soleMat = mat(o.sole ?? 0x2e3138, 0.7);

  // --- piernas: cortas y rectas, pivote en la cadera -----------------------
  const legH = F.legTop;
  const legGeo = roundedBox(b.legW, legH, 0.3, 3, 0.1);
  legGeo.translate(0, -legH / 2, 0);
  const shoeGeo = roundedBox(b.legW + 0.05, 0.16, 0.42, 3, 0.07);
  const soleGeo = roundedBox(b.legW + 0.07, 0.07, 0.44, 3, 0.03);

  const legs = {};
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(b.legX * sx, F.legTop, 0);
    leg.add(new THREE.Mesh(legGeo, pantsMat));

    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(0, -F.legTop + 0.11, -0.06);
    const sole = new THREE.Mesh(soleGeo, soleMat);
    sole.position.set(0, -F.legTop + 0.035, -0.06);
    leg.add(shoe, sole);

    rig.add(leg);
    legs[sx < 0 ? 'legL' : 'legR'] = leg;
  }

  // --- cuerpo: bloque chico, el ancho lo da la contextura ------------------
  const bodyH = F.bodyTop - F.bodyBottom;
  const body = new THREE.Mesh(
    roundedBox(b.body, bodyH, b.depth, 4, 0.16),
    topMat
  );
  body.position.y = F.bodyBottom + bodyH / 2;
  rig.add(body);

  // --- brazos: rectos, pivote en el hombro ---------------------------------
  // Sin mangas el brazo entero es piel; con mangas lo cubre la ropa.
  const armGeo = roundedBox(b.arm, F.armLen, b.arm + 0.02, 3, 0.09);
  armGeo.translate(0, -F.armLen / 2, 0);
  const handGeo = new THREE.SphereGeometry(0.105, 12, 10);

  const arms = {};
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(b.shoulder * sx, F.shoulderY, 0);
    arm.add(new THREE.Mesh(armGeo, o.sleeveless ? skinMat : topMat));
    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.y = -F.armLen;
    hand.scale.set(1, 0.9, 1);
    arm.add(hand);
    rig.add(arm);
    arms[sx < 0 ? 'armL' : 'armR'] = arm;
  }

  // Sisa: un reborde del color de la prenda marca dónde termina la tela.
  if (o.sleeveless) {
    for (const sx of [-1, 1]) {
      const hole = new THREE.Mesh(
        new THREE.TorusGeometry(b.arm * 0.6, 0.035, 8, 16),
        topMat
      );
      hole.position.set(b.shoulder * 0.86 * sx, F.shoulderY - 0.02, 0);
      hole.rotation.y = Math.PI / 2;
      rig.add(hole);
    }
  }

  // --- cabeza ---------------------------------------------------------------
  // En su propio grupo, para poder inclinarla en la animación.
  const headGroup = new THREE.Group();
  headGroup.position.y = F.headY;
  rig.add(headGroup);

  headGroup.add(
    new THREE.Mesh(roundedBox(F.headW, F.headH, F.headD, 5, 0.3), skinMat)
  );

  // Ojos: dos óvalos negros macizos. Es el rasgo que más define el estilo.
  const faceZ = -F.headD / 2;
  const eyeGeo = new THREE.SphereGeometry(0.13, 16, 12);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, mat(0x15151a, 0.35));
    eye.position.set(0.22 * sx, 0, faceZ + 0.02);
    eye.scale.set(0.92, 1.15, 0.3);
    headGroup.add(eye);
  }

  return {
    ...legs,
    ...arms,
    body,
    headGroup,
    width: b,
    skinMat,
    topMat,
    pantsMat,
    shoeMat,
  };
}

/**
 * Masa de pelo que envuelve cráneo, sienes y nuca, dejando libre solo la cara.
 *
 * Es la pieza que evita el efecto de pelo ralo: sin ella, un casquete que solo
 * cubre de la frente hacia arriba deja los laterales y la nuca al descubierto,
 * y entre mechón y mechón asoma la piel.
 *
 * Va desplazada hacia atrás en Z para que la cara quede despejada. Su cara
 * frontal queda en z = -0.33, bien por detrás de los ojos (z = -0.44).
 */
// La envoltura llega por arriba hasta aquí; `bottom` decide hasta dónde baja:
// -0.26 es un corte corto (tapa orejas y nuca) y -0.45 una melena.
//
// No conviene subir mucho el borde: las esquinas de la caja son redondeadas,
// así que cerca del borde la pieza se estrecha y deja ver piel justo en la
// línea del pelo. Hay que terminarla por debajo de donde debe cubrir.
const SHELL_TOP = 0.53;
export const SHELL_SHORT = -0.26;
export const SHELL_LONG = -0.45;

export function hairShellGeometry({ bottom = SHELL_LONG } = {}) {
  const h = SHELL_TOP - bottom;
  const g = roundedBox(F.headW * 1.08, h, F.headD * 0.94, 5, 0.2);
  g.translate(0, (SHELL_TOP + bottom) / 2, 0.1);
  return g;
}

// Los ojos ocupan hasta y = 0.15. Todo lo que vaya por delante de la cara
// debe quedar por encima de esa línea o les comerá el borde superior.
const BROW_Y = 0.16;

/**
 * Mechón de la sien, en x = ±0.47.
 *
 * La envoltura llega solo hasta z = -0.33 y sus esquinas van redondeadas, así
 * que la esquina delantera de la cabeza (la sien, justo al lado del ojo) queda
 * al aire y parece una entrada. Esta pieza la tapa.
 *
 * Va por fuera de x = 0.38, y los ojos terminan en x = 0.34: no los toca.
 */
export function templeLockGeometry(sx) {
  const g = roundedBox(0.18, 0.44, 0.32, 4, 0.08);
  g.translate(F.headW * 0.46 * sx, 0, -F.headD * 0.22);
  return g;
}

/** Pelo corto: envoltura hasta la nuca, casquete y mechón al frente. */
export function hairCap(headGroup, color, { sweep = true, bottom = SHELL_SHORT } = {}) {
  const m = mat(color);

  // Cubre cráneo y nuca. Sin esto el pelo corto deja los costados pelados.
  headGroup.add(new THREE.Mesh(hairShellGeometry({ bottom }), m));
  // Y las sienes, que la envoltura no alcanza.
  for (const sx of [-1, 1]) {
    headGroup.add(new THREE.Mesh(templeLockGeometry(sx), m));
  }

  const capH = F.headH * 0.42;
  const cap = new THREE.Mesh(
    roundedBox(F.headW * 1.06, capH, F.headD * 1.06, 5, 0.26),
    m
  );
  cap.position.y = BROW_Y + capH / 2;
  headGroup.add(cap);

  if (sweep) {
    const tuft = new THREE.Mesh(
      roundedBox(F.headW * 0.62, 0.2, 0.3, 4, 0.09),
      m
    );
    tuft.position.set(F.headW * 0.1, BROW_Y + 0.13, -F.headD / 2 + 0.04);
    tuft.rotation.z = -0.16;
    headGroup.add(tuft);
  }
  return cap;
}

export { BROW_Y };

export { RoundedBoxGeometry };
