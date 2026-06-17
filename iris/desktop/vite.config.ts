import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'path';
import pkg from './package.json';

// VS Code (Electron-based) sets ELECTRON_RUN_AS_NODE=1, which makes
// the Electron binary act as plain Node.js without Electron APIs.
// Remove it so child Electron processes initialize properly.
delete process.env.ELECTRON_RUN_AS_NODE;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            sourcemap: false,
            minify: true,
            rollupOptions: {
              external: [
                'electron', 'electron-store', 'electron-updater',
                '@ffmpeg-installer/ffmpeg', '@ffmpeg-installer/win32-x64',
                // Local workflow engine + its server (embedded in main). Fastify
                // is bundle-hostile (dynamic requires), and the workspace pkgs
                // resolve from node_modules/dist at runtime — keep them external.
                'fastify', '@fastify/cors', '@fastify/static',
                'iris-engine', 'iris-host-local', 'iris-nodes',
              ],
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            sourcemap: false,
            minify: true,
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'es',
                entryFileNames: '[name].mjs',
              },
            },
          },
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // iris-editor is consumed as source; resolve its internal `@editor/*`
      // alias to the package src (same as iris/web's webpack config).
      '@editor': path.resolve(__dirname, '../../packages/iris-editor/src'),
    },
    // iris-editor is consumed as a source library (workspace symlink). pnpm's
    // layout can otherwise bundle two copies of React / @xyflow/react, which
    // breaks React's synthetic events and ReactFlow context. Force singletons.
    dedupe: ['react', 'react-dom', '@xyflow/react'],
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    chunkSizeWarningLimit: 4000,
  },
  optimizeDeps: {
    include: ['@tanstack/react-query', 'lucide-react'],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
