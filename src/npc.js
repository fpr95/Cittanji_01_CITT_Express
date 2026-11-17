// ---------------------------------------------------------------------------
// Los NPC que reciben las entregas, uno por casa.
//
// Estilo: figura coleccionable tipo "funko pop". Las proporciones son lo que
// define el estilo, no el detalle:
//   - la cabeza ocupa ~40% de la altura total y es una caja redondeada
//   - no hay cuello: la cabeza se apoya directo sobre el cuerpo
//   - el cuerpo es pequeño y los brazos y piernas son cortos y rectos
//   - los ojos son dos óvalos negros macizos, sin blanco ni pupila
//   - no hay nariz ni boca (salvo un detalle puntual)
//   - colores planos y acabado de vinilo mate
//
// Todo se construye con primitivas. Para cambiar el aspecto de alguien basta
// con editar su entrada en PEOPLE, más abajo.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// Las proporciones y el cuerpo base viven en funko.js, compartidos con el
// mensajero, para que todos midan y se vean igual.
import {
  F,
  mat,
  buildFunkoBase,
  hairCap,
  hairShellGeometry,
  BROW_Y,
  SHELL_LONG,
  SHELL_SHORT,
  templeLockGeometry,
  roundedBox,
} from './funko.js';

// ---------------------------------------------------------------------------
// Las cuatro personas. Esto es lo único que hay que tocar para ajustarlos.
// ---------------------------------------------------------------------------
const PEOPLE = {
  // 40 años, pelo corto y canoso, camisa celeste, pantalón beige,
  // zapatos café oscuro.
  nico: {
    build: 'normal',
    skin: 0xe8b98f,
    top: 0xbcd8ee,
    pants: 0xc9b388,
    shoes: 0x4a3426,
    hair: { style: 'short', color: 0xc2c0bc, streak: 0x8d8b87 },
    extras: ['buttons', 'collar'],
  },
  // 21 años, delgado, estatura media, jeans y camisa floreada sin mangas.
  // Lo acompaña Tux, el pingüino de Linux.
  dani: {
    build: 'slim',
    sleeveless: true,
    skin: 0xc98b5e,
    top: 0xe07a5f, // camisa floreada
    pants: 0x4a6ea8, // jeans
    shoes: 0x2f6b4f,
    hair: { style: 'curly', color: 0x241a14, beard: 0x241a14 },
    extras: ['floralPrint', 'headphones'],
  },
  // 28 años, contextura gruesa, chaleco y pantalón de tela negros,
  // rulos negros de largo medio, lentes.
  milenka: {
    build: 'wide',
    skin: 0xeab98f,
    top: 0x1f1f26,
    pants: 0x17171c,
    shoes: 0x121216,
    hair: { style: 'longCurly', color: 0x1b1016 },
    extras: ['vest', 'glasses:0x9a8fd0', 'lips:0xb3324a'],
  },
  // 30 años, contextura gruesa, polera negra y jeans anchos, barba,
  // lentes y pelo corto hacia un lado.
  fernando: {
    build: 'wide',
    skin: 0xd9a271,
    top: 0x1c1c22, // polera negra
    pants: 0x3f5f91, // jeans anchos
    shoes: 0x121216,
    hair: { style: 'short', color: 0x1d1510, beard: 0x1d1510 },
    extras: ['glasses:0x16161a:square'],
  },
};

