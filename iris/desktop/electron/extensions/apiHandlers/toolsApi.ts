/**
 * iris.tools API handler — tool registration is handled in the worker.
 * This handler routes tool execution requests.
 */
import type { ExtensionManager } from '../extensionManager';

export function registerToolsApi(manager: ExtensionManager): void {
  manager.registerApiHandler('iris.tools', 'execute', async (_extId, args) => {
    const [toolId, params] = args;
    return manager.executeTool(toolId as string, params);
  });
}
