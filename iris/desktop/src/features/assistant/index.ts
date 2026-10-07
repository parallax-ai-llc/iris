/**
 * Assistant — the app-wide prompt panel (public API).
 *
 * Surface adapters (image editor, video editor, workspace) are assembled in
 * `src/app/assistant/`, because they read several features' stores.
 */

export { AssistantPanel, type AssistantBlock } from './components/AssistantPanel';
export {
  useAssistantStore,
  clampPanelWidth,
  ASSISTANT_PANEL_MIN_WIDTH,
  ASSISTANT_PANEL_MAX_WIDTH,
  ASSISTANT_PANEL_DEFAULT_WIDTH,
} from './stores/assistant.store';
export { useAssistantShortcut, toggleAssistant, isAssistantToggleShortcut } from './hooks/useAssistantShortcut';
export { parseCommandBlock, stripCommandBlocks } from './lib/commandBlock';
export type {
  AssistantAdapter,
  AssistantCommand,
  AssistantMessage,
  AssistantSurface,
  CommandStatus,
} from './types';
