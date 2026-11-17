import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // Rutas relativas en el HTML generado.
  //
  // Por defecto Vite escribe rutas absolutas ("/assets/main.js"), que solo
  // funcionan si el juego se sirve en la raíz del dominio. Las plataformas de
  // CTF suelen alojar cada desafío en un subdirectorio
  // (https://.../challenges/citt-express/), y ahí las rutas absolutas apuntan
  // fuera y la página queda en blanco. Con './' funciona en cualquier ruta.
  base: './',

  build: {
    rollupOptions: {
      input: {
        // Dos páginas: el juego y la hoja de personajes. En desarrollo Vite
        // sirve cualquier .html de la raíz, pero el build de producción solo
        // toma index.html si no se declaran aquí las dos entradas.
        main: resolve(__dirname, 'index.html'),
        preview: resolve(__dirname, 'preview.html'),
      },
    },
  },
});
