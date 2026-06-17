/**
 * iris-editor — shared Iris workflow editor.
 *
 * The editor extracted from iris/web, decoupled from the app via an injected
 * seam context. Mount `<IrisWorkflowEditor>` inside `<IrisEditorProvider>` and
 * provide the seams (API client, i18n, model list, navigation, optional media
 * components). Consumed by iris/web (real seams) and iris-host-local (local
 * seams). Import the theme once: `import 'iris-editor/styles.css'`.
 */

export { IrisWorkflowEditor } from './IrisWorkflowEditor';
export type { IrisWorkflowEditorProps } from './IrisWorkflowEditor';
export { IrisEditorProvider, useSeams } from './seams';
export type { IrisEditorSeams, ModelsSeam } from './seams';

// API client seam (injectable singleton + the types consumers need). PortType
// is intentionally NOT re-exported here — node-definitions' PortType is the one
// consumers use; this avoids an ambiguous re-export.
export { irisApiClient, setIrisApiClient } from './lib/apis/iris-api-client';
export type {
  IrisApiClient,
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  WorkflowStatus,
  UpdateWorkflowData,
  ApiNodeInput,
  ApiEdgeInput,
  ExecuteWorkflowData,
  ValidationResultDTO,
  TokenCostsResponse,
} from './lib/apis/iris-api-client';
export type { StorageFile } from './lib/apis/storage-api-client';

// Local (BYOK) IrisApiClient backed by the iris-host-local REST surface. Used by
// iris-host-local (relative paths) and the Electron desktop host (absolute
// baseUrl to the embedded local server).
export { createLocalApiClient } from './local/local-api-client';
export { createLocalT } from './local/local-i18n';

// Store + types (consumers like workflow-parser, chat modal, demos use these).
export {
  useIrisEditorStore,
  type IrisNodeData,
  type NodeConfig,
  type NodeStatus,
  type NodeProgress,
  type InputConfig,
  type OutputConfig,
  type InputSourceType,
} from './store/iris-editor';
export type { AgentModel } from './store/agent';

// Node catalog (single source adapter over iris-nodes).
export * from './constants/node-definitions';

// Hooks + utilities reused by consumers (chat modal, apply button, demos).
export { useExecutionPolling } from './hooks/useExecutionPolling';
export * from './utils/workflow-parser';

// Editor sub-components (for consumers that mount pieces directly).
export { ExecutionInputModal } from './components/editor/ExecutionInputModal';
export { WorkflowCanvas } from './components/editor/WorkflowCanvas';
export { NodePalette } from './components/editor/NodePalette';
export { NodeConfigPanel } from './components/editor/config/NodeConfigPanel';

// Node color palettes (used by demo/guide components).
export {
  categoryPalette,
  categoryColorClasses,
  portTypeColors,
  paletteCategoryColors,
} from './components/editor/nodes/nodeColors';
