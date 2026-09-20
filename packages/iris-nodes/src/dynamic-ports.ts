// Dynamic output ports — shared by the engine (which emits them) and the
// editors (which render handles for them) so both sides derive the same port
// names from the same node settings.
//
// Two nodes grow ports from their config:
//   - UTIL_ROUTER: one port per `routes[].name` (+ the static `default`).
//   - AI_DECISION (mode = choice): one port per option label.

import type { PortDefinition } from './types.js';

export interface DecisionOption {
  /** Port name and the label sent to the model. */
  label: string;
  /** Optional criteria text sent alongside the label. */
  description: string | null;
}

export interface RouterRoute {
  name: string;
  condition: string;
}

/** AI_DECISION output names an option label may not shadow. */
export const DECISION_RESERVED_PORTS: readonly string[] = [
  'answer',
  'confidence',
  'probabilities',
  'true',
  'false',
  'uncertain',
];

/**
 * Parse the `options` textarea of AI_DECISION: one option per line,
 * `label: description` or just `label`. Blank lines, duplicate labels and
 * labels that collide with the fixed output ports are dropped.
 */
export function parseDecisionOptions(raw: unknown): DecisionOption[] {
  if (typeof raw !== 'string') return [];
  const seen = new Set<string>();
  const options: DecisionOption[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(':');
    const label = (idx === -1 ? trimmed : trimmed.slice(0, idx)).trim();
    const description = idx === -1 ? '' : trimmed.slice(idx + 1).trim();
    if (!label || seen.has(label) || DECISION_RESERVED_PORTS.includes(label)) continue;
    seen.add(label);
    options.push({ label, description: description || null });
  }
  return options;
}

/**
 * Parse the `levels` textarea of AI_DECISION: one level per line, lowest
 * first. The line index is the score the model returns.
 */
export function parseScoreLevels(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Parse the `routes` config of UTIL_ROUTER (a JSON array of
 * `{ name, condition }`, stored as a string by the editor or already
 * parsed). Entries without a name, or named `default`, are dropped.
 */
export function parseRouterRoutes(raw: unknown): RouterRoute[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const routes: RouterRoute[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === 'string' ? e.name.trim() : '';
    const condition = typeof e.condition === 'string' ? e.condition.trim() : '';
    if (!name || name === 'default') continue;
    routes.push({ name, condition });
  }
  return routes;
}

/**
 * Output ports a node exposes given its settings. Returns the static
 * definition's ports for nodes without dynamic ports, so callers can use
 * this unconditionally in place of `nodeDef.outputs`.
 */
export function getDynamicOutputPorts(
  nodeType: string,
  staticOutputs: PortDefinition[],
  settings: Record<string, unknown> | undefined,
): PortDefinition[] {
  if (nodeType === 'UTIL_ROUTER') {
    const routes = parseRouterRoutes(settings?.routes);
    if (routes.length === 0) return staticOutputs;
    const routePorts: PortDefinition[] = routes.map((r) => ({
      name: r.name,
      type: 'any',
      label: r.name,
    }));
    return [...routePorts, ...staticOutputs];
  }

  if (nodeType === 'AI_DECISION' && settings?.mode === 'choice') {
    const options = parseDecisionOptions(settings?.options);
    if (options.length === 0) return staticOutputs;
    const optionPorts: PortDefinition[] = options.map((o) => ({
      name: o.label,
      type: 'any',
      label: o.label,
    }));
    // In choice mode the yes/no ports never fire — swap them for the labels.
    const kept = staticOutputs.filter((p) => p.name !== 'true' && p.name !== 'false');
    const valuePorts = kept.filter((p) => p.name !== 'uncertain');
    const uncertain = kept.filter((p) => p.name === 'uncertain');
    return [...valuePorts, ...optionPorts, ...uncertain];
  }

  return staticOutputs;
}
