/**
 * Assistant store — the app-wide prompt conversation.
 *
 * The LLM stream is mocked; each test scripts the reply and checks what the
 * store sends, records and executes.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { EditorChatMessage, StreamChunk } from '@/shared/api/llm.api';
import type { AssistantAdapter, AssistantCommand } from '../../types';

const llm = vi.hoisted(() => ({
  /** Reply chunks for the next stream. */
  chunks: [] as string[],
  /** Throw this after the chunks, when set. */
  error: null as Error | null,
  /** Hold the stream open until aborted. */
  hang: false,
  calls: [] as EditorChatMessage[][],
}));

vi.mock('@/shared/api/llm.api', () => ({
  streamEditorChat: async function* (
    messages: EditorChatMessage[],
    options: { abortSignal?: AbortSignal } = {},
  ): AsyncGenerator<StreamChunk> {
    llm.calls.push(messages);
    for (const text of llm.chunks) yield { text };
    if (llm.hang) {
      // Mirrors the real client: an abort ends the stream quietly.
      await new Promise<void>((resolve) => options.abortSignal?.addEventListener('abort', () => resolve()));
      return;
    }
    if (llm.error) throw llm.error;
  },
}));

import {
  useAssistantStore,
  clampPanelWidth,
  ASSISTANT_PANEL_MAX_WIDTH,
  ASSISTANT_PANEL_MIN_WIDTH,
} from '../assistant.store';

interface TestCommand extends AssistantCommand {
  action: 'doThing';
  value?: number;
}

function makeAdapter(
  overrides: Partial<AssistantAdapter<{ n: number }, TestCommand>> = {},
): AssistantAdapter<{ n: number }, TestCommand> & { executed: TestCommand[] } {
  const executed: TestCommand[] = [];
  return {
    surface: 'workspace',
    buildSnapshot: () => ({ n: 7 }),
    buildSystemPrompt: (s) => `SYSTEM n=${s.n}`,
    parseCommand: (text) => {
      const m = text.match(/<command>([\s\S]*?)<\/command>/);
      return m ? (JSON.parse(m[1]) as TestCommand) : null;
    },
    executeCommand: async (cmd) => {
      executed.push(cmd);
      return 'queued';
    },
    executed,
    ...overrides,
  };
}

beforeEach(() => {
  llm.chunks = [];
  llm.error = null;
  llm.hang = false;
  llm.calls = [];
  localStorage.clear();
  useAssistantStore.getState().clearHistory();
  useAssistantStore.setState({ draft: '', isStreaming: false, abortController: null });
});