/** Fábrica principal. `kind` es el id del NPC definido en config.js. */
export function createNpc({ kind, rnd = Math.random }) {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);

  let parts;
  if (kind === 'clip') parts = buildClip(rig);
  else parts = buildFunko(rig, PEOPLE[kind] || PEOPLE.nico, kind);

  // El pingüino acompaña a Dani.
  if (kind === 'dani') {
    const pet = buildPenguin();
    pet.group.position.set(1.0, 0, 0.3);
    pet.group.rotation.y = -0.4;
    rig.add(pet.group);
    parts.pet = pet;
  }

  const phase = rnd() * Math.PI * 2;
  const bobSpeed = 1.3 + rnd() * 0.35;
  let clock = phase; // fase acumulada del balanceo
  let cheer = 0; // sube a 1 cuando recibe su paquete

  function update(t, dt) {
    // La fase se acumula con dt, no se calcula desde el tiempo absoluto.
    //
    // Antes era sin(t * velocidad * energía), con la energía bajando poco a
    // poco mientras duraba la celebración. Al multiplicar el tiempo absoluto
    // por un factor que cambia, el argumento del seno pega saltos en cada
    // fotograma y el personaje tiembla en vez de moverse. Acumulando, cambiar
    // la velocidad nunca rompe la continuidad.
    const lively = 1 + cheer * 0.3; // la celebración apenas acelera...
    const amp = 1 + cheer * 2.2; // ...lo que crece es la amplitud
    clock += dt * bobSpeed * lively;

    const wave = Math.sin(clock);

    // Una figura de vinilo no camina: se balancea. El movimiento es corto a
    // propósito, y la cabeza, que pesa, va un poco retrasada.
    rig.position.y = Math.abs(wave) * 0.055 * amp;
    rig.rotation.z = wave * 0.035 * (1 + cheer * 0.8);
    if (parts.headGroup) {
      parts.headGroup.rotation.z = -wave * 0.055;
      parts.headGroup.rotation.y = Math.sin(clock * 0.6) * 0.1;
    }

    const swing = wave * (0.09 + cheer * 0.55);
    if (parts.leftArm) parts.leftArm.rotation.z = 0.13 + swing;
    if (parts.rightArm) parts.rightArm.rotation.z = -0.13 - swing;
    if (parts.pet) parts.pet.update(t, phase);

    // Algo más de tres segundos de alegría, decayendo suave.
    if (cheer > 0) cheer = Math.max(0, cheer - dt * 0.3);
  }

  function celebrate() {
    cheer = 1;
  }

  return { group, update, celebrate };
}

// ---------------------------------------------------------------------------
// El molde funko. Devuelve las piezas que necesita la animación.
// ---------------------------------------------------------------------------
function buildFunko(rig, o) {
  // El cuerpo entero viene del molde compartido; aquí solo se le pone encima
  // el pelo, la barba y los accesorios de cada persona.
  const parts = buildFunkoBase(rig, o);
  const { headGroup } = parts;
  o.width = parts.width; // lo necesitan los accesorios

  HAIR[o.hair.style](headGroup, o.hair.color);
  if (o.hair.streak) {
    const streak = new THREE.Mesh(
      roundedBox(F.headW * 0.5, 0.3, F.headD * 1.0, 4, 0.14),
      mat(o.hair.streak)
    );
    streak.position.set(-F.headW * 0.26, F.headH * 0.42, 0.02);
    headGroup.add(streak);
  }
  if (o.hair.beard) addBeard(headGroup, o.hair.beard);

  // Formato de cada accesorio: "nombre" o "nombre:arg1:arg2".
  for (const extra of o.extras || []) {
    const [name, ...args] = extra.split(':');
    EXTRAS[name]?.(rig, headGroup, o, args);
  }

  return { leftArm: parts.armL, rightArm: parts.armR, headGroup };
}

