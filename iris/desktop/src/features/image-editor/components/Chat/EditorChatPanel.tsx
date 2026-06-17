import { useCallback, useRef, useMemo } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useEditorChatStore, getOrCreateChatStore } from '@/features/image-editor/stores/editorChat.store';
import { useEditorTabsStore } from '@/features/image-editor/stores/editorTabs.store';
import { getActiveStoreSafe } from '@/features/image-editor/stores/imageEditorRegistry';
import type { EditorStateSnapshot, LayerSnapshot } from '@/features/image-editor/chat/systemPrompt';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';

const EMPTY_ADJUSTMENTS = {
  brightness: 0, contrast: 0, saturation: 0, hue: 0, exposure: 0, gamma: 1,
  temperature: 0, tint: 0, highlights: 0, shadows: 0, clarity: 0, vibrance: 0,
};

function buildEditorSnapshot(): EditorStateSnapshot {
  const store = getActiveStoreSafe();
  if (!store) {
    return {
      canvasWidth: 0,
      canvasHeight: 0,
      layers: [],
      activeLayerId: null,
      editMode: 'none',
      activeTool: 'brush',
      sourceAssetId: null,
      sourceAssetName: null,
      zoom: 100,
      rotation: 0,
      flipHorizontal: false,
      flipVertical: false,
      adjustments: { ...EMPTY_ADJUSTMENTS },
      activeFilterPreset: 'none',
    };
  }

  const s = store.getState();
  const layers: LayerSnapshot[] = s.layers.map((l) => ({
    id: l.id,
    name: l.name,
    visible: l.visible,
    locked: l.locked,
    opacity: l.opacity,
    blendMode: l.blendMode,
    width: l.width,
    height: l.height,
    type: l.type,
  }));

  // Canvas size from first layer or sourceAsset metadata
  const meta = s.sourceAsset?.metadata as { width?: number; height?: number } | undefined;
  const canvasWidth = s.layers[0]?.width || meta?.width || 0;
  const canvasHeight = s.layers[0]?.height || meta?.height || 0;

  const a = s.adjustments;
  return {
    canvasWidth,
    canvasHeight,
    layers,
    activeLayerId: s.activeLayerId,
    editMode: s.editMode,
    activeTool: s.activeTool,
    sourceAssetId: s.sourceAsset?.id || null,
    sourceAssetName: s.sourceAsset?.name || null,
    zoom: s.zoom,
    rotation: s.rotation,
    flipHorizontal: s.flipHorizontal,
    flipVertical: s.flipVertical,
    adjustments: {
      brightness: a.brightness,
      contrast: a.contrast,
      saturation: a.saturation,
      hue: a.hue,
      exposure: a.exposure,
      gamma: a.gamma,
      temperature: a.temperature,
      tint: a.tint,
      highlights: a.highlights,
      shadows: a.shadows,
      clarity: a.clarity,
      vibrance: a.vibrance,
    },
    activeFilterPreset: s.activeFilterPreset,
  };
}

export function EditorChatPanel() {
  const activeTabId = useEditorTabsStore((s) => s.activeTabId);
  const tabId = activeTabId || '__default__';

  const messages = useEditorChatStore(tabId, (s) => s.messages);
  const isStreaming = useEditorChatStore(tabId, (s) => s.isStreaming);
  const streamingContent = useEditorChatStore(tabId, (s) => s.streamingContent);
  const isCollapsed = useEditorChatStore(tabId, (s) => s.isCollapsed);
  const panelHeight = useEditorChatStore(tabId, (s) => s.panelHeight);

  const chatStore = useMemo(() => getOrCreateChatStore(tabId), [tabId]);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const handleSend = useCallback(
    (text: string) => {
      const snapshot = buildEditorSnapshot();
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

  // Resize handler
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizeRef.current = { startY: e.clientY, startHeight: panelHeight };

      const onMouseMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const delta = resizeRef.current.startY - ev.clientY;
        chatStore.getState().setPanelHeight(resizeRef.current.startHeight + delta);
      };

      const onMouseUp = () => {
        resizeRef.current = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [panelHeight, chatStore],
  );

  // Collapsed bar
  if (isCollapsed) {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-t border-zinc-800 select-none">
        <button
          onClick={handleToggle}
          className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>AI Assistant</span>
          {messages.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-zinc-700 text-[10px] text-zinc-300">
              {messages.length}
            </span>
          )}
          <ChevronUp className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // Expanded panel
  return (
    <div
      className="flex flex-col bg-zinc-900 border-t border-zinc-800"
      style={{ height: panelHeight }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="h-1 cursor-ns-resize hover:bg-zinc-600 transition-colors flex-shrink-0"
      >
        <div className="mx-auto mt-[2px] w-8 h-[2px] rounded-full bg-zinc-700" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1 flex-shrink-0">
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
            title="Collapse"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <ChatMessageList
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
      />

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onAbort={handleAbort}
        isStreaming={isStreaming}
      />
    </div>
  );
}
