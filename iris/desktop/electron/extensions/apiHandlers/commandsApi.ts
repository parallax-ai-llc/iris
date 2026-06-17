/**
 * iris.commands API handler — runs in Main Process.
 */
import type { ExtensionManager } from '../extensionManager';

export function registerCommandsApi(manager: ExtensionManager): void {
  // iris.commands.register — handled locally in worker, only contribution notification reaches here
  // iris.commands.execute — routes through ExtensionHost to find the right worker
  manager.registerApiHandler('iris.commands', 'execute', async (_extId, args) => {
    const [commandId, ...rest] = args;
    return manager.executeCommand(commandId as string, rest);
  });
}
