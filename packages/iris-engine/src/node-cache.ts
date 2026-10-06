/**
 * Node result cache — key computation and eligibility rules.
 *
 * When a workflow is re-run, a node whose resolved config and upstream outputs
 * are unchanged reuses its previous result instead of executing (and billing)
 * again. This module is pure: it decides *whether* a node may be cached and
 * *what* its cache key is. Persistence lives behind `WorkflowStore`
 * (`getCachedResult` / `putCachedResult` / `deleteCachedResult`), and the
 * orchestration (hit / miss / write) lives in `workflow-engine.ts`.
 *
 * Key = sha256(canonicalJson({ v, type, config, inputs })), where
 *   - `config` is the node config with `{{var}}` substituted and UI-only
 *     fields (label, position, ...) removed,
 *   - `inputs` maps each input port to the content hash of the value that
 *     flows into it (asset references are represented by their id).
 * The key never contains the nodeId: identical nodes anywhere in the same
 * workflow share an entry. Entries are scoped by (workflowId, userId).
 *
 * The key only sees config + inputs, so a node that reads execution variables
 * directly (not through `{{var}}` in its config, e.g. condition / router /
 * filter expressions) is marked `cacheable: false` in its iris-nodes
 * definition. variables 를 직접 읽는 노드는 정의에서 cacheable:false 로 표시한다.
 * Input values get the same `{{var}}` substitution as config before hashing,
 * because generator prompts resolve `{{var}}` inside upstream text too.
 *
 * Known limit: in agent mode the tool nodes an agent calls also receive the
 * run's variables; their effect is only visible through the agent node's own
 * key (config + inputs), not tracked per variable.
 */

import { createHash } from 'node:crypto';
import { getNodeDefinition } from 'iris-nodes';

/** Bump to invalidate every cache entry (e.g. node semantics changed). */
export const CACHE_SCHEMA_VERSION = 1;

/** Outputs whose JSON serialization exceeds this are not cached. */
export const MAX_CACHE_ENTRY_BYTES = 1_048_576;

/** Per-workflow entry cap; beyond it the least recently used are evicted. */
export const MAX_CACHE_ENTRIES_PER_WORKFLOW = 500;

/** Entries unused for this many days are removed by cleanup. */
export const CACHE_RETENTION_DAYS = 7;

/** UTIL_CRYPTO operations that produce random output and are never cached. */
const NON_DETERMINISTIC_CRYPTO_OPERATIONS = new Set(['uuid', 'randomString']);

/** Config keys that only affect presentation, never execution. */
const UI_ONLY_CONFIG_KEYS = new Set([
  'label',
  'description',
  'position',
  'positionX',
  'positionY',
  'width',
  'height',
  'color',
  'notes',
  'ui',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Normalize a value into a JSON-compatible tree with sorted object keys. */
function canonicalize(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null) return null;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      return Number.isFinite(value) ? value : null;
    case 'bigint':
      return value.toString();
    case 'undefined':
    case 'function':
    case 'symbol':
      return undefined;
    default:
      break;
  }

  const obj = value as object;
  if (seen.has(obj)) return '[Circular]';

  const withToJson = obj as { toJSON?: () => unknown };
  if (typeof withToJson.toJSON === 'function') {
    return canonicalize(withToJson.toJSON(), seen);
  }

  seen.add(obj);
  try {
    if (Array.isArray(obj)) {
      return obj.map(item => {
        const normalized = canonicalize(item, seen);
        return normalized === undefined ? null : normalized;
      });
    }
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const normalized = canonicalize(
        (obj as Record<string, unknown>)[key],
        seen
      );
      if (normalized !== undefined) out[key] = normalized;
    }
    return out;
  } finally {
    seen.delete(obj);
  }
}

/**
 * Deterministic JSON: object keys sorted recursively, `undefined` (and
 * functions / symbols) dropped from objects, array order preserved.
 */
export function canonicalJson(value: unknown): string {
  const normalized = canonicalize(value, new WeakSet());
  return JSON.stringify(normalized === undefined ? null : normalized);
}

