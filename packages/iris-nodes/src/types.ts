// Shared type definitions for Iris workflow nodes.
// These are pure data types — no React/icon imports — so they can be consumed
// by the web app, desktop app, RN app, server, LLM service, and SDKs.

export type NodeCategory =
  | 'TRIGGER'
  | 'GENERATOR'
  | 'ANALYZER'
  | 'EDITOR'
  | 'UTILITY'
  | 'WEB'
  | 'OUTPUT';

export type PortType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'json'
  | 'any'
  | 'trigger';

export interface PortDefinition {
  name: string;
  type: PortType;
  label: string;
  required?: boolean;
  multiple?: boolean;
  /** If true, the port has no connection handle — preview only, cannot be wired to another node. */
  hideHandle?: boolean;
}

export type ConfigFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'toggle'
  | 'slider'
  | 'file'
  | 'prompt'
  | 'json'
  | 'headers'
  | 'provider'
  | 'model'
  | 'duration'
  /**
   * Multi-select picker over other nodes in the same workflow.
   * Currently used by `GEN_TEXT_TO_TEXT` (mode='agent') to let the user pick
   * which nodes the agent may call as tools. The UI should filter the
   * candidate list to nodes whose definition has `canBeTool: true`.
   * Value shape: `string[]` of node IDs (workflow-local).
   */
  | 'node-multi-select';

export interface ConfigFieldDefinition {
  name: string;
  label: string;
  type: ConfigFieldType;
  required?: boolean;
  defaultValue?: unknown;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  description?: string;
  dependsOn?: {
    field: string;
    value: unknown;
  };
}

/**
 * Storage shape for the 'headers' config field.
 * Array form preserves order, allows toggle/disable, and supports duplicate keys.
 * Execution engines also accept the legacy `Record<string,string>` shape.
 */
export interface HeaderEntry {
  key: string;
  value: string;
  enabled?: boolean;
}

/**
 * Node definition — pure data only.
 * UI apps (iris/, iris-desktop/) provide their own icon mapping by reading
 * `iconName` and looking it up in their local icon set (lucide-react etc.).
 */
export interface NodeDefinition {
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  /** Symbolic icon name. Each UI app maps this to its own icon library. */
  iconName: string;
  /** Tailwind / theme color hint (e.g. 'gray', 'purple'). */
  color: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  configFields: ConfigFieldDefinition[];
  /** Optional AI capability tag (used by ModelSelector to filter providers). */
  aiCapability?: string;
  /**
   * If true, this node can be exposed to an AI agent (`GEN_TEXT_TO_TEXT`
   * with `mode='agent'`) as a callable tool. Defaults to undefined/false.
   *
   * Set to true on side-effect-light, idempotent-ish nodes that an agent
   * can reasonably call repeatedly during a reasoning loop. Side-effect-heavy
   * nodes (outputs, irreversible edits, money-spending generators) should
   * remain false to prevent the agent from doing unintended damage.
   */
  canBeTool?: boolean;
}
