import { useCallback, useEffect, useMemo, useRef } from 'react';
import { MessageSquare, X, Trash2 } from 'lucide-react';
import {
  getOrCreateVideoChatStore,
  useVideoEditorChatStore,
} from '@/features/video-editor/stores/videoEditorChat.store';
import { useEditorStore, type Track, type Clip } from '@/features/video-editor/stores/editor.store';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import { setVideoChatModalHandlers } from '@/features/video-editor/chat/commandExecutor';
import type {
  VideoEditorStateSnapshot,
  VideoTrackSnapshot,
  VideoClipSnapshot,
  VideoSubtitleEntrySnapshot,
} from '@/features/video-editor/chat/systemPrompt';
import { ChatInput } from './ChatInput';
import { ChatMessageList } from './ChatMessageList';

interface VideoEditorChatPanelProps {
  /** Open the silence-removal modal. Used when the chat triggers it. */
  onOpenSilenceRemoval?: () => void;
  /** Open the auto-captions modal. */
  onOpenAutoCaptions?: () => void;
}

function effectIdsFor(clip: Clip): string[] | undefined {
  if (clip.type === 'video' || clip.type === 'audio' || clip.type === 'adjustment') {
    const ids: string[] = [];
    for (const e of clip.effects) {
      const id = e.filterType ?? e.transitionType ?? e.audioEffectType;
      if (id) ids.push(id);
    }
    return ids;
  }
  return undefined;
}

function buildVideoSnapshot(): VideoEditorStateSnapshot {
  const editor = useEditorStore.getState();
  const project = useVideoProjectStore.getState().currentProject;

  const tracks: VideoTrackSnapshot[] = editor.tracks.map((t: Track) => ({
    id: t.id,
    type: t.type === 'music' ? 'music' : t.type,
    name: t.name,
    visible: t.visible,
    muted: t.muted,
    locked: t.locked,
    clipCount: t.clips.length,
  }));

  const clips: VideoClipSnapshot[] = [];
  const subtitles: VideoSubtitleEntrySnapshot[] = [];

  for (const track of editor.tracks) {
    for (const clip of track.clips) {
      if (clip.type === 'compound' || clip.type === 'shape') continue;

      const snap: VideoClipSnapshot = {
        id: clip.id,
        trackId: clip.trackId,
        type: clip.type,
        name: clip.name,
        startTime: clip.startTime,
        endTime: clip.endTime,
        effects: effectIdsFor(clip),
        opacity:
          clip.type === 'video'
            ? clip.transform.opacity
            : clip.type === 'adjustment'
              ? clip.opacity
              : undefined,
        muted:
          clip.type === 'video' || clip.type === 'audio'
            ? clip.muted
            : undefined,
      };

      if (clip.type === 'subtitle') {
        snap.text = clip.text;
        subtitles.push({
          startTime: clip.startTime,
          endTime: clip.endTime,
          text: clip.text,
        });
      }

      clips.push(snap);
    }
  }

  clips.sort((a, b) => a.startTime - b.startTime || a.trackId.localeCompare(b.trackId));

  return {
    projectName: project?.name ?? 'Untitled',
    durationSec: editor.duration,
    width: project?.width ?? 1920,
    height: project?.height ?? 1080,
    frameRate: project?.frameRate ?? 30,
    currentTime: editor.currentTime,
    isPlaying: editor.isPlaying,
    selectedClipId: editor.selectedClip?.id ?? null,
    tracks,
    clips,
    subtitles,
  };
}

export function VideoEditorChatPanel({
  onOpenSilenceRemoval,
  onOpenAutoCaptions,
}: VideoEditorChatPanelProps) {
  const projectId = useVideoProjectStore((s) => s.currentProject?.id);
  const storeKey = projectId ?? '__default__';

  const messages = useVideoEditorChatStore(storeKey, (s) => s.messages);
  const isStreaming = useVideoEditorChatStore(storeKey, (s) => s.isStreaming);
  const streamingContent = useVideoEditorChatStore(storeKey, (s) => s.streamingContent);
  const isCollapsed = useVideoEditorChatStore(storeKey, (s) => s.isCollapsed);
  const panelWidth = useVideoEditorChatStore(storeKey, (s) => s.panelWidth);

  const chatStore = useMemo(() => getOrCreateVideoChatStore(storeKey), [storeKey]);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Register modal handlers so chat commands can open them.
  useEffect(() => {
    setVideoChatModalHandlers({
      openSilenceRemoval: onOpenSilenceRemoval,
      openAutoCaptions: onOpenAutoCaptions,
    });
    return () => {
      setVideoChatModalHandlers({});
    };
  }, [onOpenSilenceRemoval, onOpenAutoCaptions]);

  const handleSend = useCallback(
    (text: string) => {
      const snapshot = buildVideoSnapshot();
      chatStore.getState().sendMessage(text, snapshot);
    },
    [chatStore],
  );

  const handleAbort = useCallback(() => {
    chatStore.getState().abortStream();
  }, [chatStore]);

  const handleToggle = useCallback(() => {
    chatStore.getState().toggleCollapsed();
  }, [chatStore]);

  const handleClear = useCallback(() => {
    chatStore.getState().clearHistory();
  }, [chatStore]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizeRef.current = { startX: e.clientX, startWidth: panelWidth };

      const onMouseMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        // Dragging the left edge leftwards (smaller clientX) widens the panel.
        const delta = resizeRef.current.startX - ev.clientX;
        chatStore.getState().setPanelWidth(resizeRef.current.startWidth + delta);
      };
      const onMouseUp = () => {
        resizeRef.current = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [panelWidth, chatStore],
  );

  // Collapsed: the panel is hidden. It is opened from the AI Assistant button
  // in the title bar (next to Export video).
  if (isCollapsed) {
    return null;
  }

  return (
    <div
      className="absolute top-0 right-0 bottom-0 z-30 flex flex-row bg-zinc-900 border-l border-zinc-800 shadow-2xl"
      style={{ width: panelWidth }}
    >
      {/* Resize handle on the left edge */}
      <div
        onMouseDown={handleResizeStart}
        className="w-1 cursor-ew-resize hover:bg-zinc-600 transition-colors flex-shrink-0 self-stretch"
      >
        <div className="my-auto ml-[2px] h-8 w-[2px] rounded-full bg-zinc-700" />
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center justify-between px-3 py-2 flex-shrink-0 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-xs font-medium text-zinc-300">AI Assistant</span>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={handleClear}
                className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                title="Clear chat"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={handleToggle}
              className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <ChatMessageList
          messages={messages}
          streamingContent={streamingContent}
          isStreaming={isStreaming}
        />

        <ChatInput
          onSend={handleSend}
          onAbort={handleAbort}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