/** Hex SHA-256 of a UTF-8 string. */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * True when the engine may read / write the cache for this node. A node is
 * cacheable unless its iris-nodes definition says `cacheable: false`; unknown
 * node types are never cached. `UTIL_CRYPTO` is cacheable only for its
 * deterministic operations (hash / hmac), never for uuid / randomString.
 */
export function isNodeCacheable(
  type: string,
  config: Record<string, unknown> | null | undefined
): boolean {
  const definition = getNodeDefinition(type);
  if (!definition) return false;
  if (definition.cacheable === false) return false;

  if (type === 'UTIL_CRYPTO') {
    const cfg = config ?? {};
    const settings = isPlainObject(cfg.settings) ? cfg.settings : {};
    const operation = (cfg.operation ?? settings.operation ?? 'hash') as unknown;
    if (NON_DETERMINISTIC_CRYPTO_OPERATIONS.has(String(operation))) {
      return false;
    }
  }

  return true;
}

function substituteVariables(
  value: unknown,
  variables: Record<string, unknown>
): unknown {
  if (typeof value === 'string') {
    // Same rule as NodeExecutor.resolveValue.
    return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
      String(variables[name] ?? '')
    );
  }
  if (Array.isArray(value)) {
    return value.map(item => substituteVariables(item, variables));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = substituteVariables(inner, variables);
    }
    return out;
  }
  return value;
}

/**
 * The config as it participates in the cache key: UI-only top-level fields
 * removed, then `{{var}}` substituted in every string (recursively).
 * `provider` / `model` stay in.
 */
export function resolveConfigForCacheKey(
  config: Record<string, unknown> | null | undefined,
  variables: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config ?? {})) {
    if (UI_ONLY_CONFIG_KEYS.has(key)) continue;
    out[key] = substituteVariables(value, variables);
  }
  return out;
}

/** An asset reference (`{ id, type, path | url }`) is represented by its id
 *  so signed / temporary URLs do not change the hash. */
function isAssetLike(value: unknown): value is { id: string } {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    ('path' in value || 'url' in value)
  );
}

function representAssets(value: unknown): unknown {
  if (isAssetLike(value)) return { assetId: value.id };
  if (Array.isArray(value) && value.length > 0 && value.every(isAssetLike)) {
    return value.map(item => ({ assetId: (item as { id: string }).id }));
  }
  return value;
}

/** Content hash of a node's `outputs` (asset references by id). */
export function hashOutputs(outputs: Record<string, unknown>): string {
  const represented: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(outputs ?? {})) {
    represented[key] = representAssets(value);
  }
  return sha256Hex(canonicalJson(represented));
}

/**
 * Per-port content hashes of the values flowing into a node. When `variables`
 * is given, `{{var}}` in input strings (recursively) is substituted first with
 * the same rule as `resolveConfigForCacheKey`, so a prompt that references a
 * variable gets a new key when that variable changes. Asset references are
 * still represented by their id.
 */
export function hashInputs(
  inputs: Record<string, unknown>,
  variables?: Record<string, unknown>
): Record<string, string> {
  const hashed: Record<string, string> = {};
  for (const [port, value] of Object.entries(inputs ?? {})) {
    if (value === undefined) continue;
    const represented = representAssets(value);
    const resolved = variables
      ? substituteVariables(represented, variables)
      : represented;
    hashed[port] = sha256Hex(canonicalJson(resolved));
  }
  return hashed;
}

/** The cache key for a node run. Never includes the nodeId. */
export function computeNodeCacheKey(params: {
  type: string;
  config: Record<string, unknown>;
  inputs: Record<string, unknown>;
  /** Run variables for `{{var}}` substitution inside input values. */
  variables?: Record<string, unknown>;
}): string {
  return sha256Hex(
    canonicalJson({
      v: CACHE_SCHEMA_VERSION,
      type: params.type,
      config: params.config,
      inputs: hashInputs(params.inputs, params.variables),
    })
  );
}

/** True when the outputs are small enough to cache. */
export function outputsWithinSizeLimit(
  outputs: Record<string, unknown>
): boolean {
  try {
    const serialized = JSON.stringify(outputs ?? {});
    return Buffer.byteLength(serialized, 'utf8') <= MAX_CACHE_ENTRY_BYTES;
  } catch {
    return false;
  }
}
