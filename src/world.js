// ---------------------------------------------------------------------------
// Construcción del planeta: superficie, central, las 5 casas de entrega, la
// mini ciudad que bordea los caminos y la vegetación.
//
// Formas: casi todo es cilindro, cápsula o esfera. Se evitan las cajas para
// que el conjunto se lea redondeado.
//
// Optimización: árboles, rocas y flores no son objetos sueltos sino
// InstancedMesh, así que se dibujan en pocas llamadas.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLANET, WORLD, STOPS } from './config.js';
import {
  orient,
  orientQuaternion,
  randomTangent,
  tangentTowards,
  mulberry32,
  fibonacciSphere,
} from './sphereMath.js';
import { createNpc, createMascot } from './npc.js';

const R = PLANET.radius;
const mat = (color, rough = 0.85, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });

/** Funde varias mallas del mismo material en una sola.
 *  Se usa para piezas repetidas (ventanas, rejas): mismo aspecto, una
 *  llamada de dibujo en vez de una por pieza. */
function bake(meshes, material) {
  const geos = meshes.map((m) => {
    m.updateMatrix();
    // Sin índice en todas: mergeGeometries no admite mezclar los dos modos.
    const c = m.geometry.clone();
    const g = c.index ? c.toNonIndexed() : c;
    g.applyMatrix4(m.matrix);
    return g;
  });
  return new THREE.Mesh(mergeGeometries(geos, false), material);
}

