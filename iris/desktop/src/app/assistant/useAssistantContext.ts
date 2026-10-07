import { useEditorTabsStore } from '@/features/image-editor/stores/editorTabs.store';
import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import type { AssistantAdapter } from '@/features/assistant';
import { imageEditorAdapter, videoEditorAdapter, workspaceAdapter } from './adapters';

/**
 * Which surface the assistant is talking to right now. Mirrors the screen
 * precedence in App.tsx: the image editor wins over the video editor, and
 * everything else (pages, workflow editor) is the workspace.
 */
export interface AssistantContext {
  adapter: AssistantAdapter;
  /** Open file / project name shown next to the surface label. */
  detail: string | null;
}

export function useAssistantContext(): AssistantContext {
  const imageEditorVisible = useEditorTabsStore((s) => s.tabs.length > 0 && s.isEditorVisible);
  const imageTabName = useEditorTabsStore(
    (s) => s.tabs.find((tab) => tab.id === s.activeTabId)?.asset.name ?? null,
  );
  const videoEditorOpen = useEditorStore((s) => s.isEditorOpen);
  const projectName = useVideoProjectStore((s) => s.currentProject?.name ?? null);

  if (imageEditorVisible) {
    return { adapter: imageEditorAdapter, detail: imageTabName };
  }
  if (videoEditorOpen) {
    return { adapter: videoEditorAdapter, detail: projectName };
  }
  return { adapter: workspaceAdapter, detail: null };
}
