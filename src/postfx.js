// ---------------------------------------------------------------------------
// Hito 6: estilo visual con EffectComposer.
//
// Cadena de pases:
//   RenderPass      -> dibuja la escena en un buffer en vez de la pantalla
//   UnrealBloomPass -> extrae los píxeles brillantes y los difunde (halo)
//   OutputPass      -> aplica el mapeo de tonos ACES y pasa a sRGB
//
// Pulsando P se desactiva toda la cadena, para comparar con el render directo.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export function createPostFX(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());

  // Buffer propio con MSAA: el antialias del renderer no llega a los pases,
  // así que sin esto los bordes se ven dentados al activar los efectos.
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: 4,
  });

  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  // strength, radius, threshold: solo lo que pasa el umbral genera halo.
  // Con cielo diurno el umbral va alto, si no el fondo entero se empasta;
  // el halo queda reservado para las balizas y el sol.
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    0.34,
    0.7,
    0.9
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const api = {
    enabled: true,
    composer,
    bloom,
    render() {
      if (api.enabled) composer.render();
      else renderer.render(scene, camera);
    },
    setSize(w, h) {
      composer.setSize(w, h);
      bloom.setSize(w, h);
    },
    toggle() {
      api.enabled = !api.enabled;
      return api.enabled;
    },
  };
  return api;
}
