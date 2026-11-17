// ---------------------------------------------------------------------------
// Configuración del juego. Todo lo ajustable vive aquí.
// El/la docente puede cambiar la clave, las preguntas y los consejos sin tocar
// el resto del código.
// ---------------------------------------------------------------------------

export const PLANET = { radius: 19, detail: 5, color: 0x6cc06a };

// `scale` ajusta la estatura del personaje sin tocar el modelo ni las
// colisiones. Los personajes son grandes y de cabeza grande a propósito.
// `scale` 1 deja al mensajero a la misma estatura que los NPC: todos salen
// del mismo molde funko.
export const PLAYER = { radius: 0.62, speed: 7.5, turn: 2.7, scale: 1 };

// Cámara más cerca y algo más cerrada: se ve mejor al personaje.
export const CAMERA = { fov: 55, height: 4.4, back: 8.6, lag: 6.5 };

// Cielo diurno. La niebla usa el mismo color para que el borde del planeta
// se funda con el cielo en vez de recortarse.
export const SKY = {
  color: 0xa8def5,
  fogNear: 44,
  fogFar: 150,
  clouds: 24,
};

export const WORLD = {
  trees: 26,
  rocks: 14,
  flowers: 40,
  seed: 20261112,
  depotClear: 0.42, // radianes libres alrededor de la central
  // Caminos de tierra que salen de la central hacia cada casa.
  path: {
    width: 1.8,
    samples: 52,
    meander: 0.14, // cuánto serpentea (0 = línea recta)
    clearance: 1.0, // margen libre de vegetación a cada lado
  },
  // Edificios de relleno que bordean los caminos y forman la mini ciudad.
  city: {
    perPath: 7, // edificios por camino, repartidos a ambos lados
    offset: 3.4, // a qué distancia del eje del camino se levantan
    lamps: 5, // faroles por camino
  },
};

// Distancias de interacción, en unidades de superficie (longitud de arco).
// `pickup` es mayor porque la central es un edificio ancho.
export const INTERACT = { pickup: 4.3, deliver: 3.8 };

// ---------------------------------------------------------------------------
// La chinita. Si toca al mensajero mientras lleva un paquete, se lo roba y hay
// que volver a la central por otro.
//
// Dificultad media: es más lenta que el jugador, así que en línea recta no
// alcanza, pero persigue y corta en diagonal si te acercas o te enredas.
// ---------------------------------------------------------------------------
export const LADYBUG = {
  speed: 6.2, // contra 7.5 del jugador: en recta no alcanza, en curva sí
  turn: 2.1,
  chaseRadius: 20, // desde dónde empieza a perseguir
  lead: 0.5, // cuánto anticipa el movimiento del jugador (0 = nada)
  hitRadius: 1.5,
  hover: 1.1, // altura de vuelo sobre el suelo
  safeZone: 6, // radio intocable alrededor de la central
  retreat: 5.5, // segundos que se aleja tras robar un paquete
  wanderChange: 2.8, // cada cuánto cambia de rumbo cuando no persigue
};

// ---------------------------------------------------------------------------
// LA CLAVE
//
// No aparece en claro en ninguna parte del código. Viaja codificada en Base64
// y repartida en cinco fragmentos, uno por casa (el campo `fragment` de cada
// parada). Además, los DOS ÚLTIMOS caracteres de esa cadena, incluido el '='
// final, no están escritos como texto: se reconstruyen al terminar la ruta.
//
// El efecto es que buscar texto sobre el bundle no da con la clave, y lo que
// sí aparece es una cadena Base64 incompleta que no decodifica por sí sola.
//
// OJO: esto es ofuscación, no seguridad. Base64 no cifra nada: no hay clave
// ni secreto, solo otra forma de escribir los mismos bytes. Quien lea este
// archivo con calma, o abra las herramientas del navegador, obtiene la clave
// igual. Solo sube el listón para quien pase un `grep` por encima.
//
//   npm run flag                      muestra la clave actual
//   npm run flag -- "<clave nueva>"  genera los valores de otra
// ---------------------------------------------------------------------------

