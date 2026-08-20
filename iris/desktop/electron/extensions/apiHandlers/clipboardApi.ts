/**
 * iris.clipboard API handler — clipboard access for extensions.
 * Uses Electron's clipboard module directly in the Main Process
 * (no renderer round-trip needed). Gated by the 'clipboard' permission
 * in permissionEnforcer (iris.clipboard.read / iris.clipboard.write).
 */
import { clipboard } from 'electron';

export function registerClipboardApi(
  manager: { registerApiHandler: (ns: string, method: string, handler: (extId: string, args: unknown[]) => Promise<unknown>) => void }
): void {
  manager.registerApiHandler('iris.clipboard', 'read', async () => {
    return clipboard.readText();
  });

  manager.registerApiHandler('iris.clipboard', 'write', async (_extId, args) => {
    const [data] = args;
    if (typeof data !== 'string') {
      throw new Error('iris.clipboard.write expects a string');
    }
    clipboard.writeText(data);
    return undefined;
  });
}
