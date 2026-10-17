// Test-only module resolution for `node --test` on the editor's TypeScript
// sources (Node type stripping). The sources are written for a bundler:
// extensionless relative imports and the `@editor/*` path alias. This hook
// maps both to the real `.ts` / `.tsx` files so store and utility modules can
// be imported directly. Use: `node --import ./test/ts-resolve.mjs --test ...`.
import { register } from 'node:module';

register(
  `data:text/javascript,${encodeURIComponent(`
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = ${JSON.stringify(new URL('../src/', import.meta.url).href)};
const EXTS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

function tryFile(base) {
  const p = fileURLToPath(base);
  if (existsSync(p) && statSync(p).isFile()) return base;
  for (const ext of EXTS) {
    const candidate = fileURLToPath(base) + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@editor/')) {
    const hit = tryFile(new URL(specifier.slice('@editor/'.length), SRC).href);
    if (hit) return { url: hit, shortCircuit: true };
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const hit = tryFile(new URL(specifier, context.parentURL).href);
    if (hit) return { url: hit, shortCircuit: true };
  }
  return next(specifier, context);
}
`)}`,
);
