// ---------------------------------------------------------------------------
// Exporta cada personaje a un archivo .glb (glTF 2.0 binario).
//
//   npm run export
//
// Los archivos salen en models/ y se pueden abrir en Blender, Windows 3D
// Viewer, https://gltf-viewer.donmccurdy.com o cualquier visor de glTF.
//
// Importante: el juego NO carga estos archivos. Los personajes se siguen
// construyendo en código, en src/npc.js. Esta exportación sirve para dos
// cosas: verlos de cerca sin abrir el juego, y poder retocarlos en Blender
// si en algún momento se quiere pasar a modelos externos.
// ---------------------------------------------------------------------------
import * as THREE from 'three';

// GLTFExporter está escrito para el navegador y usa FileReader para pasar el
// Blob final a ArrayBuffer. Node no lo tiene, así que se suple con lo mínimo
// que el exportador llega a usar. Debe ir ANTES de importarlo.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob
        .arrayBuffer()
        .then((buffer) => {
          this.result = buffer;
          this.onloadend?.();
        })
        .catch((err) => this.onerror?.(err));
    }
  };
}

const { GLTFExporter } = await import(
  'three/examples/jsm/exporters/GLTFExporter.js'
);
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createNpc, createMascot } from '../src/npc.js';
import { createPlayer } from '../src/player.js';
import { createLadybug } from '../src/ladybug.js';
import { PLANET } from '../src/config.js';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'models');
mkdirSync(outDir, { recursive: true });

const exporter = new GLTFExporter();

/** Exporta un Object3D a .glb, dejándolo de pie en el origen. */
function save(name, object) {
  return new Promise((resolve, reject) => {
    const root = new THREE.Group();
    root.name = name;
    root.add(object);

    exporter.parse(
      root,
      (result) => {
        const file = join(outDir, `${name}.glb`);
        writeFileSync(file, Buffer.from(result));
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        let tris = 0;
        root.traverse((o) => {
          if (!o.isMesh) return;
          const g = o.geometry;
          tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
        });
        console.log(
          `${name.padEnd(12)} ${(size.y).toFixed(2).padStart(5)} alto  ` +
            `${String(Math.round(tris)).padStart(6)} tris  ` +
            `${(Buffer.from(result).length / 1024).toFixed(0).padStart(4)} KB`
        );
        resolve();
      },
      reject,
      { binary: true }
    );
  });
}

const scene = new THREE.Scene(); // los constructores piden dónde añadirse
const rnd = Math.random;

console.log('personaje     altura        malla   peso');

for (const kind of ['nico', 'dani', 'milenka', 'fernando', 'clip']) {
  await save(kind, createNpc({ kind, rnd }).group);
}
await save('mascota-ave', createMascot().group);

// El jugador y la chinita se colocan sobre la esfera al crearse: hay que
// devolverlos al origen y quitarles la rotación antes de exportar.
const player = createPlayer(scene);
player.mesh.position.set(0, 0, 0);
player.mesh.quaternion.identity();
await save('estudiante', player.mesh);

const ladybug = createLadybug(scene, {
  obstacles: [],
  depotDir: new THREE.Vector3(0, 1, 0),
});
ladybug.mesh.position.set(0, 0, 0);
ladybug.mesh.quaternion.identity();
await save('chinita', ladybug.mesh);

console.log(`\nListo. Archivos .glb en ${outDir}`);
console.log('Nota: el juego no los usa; los personajes viven en src/npc.js.');
