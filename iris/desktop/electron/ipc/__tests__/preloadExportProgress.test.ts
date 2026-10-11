// @vitest-environment node
/**
 * #12 — export:progress is shared by the Export modal (always mounted) and
 * Silence Removal. Unsubscribing one consumer must never remove the other's
 * listener (the old removeProgressListener() called removeAllListeners, which
 * left the Export modal stuck in "rendering" forever).
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { EventEmitter } from 'events';

const bus = new EventEmitter();
let exposed: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_key: string, api: Record<string, unknown>) => { exposed = api; },
  },
  ipcRenderer: {
    on: (ch: string, l: (...a: unknown[]) => void) => bus.on(ch, l),
    removeListener: (ch: string, l: (...a: unknown[]) => void) => bus.removeListener(ch, l),
    removeAllListeners: (ch: string) => bus.removeAllListeners(ch),
    invoke: vi.fn(),
    send: vi.fn(),
  },
  webUtils: { getPathForFile: vi.fn() },
}));

describe('preload videoExport.onProgress', () => {
  beforeAll(async () => {
    await import('../../preload');
  });

  it('returns an unsubscribe that removes only its own listener', () => {
    const modal = vi.fn();
    const silence = vi.fn();
    const offModal = exposed.videoExport.onProgress(modal);
    const offSilence = exposed.videoExport.onProgress(silence);
    expect(typeof offModal).toBe('function');

    bus.emit('export:progress', {}, { status: 'rendering', progress: 10 });
    offSilence(); // Silence Removal finishes its flatten render
    bus.emit('export:progress', {}, { status: 'completed', progress: 100 });

    expect(silence).toHaveBeenCalledTimes(1);
    expect(modal).toHaveBeenCalledTimes(2);
    expect(modal).toHaveBeenLastCalledWith({ status: 'completed', progress: 100 });

    offModal();
    expect(bus.listenerCount('export:progress')).toBe(0);
    expect(exposed.videoExport.removeProgressListener).toBeUndefined();
  });
});
