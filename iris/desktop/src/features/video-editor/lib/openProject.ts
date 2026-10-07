/**
 * Open a saved video project in the full-screen video editor.
 *
 * Shared by the Projects page and the assistant's "create video project"
 * command, so both enter the editor the same way.
 */

import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';

/** Loads the project and its timeline into the editor. False when it can't be loaded. */
export async function openVideoProjectInEditor(projectId: string): Promise<boolean> {
  const project = await useVideoProjectStore.getState().loadProject(projectId);
  if (!project) return false;
  useEditorStore.getState().loadFromTimelineData(project.timelineData, project.duration);
  return true;
}
