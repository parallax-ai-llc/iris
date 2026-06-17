/**
 * Execution + loop tuning constants for the workflow engine.
 *
 * Moved out of `core/server/.../iris.constants.ts` so the `WorkflowEngine` is
 * server-independent. The server re-exports these from its historical
 * `iris.constants` path, so existing consumers (e.g. `workflows.service`) keep
 * importing them unchanged.
 */

/** Default execution timeout in milliseconds (10 minutes). */
export const DEFAULT_EXECUTION_TIMEOUT = 10 * 60 * 1000;

/** Maximum retries for a single node execution. */
export const MAX_NODE_RETRIES = 3;

/** Retry delay base in milliseconds (exponential backoff). */
export const RETRY_DELAY_BASE = 1000;

/** Hard cap on total loop iterations per workflow (multiplicative across nested
 *  loops). */
export const MAX_LOOP_ITERATIONS_TOTAL = 1000;

/** Minimum delay between loop iterations in milliseconds. */
export const LOOP_ITERATION_MIN_DELAY_MS = 50;
