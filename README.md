# CITT Express

Juego educativo de ciberseguridad en el navegador. El alumnado reparte
encomiendas por un planeta pequeño; en cada casa le espera alguien con **una
pregunta de alternativas**. Si acierta, recibe **un fragmento de algo que
parece una clave** y el principio de ciberseguridad que hay detrás.

Al completar las 5 entregas los fragmentos se ensamblan, pero lo que aparece
**no es la flag todavía**: es una cadena en Base64. El juego no la decodifica
ni dice qué es. Reconocer la codificación y revertirla es el último paso del
desafío, y le toca al alumnado.

Construido con **Three.js** y **Vite**. Toda la geometría se genera con
primitivas en tiempo de carga; el único archivo externo es el logo de la
central.

## Despliegue (para quien administra la competencia)

El juego es **100% estático**: no necesita servidor de aplicación, ni base de
datos, ni puertos abiertos. Una vez construido son HTML, JavaScript y una
imagen, que se sirven como cualquier página.

```bash
git clone <url-del-repositorio>
cd citt-express
npm ci          # instala dependencias (necesita Node 18 o superior)
npm run build   # genera dist/
```

El contenido de `dist/` es lo que hay que publicar. Funciona tanto en la raíz
de un dominio como en un subdirectorio del tipo
`https://.../challenges/citt-express/`, porque las rutas generadas son
relativas (`base: './'` en `vite.config.js`).

**No se puede abrir `index.html` con doble clic.** El juego usa módulos de
JavaScript, que el navegador bloquea sobre `file://`. Hace falta servirlo por
HTTP, aunque sea con algo mínimo:

```bash
npx serve dist        # o: python -m http.server -d dist 8080
```

**Si quien despliega no puede ejecutar Node**, comenta la línea `dist/` del
`.gitignore` y sube la carpeta ya construida. Son archivos estáticos: basta
con copiarlos al servidor.

Para que **el alumnado lo ejecute en cada computador** no hace falta instalar
nada en esos equipos: basta con que abran la URL en un navegador con WebGL
(cualquier Chrome, Edge o Firefox actual). Si se necesita que funcione sin
red, hay que copiar `dist/` a cada máquina y levantar allí un servidor
estático local.

### Antes de publicar: qué viaja al navegador

El desafío se ejecuta entero en el cliente, así que conviene saber qué queda
expuesto y qué no.

**No viaja la flag.** No aparece en claro en ningún archivo, y el juego nunca
la decodifica, así que tampoco está en el JavaScript compilado. Lo que entrega
al terminar es la cadena en Base64, que es justamente el último paso del
desafío.

**Sí viajan las respuestas correctas de las preguntas.** Están en
`src/config.js` y en el bundle: quien abra las herramientas de desarrollo
puede verlas sin jugar. Es inevitable sin un servidor que valide.

**Y el repositorio conviene que sea privado.** Aunque la flag no esté escrita,
quien lea `src/config.js` puede rehacer la cadena juntando los fragmentos.
Dale acceso solo a quien administra la competencia.

Para ver la flag sin tenerla escrita en ninguna parte: `npm run flag`.

## Uso (desarrollo)

```bash
npm install
npm run dev      # servidor de desarrollo
npm run build    # bundle de producción en dist/
npm test         # simulación headless de 12 partidas completas
npm run export   # exporta los personajes a models/*.glb
```

Con el servidor levantado hay dos páginas:

- `/` el juego
- `/preview.html` la **hoja de personajes**: todos en fila sobre peanas,
  girando, con la luz y las sombras del juego y sus animaciones corriendo.
  Sirve para revisar el aspecto sin jugar hasta cada casa.

`npm run export` escribe un `.glb` por personaje en `models/`. El juego no los
usa (los personajes se construyen en código); sirven para abrirlos en Blender
o en cualquier visor de glTF.

Controles: `W`/`S` avanzar y retroceder, `A`/`D` girar, `P` alternar los
efectos visuales, `Espacio` continuar tras acertar una pregunta.

## El ciclo de juego

1. Recoger un paquete en la **Casa principal** (la central).
2. Ir a la casa que marque la baliza, esquivando a la chinita.
3. Responder la pregunta del NPC. Si se falla, se puede reintentar: la
   alternativa errada queda marcada y la tarjeta sigue abierta.
4. Al acertar, el NPC entrega su fragmento y se vuelve a la central.

La **Casa de Inducción es siempre la primera**; el resto sale en orden
aleatorio. Está marcada con `first: true` en `config.js`.

## La clave

**No está escrita en claro en ningún archivo del repositorio.** Va codificada
en Base64, cubriendo la cadena entera (desde `CTI` hasta la llave de cierre),
y repartida en cinco fragmentos: el campo `fragment` de cada parada en
`src/config.js`. Los dos últimos caracteres de esa cadena, incluido el `=` de
relleno, tampoco aparecen como texto: se guardan como códigos numéricos y se
añaden al completar la ruta.

