/**
 * Shared filter-graph state for one export render: the filter_complex parts,
 * the input index map and the per-input split queues.
 *
 * When the same source file feeds N chains (split clips, an asset on two
 * tracks, a video and its separated audio), every chain must read its own
 * copy: `[idx:v]split=N` / `[idx:a]asplit=N` are emitted up front and each
 * consumer takes the next label from the queue.
 */

export interface GraphContext {
  filterParts: string[];
  /** sourceUrl → FFmpeg input index */
  inputMap: Map<string, number>;
  videoSplitQueue: Map<number, string[]>;
  audioSplitQueue: Map<number, string[]>;
  /** Sources with an audio stream (probed by the IPC handler); undefined = assume all. */
  sourcesWithAudio?: Set<string>;
}

export function sourceHasAudio(ctx: GraphContext, sourceUrl: string): boolean {
  return !ctx.sourcesWithAudio || ctx.sourcesWithAudio.has(sourceUrl);
}

export function takeVideoSrc(ctx: GraphContext, idx: number): string {
  const q = ctx.videoSplitQueue.get(idx);
  if (!q || q.length === 0) return `${idx}:v`;
  return q.shift()!;
}

export function takeAudioSrc(ctx: GraphContext, idx: number): string {
  const q = ctx.audioSplitQueue.get(idx);
  if (!q || q.length === 0) return `${idx}:a`;
  return q.shift()!;
}

/** Emit split / asplit fan-outs for inputs used by more than one chain. */
export function emitSplits(
  ctx: GraphContext,
  videoUses: Map<number, number>,
  audioUses: Map<number, number>,
): void {
  videoUses.forEach((n, idx) => {
    if (n <= 1) return;
    const labels = Array.from({ length: n }, (_, i) => `vsplit${idx}_${i}`);
    ctx.filterParts.push(`[${idx}:v]split=${n}${labels.map((l) => `[${l}]`).join('')}`);
    ctx.videoSplitQueue.set(idx, labels);
  });
  audioUses.forEach((n, idx) => {
    if (n <= 1) return;
    const labels = Array.from({ length: n }, (_, i) => `asplit${idx}_${i}`);
    ctx.filterParts.push(`[${idx}:a]asplit=${n}${labels.map((l) => `[${l}]`).join('')}`);
    ctx.audioSplitQueue.set(idx, labels);
  });
}

export function countUse(uses: Map<number, number>, idx: number | undefined): void {
  if (idx === undefined) return;
  uses.set(idx, (uses.get(idx) ?? 0) + 1);
}
