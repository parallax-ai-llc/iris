/**
 * Execution event stream (04-workflow-editor.md 3.7): turns the engine's
 * EventEmitter events into small numbered events the editor subscribes to
 * over SSE, instead of polling every node result once a second (R-05, R-06).
 *
 * Events carry output summaries (text preview up to 2 KB, asset references,
 * JSON preview), never whole results; the full value is one GET away
 * (`/executions/:id/nodes/:nodeId/output/:port`). Each execution keeps a short
 * replay buffer so a reconnecting client asks for "everything after seq N".
 */

import type { EventEmitter } from 'node:events';
import type { AssetReference, NodeResult } from 'iris-engine';

export const PREVIEW_BYTES = 2048;

export interface AssetRefSummary {
  assetId: string;
  kind: 'image' | 'video' | 'audio' | 'document' | 'other';
  url?: string;
}

export type OutputSummary = Record<
  string,
  | { kind: 'text'; preview: string; size: number }
  | { kind: 'asset'; ref: AssetRefSummary }
  | { kind: 'json'; preview: string; size: number }
>;

export type NodeFinishedStatus = 'completed' | 'failed' | 'cached' | 'skipped' | 'cancelled';
export type ExecFinishedStatus = 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';

export type ExecEvent =
  | { t: 'exec.started'; executionId: string; docHash?: string }
  | { t: 'node.started'; executionId: string; nodeId: string; at: string }
  | { t: 'node.progress'; executionId: string; nodeId: string; percent?: number; message?: string }
  | {
      t: 'node.finished';
      executionId: string;
      nodeId: string;
      status: NodeFinishedStatus;
      outputs: OutputSummary;
      error?: { code: string; message: string };
      durationMs: number;
    }
  | { t: 'exec.finished'; executionId: string; status: ExecFinishedStatus };

export type NumberedExecEvent = ExecEvent & { seq: number };

const ASSET_KIND: Record<string, AssetRefSummary['kind']> = {
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  DOCUMENT: 'document',
};

/** Per-port summary of a node's outputs (asset outputs become references). */
export function summarizeOutputs(
  outputs: Record<string, unknown> | undefined,
  assets: AssetReference[] = [],
): OutputSummary {
  const summary: OutputSummary = {};
  const byUrl = new Map(assets.filter(a => a.url).map(a => [a.url as string, a]));
  for (const [port, value] of Object.entries(outputs ?? {})) {
    if (port.startsWith('__') || value === undefined) continue;
    if (typeof value === 'string') {
      const asset = byUrl.get(value);
      if (asset) {
        summary[port] = {
          kind: 'asset',
          ref: { assetId: asset.id, kind: ASSET_KIND[asset.type] ?? 'other', url: asset.url },
        };
        continue;
      }
      summary[port] = { kind: 'text', preview: value.slice(0, PREVIEW_BYTES), size: value.length };
      continue;
    }
    let json: string;
    try {
      json = JSON.stringify(value) ?? 'null';
    } catch {
      json = '"[unserializable]"';
    }
    summary[port] = { kind: 'json', preview: json.slice(0, PREVIEW_BYTES), size: json.length };
  }
  return summary;
}

function nodeStatus(result: NodeResult): NodeFinishedStatus {
  if (result.status === 'failed') {
    return result.error?.code === 'CANCELLED' || result.error?.code === 'TIMEOUT'
      ? 'cancelled'
      : 'failed';
  }
  return result.status;
}

interface Channel {
  events: NumberedExecEvent[];
  listeners: Set<(e: NumberedExecEvent) => void>;
  finished: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

export interface ExecutionEventHubOptions {
  /** Events kept per execution for replay. Default 2000. */
  bufferSize?: number;
  /** How long a finished execution's buffer stays for late subscribers. Default 10 min. */
  retainMs?: number;
}

/** Collects engine events per execution and fans them out to subscribers. */
export class ExecutionEventHub {
  private readonly channels = new Map<string, Channel>();
  private readonly bufferSize: number;
  private readonly retainMs: number;
  private readonly timeouts = new Map<string, true>();