export function createWorld(scene, opts = {}) {
  const rnd = mulberry32(WORLD.seed);
  const obstacles = []; // { dir: Vector3, r: radio angular en radianes }
  const group = new THREE.Group();
  scene.add(group);

  // --- superficie -----------------------------------------------------------
  const planetGeo = new THREE.IcosahedronGeometry(R, PLANET.detail);
  paintTerrain(planetGeo);
  const planet = new THREE.Mesh(
    planetGeo,
    mat(0xffffff, 1, { flatShading: true, vertexColors: true, metalness: 0 })
  );
  group.add(planet);

  // Mar interior: asoma por las zonas bajas del relieve facetado.
  const sea = new THREE.Mesh(
    new THREE.SphereGeometry(R - 0.26, 72, 44),
    mat(0x4fa3d1, 0.3)
  );
  group.add(sea);

  const depotDir = new THREE.Vector3(0, 1, 0); // el jugador empieza aquí

  function place(obj, dir, tangent = randomTangent(dir, rnd)) {
    obj.position.copy(dir).multiplyScalar(R);
    orient(obj, dir, tangent);
    return tangent;
  }

  // --- las 5 casas de entrega ----------------------------------------------
  // Fibonacci con puntos extra, descartando los cercanos al polo (la central).
  const candidates = fibonacciSphere(STOPS.length + 3).filter(
    (p) => p.angleTo(depotDir) > 0.75
  );

  const smokers = [];

  const stops = STOPS.map((cfg, i) => {
    const dir = candidates[i].clone();
    // La casa mira hacia la central, que es de donde siempre llega el
    // mensajero: así el camino desemboca justo en la puerta.
    const faceDir = tangentTowards(dir, depotDir, new THREE.Vector3());
    const building = buildStop(cfg, smokers);
    place(building, dir, faceDir);
    group.add(building);
    // El radio reservado cubre la casa, la reja y el espacio del NPC.
    obstacles.push({ dir, r: 2.6 / R });

    const beacon = buildBeacon(cfg.beaconColor || cfg.roofColor);
    beacon.position.copy(dir).multiplyScalar(R + 4.4);
    orient(beacon, dir, faceDir);
    beacon.visible = false;
    group.add(beacon);

    // El NPC espera delante de la puerta, de cara a quien llega.
    const npcDir = dir
      .clone()
      .multiplyScalar(R)
      .addScaledVector(faceDir, 2.4)
      .normalize();
    const npc = createNpc({ kind: cfg.npc, rnd });
    npc.group.position.copy(npcDir).multiplyScalar(R);
    orient(npc.group, npcDir, tangentTowards(npcDir, faceDir, new THREE.Vector3()));
    group.add(npc.group);

    return { ...cfg, index: i, dir, faceDir, building, beacon, npc, delivered: false };
  });

  // --- central de paquetes --------------------------------------------------
  const depotFace = new THREE.Vector3();
  tangentTowards(depotDir, stops[0].dir, depotFace); // mira a la primera casa
  const depot = buildDepot(opts.logoTexture, smokers);
  place(depot, depotDir, depotFace);
  group.add(depot);
  obstacles.push({ dir: depotDir.clone(), r: 3.0 / R });

  // La mascota del planeta espera junto a la central.
  const mascot = createMascot();
  const mascotDir = depotDir
    .clone()
    .multiplyScalar(R)
    .addScaledVector(depotFace, 3.6)
    .addScaledVector(new THREE.Vector3().crossVectors(depotDir, depotFace), 2.2)
    .normalize();
  mascot.group.position.copy(mascotDir).multiplyScalar(R);
  orient(mascot.group, mascotDir, tangentTowards(mascotDir, depotFace, new THREE.Vector3()));
  group.add(mascot.group);

  // --- caminos --------------------------------------------------------------
  const pathSamples = []; // { dir, side, t } de todos los caminos
  const pathMesh = buildPaths(depotDir, stops, pathSamples, rnd);
  group.add(pathMesh);

  // Margen que la vegetación debe respetar a los lados del camino.
  const cosPathClear = Math.cos(
    (WORLD.path.width / 2 + WORLD.path.clearance) / R
  );
  const onPath = (dir) => pathSamples.some((s) => dir.dot(s.dir) > cosPathClear);

  /** ¿Cabe algo de radio `radiusUnits` en `dir`? */
  function isFree(dir, radiusUnits, gapRad = 0.01) {
    const ang = radiusUnits / R;
    if (dir.angleTo(depotDir) < WORLD.depotClear) return false;
    for (const o of obstacles) {
      if (dir.angleTo(o.dir) < o.r + ang + gapRad) return false;
    }
    return true;
  }

  // --- mini ciudad ----------------------------------------------------------
  // Edificios de relleno a ambos lados de cada camino: forman las calles.
  const cityGroup = new THREE.Group();
  group.add(cityGroup);
  buildCity(cityGroup, pathSamples, stops.length, obstacles, isFree, rnd, smokers);

  // --- vegetación -----------------------------------------------------------
  function tryPlace(radiusUnits, gapRad, register = true) {
    for (let attempt = 0; attempt < 90; attempt++) {
      const dir = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
      if (dir.lengthSq() < 0.01) continue;
      dir.normalize();
      if (onPath(dir)) continue;
      if (!isFree(dir, radiusUnits, gapRad)) continue;
      if (register) obstacles.push({ dir, r: radiusUnits / R });
      return dir;
    }
    return null;
  }

  const treeDirs = [];
  for (let i = 0; i < WORLD.trees; i++) {
    const dir = tryPlace(0.8, 0.02, true);
    if (dir) treeDirs.push(dir);
  }
  const rockDirs = [];
  for (let i = 0; i < WORLD.rocks; i++) {
    const dir = tryPlace(0.5, 0.01, false); // decorativas, no frenan
    if (dir) rockDirs.push(dir);
  }
  const flowerDirs = [];
  for (let i = 0; i < WORLD.flowers; i++) {
    const dir = tryPlace(0.22, 0.004, false);
    if (dir) flowerDirs.push(dir);
  }

  const { trunks, leaves } = buildTrees(treeDirs, rnd);
  group.add(trunks, leaves);
  group.add(buildRocks(rockDirs, rnd));
  group.add(buildFlowers(flowerDirs, rnd));

  // --- animación del mundo --------------------------------------------------
  const flag = depot.userData.flag;
  const flagRest = flag ? flag.geometry.attributes.position.array.slice() : null;
  const beam = depot.userData.beam;

  function update(t, dt) {
    // La bandera ondea desplazando sus vértices: una onda que crece con la
    // distancia al mástil, que es donde está sujeta.
    if (flag) {
      const pos = flag.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = flagRest[i * 3];
        const y = flagRest[i * 3 + 1];
        const grip = Math.max(0, x / 1.3); // 0 en el mástil, 1 en la punta
        pos.setZ(i, Math.sin(t * 4.5 - x * 3.4 + y * 1.2) * 0.17 * grip);
        pos.setY(i, y + Math.sin(t * 3.2 - x * 2.4) * 0.05 * grip);
      }
      pos.needsUpdate = true;
      flag.geometry.computeVertexNormals();
    }

    if (beam) beam.material.opacity = 0.12 + Math.sin(t * 1.5) * 0.04;

    // Humo de las chimeneas: cada bocanada sube, se ensancha y reaparece.
    for (const s of smokers) {
      const life = (t * 0.34 + s.offset) % 1;
      s.puff.position.y = s.baseY + life * 1.5;
      s.puff.scale.setScalar(0.3 + life * 0.85);
      s.puff.material.opacity = 0.42 * (1 - life);
    }

    mascot.update(t);
  }

  return { group, planet, obstacles, stops, depot, depotDir, mascot, update };
}