// ---------------------------------------------------------------------------
// Peinados. Todos son masas sólidas: en este estilo el pelo es una pieza.
// ---------------------------------------------------------------------------
const HAIR = {
  /** Corto, con raya al costado. */
  short(headGroup, color) {
    hairCap(headGroup, color);
  },

  /** Volumen rizado, como el de Dani. */
  curly(headGroup, color) {
    headGroup.add(curlMass(color, 0.44, 36, seeded(11), { top: 0.3, spread: 1.15 }));
  },

  /** Melena larga y rizada, cubriendo toda la cabeza.
   *  Primero una masa que envuelve cráneo, sienes y nuca (si no, entre rizo
   *  y rizo asoma la piel y parece pelo ralo), y encima los rizos. */
  longCurly(headGroup, color) {
    headGroup.add(
      curlMass(color, 0.46, 46, seeded(23), { top: 0.3, spread: 1.2, wrap: true })
    );
    const m = mat(color);
    // Mechones largos que caen por los lados hasta los hombros.
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(roundedBox(0.34, 1.0, 0.56, 4, 0.2), m);
      side.position.set(F.headW * 0.5 * sx, -F.headH * 0.44, 0.08);
      side.rotation.z = 0.07 * sx;
      headGroup.add(side);
    }
    const back = new THREE.Mesh(roundedBox(0.92, 0.9, 0.38, 4, 0.17), m);
    back.position.set(0, -F.headH * 0.5, F.headD * 0.44);
    headGroup.add(back);
  },
};

/** Racimo de esferas fundido en una sola malla: el pelo rizado como bloque. */
function curlMass(color, radius, count, rnd, { top = 0.3, spread = 1, wrap = false }) {
  // mergeGeometries exige que TODAS las geometrías estén indexadas o ninguna.
  // La caja redondeada no lo está y las esferas sí, así que se normaliza.
  const geos = [];
  const push = (g) => geos.push(g.index ? g.toNonIndexed() : g);

  // Sin la envoltura, entre rizo y rizo se ve la piel y parece pelo ralo.
  // `wrap` la baja hasta cubrir el cráneo entero (melena); si no, termina
  // sobre las orejas y la nuca, como un corte corto.
  push(hairShellGeometry({ bottom: wrap ? SHELL_LONG : SHELL_SHORT }));
  // Las sienes quedan fuera del alcance de la envoltura.
  for (const sx of [-1, 1]) push(templeLockGeometry(sx));

  // Casquete superior: cubre la coronilla y baja hasta la línea de las cejas,
  // nunca por debajo, o le comería el borde de arriba a los ojos.
  const capH = F.headH * 0.44;
  const base = roundedBox(F.headW * 1.06, capH, F.headD * 1.06, 5, 0.27);
  base.translate(0, BROW_Y + capH / 2, 0);
  push(base);

  // El factor vertical va bajo a propósito: los rizos dan volumen a los
  // lados, no altura, para que todos los personajes midan casi lo mismo.
  let placed = 0;
  for (let attempt = 0; attempt < count * 4 && placed < count; attempt++) {
    const a = rnd() * Math.PI * 2;
    const p = rnd() * 1.3;
    const s = 0.13 + rnd() * 0.07;
    const x = Math.cos(a) * radius * Math.sin(p) * spread;
    const y = F.headH * top + Math.cos(p) * radius * 0.45;
    const z = Math.sin(a) * radius * Math.sin(p) * spread;

    // Un rizo por delante de la cara y por debajo de las cejas taparía los
    // ojos. Se descarta y se sortea otro.
    if (z < -0.3 && y < BROW_Y + 0.06) continue;

    const g = new THREE.SphereGeometry(s, 10, 8);
    g.translate(x, y, z);
    push(g);
    placed++;
  }
  return new THREE.Mesh(mergeGeometries(geos, false), mat(color));
}

/** Barba: una pieza maciza que envuelve la mandíbula.
 *  Va justo por debajo de los ojos (que ocupan hasta y = -0.15) y asoma un
 *  poco por debajo de la cabeza, como una barba de verdad. */
function addBeard(headGroup, color) {
  const beard = new THREE.Mesh(
    roundedBox(F.headW * 0.96, F.headH * 0.42, F.headD * 0.98, 5, 0.22),
    mat(color)
  );
  beard.position.set(0, -F.headH * 0.38, 0.01);
  headGroup.add(beard);

  // Bigote: una pieza fina que une la barba con la nariz ausente.
  const stache = new THREE.Mesh(
    roundedBox(F.headW * 0.4, 0.11, 0.14, 3, 0.05),
    mat(color)
  );
  stache.position.set(0, -F.headH * 0.21, -F.headD / 2 - 0.01);
  headGroup.add(stache);
}

