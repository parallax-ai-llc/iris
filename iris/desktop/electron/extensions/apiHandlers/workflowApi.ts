/**
 * iris.workflow API handler — workflow node registration is handled in the worker.
 * This handler provides workflow-related queries.
 */
export function registerWorkflowApi(
  manager: { registerApiHandler: (ns: string, method: string, handler: (extId: string, args: unknown[]) => Promise<unknown>) => void }
): void {
  // Workflow node registration contributions are sent as contribution messages
  // and forwarded to the renderer's ContributionRegistry store.
  // No additional Main Process handlers needed for now.
}