// ---------------------------------------------------------------------------
// Terreno pintado por caras: mezcla de verdes con parches de tierra y arena.
// La geometría del icosaedro no está indexada, así que cada triángulo tiene
// sus propios 3 vértices y se puede colorear cara a cara.
// ---------------------------------------------------------------------------
function paintTerrain(geo) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const grassA = new THREE.Color(0x6cc06a);
  const grassB = new THREE.Color(0x52a85c);
  const grassC = new THREE.Color(0x88cf72);
  const sand = new THREE.Color(0xd8c48c);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i += 3) {
    // Centroide del triángulo, normalizado: un punto sobre la esfera.
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;

    // Ruido barato: tres ondas de distinta frecuencia.
    const n =
      Math.sin(cx * 0.42) * Math.cos(cy * 0.37) +
      Math.sin(cz * 0.29 + cx * 0.12) * 0.7 +
      Math.cos(cy * 0.63 + cz * 0.21) * 0.45;

    if (n > 1.35) c.copy(sand);
    else if (n > 0.55) c.copy(grassC).lerp(grassA, (1.35 - n) / 0.8);
    else if (n > -0.5) c.copy(grassA).lerp(grassB, (0.55 - n) / 1.05);
    else c.copy(grassB);

    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = c.r;
      colors[(i + k) * 3 + 1] = c.g;
      colors[(i + k) * 3 + 2] = c.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// ---------------------------------------------------------------------------
// Caminos: una cinta de triángulos siguiendo el arco de círculo máximo entre
// la central y cada casa, levantada unos centímetros sobre la superficie.
// ---------------------------------------------------------------------------
function buildPaths(depotDir, stops, outSamples, rnd) {
  const { width, samples, meander } = WORLD.path;
  const half = width / 2;
  const lift = R + 0.07;

  const positions = [];
  const normals = [];
  const indices = [];
  let vertexCount = 0;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const next = new THREE.Vector3();
  const travel = new THREE.Vector3();
  const side = new THREE.Vector3();

  stops.forEach((stop, pathIndex) => {
    a.copy(depotDir);
    b.copy(stop.dir);
    // Normal del plano del arco: también es la dirección lateral en cada punto.
    axis.crossVectors(a, b);
    if (axis.lengthSq() < 1e-8) return;
    axis.normalize();

    const phase = rnd() * Math.PI * 2;
    const freq = 1.2 + rnd() * 1.4;
    const amp = meander * (0.6 + rnd() * 0.8);

    const pointAt = (t, out) => {
      out.copy(a).lerp(b, t);
      if (out.lengthSq() < 1e-8) out.copy(a);
      out.normalize();
      // Desvío lateral que vale cero en ambos extremos.
      const wobble = Math.sin(Math.PI * t) * Math.sin(freq * Math.PI * t + phase) * amp;
      return out.addScaledVector(axis, wobble).normalize();
    };

    const rowStart = vertexCount;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      pointAt(t, dir);

      pointAt(Math.max(0, t - 0.02), prev);
      pointAt(Math.min(1, t + 0.02), next);
      travel.subVectors(next, prev);
      travel.addScaledVector(dir, -travel.dot(dir));
      if (travel.lengthSq() < 1e-10) travel.copy(axis);
      travel.normalize();
      side.crossVectors(dir, travel).normalize();

      outSamples.push({ dir: dir.clone(), side: side.clone(), t, pathIndex });

      // El camino se angosta en la punta para no tapar la puerta.
      const w = half * (t > 0.93 ? 1 - (t - 0.93) * 8 : 1);

      for (const s of [-1, 1]) {
        positions.push(
          (dir.x + side.x * ((s * w) / R)) * lift,
          (dir.y + side.y * ((s * w) / R)) * lift,
          (dir.z + side.z * ((s * w) / R)) * lift
        );
        normals.push(dir.x, dir.y, dir.z);
        vertexCount++;
      }

      if (i > 0) {
        const p = rowStart + (i - 1) * 2;
        indices.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
      }
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);

  return new THREE.Mesh(geo, mat(0xd9bf8c, 1, { side: THREE.DoubleSide }));
}

// ---------------------------------------------------------------------------
// Mini ciudad: edificios de relleno a los lados de cada camino, más faroles.
// ---------------------------------------------------------------------------
function buildCity(parent, pathSamples, pathCount, obstacles, isFree, rnd, smokers) {
  const { perPath, offset, lamps } = WORLD.city;
  const byPath = [];
  for (let i = 0; i < pathCount; i++) byPath.push([]);
  for (const s of pathSamples) byPath[s.pathIndex]?.push(s);

  const dir = new THREE.Vector3();

  for (const samples of byPath) {
    if (!samples.length) continue;

    // Edificios: repartidos a lo largo del camino, alternando de vereda.
    for (let k = 0; k < perPath; k++) {
      const t = 0.17 + (k / Math.max(1, perPath - 1)) * 0.62;
      const s = samples[Math.round(t * (samples.length - 1))];
      if (!s) continue;
      const sideSign = k % 2 === 0 ? 1 : -1;
      const jitter = offset + (rnd() - 0.5) * 1.1;

      dir
        .copy(s.dir)
        .multiplyScalar(R)
        .addScaledVector(s.side, sideSign * jitter)
        .normalize();

      if (!isFree(dir, 1.85, 0.012)) continue;
      obstacles.push({ dir: dir.clone(), r: 1.85 / R });

      const b = buildCityBuilding(rnd, smokers);
      b.position.copy(dir).multiplyScalar(R);
      // La fachada mira al camino, es decir hacia el lado contrario al offset.
      const face = s.side.clone().multiplyScalar(-sideSign);
      orient(b, dir, tangentTowards(dir, face, new THREE.Vector3()));
      parent.add(b);
    }

    // Faroles: pegados al camino, sin bloquear el paso.
    for (let k = 0; k < lamps; k++) {
      const t = 0.14 + (k / Math.max(1, lamps - 1)) * 0.7;
      const s = samples[Math.round(t * (samples.length - 1))];
      if (!s) continue;
      const sideSign = k % 2 === 0 ? -1 : 1;
      dir
        .copy(s.dir)
        .multiplyScalar(R)
        .addScaledVector(s.side, sideSign * (WORLD.path.width / 2 + 0.55))
        .normalize();

      const lamp = buildLamp();
      lamp.position.copy(dir).multiplyScalar(R);
      orient(lamp, dir, tangentTowards(dir, s.side, new THREE.Vector3()));
      parent.add(lamp);
    }
  }
}

const CITY_PALETTE = [0xf0e2cc, 0xe8d6bf, 0xdfe8ef, 0xf3dfd5, 0xe4ecdd, 0xefe6f2];
const CITY_ROOFS = [0xb5553f, 0x4a6f9c, 0x7a8b5c, 0x9c6b4a, 0x5f6b86, 0xa8544f];

function buildCityBuilding(rnd, smokers) {
  const g = new THREE.Group();
  const wallCol = CITY_PALETTE[Math.floor(rnd() * CITY_PALETTE.length)];
  const roofCol = CITY_ROOFS[Math.floor(rnd() * CITY_ROOFS.length)];
  const wallMat = mat(wallCol, 0.9);
  const roofMat = mat(roofCol, 0.7);
  const trimMat = mat(0x8a7a66, 0.85);

  const kind = Math.floor(rnd() * 3);
  const radius = 0.95 + rnd() * 0.3;
  let height;

  if (kind === 0) {
    // Torre de departamentos: varios pisos con cornisa.
    const floors = 2 + Math.floor(rnd() * 3);
    height = 0.95 * floors;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 1.08, height, 18),
      wallMat
    );
    body.position.y = height / 2;
    g.add(body);
    for (let f = 1; f < floors; f++) {
      const ledge = new THREE.Mesh(
        new THREE.TorusGeometry(radius + 0.02, 0.05, 8, 24),
        trimMat
      );
      ledge.position.y = f * 0.95;
      ledge.rotation.x = Math.PI / 2;
      g.add(ledge);
    }
    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(radius + 0.16, radius + 0.16, 0.16, 18),
      roofMat
    );
    roof.position.y = height + 0.06;
    g.add(roof);
    addWindows(g, radius, floors, 0.62, rnd);
  } else if (kind === 1) {
    // Casita con techo cónico.
    height = 1.5 + rnd() * 0.5;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 1.06, height, 18),
      wallMat
    );
    body.position.y = height / 2;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(radius + 0.35, 1.05 + rnd() * 0.4, 18),
      roofMat
    );
    roof.position.y = height + 0.5;
    g.add(body, roof);
    addWindows(g, radius, 1, height * 0.55, rnd);
    addChimney(g, radius * 0.5, height + 0.5, smokers, rnd);
  } else {
    // Local comercial: bajo, ancho y con toldo a rayas.
    height = 1.25 + rnd() * 0.3;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 1.15, radius * 1.2, height, 20),
      wallMat
    );
    body.position.y = height / 2;
    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 1.3, radius * 1.3, 0.14, 20),
      roofMat
    );
    roof.position.y = height + 0.05;
    const awning = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 0.1, 16, 1, false, 0, Math.PI),
      roofMat
    );
    awning.position.set(0, height * 0.72, -radius * 1.0);
    awning.rotation.set(Math.PI / 2, 0, 0);
    awning.scale.z = 0.7;
    const sign = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.07, 14),
      mat(0xf6d978, 0.5)
    );
    sign.position.set(0, height + 0.42, -radius * 0.85);
    sign.rotation.x = Math.PI / 2;
    g.add(body, roof, awning, sign);
    addWindows(g, radius * 1.15, 1, height * 0.5, rnd);
  }

  // Puerta, común a todos.
  const door = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.22, 0.34, 4, 12),
    mat(0x7a5231, 0.9)
  );
  door.position.set(0, 0.46, -(radius + 0.02));
  door.scale.z = 0.25;
  g.add(door);

  return g;
}

