import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// NOTE: vite-plugin-pwa was removed on purpose. This project already ships a hand-written
// service worker (public/sw.js) with manual registration (src/main.tsx) and a manual
// manifest (public/manifest.json). vite-plugin-pwa's default 'generateSW' strategy also
// emits a service worker to the same /sw.js path at build time, which silently overwrote
// (or raced with) the custom one and made offline caching behavior unpredictable.
export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
