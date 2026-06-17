/**
 * Shared Iris workflow template types.
 *
 * Framework-agnostic — no React, no app DTOs. Consumers (iris/web, iris/desktop)
 * map these onto their own create-workflow shapes.
 */

/** A node in a template's preset graph. `type` is an Iris node type string
 *  (e.g. `TRIGGER_MANUAL`, `GEN_TEXT_TO_IMAGE`). */
export interface TemplateNode {
  nodeId: string;
  type: string;
  label: string;
  positionX: number;
  positionY: number;
  config?: Record<string, unknown>;
  inputPorts?: unknown[];
  outputPorts?: unknown[];
  providerId?: string;
}

/** An edge connecting two template nodes by handle id. */
export interface TemplateEdge {
  edgeId: string;
  sourceNodeId: string;
  sourceHandle: string;
  targetNodeId: string;
  targetHandle: string;
  label?: string;
  animated?: boolean;
}

/** Common template metadata, shared by presets and (server) saved templates. */
export interface WorkflowTemplateMeta {
  name: string;
  description?: string;
  category: string;
  tags?: string[];
  nodeCount?: number;
  usageCount?: number;
}

/** A built-in preset template: metadata + the full workflow graph to
 *  instantiate. `i18nKey` indexes the `presets` block of the locale messages. */
export interface PresetTemplate extends WorkflowTemplateMeta {
  id: string;
  isPreset: true;
  i18nKey: string;
  presetNodes: TemplateNode[];
  presetEdges: TemplateEdge[];
}

/** The empty-canvas pseudo-template (no graph). */
export interface BlankTemplateMeta {
  id: string;
  name: string;
  description: string;
  category: string;
}