/** Ventanitas repartidas por la fachada; dan la escala de "ciudad". */
function addWindows(g, radius, floors, baseY, rnd) {
  const geo = new THREE.CylinderGeometry(0.14, 0.14, 0.07, 10);
  const glass = mat(0xa9d8ef, 0.25, { emissive: 0x2b4a63, emissiveIntensity: 0.35 });
  const parts = [];
  for (let f = 0; f < floors; f++) {
    const y = baseY + f * 0.95;
    const count = 3 + Math.floor(rnd() * 2);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rnd() * 0.3;
      const w = new THREE.Mesh(geo, glass);
      w.position.set(Math.sin(a) * radius, y, Math.cos(a) * radius);
      w.lookAt(w.position.clone().multiplyScalar(2).setY(y));
      w.rotateX(Math.PI / 2);
      parts.push(w);
    }
  }
  if (parts.length) g.add(bake(parts, glass));
}

function addChimney(g, x, y, smokers, rnd) {
  const pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.16, 0.62, 10),
    mat(0xa06a52, 0.9)
  );
  pipe.position.set(x, y, 0.1);
  g.add(pipe);

  // Una sola bocanada que se recicla: basta para leer "humo".
  const puff = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 10, 8),
    new THREE.MeshStandardMaterial({
      color: 0xf2f2f2,
      transparent: true,
      opacity: 0.4,
      roughness: 1,
      depthWrite: false,
    })
  );
  puff.position.set(x, y + 0.4, 0.1);
  g.add(puff);
  smokers.push({ puff, baseY: y + 0.4, offset: rnd() });
}

