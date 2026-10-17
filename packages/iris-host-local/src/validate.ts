/**
 * Workflow validation — semantic checks the engine's structural `validateGraph`
 * doesn't cover (required inputs, provider/model, URLs, conditions, loop caps).
 *
 * The checks themselves live in `iris-nodes` (`validateWorkflowSemantics`) so
 * the editor can run them on the document it is about to execute. This wrapper
 * reads a stored workflow (any saved version) through `migrateWorkflowDoc`,
 * injects the engine's expression checker and loop cap, and returns the
 * messages in the cloud wording (`Node "<label>" …`) that the editor maps back
 * to nodes.
 *
 * A v1 `config.inputs[x] = { source: 'node', nodeId }` link no longer counts
 * as a connection by itself (W-02): migration turns it into a real edge when
 * the source node exists and drops it otherwise, so validation and the engine
 * see the same graph.
 */

import {
  migrateWorkflowDoc,
  validateWorkflowSemantics as validateDocSemantics,
} from 'iris-nodes';
import type { SemanticIssue } from 'iris-nodes';
import { MAX_LOOP_ITERATIONS_TOTAL, validateExpression } from 'iris-engine';

/** Anything shaped like a stored workflow (rows or a v2 document). */
export interface ValidatableWorkflow {
  nodes: unknown[];
  edges: unknown[];
}

/** Structured issues (with `nodeId`) for callers that no longer match labels. */
export function validateWorkflowSemanticIssues(wf: ValidatableWorkflow): SemanticIssue[] {
  const doc = migrateWorkflowDoc({ nodes: wf.nodes, edges: wf.edges });
  return validateDocSemantics(doc, {
    validateExpression: source => validateExpression(source),
    maxLoopIterationsTotal: MAX_LOOP_ITERATIONS_TOTAL,
  });
}

/**
 * Semantic (non-structural) validation errors for a stored workflow, as
 * messages. The caller (`server.ts`) prepends the structural `validateGraph`
 * errors, exactly as the cloud server does.
 */
export function validateWorkflowSemantics(wf: ValidatableWorkflow): string[] {
  return validateWorkflowSemanticIssues(wf).map(issue => issue.message);
}
