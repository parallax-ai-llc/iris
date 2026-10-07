/**
 * Workspace assistant commands — they must go through the same generation,
 * project and navigation paths the screens use.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const api = vi.hoisted(() => ({
  generateImage: vi.fn(),
  getImage: vi.fn(),
  pollAssetUntilReady: vi.fn(),
  generateVideo: vi.fn(),
  getVideo: vi.fn(),
  pollVideoStatus: vi.fn(),
  openProject: vi.fn(),
  workflowDirty: false,
}));

vi.mock('@/shared/api/image.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api/image.api')>()),
  generateImage: api.generateImage,
  getImage: api.getImage,
  getImages: vi.fn(async () => ({ assets: [] })),
  pollAssetUntilReady: api.pollAssetUntilReady,
}));
vi.mock('@/shared/api/video.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api/video.api')>()),
  generateVideo: api.generateVideo,
  getVideo: api.getVideo,
  getVideos: vi.fn(async () => ({ assets: [] })),
  pollVideoStatus: api.pollVideoStatus,
}));
vi.mock('@/shared/api/provider.api', () => ({
  getImageModels: vi.fn(async () => [
    { id: 'edit-only', name: 'Edit only', provider: 'x', imageRequired: true },
    { id: 'flux', name: 'Flux', provider: 'bfl' },
  ]),
  getVideoModels: vi.fn(async () => [
    { id: 'kling', name: 'Kling', provider: 'replicate', supportedDurations: [5, 10], supportedAspectRatios: ['16:9', '9:16'] },
  ]),
}));
vi.mock('@/features/video-editor/lib/openProject', () => ({
  openVideoProjectInEditor: api.openProject,
}));
vi.mock('iris-editor', () => ({
  useIrisEditorStore: { getState: () => ({ isDirty: api.workflowDirty }) },
}));

import { useUIStore } from '@/shared/stores/ui.store';
import { useConnectionStore } from '@/shared/stores/connection.store';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import { useEditorTabsStore } from '@/features/image-editor/stores/editorTabs.store';
import { executeWorkspaceCommand, parseWorkspaceCommand } from '../commandExecutor';

const asset = (id: string, assetType: 'IMAGE' | 'VIDEO', processingStatus = 'PROCESSING') =>
  ({ id, name: id, assetType, processingStatus }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  api.workflowDirty = false;
  useConnectionStore.setState({ isServerConnected: true });
  useUIStore.setState({
    currentPage: 'home',
    editingWorkflowId: null,
    isCreatingBatch: false,
    selectedBatchId: null,
    pendingToolMode: null,
  });
});

describe('parseWorkspaceCommand', () => {
  it('reads the first command block and ignores broken JSON', () => {
    expect(parseWorkspaceCommand('ok <command>{"action":"navigate","page":"videos"}</command>')).toEqual({
      action: 'navigate',
      page: 'videos',
    });
    expect(parseWorkspaceCommand('<command>{nope}</command>')).toBeNull();
    expect(parseWorkspaceCommand('just text')).toBeNull();
  });
});

describe('navigate', () => {
  it('moves to a known page and closes an open (saved) workflow', async () => {
    useUIStore.setState({ editingWorkflowId: 'wf-1' });
    await executeWorkspaceCommand({ action: 'navigate', page: 'videos' });
    expect(useUIStore.getState().currentPage).toBe('videos');
    expect(useUIStore.getState().editingWorkflowId).toBeNull();
  });

  it('refuses unknown pages and unsaved workflows', async () => {
    await expect(executeWorkspaceCommand({ action: 'navigate', page: 'admin' })).rejects.toThrow();

    api.workflowDirty = true;
    useUIStore.setState({ editingWorkflowId: 'wf-1' });
    await expect(executeWorkspaceCommand({ action: 'navigate', page: 'images' })).rejects.toThrow();
    expect(useUIStore.getState().editingWorkflowId).toBe('wf-1');
  });
});

describe('generateImage', () => {
  it('uses a text-to-image model, falls back to 1:1 and opens Images', async () => {
    api.generateImage.mockResolvedValue(asset('img-1', 'IMAGE'));
    api.pollAssetUntilReady.mockResolvedValue(asset('img-1', 'IMAGE', 'READY'));

    const note = await executeWorkspaceCommand({ action: 'generateImage', prompt: 'a fox', aspectRatio: '7:3' });

    expect(api.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'a fox', model: 'flux', providerId: 'bfl', aspectRatio: '1:1' }),
    );
    expect(useUIStore.getState().currentPage).toBe('images');
    expect(note).toBeTruthy();
  });

  it('needs a prompt and a reachable server', async () => {
    await expect(executeWorkspaceCommand({ action: 'generateImage', prompt: '  ' })).rejects.toThrow();
    useConnectionStore.setState({ isServerConnected: false });
    await expect(executeWorkspaceCommand({ action: 'generateImage', prompt: 'a fox' })).rejects.toThrow();
    expect(api.generateImage).not.toHaveBeenCalled();
  });

  it('fails when the request is rejected', async () => {
    api.generateImage.mockResolvedValue(null);
    await expect(executeWorkspaceCommand({ action: 'generateImage', prompt: 'a fox' })).rejects.toThrow();
  });
});

describe('generateVideo', () => {
  it("snaps duration and aspect ratio to the model's supported values", async () => {
    api.generateVideo.mockResolvedValue(asset('vid-1', 'VIDEO'));
    api.pollVideoStatus.mockResolvedValue(asset('vid-1', 'VIDEO', 'READY'));

    await executeWorkspaceCommand({ action: 'generateVideo', prompt: 'waves', duration: 7, aspectRatio: '1:1' });

    expect(api.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'waves', model: 'kling', duration: 5, aspectRatio: '16:9' }),
    );
    expect(useUIStore.getState().currentPage).toBe('videos');
  });
});

describe('createVideoProject', () => {
  it('creates a project at the requested frame size and opens it', async () => {
    const createProject = vi.fn(async () => ({ id: 'p-1' }));
    useVideoProjectStore.setState({ createProject } as never);
    api.openProject.mockResolvedValue(true);

    await executeWorkspaceCommand({ action: 'createVideoProject', name: 'Teaser', aspectRatio: '9:16' });

    expect(createProject).toHaveBeenCalledWith({ name: 'Teaser', width: 1080, height: 1920 });
    expect(api.openProject).toHaveBeenCalledWith('p-1');
  });
});

describe('openImageEditor', () => {
  it('fetches the asset when it is not in the gallery and opens a tab', async () => {
    const openTab = vi.fn();
    useEditorTabsStore.setState({ openTab } as never);
    api.getImage.mockResolvedValue(asset('img-9', 'IMAGE', 'READY'));

    await executeWorkspaceCommand({ action: 'openImageEditor', assetId: 'img-9' });
    expect(openTab).toHaveBeenCalledWith(expect.objectContaining({ id: 'img-9' }));

    api.getImage.mockResolvedValue(asset('vid-9', 'VIDEO', 'READY'));
    await expect(executeWorkspaceCommand({ action: 'openImageEditor', assetId: 'vid-9' })).rejects.toThrow();
  });
});