function buildLamp() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.085, 1.7, 10),
    mat(0x3f4452, 0.7)
  );
  post.position.y = 0.85;
  const arm = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 12, Math.PI / 2), mat(0x3f4452, 0.7));
  arm.position.set(0, 1.7, 0);
  arm.rotation.set(0, Math.PI / 2, 0);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 14, 10),
    mat(0xfff3c4, 0.3, { emissive: 0xffd978, emissiveIntensity: 1.8 })
  );
  bulb.position.set(0, 1.82, -0.2);
  const hood = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.2, 12),
    mat(0x3f4452, 0.7)
  );
  hood.position.set(0, 1.97, -0.2);
  g.add(post, arm, bulb, hood);
  return g;
}

// ---------------------------------------------------------------------------
// La central: el edificio más alto y el único con torre, cúpula, bandera y un
// haz de luz permanente. Blanca y azul, con el logo en la torre.
// ---------------------------------------------------------------------------
function buildDepot(logoTexture, smokers) {
  const g = new THREE.Group();

  const whiteMat = mat(0xfbfcfe, 0.75);
  const blueMat = mat(0x2f5fa8, 0.6);
  const blueDeepMat = mat(0x24488a, 0.6);
  const woodMat = mat(0x8a5a33, 0.9);

  const terrace = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 3.1, 0.34, 36), whiteMat);
  terrace.position.y = 0.17;
  const terraceEdge = new THREE.Mesh(new THREE.TorusGeometry(2.95, 0.1, 10, 40), blueMat);
  terraceEdge.position.y = 0.33;
  terraceEdge.rotation.x = Math.PI / 2;

  const hall = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.25, 2.3, 36), whiteMat);
  hall.position.y = 1.45;

  const band = new THREE.Mesh(new THREE.TorusGeometry(2.14, 0.12, 10, 44), blueMat);
  band.position.y = 2.5;
  band.rotation.x = Math.PI / 2;

  const eaves = new THREE.Mesh(new THREE.ConeGeometry(2.78, 0.95, 36), blueMat);
  eaves.position.y = 3.02;

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.28, 1.42, 1.9, 30), whiteMat);
  tower.position.y = 4.2;

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.34, 30, 18, 0, Math.PI * 2, 0, Math.PI / 2),
    blueMat
  );
  dome.position.y = 5.1;

  // --- logo en la torre -----------------------------------------------------
  // Va donde antes estaba el reloj, mirando al frente (-Z).
  const logoRim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.08, 10, 30), blueDeepMat);
  logoRim.position.set(0, 4.3, -1.32);

  const logoMat = logoTexture
    ? new THREE.MeshStandardMaterial({ map: logoTexture, roughness: 0.6 })
    : mat(0x2f5fa8, 0.6);
  const logo = new THREE.Mesh(new THREE.CircleGeometry(0.6, 36), logoMat);
  logo.position.set(0, 4.3, -1.36);
  // CircleGeometry nace en el plano XY mirando a +Z: hay que darla vuelta.
  logo.rotation.y = Math.PI;

  const logoBack = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 32), whiteMat);
  logoBack.position.set(0, 4.3, -1.3);
  logoBack.rotation.x = Math.PI / 2;

  // Puerta de arco con marco.
  const door = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 0.7, 4, 16), woodMat);
  door.position.set(0, 0.95, -2.06);
  door.scale.z = 0.3;
  const doorFrame = new THREE.Mesh(new THREE.CapsuleGeometry(0.58, 0.76, 4, 18), blueMat);
  doorFrame.position.set(0, 0.97, -2.0);
  doorFrame.scale.z = 0.2;

  const awning = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 0.12, 22, 1, false, 0, Math.PI),
    blueMat
  );
  awning.position.set(0, 1.98, -2.0);
  awning.rotation.set(Math.PI / 2, 0, 0);
  awning.scale.z = 0.75;

  // Ventanales alrededor del vestíbulo.
  const winGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 14);
  const winMat = mat(0xbfe2f5, 0.2, { emissive: 0x30506e, emissiveIntensity: 0.4 });
  const windows = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.52;
    const w = new THREE.Mesh(winGeo, winMat);
    w.position.set(Math.sin(a) * 2.12, 1.6, Math.cos(a) * 2.12);
    w.lookAt(w.position.clone().multiplyScalar(2).setY(1.6));
    w.rotateX(Math.PI / 2);
    windows.push(w);
  }
  g.add(bake(windows, winMat));

  // Mástil y bandera (se animan en world.update).
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 10), blueDeepMat);
  pole.position.y = 7.4;
  const flagGeo = new THREE.PlaneGeometry(1.3, 0.8, 14, 6);
  flagGeo.translate(0.65, 0, 0); // sujeta por el borde izquierdo
  const flag = new THREE.Mesh(
    flagGeo,
    mat(0x6ee7ff, 0.7, { side: THREE.DoubleSide })
  );
  flag.position.set(0.06, 8.6, 0);

  const finial = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 14, 10),
    mat(0xfff1b8, 0.3, { emissive: 0xffd34d, emissiveIntensity: 2.6 })
  );
  finial.position.y = 9.15;

  // Haz de luz permanente: la referencia para volver desde el otro lado.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.95, 14, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x9ef0ff,
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  beam.position.y = 9.2;

  // Anillo luminoso en el suelo: marca la zona de recogida.
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.55, 0.1, 10, 48),
    mat(0x9ef0ff, 0.4, { emissive: 0x3ba7d6, emissiveIntensity: 2.4 })
  );
  ring.position.y = 0.38;
  ring.rotation.x = Math.PI / 2;

  // Pila de encomiendas en la terraza.
  const parcelMat = mat(0xc98b4b, 0.9);
  const parcelGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  for (const [x, y, z, ry] of [
    [1.9, 0.64, 1.5, 0.3],
    [1.5, 0.64, 2.0, -0.5],
    [1.72, 1.2, 1.74, 0.15],
  ]) {
    const p = new THREE.Mesh(parcelGeo, parcelMat);
    p.position.set(x, y, z);
    p.rotation.y = ry;
    g.add(p);
  }

  g.add(
    terrace, terraceEdge, hall, band, eaves, tower, dome,
    logoRim, logo, logoBack,
    door, doorFrame, awning, pole, flag, finial, beam, ring
  );
  g.userData.flag = flag;
  g.userData.beam = beam;
  return g;
}