describe('sendMessage', () => {
  it('sends the adapter prompt, strips the command block and runs the command', async () => {
    llm.chunks = ['Making it now. ', '<command>{"action":"doThing","value":3}</command>'];
    const adapter = makeAdapter();

    await useAssistantStore.getState().sendMessage('  make a thing  ', adapter);

    expect(llm.calls[0][0]).toEqual({ role: 'system', content: 'SYSTEM n=7' });
    expect(llm.calls[0][1]).toEqual({ role: 'user', content: 'make a thing' });

    const [user, reply] = useAssistantStore.getState().messages;
    expect(user).toMatchObject({ role: 'user', content: 'make a thing', surface: 'workspace' });
    expect(reply).toMatchObject({
      role: 'assistant',
      content: 'Making it now.',
      surface: 'workspace',
      commandStatus: 'success',
      commandNote: 'queued',
    });
    expect(adapter.executed).toEqual([{ action: 'doThing', value: 3 }]);
    expect(useAssistantStore.getState().isStreaming).toBe(false);
  });

  it('marks the command as failed when the executor throws', async () => {
    llm.chunks = ['<command>{"action":"doThing"}</command>'];
    const adapter = makeAdapter({
      executeCommand: async () => {
        throw new Error('No layer selected');
      },
    });

    await useAssistantStore.getState().sendMessage('go', adapter);

    const reply = useAssistantStore.getState().messages[1];
    expect(reply.commandStatus).toBe('error');
    expect(reply.commandError).toBe('No layer selected');
  });

  it('keeps a text-only reply without a command', async () => {
    llm.chunks = ['Which image do you mean?'];
    await useAssistantStore.getState().sendMessage('edit it', makeAdapter());

    const reply = useAssistantStore.getState().messages[1];
    expect(reply.content).toBe('Which image do you mean?');
    expect(reply.command).toBeUndefined();
    expect(reply.commandStatus).toBeUndefined();
  });

  it('shows the error and never executes a command when the stream fails', async () => {
    llm.chunks = [];
    llm.error = new Error('Authentication required');
    const adapter = makeAdapter();

    await useAssistantStore.getState().sendMessage('hi', adapter);

    const reply = useAssistantStore.getState().messages[1];
    expect(reply.content).toBe('Error: Authentication required');
    expect(adapter.executed).toHaveLength(0);
  });

  it('tags earlier turns from another surface in the history', async () => {
    llm.chunks = ['ok'];
    await useAssistantStore.getState().sendMessage('first', makeAdapter({ surface: 'image-editor' }));
    await useAssistantStore.getState().sendMessage('second', makeAdapter({ surface: 'video-editor' }));

    const history = llm.calls[1].slice(1);
    expect(history[0]).toEqual({ role: 'user', content: '[earlier, in the image-editor] first' });
    expect(history[history.length - 1]).toEqual({ role: 'user', content: 'second' });
    expect(useAssistantStore.getState().messages.map((m) => m.surface)).toEqual([
      'image-editor',
      'image-editor',
      'video-editor',
      'video-editor',
    ]);
  });

  it('marks an aborted reply as cancelled and skips its command', async () => {
    llm.chunks = ['<command>{"action":"doThing"}</command>'];
    llm.hang = true;
    const adapter = makeAdapter();

    const pending = useAssistantStore.getState().sendMessage('go', adapter);
    await vi.waitFor(() => expect(useAssistantStore.getState().streamingContent).not.toBe(''));
    useAssistantStore.getState().abortStream();
    await pending;

    const reply = useAssistantStore.getState().messages[1];
    expect(reply.content).toBe('_(cancelled)_');
    expect(reply.command).toBeUndefined();
    expect(adapter.executed).toHaveLength(0);
  });

  it('drops an in-flight reply when the conversation is cleared', async () => {
    llm.hang = true;
    const pending = useAssistantStore.getState().sendMessage('go', makeAdapter());
    await vi.waitFor(() => expect(llm.calls).toHaveLength(1));
    useAssistantStore.getState().clearHistory();
    await pending;

    expect(useAssistantStore.getState().messages).toEqual([]);
    expect(useAssistantStore.getState().isStreaming).toBe(false);
  });

  it('ignores empty prompts and a second send while streaming', async () => {
    await useAssistantStore.getState().sendMessage('   ', makeAdapter());
    expect(llm.calls).toHaveLength(0);

    llm.hang = true;
    const pending = useAssistantStore.getState().sendMessage('one', makeAdapter());
    await vi.waitFor(() => expect(llm.calls).toHaveLength(1));
    await useAssistantStore.getState().sendMessage('two', makeAdapter());
    expect(llm.calls).toHaveLength(1);

    useAssistantStore.getState().abortStream();
    await pending;
  });
});

describe('panel preferences', () => {
  it('clamps the width and remembers it', () => {
    useAssistantStore.getState().setPanelWidth(9999);
    expect(useAssistantStore.getState().panelWidth).toBe(ASSISTANT_PANEL_MAX_WIDTH);
    expect(localStorage.getItem('iris.assistant.width')).toBe(String(ASSISTANT_PANEL_MAX_WIDTH));

    useAssistantStore.getState().setPanelWidth(10);
    expect(useAssistantStore.getState().panelWidth).toBe(ASSISTANT_PANEL_MIN_WIDTH);
    expect(clampPanelWidth(Number.NaN)).toBeGreaterThanOrEqual(ASSISTANT_PANEL_MIN_WIDTH);
  });

  it('remembers open/closed', () => {
    useAssistantStore.getState().setOpen(false);
    expect(localStorage.getItem('iris.assistant.open')).toBe('false');
    useAssistantStore.getState().toggleOpen();
    expect(useAssistantStore.getState().isOpen).toBe(true);
    expect(localStorage.getItem('iris.assistant.open')).toBe('true');
  });
});
