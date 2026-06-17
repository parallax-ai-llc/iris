import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

// Builds the local-host SPA (index.html → dist/), served by iris-host-local's
// Fastify server. iris/web consumes this package as a source library instead
// (importing from src/), so it uses its own Tailwind/build — this config is
// only for the standalone local app. In dev, proxy API + media to a running
// `npx iris-flow` instance.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@editor': srcDir },
    // pnpm's symlinked layout can otherwise bundle two React copies, which
    // breaks React's synthetic event system (any click freezes the renderer).
    dedupe: ['react', 'react-dom'],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4747',
      '/public': 'http://localhost:4747',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