// ---------------------------------------------------------------------------
// Accesorios.
// ---------------------------------------------------------------------------
const EXTRAS = {
  /** Botones de camisa. */
  buttons(rig, headGroup, o) {
    const geo = new THREE.SphereGeometry(0.035, 8, 6);
    const m = mat(0xffffff, 0.4);
    const z = -o.width.depth / 2 - 0.015;
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(geo, m);
      b.position.set(0, 1.12 - i * 0.2, z);
      b.scale.set(1, 1, 0.6);
      rig.add(b);
    }
  },

  /** Cuello de camisa: dos solapas sobre el pecho.
   *  Un tono más oscuro que la camisa, si no no se distingue del torso. */
  collar(rig, headGroup, o) {
    const m = mat(new THREE.Color(o.top).multiplyScalar(0.86).getHex(), 0.5);
    const z = -o.width.depth / 2 - 0.01;
    for (const sx of [-1, 1]) {
      const flap = new THREE.Mesh(roundedBox(0.22, 0.2, 0.1, 3, 0.05), m);
      flap.position.set(0.13 * sx, 1.21, z);
      flap.rotation.z = 0.5 * sx;
      rig.add(flap);
    }
  },

  /** Estampado de la camisa: unas pocas flores sueltas sobre la tela.
   *  A esta escala no hace falta más; una textura sería desperdicio. */
  floralPrint(rig, headGroup, o) {
    const b = o.width;
    const petal = mat(0xf7e3c8, 0.5);
    const heart = mat(0x9a4a3a, 0.5);
    const spots = [
      [-0.18, 1.12, -1], [0.16, 0.95, -1], [-0.08, 0.72, -1],
      [0.2, 1.15, 1], [-0.14, 0.86, 1],
    ];
    for (const [x, y, side] of spots) {
      const z = side < 0 ? -b.depth / 2 - 0.01 : b.depth / 2 + 0.01;
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), petal);
      flower.position.set(x, y, z);
      flower.scale.set(1, 1, 0.25);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), heart);
      core.position.set(x, y, z + (side < 0 ? -0.01 : 0.01));
      core.scale.set(1, 1, 0.3);
      rig.add(flower, core);
    }
  },

  /** Chaleco: un panel más oscuro sobre el torso, con solapas. */
  vest(rig, headGroup, o) {
    const b = o.width;
    const m = mat(0x101015, 0.5);
    const back = new THREE.Mesh(
      roundedBox(b.body + 0.04, 0.7, b.depth + 0.04, 4, 0.14),
      m
    );
    back.position.y = 0.92;
    rig.add(back);
    // La abertura delantera: dos solapas dejan ver la prenda de abajo.
    for (const sx of [-1, 1]) {
      const lapel = new THREE.Mesh(
        roundedBox(b.body * 0.3, 0.72, 0.1, 3, 0.04),
        m
      );
      lapel.position.set(b.body * 0.3 * sx, 0.92, -b.depth / 2 - 0.03);
      rig.add(lapel);
    }
    const gap = new THREE.Mesh(
      roundedBox(b.body * 0.34, 0.66, 0.06, 3, 0.03),
      mat(o.top, 0.6)
    );
    gap.position.set(0, 0.92, -b.depth / 2 - 0.03);
    rig.add(gap);
  },

  /** Audífonos colgados al cuello. */
  headphones(rig) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.05, 10, 24),
      mat(0x4a7fa5, 0.45)
    );
    band.position.set(0, 1.26, 0.02);
    band.rotation.x = Math.PI / 2 - 0.2;
    rig.add(band);
    for (const sx of [-1, 1]) {
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16),
        mat(0x3c6b8c, 0.45)
      );
      cup.position.set(0.3 * sx, 1.26, 0.02);
      cup.rotation.z = Math.PI / 2;
      rig.add(cup);
    }
  },

  /** Credencial con cordón. */
  lanyard(rig) {
    const m = mat(0x2fa8a0, 0.6);
    for (const sx of [-1, 1]) {
      const strap = new THREE.Mesh(roundedBox(0.05, 0.42, 0.05, 2, 0.02), m);
      strap.position.set(0.12 * sx, 1.06, -0.24);
      strap.rotation.z = 0.2 * sx;
      rig.add(strap);
    }
    const badge = new THREE.Mesh(
      roundedBox(0.2, 0.27, 0.05, 3, 0.03),
      mat(0x9fd36a, 0.45)
    );
    badge.position.set(0, 0.73, -0.25);
    rig.add(badge);
  },

  /**
   * Lentes. `args` = [color, forma]. La forma puede ser 'square' para marco
   * cuadrado; cualquier otra cosa da el marco redondo.
   *   glasses:0x16161a:square
   * Todo el armazón se funde en una sola malla.
   */
  glasses(rig, headGroup, o, args) {
    const color = args[0] ? Number(args[0]) : 0x16161a;
    const square = args[1] === 'square';
    const faceZ = -F.headD / 2 - 0.02;
    const T = 0.032; // grosor del marco
    const geos = [];
    const add = (g, x, y, z, rx = 0) => {
      if (rx) g.rotateX(rx);
      g.translate(x, y, z);
      geos.push(g.index ? g.toNonIndexed() : g);
    };

    for (const sx of [-1, 1]) {
      const cx = 0.22 * sx;
      if (square) {
        // Cuatro barras formando un rectángulo hueco alrededor del ojo.
        const halfW = 0.175;
        const halfH = 0.17;
        add(new THREE.BoxGeometry(halfW * 2 + T, T, T), cx, halfH, faceZ);
        add(new THREE.BoxGeometry(halfW * 2 + T, T, T), cx, -halfH, faceZ);
        add(new THREE.BoxGeometry(T, halfH * 2, T), cx - halfW, 0, faceZ);
        add(new THREE.BoxGeometry(T, halfH * 2, T), cx + halfW, 0, faceZ);
      } else {
        const ring = new THREE.TorusGeometry(0.17, T / 2, 8, 22);
        ring.scale(1, 0.92, 1);
        add(ring, cx, 0, faceZ);
      }
      // Patilla hacia la oreja.
      add(new THREE.BoxGeometry(T, T, 0.3), (square ? 0.4 : 0.38) * sx, 0, faceZ + 0.16);
    }
    // Puente entre los dos cristales.
    add(new THREE.BoxGeometry(0.1, T, T), 0, 0, faceZ);

    headGroup.add(new THREE.Mesh(mergeGeometries(geos, false), mat(color, 0.4)));
  },

  /** Boca pintada: el único rasgo facial que se permite. */
  lips(rig, headGroup, o, args) {
    const lip = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 14, 10),
      mat(args[0] ? Number(args[0]) : 0xb3324a, 0.4)
    );
    lip.position.set(0, -F.headH * 0.3, -F.headD / 2 + 0.01);
    lip.scale.set(1, 0.45, 0.22);
    headGroup.add(lip);
  },
};

