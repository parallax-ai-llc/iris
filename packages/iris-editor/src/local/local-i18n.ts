/**
 * Local i18n for the editor's `t` seam. Resolves the editor's `iris.*` keys
 * against the vendored English dictionary. Used by the iris-host-local SPA and
 * the Electron desktop host (both run the editor without a full i18n runtime).
 */

import enIris from './en-iris.json';

function dotGet(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
      obj,
    );
}

/** Build a `t(key, params?)` that resolves `iris.*` keys against `en-iris.json`. */
export function createLocalT(): (
  key: string,
  params?: string | Record<string, unknown>,
) => string {
  return (key, params) => {
    const stripped = key.startsWith('iris.') ? key.slice(5) : key;
    const val = dotGet(enIris, stripped);
    if (typeof val === 'string') {
      if (params && typeof params === 'object') {
        return val.replace(/\{(\w+)\}/g, (_, k) =>
          String((params as Record<string, unknown>)[k] ?? ''),
        );
      }
      return val;
    }
    return typeof params === 'string' ? params : '';
  };
}
