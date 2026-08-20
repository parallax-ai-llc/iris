/**
 * Vite config for E2E testing — renderer only (no electron plugin).
 * Electron main process is launched separately by Playwright fixtures.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// package.json is read via createRequire rather than a JSON import so this
// config needs no `resolveJsonModule`/assert syntax under ESM.
const pkg = createRequire(import.meta.url)('../package.json') as { version: string };

export default defineConfig({
  // MUST mirror vite.config.ts. Without it the renderer throws
  // `ReferenceError: __APP_VERSION__ is not defined` on boot (ConnectionStatus
  // → Sidebar → AppLayout), taking down every E2E test that renders the shell.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