// ---------------------------------------------------------------------------
// El Clip: un clip de oficina con ojos. El tubo sigue una curva en forma de
// clip, que es lo que le da la silueta.
// ---------------------------------------------------------------------------
function buildClip(rig) {
  const curve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0.0, 0.1, 0),
      new THREE.Vector3(-0.3, 0.14, 0),
      new THREE.Vector3(-0.42, 0.55, 0),
      new THREE.Vector3(-0.42, 1.55, 0),
      new THREE.Vector3(-0.3, 1.95, 0),
      new THREE.Vector3(0.0, 2.05, 0),
      new THREE.Vector3(0.3, 1.95, 0),
      new THREE.Vector3(0.42, 1.55, 0),
      new THREE.Vector3(0.42, 0.5, 0),
      new THREE.Vector3(0.28, 0.26, 0),
      new THREE.Vector3(0.1, 0.34, 0),
      new THREE.Vector3(0.06, 0.8, 0),
      new THREE.Vector3(0.06, 1.5, 0),
      new THREE.Vector3(0.0, 1.72, 0),
      new THREE.Vector3(-0.14, 1.6, 0),
      new THREE.Vector3(-0.16, 1.2, 0),
    ],
    false,
    'catmullrom',
    0.4
  );
  const body = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 160, 0.075, 10, false),
    mat(0x6e6e76, 0.35, { metalness: 0.65 })
  );
  rig.add(body);

  // La cabeza del Clip son sus ojos: van en un grupo para inclinarlos igual
  // que la de los demás.
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.62;
  rig.add(headGroup);

  const white = mat(0xffffff, 0.3);
  const black = mat(0x101014, 0.3);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 14), white);
    eye.position.set(0.2 * sx, 0, -0.12);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 12), black);
    pupil.position.set(0.21 * sx, -0.02, -0.27);
    const brow = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.032, 8, 14, Math.PI * 0.75),
      black
    );
    brow.position.set(0.2 * sx, 0.16, -0.16);
    brow.rotation.set(0.2, 0, 0.35 * sx);
    headGroup.add(eye, pupil, brow);
  }
  return { headGroup };
}

