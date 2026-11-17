// ---------------------------------------------------------------------------
// Herramienta de la clave.
//
//   npm run flag                       muestra la clave actual
//   npm run flag -- "<clave nueva>"   genera los valores para otra clave
//
// Existe para que la clave no tenga que estar escrita en claro en ningún
// archivo del repositorio: se calcula a partir de lo que hay en config.js.
// ---------------------------------------------------------------------------
import { STOPS, FULL_ENCODED, fullKey, KEY_TAIL_CODES } from '../src/config.js';

const nueva = process.argv[2];

if (!nueva) {
  console.log('\nClave actual\n');
  console.log('  codificada :', FULL_ENCODED);
  console.log('  en claro   :', fullKey());
  console.log('\nRepartida en las casas:\n');
  for (const s of STOPS) {
    console.log(`  ${s.fragment.padEnd(9)} ${s.name}`);
  }
  const cola = String.fromCharCode(...KEY_TAIL_CODES);
  console.log(
    `  ${JSON.stringify(cola).padEnd(9)} (cola: no la entrega nadie, ` +
      'se añade al completar la ruta)'
  );
  console.log(
    '\nRecuerda: Base64 no cifra. Esto solo evita que la clave aparezca\n' +
      'de golpe al buscar texto en el bundle.\n'
  );
  process.exit(0);
}

// --- generar los valores de una clave nueva --------------------------------
const b64 = Buffer.from(nueva, 'utf8').toString('base64');
const cuerpo = b64.slice(0, -2);
const cola = b64.slice(-2);

// Se reparte el cuerpo entre las casas, lo más parejo posible.
const n = STOPS.length;
const base = Math.floor(cuerpo.length / n);
const sobra = cuerpo.length % n;
const partes = [];
let i = 0;
for (let k = 0; k < n; k++) {
  const largo = base + (k < sobra ? 1 : 0);
  partes.push(cuerpo.slice(i, i + largo));
  i += largo;
}

console.log(`\nClave  : ${nueva}`);
console.log(`Base64 : ${b64}\n`);
console.log('Pega estos `fragment` en STOPS (src/config.js), en este orden:\n');
STOPS.forEach((s, k) => {
  console.log(`  ${s.id.padEnd(10)} fragment: '${partes[k]}',`);
});
console.log('\nY reemplaza la cola:\n');
console.log(
  `  export const KEY_TAIL_CODES = [${[...cola]
    .map((c) => c.charCodeAt(0))
    .join(', ')}];   // ${JSON.stringify(cola)}`
);
console.log('\nDespués corre `npm test`, que verifica que vuelva a cuadrar.\n');
