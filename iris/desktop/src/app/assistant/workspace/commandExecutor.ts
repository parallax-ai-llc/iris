/**
 * Workspace command executor.
 *
 * Runs the workspace surface's commands through the same paths the screens
 * use: the shared generation APIs (`generateImage` / `generateVideo`, which
 * already route to the local engine in self-host builds), the gallery stores
 * for refreshing lists, the video project store, and the editor openers.
 * No new API is introduced here.
 */

import i18n from '@/shared/lib/i18n';
import { useUIStore } from '@/shared/stores/ui.store';
import { useConnectionStore } from '@/shared/stores/connection.store';
import {
  generateImage as generateImageApi,
  getImage,
  pollAssetUntilReady,
} from '@/shared/api/image.api';
import { generateVideo as generateVideoApi, getVideo, pollVideoStatus } from '@/shared/api/video.api';
import { parseCommandBlock } from '@/features/assistant';
import { useImageStore, ASPECT_RATIOS, type AspectRatio } from '@/features/images/stores/image.store';
import {
  useVideoStore,
  VIDEO_ASPECT_RATIOS,
  type VideoAspectRatio,
} from '@/features/videos/stores/video.store';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import { openVideoProjectInEditor } from '@/features/video-editor/lib/openProject';
import { useEditorTabsStore } from '@/features/image-editor/stores/editorTabs.store';
import { useIrisEditorStore } from 'iris-editor';
import { WORKSPACE_PAGES, type WorkspacePage } from './systemPrompt';

// ==================== Command types ====================

export type WorkspaceCommand =
  | { action: 'generateImage'; prompt: string; negativePrompt?: string; aspectRatio?: string; model?: string }
  | {
      action: 'generateVideo';
      prompt: string;
      negativePrompt?: string;
      aspectRatio?: string;
      duration?: number;
      model?: string;
    }
  | { action: 'createVideoProject'; name?: string; aspectRatio?: string }
  | { action: 'openVideoProject'; projectId: string }
  | { action: 'openImageEditor'; assetId: string }
  | { action: 'openVideoEditor'; assetId: string }
  | { action: 'navigate'; page: string };

export function parseWorkspaceCommand(text: string): WorkspaceCommand | null {
  return parseCommandBlock(text) as WorkspaceCommand | null;
}

// ==================== Helpers ====================

const t = (key: string, fallback: string, vars?: Record<string, string>) =>
  i18n.t(key, { ns: 'common', defaultValue: fallback, ...vars });

/** Project frame sizes offered to the model. */
export const PROJECT_SIZES: Record<string, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
};

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(t('assistant.errors.missingField', 'Missing "{{field}}"', { field }));
  }
  return value.trim();
}

/** Cloud generation needs the Parallax server, same as the Generate buttons. */
function requireServer(): void {
  if (!useConnectionStore.getState().isServerConnected) {
    throw new Error(t('assistant.errors.serverRequired', 'The Iris server is not reachable right now.'));
  }
}

/**
 * Move to a page from anywhere outside the editors. A workflow open in the
 * workflow editor (or a batch screen) sits on top of the page, so close it
 * first; a workflow with unsaved changes is left alone.
 *
 * @returns false when an unsaved workflow blocked the move.
 */
export function goToPage(page: WorkspacePage): boolean {
  const ui = useUIStore.getState();
  if (ui.editingWorkflowId) {
    if (useIrisEditorStore.getState().isDirty) return false;
    ui.setEditingWorkflowId(null);
  }
  if (ui.isCreatingBatch) ui.setIsCreatingBatch(false);
  if (ui.selectedBatchId) ui.setSelectedBatchId(null);
  ui.setCurrentPage(page);
  return true;
}

/**
 * Pick a text-only model: the one the command names, else the user's current
 * pick, else the first model that doesn't need an input image.
 */
function pickModel<M extends { id: string; imageRequired?: boolean }>(
  models: M[],
  requested: string | undefined,
  current: string,
): M | undefined {
  const usable = models.filter((m) => !m.imageRequired);
  return (
    (requested ? usable.find((m) => m.id === requested) : undefined) ??
    usable.find((m) => m.id === current) ??
    usable[0]
  );
}

let modelsRequested = false;
/** The galleries load model lists on mount; load them once if the user hasn't been there. */
async function ensureModelsLoaded(): Promise<void> {
  if (modelsRequested) return;
  modelsRequested = true;
  await Promise.all([useImageStore.getState().fetchModels(), useVideoStore.getState().fetchModels()]);
}

// ==================== Commands ====================

async function runGenerateImage(cmd: Extract<WorkspaceCommand, { action: 'generateImage' }>): Promise<string> {
  const prompt = requireText(cmd.prompt, 'prompt');
  requireServer();
  await ensureModelsLoaded();

  const images = useImageStore.getState();
  const model = pickModel(images.imageModels, cmd.model, images.model);
  const aspectRatio: AspectRatio = (ASPECT_RATIOS as readonly string[]).includes(cmd.aspectRatio ?? '')
    ? (cmd.aspectRatio as AspectRatio)
    : '1:1';

  const asset = await generateImageApi({
    prompt,
    negativePrompt: cmd.negativePrompt?.trim() || undefined,
    model: model?.id,
    providerId: model?.provider,
    aspectRatio,
  });
  if (!asset) throw new Error(t('assistant.errors.generationFailed', 'Generation request failed.'));

  goToPage('images');
  void useImageStore.getState().fetchImages();

  // Images usually finish within seconds — wait so the status line can say so.
  const ready = await pollAssetUntilReady(asset.id, { maxAttempts: 120, intervalMs: 1500 });
  void useImageStore.getState().fetchImages();
  return ready
    ? t('assistant.notes.imageReady', 'Image ready in Images')
    : t('assistant.notes.imageQueued', 'Image queued, it will show up in Images');
}