Para verla o cambiarla:

```bash
npm run flag                       # muestra la clave actual
npm run flag -- "<clave nueva>"    # genera los valores para otra clave
```

El segundo comando imprime los `fragment` y los códigos de la cola listos para
pegar en `src/config.js`.

Los fragmentos se concatenan **en el orden del arreglo `STOPS`**, no en el
orden en que el jugador entrega, así que la clave sale igual sin importar la
ruta ni cuántas veces le roben un paquete.

`npm test` lo comprueba: juega 12 partidas completas, confirma que el orden de
entrega varió entre ellas y que la clave final fue siempre la misma. También
verifica que la clave no aparezca como texto en `src/` ni en este README, y
que los fragmentos por sí solos no la reconstruyan. Si cambias la clave o las
preguntas, vuelve a correrlo.

### Hasta dónde protege esto

**Base64 no cifra**: no hay clave ni secreto, solo otra forma de escribir los
mismos bytes, y se deshace en un segundo con cualquier herramienta. Aquí no
está puesto como protección sino como **último paso del desafío**: el juego
entrega la cadena codificada y el alumnado debe darse cuenta de qué es.

Lo que sí se gana, de paso, es que la flag no aparezca por ninguna parte:

- No está escrita en claro en ningún archivo del repositorio.
- No está en el JavaScript compilado. El juego nunca la decodifica, así que
  el navegador no la ve en ningún momento, y el empaquetador ni siquiera
  incluye la función que decodifica.
- Lo que sí viaja son los cinco fragmentos, que por separado no reconstruyen
  nada: faltan los dos últimos caracteres, que se añaden al terminar la ruta.

Aun así, quien lea `src/config.js` con calma puede rehacer la cadena a mano.
Para impedirlo de verdad habría que validar la respuesta en un servidor, que ya
es otro tipo de desafío. Conviene que el repositorio sea privado.

## Las casas

| Casa | Color | NPC | Tema de la pregunta | Fragmento |
|---|---|---|---|---|
| Casa principal | Blanca y azul | — | Central de encomiendas, logo en la torre | — |
| Casa de Inducción | Blanca | Nico | Introductoria: MFA y capas | `D3F` |
| Casa de Linux | Verde | Dani (+ pingüino) | Permisos de archivo en Linux | `3NSA` |
| Casa de Defensa | Azul | Milenka | SOC: diferencia entre IDS e IPS | `_EN_` |
| Casa de Pentest | Roja | Fernando | Qué es un CVE | `CAP` |
| Casa Legacy | Café gastado | El Clip | Riesgo de sistemas sin soporte | `AS_2026` |

Cada entrada de `STOPS` lleva su `greeting`, su `question` (enunciado, cuatro
alternativas, índice de la correcta y la explicación que se muestra al
acertar) y el `tip` con el principio de fondo. Se pueden cambiar sin tocar el
resto del código.

El planeta usa una semilla fija (`WORLD.seed`), así que **todo el curso juega
exactamente el mismo mapa**. Cambiar la semilla genera otro reparto.

## La chinita

Ronda el planeta y, si toca al mensajero **mientras lleva un paquete**, se lo
roba: aparece un aviso en la esquina durante 3 segundos, el juego no se detiene
y hay que volver a la central por otro. El destino asignado no cambia.

La dificultad está calibrada en `LADYBUG` (`config.js`) así:

- es más lenta que el jugador (6,2 contra 7,5), así que en línea recta no
  alcanza;
- **intercepta**: apunta a donde el jugador va a estar, no a donde está, de
  modo que girar sin pensar sale caro;
- solo persigue cuando el jugador lleva algo, así que el regreso es seguro;
- esquiva los edificios, por lo que se la puede despistar rodeando una casa;
- nunca entra en la plaza de la central (`safeZone`), así que siempre se puede
  salir con el paquete en la mano;
- tras robar se aleja unos segundos, para que no encadene dos robos.

`npm test` mide el ajuste con un piloto automático que **nunca esquiva**: en
ese peor caso pierde alrededor de un paquete por partida y aun así termina
siempre. Una persona que esquive lo notará bastante más fácil.

## Estructura

| Archivo | Responsabilidad |
|---|---|
| `src/config.js` | Toda la configuración: clave, casas, preguntas, chinita, ajustes |
| `src/sphereMath.js` | Movimiento y orientación sobre la esfera |
| `src/world.js` | Planeta, central, casas, mini ciudad, caminos y vegetación |
| `src/npc.js` | Los cinco NPC, el pingüino y la mascota del planeta |
| `src/ladybug.js` | La chinita: vuelo, persecución e intercepción |
| `src/funko.js` | El molde compartido: proporciones y cuerpo base |
| `src/player.js` | El mensajero: modelo, caminata y colisiones |
| `src/followCamera.js` | Cámara de seguimiento |
| `src/postfx.js` | Cadena de post-procesado (bloom, ACES) |
| `src/game.js` | Entregas, preguntas y ensamblado de la clave |
| `src/ui.js` | HUD, tarjetas y pantalla final (HTML, no 3D) |
| `src/main.js` | Arranque, luces, sombras y bucle principal |
| `public/citt_logo.jpg` | Logo de la torre de la central |