// Códigos de los dos caracteres finales. Como números no los encuentra una
// búsqueda de texto; `keyTail()` los vuelve a convertir en caracteres.
export const KEY_TAIL_CODES = [48, 61];

export const keyTail = () => String.fromCharCode(...KEY_TAIL_CODES);

/** Base64 -> texto. `atob` existe en el navegador y en Node 18 o superior. */
export const decodeKey = (encoded) => atob(encoded);

// ---------------------------------------------------------------------------
// Las 5 casas de entrega (la central no cuenta). Cada NPC hace una pregunta;
// si se acierta, entrega su fragmento de la cadena.
//
// Los fragmentos se unen EN ESTE ORDEN, no en el orden en que se entregan.
// `first: true` marca la casa a la que SIEMPRE se envía primero.
// ---------------------------------------------------------------------------
export const STOPS = [
  {
    id: 'induccion',
    name: 'Casa de Inducción',
    npc: 'nico',
    npcName: 'Nico',
    first: true,
    fragment: 'Q1RJe0Q',
    color: 0xf4f1ea, // blanca
    roofColor: 0xd8d2c4,
    beaconColor: 0x8fb8e8, // la baliza necesita color propio: el techo es gris
    principle: 'Bienvenida a la ciberseguridad',
    greeting:
      'Bienvenido al mundo de la ciberseguridad. Aquí no se trata de desconfiar de todo, sino de saber qué proteger y por qué. Partamos por lo básico.',
    question: {
      text: '¿Qué práctica protege mejor una cuenta, incluso si alguien llega a descubrir tu contraseña?',
      options: [
        'Cambiar la contraseña cada semana',
        'Activar un segundo factor de autenticación',
        'Usar una contraseña larguísima y repetirla en todos los sitios',
        'Guardar la contraseña en un archivo de texto en el escritorio',
      ],
      correct: 1,
      explain:
        'El segundo factor corta el ataque aunque la contraseña ya esté filtrada: quien la robó sigue sin el código ni la llave física. Cambiarla seguido cansa sin aportar, y repetirla convierte una filtración en todas.',
    },
    tip: 'La seguridad se construye en capas. Ninguna medida es suficiente sola, pero varias independientes hacen que el fallo de una no abra todo.',
  },
  {
    id: 'linux',
    name: 'Casa de Linux',
    npc: 'dani',
    npcName: 'Dani',
    fragment: 'zRjNOU0',
    color: 0xe8f3e4,
    roofColor: 0x3f9b4f, // verde
    principle: 'Permisos y mínimo privilegio en Linux',
    greeting:
      'Linux te muestra los permisos en la cara, así que conviene saber leerlos. Tengo una para ti.',
    question: {
      text: 'Un archivo tiene permisos -rwxr-xr--. ¿Qué puede hacer con él un usuario que no es el dueño ni pertenece a su grupo?',
      options: [
        'Leer, escribir y ejecutar',
        'Leer y ejecutar',
        'Solo leer',
        'Nada, no puede acceder',
      ],
      correct: 2,
      explain:
        'Los permisos se leen en tres bloques: dueño (rwx), grupo (r-x) y el resto (r--). El último bloque es el que aplica aquí, y solo tiene lectura. Por eso r-- significa leer y nada más.',
    },
    tip: 'Dar más permisos de los necesarios es el error más común y el más caro: una cuenta comprometida hereda todo lo que podía hacer.',
  },
  {
    id: 'defensa',
    name: 'Casa de Defensa',
    npc: 'milenka',
    npcName: 'Milenka',
    fragment: 'FfRU5fQ',
    color: 0xe6eefa,
    roofColor: 0x2f5fa8, // azul
    principle: 'Detección y respuesta (SOC)',
    greeting:
      'En el SOC vivimos de los registros y de las alertas. Pero una alerta que nadie sabe interpretar no sirve de nada.',
    question: {
      text: '¿Cuál es la diferencia principal entre un IDS y un IPS?',
      options: [
        'El IDS detecta y alerta; el IPS además bloquea el tráfico',
        'El IDS cifra el tráfico y el IPS lo descifra',
        'El IDS corre en la nube y el IPS solo en servidores físicos',
        'Ninguna, son dos nombres para lo mismo',
      ],
      correct: 0,
      explain:
        'El IDS es un detector: observa y avisa. El IPS está en línea con el tráfico y puede cortarlo. Por eso un IPS mal afinado tira servicio, mientras que un IDS mal afinado solo genera ruido.',
    },
    tip: 'Sin registros centralizados y protegidos contra borrado no hay detección ni investigación posible. Un log que nadie lee no defiende nada.',
  },
  {
    id: 'pentest',
    name: 'Casa de Pentest',
    npc: 'fernando',
    npcName: 'Fernando',
    fragment: '0FQQVNf',
    color: 0xf7e7e3,
    roofColor: 0xc0392b, // roja
    principle: 'Vulnerabilidades conocidas',
    greeting:
      'Un pentest no busca magia, busca lo que ya está roto y documentado. La mayoría de las intrusiones usan fallos con parche publicado.',
    question: {
      text: 'En un informe aparece la referencia CVE-2021-44228. ¿Qué es un CVE?',
      options: [
        'Una herramienta de escaneo de puertos',
        'El identificador único y público de una vulnerabilidad conocida',
        'Un algoritmo de cifrado simétrico',
        'Un nivel de privilegio administrativo en Windows',
      ],
      correct: 1,
      explain:
        'CVE es un catálogo público: cada fallo conocido recibe un identificador único para que todo el mundo hable de lo mismo. Ese en concreto es Log4Shell. Que sea público ayuda a defenderse, y también a quien ataca.',
    },
    tip: 'Si una vulnerabilidad tiene CVE y parche, ya no es un secreto de nadie. Inventariar y actualizar es la defensa más barata que existe.',
  },
  {
    id: 'legacy',
    name: 'Casa Legacy',
    npc: 'clip',
    npcName: 'El Clip',
    fragment: 'MjAyNn',
    color: 0xd8c7a8,
    roofColor: 0x8a6b4a, // café gastado
    principle: 'Riesgo de los sistemas heredados',
    greeting:
      'Parece que estás intentando asegurar un sistema de hace quince años. Llevo aquí desde entonces y te aseguro que nadie lo ha actualizado.',
    question: {
      text: 'Un servidor crítico sigue con un sistema operativo que ya no recibe actualizaciones. ¿Cuál es el mayor riesgo?',
      options: [
        'Que consuma más electricidad que uno moderno',
        'Que sus fallos conocidos no se parchen nunca y queden abiertos a cualquiera que los busque',
        'Que no pueda conectarse a internet',
        'Que los archivos ocupen más espacio en disco',
      ],
      correct: 1,
      explain:
        'Cuando un sistema sale de soporte, los fallos se siguen descubriendo pero ya nadie publica parches. Cada CVE nuevo es una puerta que queda abierta para siempre. Si no se puede migrar, hay que aislarlo en su propia red y vigilarlo de cerca.',
    },
    tip: 'Lo heredado no es solo lento: es deuda de seguridad que se acumula sola. Inventaria qué sigue vivo, aíslalo y ponle fecha de salida.',
  },
];

/** La cadena Base64 completa: los cinco fragmentos en orden, más la cola. */
export const FULL_ENCODED = STOPS.map((s) => s.fragment).join('') + keyTail();

/**
 * La clave ya decodificada.
 *
 * Es una función y no una constante a propósito: así solo se calcula si
 * alguien la pide. El juego nunca la llama, de modo que la clave en claro no
 * llega a existir en el navegador. La usan `npm run flag` y las pruebas, que
 * corren en Node.
 */
export const fullKey = () => decodeKey(FULL_ENCODED);
