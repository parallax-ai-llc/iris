/**
 * Assistant store — one prompt panel and one conversation for the whole app.
 *
 * The panel lives in the app shell (left of every screen), so its open state,
 * width, draft and messages are global. Each message records the surface it
 * was sent from; the adapter passed to `sendMessage` decides the system prompt
 * and how the model's command is executed.
 */

import { create } from 'zustand';
import { streamEditorChat, type EditorChatMessage } from '@/shared/api/llm.api';
import { IS_SELF_HOST } from '@/config/self-host';
import { stripCommandBlocks } from '../lib/commandBlock';
import type {
  AssistantAdapter,
  AssistantCommand,
  AssistantMessage,
  AssistantSurface,
  CommandStatus,
} from '../types';

// ==================== Constants ====================

export const ASSISTANT_PANEL_MIN_WIDTH = 280;
export const ASSISTANT_PANEL_MAX_WIDTH = 560;
export const ASSISTANT_PANEL_DEFAULT_WIDTH = 340;
/** How many past messages are sent back to the model as context. */
const HISTORY_LIMIT = 20;

const STORAGE_KEYS = {
  open: 'iris.assistant.open',
  width: 'iris.assistant.width',
} as const;

// ==================== Persistence (UI prefs only) ====================

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable — the preference just won't survive a restart.
  }
}

export function clampPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return ASSISTANT_PANEL_DEFAULT_WIDTH;
  return Math.round(Math.max(ASSISTANT_PANEL_MIN_WIDTH, Math.min(ASSISTANT_PANEL_MAX_WIDTH, width)));
}

/**
 * Open by default. Self-host builds have no Parallax account, so the
 * assistant can't reach the LLM there; start closed unless the user opened it.
 */
function initialOpen(): boolean {
  const stored = readPref(STORAGE_KEYS.open);
  return stored === null ? !IS_SELF_HOST : stored !== 'false';
}

function initialWidth(): number {
  const stored = readPref(STORAGE_KEYS.width);
  return stored === null ? ASSISTANT_PANEL_DEFAULT_WIDTH : clampPanelWidth(Number(stored));
}

// ==================== Types ====================

interface AssistantState {
  isOpen: boolean;
  panelWidth: number;
  /** Unsent prompt text — kept here so it survives screen changes. */
  draft: string;
  messages: AssistantMessage[];
  isStreaming: boolean;
  streamingContent: string;
  /** Surface of the turn currently streaming (null when idle). */
  streamingSurface: AssistantSurface | null;
  abortController: AbortController | null;
}

interface AssistantActions {
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setPanelWidth: (width: number) => void;
  setDraft: (draft: string) => void;
  sendMessage: <TSnapshot, TCommand extends AssistantCommand>(
    text: string,
    adapter: AssistantAdapter<TSnapshot, TCommand>,
  ) => Promise<void>;
  abortStream: () => void;
  clearHistory: () => void;
}

export type AssistantStore = AssistantState & AssistantActions;

// ==================== Helpers ====================

function generateMsgId(): string {
  return `amsg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Past turns from another screen are still useful context, but the model has
 * to know they were about a different editor — tag them.
 */
function toHistory(messages: AssistantMessage[], surface: AssistantSurface): EditorChatMessage[] {
  return messages.slice(-HISTORY_LIMIT).map((m) => ({
    role: m.role,
    content: m.surface === surface ? m.content : `[earlier, in the ${m.surface}] ${m.content}`,
  }));
}

// ==================== Store ====================

export const useAssistantStore = create<AssistantStore>((set, get) => {
  /** Bumped by clearHistory so an in-flight reply is dropped, not appended. */
  let conversationEpoch = 0;

  const setCommandState = (
    msgId: string,
    patch: { commandStatus: CommandStatus; commandError?: string; commandNote?: string },
  ) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)),
    }));
  };

  return {
    isOpen: initialOpen(),
    panelWidth: initialWidth(),
    draft: '',
    messages: [],
    isStreaming: false,
    streamingContent: '',
    streamingSurface: null,
    abortController: null,

    setOpen: (isOpen) => {
      writePref(STORAGE_KEYS.open, String(isOpen));
      set({ isOpen });
    },

    toggleOpen: () => get().setOpen(!get().isOpen),

    setPanelWidth: (width) => {
      const panelWidth = clampPanelWidth(width);
      writePref(STORAGE_KEYS.width, String(panelWidth));
      set({ panelWidth });
    },

    setDraft: (draft) => set({ draft }),

    sendMessage: async (text, adapter) => {
      const trimmed = text.trim();
      if (!trimmed || get().isStreaming) return;

      const surface = adapter.surface;
      const userMsg: AssistantMessage = {
        id: generateMsgId(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
        surface,
      };
      const abortController = new AbortController();
      const epoch = conversationEpoch;

      set((s) => ({
        messages: [...s.messages, userMsg],
        isStreaming: true,
        streamingContent: '',
        streamingSurface: surface,
        abortController,
      }));

      let fullContent = '';
      let failed = false;
      try {
        // Snapshot is taken at send time, so the prompt describes exactly what
        // the user was looking at when they pressed Enter.
        const systemPrompt = adapter.buildSystemPrompt(adapter.buildSnapshot());
        const history: EditorChatMessage[] = [
          { role: 'system', content: systemPrompt },
          ...toHistory(get().messages, surface),
        ];
        for await (const chunk of streamEditorChat(history, { abortSignal: abortController.signal })) {
          if (chunk.text) {
            fullContent += chunk.text;
            set({ streamingContent: fullContent });
          }
        }
      } catch (err) {
        failed = true;
        const errorMsg = err instanceof Error ? err.message : String(err);
        fullContent = fullContent || `Error: ${errorMsg}`;
      }

      if (epoch !== conversationEpoch) return; // conversation was cleared meanwhile

      // streamEditorChat swallows AbortError and simply ends — the signal is
      // the only reliable "cancelled" marker.
      const cancelled = abortController.signal.aborted;
      const command = cancelled || failed ? null : adapter.parseCommand(fullContent);
      const visible = stripCommandBlocks(fullContent);

      const assistantMsg: AssistantMessage = {
        id: generateMsgId(),
        role: 'assistant',
        content: cancelled ? `${visible}\n\n_(cancelled)_`.trim() : visible,
        timestamp: Date.now(),
        surface,
        command: command ?? undefined,
        commandStatus: command ? 'pending' : undefined,
      };

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isStreaming: false,
        streamingContent: '',
        streamingSurface: null,
        abortController: s.abortController === abortController ? null : s.abortController,
      }));

      if (!command) return;

      setCommandState(assistantMsg.id, { commandStatus: 'running' });
      try {
        const note = await adapter.executeCommand(command);
        setCommandState(assistantMsg.id, {
          commandStatus: 'success',
          commandNote: typeof note === 'string' ? note : undefined,
        });
      } catch (err) {
        setCommandState(assistantMsg.id, {
          commandStatus: 'error',
          commandError: err instanceof Error ? err.message : String(err),
        });
      }
    },

    abortStream: () => {
      const { abortController } = get();
      if (abortController) {
        abortController.abort();
        set({ isStreaming: false, abortController: null });
      }
    },

    clearHistory: () => {
      conversationEpoch += 1;
      get().abortStream();
      set({ messages: [], streamingContent: '', streamingSurface: null });
    },
  };
});