## Notas de implementación

**Gravedad radial.** La posición del jugador no son coordenadas x/y/z sino un
vector unitario `up` desde el centro del planeta. Ese vector *es* la normal del
suelo, y la dirección de avance `fwd` es siempre tangente a él. Avanzar es
rotar ambos vectores sobre su círculo máximo, lo que mantiene al personaje
pegado a la superficie sin necesidad de física.

**Colisiones.** Cada obstáculo es un círculo sobre la esfera definido por una
dirección y un radio angular. Si el jugador entra en uno, se lo reubica en el
borde por el camino más corto, lo que produce deslizamiento en lugar de
bloqueo. En un rincón entre dos edificios ese empuje puede no converger, así
que tras cuatro pasadas se vuelve a la posición del fotograma anterior: es lo
que garantiza que nunca quede dentro de una pared.

**Caminos y ciudad.** De la central sale un camino hacia cada casa: una cinta
de triángulos sobre el arco de círculo máximo, levantada 7 cm, con un desvío
lateral sinusoidal que vale cero en los extremos (por eso serpentean sin dejar
de llegar a la puerta). Los edificios de relleno se levantan después a ambos
lados de cada camino, lo que convierte los caminos en calles.

**Aspecto.** Sombras suaves (PCF) con una sola cámara ortográfica que cubre el
planeta entero, terreno pintado cara a cara con ruido para que el verde no sea
plano, cielo diurno con niebla del mismo color, nubes instanciadas, humo en las
chimeneas y bandera con vértices animados.

**Rendimiento.** Árboles, rocas, flores y nubes son `InstancedMesh`. Las piezas
repetidas (rizos del pelo, ventanas, rejas) se funden en una sola malla por
objeto, lo que bajó la escena de 792 a 588 mallas sin cambiar un triángulo. Los
shaders se compilan durante la pantalla de carga para evitar el tirón del
primer fotograma. En equipos de 4 núcleos o menos se baja la resolución y se
desactivan sombras y efectos.

## Sobre los personajes

Todos salen del **mismo molde**, `src/funko.js`, que es lo que hace que la
colección se vea pareja: estilo de figura coleccionable, cabeza del 42% de la
altura en caja redondeada, sin cuello, cuerpo pequeño, brazos y piernas cortos
y rectos, ojos como dos óvalos negros macizos sin blanco ni pupila, sin nariz
ni boca, y acabado de vinilo mate. Miden entre 2,29 y 2,43.

`buildFunkoBase()` devuelve las piernas y los brazos como grupos con pivote en
la cadera y en el hombro. Los NPC simplemente no los rotan; el mensajero sí, y
de ahí sale su caminata: piernas en oposición de fase, brazos al revés, el
cuerpo sube cuando una pierna pasa vertical y el torso se inclina hacia la
marcha.

**Ojo con el sentido de giro.** El personaje mira hacia `-Z`, así que para
levantar un brazo hacia adelante hay que rotarlo en X con ángulo **positivo**.
Con ángulo negativo se va hacia atrás y parece dislocado. Las constantes
`CARRY_X` y `CARRY_Z` de `player.js` definen la pose al sostener el paquete, y
`PARCEL_CARRY` lo coloca justo entre las manos que esa pose produce: si tocas
una, revisa la otra.

El mensajero es de rasgos deliberadamente neutros, sin nada que indique
género: pelo de largo medio, polera holgada, jeans anchos, zapatillas y
mochila. Las contexturas (`slim`, `normal`, `wide` en `BUILDS`) solo cambian
anchos, nunca la altura.

Los cuatro NPC con cara son caricaturas construidas con primitivas a partir de
las fotos y las descripciones: toman la ropa, el pelo y los accesorios
reconocibles, no los rasgos. **No usan texturas ni los retratos originales.**
Para cambiar a alguien basta con editar su entrada en `PEOPLE`, en `npc.js`.
El Clip es un homenaje al asistente de oficina de los noventa, modelado con un
tubo que sigue una curva en forma de clip, y le queda bien la Casa Legacy. A
Dani lo acompaña Tux, el pingüino de Linux.

El ave azul de la mascota institucional sigue en el juego como personaje
decorativo junto a la central: ya no entrega fragmentos, porque las cinco
casas de entrega son las que define `STOPS`.