async function runGenerateVideo(cmd: Extract<WorkspaceCommand, { action: 'generateVideo' }>): Promise<string> {
  const prompt = requireText(cmd.prompt, 'prompt');
  requireServer();
  await ensureModelsLoaded();

  const videos = useVideoStore.getState();
  const model = pickModel(videos.videoModels, cmd.model, videos.model);
  const ratios = (model?.supportedAspectRatios?.length ? model.supportedAspectRatios : VIDEO_ASPECT_RATIOS) as readonly string[];
  const aspectRatio = (ratios.includes(cmd.aspectRatio ?? '') ? cmd.aspectRatio : ratios[0] ?? '16:9') as VideoAspectRatio;
  const durations = model?.supportedDurations ?? [];
  const requested = typeof cmd.duration === 'number' && cmd.duration > 0 ? cmd.duration : undefined;
  const duration =
    durations.length > 0
      ? requested !== undefined && durations.includes(requested)
        ? requested
        : durations[0]
      : (requested ?? 5);

  const asset = await generateVideoApi({
    prompt,
    negativePrompt: cmd.negativePrompt?.trim() || undefined,
    model: model?.id,
    providerId: model?.provider,
    aspectRatio,
    duration,
  });
  if (!asset) throw new Error(t('assistant.errors.generationFailed', 'Generation request failed.'));

  goToPage('videos');
  void useVideoStore.getState().fetchVideos();
  // Video takes minutes; refresh the gallery when it settles, without
  // holding the assistant.
  if (asset.processingStatus === 'PROCESSING' || asset.processingStatus === 'PENDING') {
    void pollVideoStatus(asset.id)
      .catch(() => null)
      .then(() => useVideoStore.getState().fetchVideos());
  }
  return t('assistant.notes.videoQueued', 'Video queued, it will show up in Videos');
}

async function runCreateVideoProject(
  cmd: Extract<WorkspaceCommand, { action: 'createVideoProject' }>,
): Promise<string> {
  const size = PROJECT_SIZES[cmd.aspectRatio ?? ''] ?? PROJECT_SIZES['16:9'];
  const name = cmd.name?.trim() || t('assistant.defaults.projectName', 'Untitled project');
  const project = await useVideoProjectStore.getState().createProject({ name, ...size });
  if (!project) {
    throw new Error(
      useVideoProjectStore.getState().currentProjectError ||
        t('assistant.errors.projectFailed', 'Could not create the project.'),
    );
  }
  if (!(await openVideoProjectInEditor(project.id))) {
    throw new Error(t('assistant.errors.projectOpenFailed', 'Project created but could not be opened.'));
  }
  return t('assistant.notes.projectOpened', 'Project opened in the video editor');
}

async function runOpenVideoProject(projectId: string): Promise<void> {
  if (!(await openVideoProjectInEditor(requireText(projectId, 'projectId')))) {
    throw new Error(t('assistant.errors.notFound', 'Could not find that item.'));
  }
}

async function runOpenImageEditor(assetId: string): Promise<void> {
  const id = requireText(assetId, 'assetId');
  const asset = useImageStore.getState().images.find((a) => a.id === id) ?? (await getImage(id));
  if (!asset || (asset.assetType && asset.assetType !== 'IMAGE')) {
    throw new Error(t('assistant.errors.notFound', 'Could not find that item.'));
  }
  useEditorTabsStore.getState().openTab(asset);
}

async function runOpenVideoEditor(assetId: string): Promise<void> {
  const id = requireText(assetId, 'assetId');
  const asset = useVideoStore.getState().videos.find((a) => a.id === id) ?? (await getVideo(id));
  if (!asset || (asset.assetType && asset.assetType !== 'VIDEO')) {
    throw new Error(t('assistant.errors.notFound', 'Could not find that item.'));
  }
  useEditorStore.getState().openEditor(asset);
}

function runNavigate(page: string): void {
  if (!(WORKSPACE_PAGES as readonly string[]).includes(page)) {
    throw new Error(t('assistant.errors.unknownPage', 'Unknown screen: {{page}}', { page: String(page) }));
  }
  if (!goToPage(page as WorkspacePage)) {
    throw new Error(t('assistant.errors.unsavedWorkflow', 'Save or close the open workflow first.'));
  }
}

// ==================== Dispatcher ====================

export async function executeWorkspaceCommand(command: WorkspaceCommand): Promise<string | void> {
  switch (command.action) {
    case 'generateImage':
      return runGenerateImage(command);
    case 'generateVideo':
      return runGenerateVideo(command);
    case 'createVideoProject':
      return runCreateVideoProject(command);
    case 'openVideoProject':
      return runOpenVideoProject(command.projectId);
    case 'openImageEditor':
      return runOpenImageEditor(command.assetId);
    case 'openVideoEditor':
      return runOpenVideoEditor(command.assetId);
    case 'navigate':
      return runNavigate(command.page);
    default:
      throw new Error(`Unknown command action: ${(command as { action: string }).action}`);
  }
}