// ---------------------------------------------------------------------------
// Tux, el pingüino de Linux, acompañando a Dani.
// Rasgos que lo identifican: cuerpo bajo y redondo, panza blanca enorme,
// pico y patas amarillo anaranjado, y cara blanca con los ojos muy juntos.
// ---------------------------------------------------------------------------
function buildPenguin() {
  const group = new THREE.Group();
  const blackMat = mat(0x1e2026, 0.6);
  const whiteMat = mat(0xfafaf4, 0.6);
  const beakMat = mat(0xf5a623, 0.45);

  // Cuerpo achaparrado: Tux es más ancho que alto.
  const body = new THREE.Mesh(roundedBox(0.74, 0.66, 0.62, 5, 0.29), blackMat);
  body.position.y = 0.4;

  const belly = new THREE.Mesh(roundedBox(0.58, 0.56, 0.36, 5, 0.25), whiteMat);
  belly.position.set(0, 0.37, -0.2);

  const head = new THREE.Mesh(roundedBox(0.58, 0.5, 0.54, 5, 0.24), blackMat);
  head.position.y = 0.86;

  // Antifaz blanco de la cara, ancho y bajo.
  const face = new THREE.Mesh(roundedBox(0.44, 0.3, 0.24, 4, 0.13), whiteMat);
  face.position.set(0, 0.8, -0.22);

  const beak = new THREE.Mesh(roundedBox(0.22, 0.13, 0.2, 3, 0.06), beakMat);
  beak.position.set(0, 0.82, -0.34);

  // Ojos pequeños y muy juntos, el gesto de Tux.
  const eyeGeo = new THREE.SphereGeometry(0.052, 10, 8);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, mat(0x14161c, 0.3));
    eye.position.set(0.075 * sx, 0.95, -0.27);
    eye.scale.set(0.9, 1.15, 0.45);
    group.add(eye);
  }

  const flippers = [];
  const flipperGeo = roundedBox(0.1, 0.34, 0.22, 3, 0.05);
  flipperGeo.translate(0, -0.17, 0);
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(flipperGeo, blackMat);
    f.position.set(0.37 * sx, 0.56, 0);
    group.add(f);
    flippers.push(f);
  }

  // Patas palmeadas, anchas y bien hacia adelante.
  const footGeo = roundedBox(0.3, 0.1, 0.34, 3, 0.05);
  for (const sx of [-1, 1]) {
    const foot = new THREE.Mesh(footGeo, beakMat);
    foot.position.set(0.16 * sx, 0.05, -0.14);
    foot.rotation.y = 0.2 * sx;
    group.add(foot);
  }

  group.add(body, belly, head, face, beak);
  group.scale.setScalar(0.82);

  return {
    group,
    update(t, phase) {
      const a = Math.sin(t * 2.4 + phase + 1.2);
      flippers[0].rotation.z = 0.2 + a * 0.3;
      flippers[1].rotation.z = -0.2 - a * 0.3;
      group.position.y = Math.abs(Math.sin(t * 2.4 + phase)) * 0.05;
    },
  };
}