// ---------------------------------------------------------------------------
// Casas de entrega: cilindro con techo cónico y bastante detalle encima.
// ---------------------------------------------------------------------------
function buildStop(cfg, smokers) {
  const g = new THREE.Group();
  const wallMat = mat(cfg.color, 0.88);
  const roofMat = mat(cfg.roofColor, 0.7);
  const stoneMat = mat(0x9b958c, 0.95);
  const woodMat = mat(0x7a5231, 0.9);

  // Zócalo de piedra.
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.42, 0.3, 26), stoneMat);
  base.position.y = 0.15;

  const walls = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.28, 1.7, 26), wallMat);
  walls.position.y = 1.1;

  // Cornisa bajo el techo.
  const cornice = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.08, 10, 30), roofMat);
  cornice.position.y = 1.93;
  cornice.rotation.x = Math.PI / 2;

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.68, 1.55, 26), roofMat);
  roof.position.y = 2.72;

  // Dos anillos en el techo, que insinúan tejas.
  for (const [y, r] of [[2.3, 1.42], [2.72, 0.98]]) {
    const tile = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 8, 28), roofMat);
    tile.position.y = y;
    tile.rotation.x = Math.PI / 2;
    g.add(tile);
  }

  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), roofMat);
  knob.position.y = 3.55;
  const vane = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), stoneMat);
  vane.position.y = 3.8;

  // --- fachada --------------------------------------------------------------
  const door = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.46, 4, 16), woodMat);
  door.position.set(0, 0.72, -1.14);
  door.scale.z = 0.26;
  const doorFrame = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.52, 4, 16), roofMat);
  doorFrame.position.set(0, 0.73, -1.1);
  doorFrame.scale.z = 0.18;
  const step = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.58, 0.12, 18), stoneMat);
  step.position.set(0, 0.06, -1.32);

  // Dos ventanas con marco y postigos.
  const glassMat = mat(0xbfe2f5, 0.2, { emissive: 0x2f5068, emissiveIntensity: 0.35 });
  for (const sx of [-1, 1]) {
    const a = 0.72 * sx;
    const wx = Math.sin(a) * 1.2;
    const wz = -Math.cos(a) * 1.2;

    const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 16), roofMat);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 16), glassMat);
    for (const m of [frame, glass]) {
      m.position.set(wx, 1.28, wz);
      m.lookAt(new THREE.Vector3(wx * 2, 1.28, wz * 2));
      m.rotateX(Math.PI / 2);
      g.add(m);
    }
    // Jardinera bajo la ventana.
    const boxM = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.16, 12), woodMat);
    boxM.position.set(wx * 1.03, 0.97, wz * 1.03);
    g.add(boxM);
    for (let i = 0; i < 3; i++) {
      const bloom = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 8, 6),
        mat([0xe8617d, 0xf2c14e, 0xd56ad9][i], 0.7)
      );
      bloom.position.set(wx * 1.03 + (i - 1) * 0.11, 1.09, wz * 1.03);
      g.add(bloom);
    }
  }

  // Chimenea con humo.
  addChimney(g, 0.72, 2.6, smokers, Math.random);

  // Buzón junto a la puerta.
  const mailbox = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.22, 4, 14), roofMat);
  mailbox.position.set(1.0, 1.05, -1.32);
  mailbox.rotation.z = Math.PI / 2;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.85, 10), woodMat);
  post.position.set(1.0, 0.42, -1.32);

  // Reja baja, en arco frente a la casa (fundida en una sola malla).
  const fenceMat = mat(0xe8e2d4, 0.85);
  const pickets = [];
  const picketGeo = new THREE.CapsuleGeometry(0.055, 0.3, 4, 8);
  for (let i = 0; i < 9; i++) {
    const a = -0.95 + (i / 8) * 1.9;
    const pk = new THREE.Mesh(picketGeo, fenceMat);
    pk.position.set(Math.sin(a) * 2.05, 0.3, -Math.cos(a) * 2.05);
    pickets.push(pk);
  }
  g.add(bake(pickets, fenceMat));

  g.add(base, walls, cornice, roof, knob, vane, door, doorFrame, step, mailbox, post);
  // Guardado por referencia: el orden de los hijos cambia con el detalle.
  g.userData.roof = roof;
  return g;
}

