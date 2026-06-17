/**
 * Video Editor Chat Store
 *
 * Per-project chat state for the video editor's AI assistant. Mirrors the
 * structure of `editorChat.store.ts` (which lives next to the image editor)
 * but targets the video editor's command schema and editor.store.
 */

import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';
import { streamEditorChat, type EditorChatMessage } from '@/shared/api/llm.api';
import {
  buildVideoSystemPrompt,
  type VideoEditorStateSnapshot,
} from '@/features/video-editor/chat/systemPrompt';
import {
  parseVideoCommand,
  executeVideoCommand,
  type VideoEditorCommand,
} from '@/features/video-editor/chat/commandExecutor';

// ==================== Types ====================

export interface VideoChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  command?: VideoEditorCommand;
  commandStatus?: 'pending' | 'running' | 'success' | 'error';
  commandError?: string;
}

export interface VideoEditorChatState {
  messages: VideoChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  isCollapsed: boolean;
  panelHeight: number;
  abortController: AbortController | null;
}

export interface VideoEditorChatActions {
  sendMessage: (text: string, snapshot: VideoEditorStateSnapshot) => Promise<void>;
  abortStream: () => void;
  toggleCollapsed: () => void;
  setCollapsed: (collapsed: boolean) => void;
  setPanelHeight: (height: number) => void;
  clearHistory: () => void;
}

export type VideoEditorChatStore = VideoEditorChatState & VideoEditorChatActions;
export type VideoEditorChatStoreApi = StoreApi<VideoEditorChatStore>;

// ==================== Defaults ====================

const DEFAULT_PANEL_HEIGHT = 320;

function createDefaultState(): VideoEditorChatState {
  return {
    messages: [],
    isStreaming: false,
    streamingContent: '',
    isCollapsed: true,
    panelHeight: DEFAULT_PANEL_HEIGHT,
    abortController: null,
  };
}

function generateMsgId(): string {
  return `vmsg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ==================== Factory ====================

export function createVideoEditorChatStore(): VideoEditorChatStoreApi {
  return createStore<VideoEditorChatStore>()((set, get) => ({
    ...createDefaultState(),

    sendMessage: async (text, snapshot) => {
      const userMsg: VideoChatMessage = {
        id: generateMsgId(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };

      const abortController = new AbortController();

      set((s) => ({
        messages: [...s.messages, userMsg],
        isStreaming: true,
        streamingContent: '',
        abortController,
      }));

      const systemPrompt = buildVideoSystemPrompt(snapshot);
      const history: EditorChatMessage[] = [{ role: 'system', content: systemPrompt }];

      // Keep last 20 messages for context (matches image editor budget).
      const recent = get().messages.slice(-20);
      for (const msg of recent) {
        history.push({ role: msg.role, content: msg.content });
      }

      let fullContent = '';

      try {
        for await (const chunk of streamEditorChat(history, {
          abortSignal: abortController.signal,
        })) {
          if (chunk.text) {
            fullContent += chunk.text;
            set({ streamingContent: fullContent });
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          fullContent += '\n\n_(cancelled)_';
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          fullContent = fullContent || `Error: ${msg}`;
        }
      }

      const command = parseVideoCommand(fullContent);

      const assistantMsg: VideoChatMessage = {
        id: generateMsgId(),
        role: 'assistant',
        content: fullContent.replace(/<command>[\s\S]*?<\/command>/g, '').trim(),
        timestamp: Date.now(),
        command: command ?? undefined,
        commandStatus: command ? 'pending' : undefined,
      };

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isStreaming: false,
        streamingContent: '',
        abortController: null,
      }));

      if (command) {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantMsg.id ? { ...m, commandStatus: 'running' as const } : m,
          ),
        }));

        try {
          await executeVideoCommand(command);
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantMsg.id ? { ...m, commandStatus: 'success' as const } : m,
            ),
          }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, commandStatus: 'error' as const, commandError: msg }
                : m,
            ),
          }));
        }
      }
    },

    abortStream: () => {
      const { abortController } = get();
      if (abortController) {
        abortController.abort();
        set({ isStreaming: false, abortController: null });
      }
    },

    toggleCollapsed: () => set((s) => ({ isCollapsed: !s.isCollapsed })),
    setCollapsed: (collapsed) => set({ isCollapsed: collapsed }),
    setPanelHeight: (height) => set({ panelHeight: Math.max(180, Math.min(600, height)) }),
    clearHistory: () => set({ messages: [], streamingContent: '' }),
  }));
}

// ==================== Registry (per-project) ====================

const chatStores = new Map<string, VideoEditorChatStoreApi>();
const DEFAULT_KEY = '__default__';

export function getOrCreateVideoChatStore(projectKey?: string): VideoEditorChatStoreApi {
  const key = projectKey || DEFAULT_KEY;
  let store = chatStores.get(key);
  if (!store) {
    store = createVideoEditorChatStore();
    chatStores.set(key, store);
  }
  return store;
}

export function deleteVideoChatStore(projectKey: string): void {
  chatStores.delete(projectKey);
}

export function useVideoEditorChatStore<T>(
  projectKey: string | undefined,
  selector: (state: VideoEditorChatStore) => T,
): T {
  const store = getOrCreateVideoChatStore(projectKey);
  return useStore(store, selector);
}