// ---------------------------------------------------------------------------
// Mascota del planeta: el ave azul, decorativa, junto a la central.
// ---------------------------------------------------------------------------
export function createMascot() {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);

  const blueMat = mat(0x2f6fd0, 0.55);
  const blueDarkMat = mat(0x2459ab, 0.55);
  const whiteMat = mat(0xf4f6fa, 0.6);
  const yellowMat = mat(0xf7c315, 0.5);
  const blackMat = mat(0x14161c, 0.4);

  const torso = new THREE.Mesh(roundedBox(0.8, 0.84, 0.66, 5, 0.3), blueMat);
  torso.position.y = 0.95;

  const shirt = new THREE.Mesh(roundedBox(0.6, 0.66, 0.36, 4, 0.2), whiteMat);
  shirt.position.set(0, 0.92, -0.22);

  const head = new THREE.Mesh(roundedBox(0.78, 0.74, 0.72, 5, 0.3), blueMat);
  head.position.y = 1.68;

  const mask = new THREE.Mesh(roundedBox(0.6, 0.4, 0.3, 4, 0.14), whiteMat);
  mask.position.set(0, 1.66, -0.3);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.46, 10), yellowMat);
  beak.position.set(0, 1.62, -0.52);
  beak.rotation.x = -Math.PI / 2;

  const eyeGeo = new THREE.SphereGeometry(0.1, 14, 10);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, blackMat);
    eye.position.set(0.17 * sx, 1.74, -0.38);
    eye.scale.set(0.9, 1.2, 0.4);
    rig.add(eye);
  }

  const wingGeo = roundedBox(0.18, 0.62, 0.4, 4, 0.12);
  wingGeo.translate(0, -0.31, 0);
  const wings = [];
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(wingGeo, blueMat);
    w.position.set(0.46 * sx, 1.24, 0.02);
    rig.add(w);
    wings.push(w);
  }

  const tail = new THREE.Mesh(roundedBox(0.5, 0.26, 0.5, 4, 0.1), blueDarkMat);
  tail.position.set(0, 0.68, 0.46);
  tail.rotation.x = 0.5;

  const legGeo = new THREE.CylinderGeometry(0.09, 0.1, 0.46, 12);
  const footGeo = roundedBox(0.22, 0.1, 0.3, 3, 0.04);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, yellowMat);
    leg.position.set(0.21 * sx, 0.28, 0);
    const foot = new THREE.Mesh(footGeo, yellowMat);
    foot.position.set(0.21 * sx, 0.06, -0.06);
    rig.add(leg, foot);
  }

  rig.add(torso, shirt, head, mask, beak, tail);

  return {
    group,
    update(t) {
      rig.position.y = Math.abs(Math.sin(t * 1.3)) * 0.07;
      wings[0].rotation.z = 0.16 + Math.sin(t * 1.3) * 0.18;
      wings[1].rotation.z = -0.16 - Math.sin(t * 1.3) * 0.18;
    },
  };
}

/** Generador con semilla local, para que los rizos salgan siempre iguales. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