/** Baliza flotante del destino actual: gota invertida + columna de luz. */
function buildBeacon(color) {
  const g = new THREE.Group();
  const drop = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 20, 16),
    mat(color, 0.4, { emissive: color, emissiveIntensity: 2.6 })
  );
  drop.scale.y = 1.45;
  const tipMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.44, 0.8, 20),
    mat(color, 0.4, { emissive: color, emissiveIntensity: 2.6 })
  );
  tipMesh.position.y = -0.82;
  tipMesh.rotation.x = Math.PI;
  drop.add(tipMesh);

  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.3, 7.5, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.17,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  column.position.y = -3.9;

  g.add(drop, column);
  g.userData.cone = drop;
  return g;
}

// ---------------------------------------------------------------------------
// Vegetación instanciada. La copa son tres esferas fundidas en una geometría,
// que da una silueta redonda y sigue siendo una sola llamada de dibujo.
// ---------------------------------------------------------------------------
function buildTrees(dirs, rnd) {
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.22, 1.0, 10);
  trunkGeo.translate(0, 0.5, 0);

  const leafGeo = mergeGeometries(
    [
      sphereAt(0.74, 0, 1.9, 0),
      sphereAt(0.54, -0.44, 1.48, 0.18),
      sphereAt(0.48, 0.42, 1.62, -0.2),
      sphereAt(0.4, 0.05, 2.5, 0.05),
    ],
    false
  );

  const trunks = new THREE.InstancedMesh(trunkGeo, mat(0x81552e, 1), dirs.length);
  const leaves = new THREE.InstancedMesh(leafGeo, mat(0xffffff, 1), dirs.length);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();

  dirs.forEach((dir, i) => {
    const s = 0.85 + rnd() * 0.65;
    orientQuaternion(dir, randomTangent(dir, rnd), q);
    pos.copy(dir).multiplyScalar(R);
    scl.set(s, s * (0.9 + rnd() * 0.3), s);
    m.compose(pos, q, scl);
    trunks.setMatrixAt(i, m);
    leaves.setMatrixAt(i, m);
    col.setHSL(0.27 + rnd() * 0.08, 0.45 + rnd() * 0.2, 0.3 + rnd() * 0.12);
    leaves.setColorAt(i, col);
  });

  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  return { trunks, leaves };
}

