/**
 * Vite config for E2E testing — renderer only (no electron plugin).
 * Electron main process is launched separately by Playwright fixtures.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
      // iris-editor is consumed as source (workspace symlink); resolve its
      // internal `@editor/*` alias to the package src — mirrors vite.config.ts.
      '@editor': path.resolve(__dirname, '../../../packages/iris-editor/src'),
    },
    // Force React / ReactFlow singletons so the source-bundled iris-editor
    // shares one copy (pnpm's layout can otherwise bundle two) — mirrors
    // vite.config.ts. Two copies break synthetic events + ReactFlow context.
    dedupe: ['react', 'react-dom', '@xyflow/react'],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    include: ['@tanstack/react-query', 'lucide-react'],
  },
});