  constructor(engine: EventEmitter, options: ExecutionEventHubOptions = {}) {
    this.bufferSize = options.bufferSize ?? 2000;
    this.retainMs = options.retainMs ?? 10 * 60 * 1000;

    engine.on('execution:started', (e: { executionId: string; docHash?: string }) =>
      this.push({ t: 'exec.started', executionId: e.executionId, docHash: e.docHash }),
    );
    engine.on('node:started', (e: { executionId: string; nodeId: string }) =>
      this.push({ t: 'node.started', executionId: e.executionId, nodeId: e.nodeId, at: new Date().toISOString() }),
    );
    engine.on('node:progress', (e: { executionId: string; nodeId: string; percent?: number; message?: string }) =>
      this.push({ t: 'node.progress', executionId: e.executionId, nodeId: e.nodeId, percent: e.percent, message: e.message }),
    );
    engine.on('node:completed', (e: { executionId: string; nodeId: string; result: NodeResult; cached?: boolean }) =>
      this.push({
        t: 'node.finished',
        executionId: e.executionId,
        nodeId: e.nodeId,
        status: e.cached ? 'cached' : nodeStatus(e.result),
        outputs: summarizeOutputs(e.result.outputs, e.result.assets),
        error: e.result.error ? { code: e.result.error.code, message: e.result.error.message } : undefined,
        durationMs: e.result.duration ?? 0,
      }),
    );
    engine.on('execution:failed', (e: { executionId: string; error?: { code?: string } }) => {
      if (e.error?.code === 'TIMEOUT') this.timeouts.set(e.executionId, true);
    });
    engine.on('execution:completed', (e: { executionId: string; status: string }) => {
      const status: ExecFinishedStatus =
        e.status === 'completed'
          ? 'COMPLETED'
          : e.status === 'cancelled'
            ? 'CANCELLED'
            : this.timeouts.has(e.executionId)
              ? 'TIMEOUT'
              : 'FAILED';
      this.timeouts.delete(e.executionId);
      this.push({ t: 'exec.finished', executionId: e.executionId, status });
    });
    engine.on('execution:error', (e: { executionId: string }) =>
      this.push({ t: 'exec.finished', executionId: e.executionId, status: 'FAILED' }),
    );
  }

  private channel(executionId: string): Channel {
    let c = this.channels.get(executionId);
    if (!c) {
      c = { events: [], listeners: new Set(), finished: false };
      this.channels.set(executionId, c);
    }
    return c;
  }

  private push(event: ExecEvent): void {
    const c = this.channel(event.executionId);
    if (c.finished) return;
    const last = c.events[c.events.length - 1];
    const numbered = { ...event, seq: (last?.seq ?? 0) + 1 } as NumberedExecEvent;
    c.events.push(numbered);
    if (c.events.length > this.bufferSize) c.events.splice(0, c.events.length - this.bufferSize);
    for (const fn of c.listeners) fn(numbered);
    if (event.t === 'exec.finished') {
      c.finished = true;
      c.timer = setTimeout(() => this.channels.delete(event.executionId), this.retainMs);
      c.timer.unref?.();
    }
  }

  /** Buffered events after `afterSeq` (0 = all kept). */
  replay(executionId: string, afterSeq = 0): NumberedExecEvent[] {
    return (this.channels.get(executionId)?.events ?? []).filter(e => e.seq > afterSeq);
  }

  /** Is the execution known to have finished (in the buffer window)? */
  isFinished(executionId: string): boolean {
    return this.channels.get(executionId)?.finished ?? false;
  }

  /**
   * Replay what came after `afterSeq`, then live events. Returns the
   * unsubscribe function. Subscribing to an unknown execution waits for it.
   */
  subscribe(
    executionId: string,
    afterSeq: number,
    listener: (event: NumberedExecEvent) => void,
  ): () => void {
    for (const e of this.replay(executionId, afterSeq)) listener(e);
    const c = this.channel(executionId);
    c.listeners.add(listener);
    return () => {
      c.listeners.delete(listener);
    };
  }

  /** Stop all retention timers (server close). */
  close(): void {
    for (const c of this.channels.values()) if (c.timer) clearTimeout(c.timer);
    this.channels.clear();
  }
}