function sphereAt(r, x, y, z) {
  const g = new THREE.SphereGeometry(r, 14, 10);
  g.translate(x, y, z);
  return g;
}

function buildRocks(dirs, rnd) {
  const geo = new THREE.SphereGeometry(0.45, 12, 9);
  geo.translate(0, 0.16, 0);
  const mesh = new THREE.InstancedMesh(geo, mat(0x95979f, 0.95), dirs.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  dirs.forEach((dir, i) => {
    const s = 0.65 + rnd() * 0.85;
    orientQuaternion(dir, randomTangent(dir, rnd), q);
    pos.copy(dir).multiplyScalar(R);
    scl.set(s, s * 0.62, s * (0.85 + rnd() * 0.4));
    mesh.setMatrixAt(i, m.compose(pos, q, scl));
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** Matas de flores: pequeñas, de colores, pegadas al pasto. */
function buildFlowers(dirs, rnd) {
  const geo = mergeGeometries(
    [sphereAt(0.1, 0, 0.12, 0), sphereAt(0.08, 0.13, 0.1, 0.05), sphereAt(0.075, -0.1, 0.09, -0.08)],
    false
  );
  const mesh = new THREE.InstancedMesh(geo, mat(0xffffff, 0.8), dirs.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  const palette = [0xf2c14e, 0xe8617d, 0xd56ad9, 0xf4f1e4, 0xf28c4e];
  dirs.forEach((dir, i) => {
    const s = 0.8 + rnd() * 0.8;
    orientQuaternion(dir, randomTangent(dir, rnd), q);
    pos.copy(dir).multiplyScalar(R);
    scl.setScalar(s);
    mesh.setMatrixAt(i, m.compose(pos, q, scl));
    col.set(palette[Math.floor(rnd() * palette.length)]);
    mesh.setColorAt(i, col);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}
