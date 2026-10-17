/**
 * Run-wide cancellation.
 *
 * `WorkflowEngine` gives every execution an `AbortController`; `cancel()` and
 * the run timeout abort it. The signal travels to provider calls through an
 * async-local scope instead of a new parameter on ~100 adapter call sites:
 * `runWithAbortSignal` installs it for everything the run awaits, and
 * `abortableFetch` / `abortableSleep` / `withAbortSignal` pick it up. Code
 * outside a run (no scope) behaves exactly as before.
 *
 * Long provider jobs (video generation) poll with `abortableSleep`, so a
 * cancel stops the poll loop at the next tick and the in-flight request is
 * aborted at once (04-workflow-editor.md 3.8, R-02/R-03).
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const scope = new AsyncLocalStorage<AbortSignal>();

/** Run `fn` with `signal` as the current run signal (nested scopes win). */
export function runWithAbortSignal<T>(signal: AbortSignal, fn: () => T): T {
  return scope.run(signal, fn);
}

/** The signal of the run this code executes in, if any. */
export function currentAbortSignal(): AbortSignal | undefined {
  return scope.getStore();
}

/** The error thrown when the run was cancelled or timed out. */
export class RunAbortedError extends Error {
  readonly code = 'CANCELLED';
  constructor(reason?: unknown) {
    super(
      typeof reason === 'string' && reason
        ? `Run aborted: ${reason}`
        : 'Run aborted',
    );
    this.name = 'AbortError';
  }
}

/** True for errors produced by an aborted signal (ours or the platform's). */
export function isAbortError(error: unknown): boolean {
  if (error instanceof RunAbortedError) return true;
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

/** Throw if the current run has been aborted. */
export function throwIfRunAborted(signal: AbortSignal | undefined = currentAbortSignal()): void {
  if (signal?.aborted) throw new RunAbortedError(signal.reason);
}

/** `init` with the run signal merged into its own signal (both abort). */
export function withAbortSignal<T extends { signal?: AbortSignal | null }>(
  init?: T,
  signal: AbortSignal | undefined = currentAbortSignal(),
): T {
  if (!signal) return (init ?? {}) as T;
  const own = init?.signal ?? undefined;
  return {
    ...(init ?? ({} as T)),
    signal: own ? AbortSignal.any([own, signal]) : signal,
  };
}

/** `fetch` that is aborted when the current run is cancelled. */
export function abortableFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  const signal = currentAbortSignal();
  // Outside a run keep the caller's exact arguments (tests assert on them).
  if (!signal) return init === undefined ? fetch(input) : fetch(input, init);
  return fetch(input, withAbortSignal(init ?? {}, signal));
}

/** `setTimeout` sleep that rejects with `RunAbortedError` on cancel. */
export function abortableSleep(
  ms: number,
  signal: AbortSignal | undefined = currentAbortSignal(),
): Promise<void> {
  if (!signal) return new Promise(resolve => setTimeout(resolve, ms));
  if (signal.aborted) return Promise.reject(new RunAbortedError(signal.reason));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new RunAbortedError(signal.reason));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
