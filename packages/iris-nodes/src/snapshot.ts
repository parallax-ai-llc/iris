// Language-agnostic JSON snapshot of the catalog. Used as the input for
// codegen in non-TS SDKs (sdk-py, sdk-go). Run via `pnpm gen:snapshot` —
// the build step writes dist/snapshot.json which other tooling reads.

import { NODE_DEFINITIONS } from './index.js';
import type { NodeDefinition } from './types.js';

export interface SnapshotPort {
  name: string;
  type: string;
  label: string;
  required?: boolean;
  multiple?: boolean;
  hideHandle?: boolean;
}

export interface SnapshotConfigField {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  defaultValue?: unknown;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  description?: string;
  dependsOn?: { field: string; value: unknown };
}

export interface SnapshotNode {
  type: string;
  category: string;
  label: string;
  description: string;
  iconName: string;
  color: string;
  aiCapability?: string;
  canBeTool?: boolean;
  inputs: SnapshotPort[];
  outputs: SnapshotPort[];
  configFields: SnapshotConfigField[];
}

export interface Snapshot {
  version: string;
  generatedAt: string;
  categories: string[];
  nodes: Record<string, SnapshotNode>;
}

function toSnapshotNode(def: NodeDefinition): SnapshotNode {
  return {
    type: def.type,
    category: def.category,
    label: def.label,
    description: def.description,
    iconName: def.iconName,
    color: def.color,
    ...(def.aiCapability !== undefined ? { aiCapability: def.aiCapability } : {}),
    ...(def.canBeTool !== undefined ? { canBeTool: def.canBeTool } : {}),
    inputs: def.inputs.map((p) => ({
      name: p.name,
      type: p.type,
      label: p.label,
      ...(p.required !== undefined ? { required: p.required } : {}),
      ...(p.multiple !== undefined ? { multiple: p.multiple } : {}),
      ...(p.hideHandle !== undefined ? { hideHandle: p.hideHandle } : {}),
    })),
    outputs: def.outputs.map((p) => ({
      name: p.name,
      type: p.type,
      label: p.label,
      ...(p.required !== undefined ? { required: p.required } : {}),
      ...(p.multiple !== undefined ? { multiple: p.multiple } : {}),
      ...(p.hideHandle !== undefined ? { hideHandle: p.hideHandle } : {}),
    })),
    configFields: def.configFields.map((f) => ({
      name: f.name,
      label: f.label,
      type: f.type,
      ...(f.required !== undefined ? { required: f.required } : {}),
      ...(f.defaultValue !== undefined ? { defaultValue: f.defaultValue } : {}),
      ...(f.options !== undefined ? { options: f.options } : {}),
      ...(f.min !== undefined ? { min: f.min } : {}),
      ...(f.max !== undefined ? { max: f.max } : {}),
      ...(f.step !== undefined ? { step: f.step } : {}),
      ...(f.placeholder !== undefined ? { placeholder: f.placeholder } : {}),
      ...(f.description !== undefined ? { description: f.description } : {}),
      ...(f.dependsOn !== undefined ? { dependsOn: f.dependsOn } : {}),
    })),
  };
}

export function buildSnapshot(version: string = '0.1.0'): Snapshot {
  const nodes: Record<string, SnapshotNode> = {};
  for (const [type, def] of Object.entries(NODE_DEFINITIONS)) {
    nodes[type] = toSnapshotNode(def);
  }
  return {
    version,
    generatedAt: new Date().toISOString(),
    categories: ['TRIGGER', 'GENERATOR', 'ANALYZER', 'EDITOR', 'UTILITY', 'WEB', 'OUTPUT'],
    nodes,
  };
}
