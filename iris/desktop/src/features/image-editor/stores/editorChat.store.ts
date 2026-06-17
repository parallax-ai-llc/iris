/**
 * Editor Chat Store
 *
 * Per-tab chat state for the image editor AI assistant.
 * Uses the same registry pattern as imageEditorRegistry.ts.
 */

import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';
import { streamEditorChat, type EditorChatMessage } from '@/shared/api/llm.api';
import { buildSystemPrompt, type EditorStateSnapshot } from '@/features/image-editor/chat/systemPrompt';
import { parseCommand, executeCommand, type EditorCommand } from '@/features/image-editor/chat/commandExecutor';
import { getActiveStore as getActiveEditorStore } from './imageEditorRegistry';

// ==================== Types ====================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  command?: EditorCommand;
  commandStatus?: 'pending' | 'running' | 'success' | 'error';
  commandError?: string;
}

export interface EditorChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  isCollapsed: boolean;
  panelHeight: number;
  abortController: AbortController | null;
}

export interface EditorChatActions {
  sendMessage: (text: string, editorSnapshot: EditorStateSnapshot) => Promise<void>;
  abortStream: () => void;
  toggleCollapsed: () => void;
  setCollapsed: (collapsed: boolean) => void;
  setPanelHeight: (height: number) => void;
  clearHistory: () => void;
  updateCommandStatus: (msgId: string, status: 'pending' | 'running' | 'success' | 'error', error?: string) => void;
}

export type EditorChatStore = EditorChatState & EditorChatActions;
export type EditorChatStoreApi = StoreApi<EditorChatStore>;

// ==================== Defaults ====================

const DEFAULT_PANEL_HEIGHT = 280;

function createDefaultState(): EditorChatState {
  return {
    messages: [],
    isStreaming: false,
    streamingContent: '',
    isCollapsed: true,
    panelHeight: DEFAULT_PANEL_HEIGHT,
    abortController: null,
  };
}

// ==================== Store Factory ====================

function generateMsgId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEditorChatStore(): EditorChatStoreApi {
  return createStore<EditorChatStore>()((set, get) => ({
    ...createDefaultState(),

    sendMessage: async (text: string, editorSnapshot: EditorStateSnapshot) => {
      const userMsg: ChatMessage = {
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

      // 대화 히스토리 빌드
      const systemPrompt = buildSystemPrompt(editorSnapshot);
      const history: EditorChatMessage[] = [
        { role: 'system', content: systemPrompt },
      ];

      // 최근 20개 메시지만 포함 (컨텍스트 제한)
      const recentMessages = get().messages.slice(-20);
      for (const msg of recentMessages) {
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
          const errorMsg = err instanceof Error ? err.message : String(err);
          fullContent = fullContent || `Error: ${errorMsg}`;
        }
      }

      // 커맨드 파싱
      const command = parseCommand(fullContent);

      // 어시스턴트 메시지 추가
      const assistantMsg: ChatMessage = {
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

      // 커맨드 실행
      if (command) {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantMsg.id ? { ...m, commandStatus: 'running' as const } : m,
          ),
        }));

        try {
          const editorStore = getActiveEditorStore();
          await executeCommand(command, editorStore);
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantMsg.id ? { ...m, commandStatus: 'success' as const } : m,
            ),
          }));
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, commandStatus: 'error' as const, commandError: errorMsg }
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
    setPanelHeight: (height) => set({ panelHeight: Math.max(150, Math.min(500, height)) }),
    clearHistory: () => set({ messages: [], streamingContent: '' }),

    updateCommandStatus: (msgId, status, error) => {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === msgId ? { ...m, commandStatus: status, commandError: error } : m,
        ),
      }));
    },
  }));
}

// ==================== Registry ====================

const chatStores = new Map<string, EditorChatStoreApi>();

export function getOrCreateChatStore(tabId: string): EditorChatStoreApi {
  let store = chatStores.get(tabId);
  if (!store) {
    store = createEditorChatStore();
    chatStores.set(tabId, store);
  }
  return store;
}

export function getChatStore(tabId: string): EditorChatStoreApi | undefined {
  return chatStores.get(tabId);
}

export function deleteChatStore(tabId: string): void {
  chatStores.delete(tabId);
}

// ==================== React Hook ====================

/**
 * Hook to use the chat store for the current tab.
 * Must be called with a valid tabId.
 */
export function useEditorChatStore<T>(
  tabId: string,
  selector: (state: EditorChatStore) => T,
): T {
  const store = getOrCreateChatStore(tabId);
  return useStore(store, selector);
}
