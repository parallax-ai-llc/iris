/**
 * Guarded renderer send for the iris.* API handlers.
 *
 * A BrowserWindow reference stays truthy after the window is destroyed, so
 * `win?.webContents.send(...)` still throws "Object has been destroyed" during
 * teardown. Every main → renderer send in this directory goes through here.
 *
 * Returns false when the message could not be delivered, so callers that wait
 * for a renderer reply can fail fast instead of hanging until their timeout.
 */
import type { BrowserWindow } from 'electron';

export function sendToWindow(
  win: BrowserWindow | null,
  channel: string,
  payload: unknown
): boolean {
  if (!win || win.isDestroyed()) return false;

  const contents = win.webContents;
  if (!contents || contents.isDestroyed()) return false;

  try {
    contents.send(channel, payload);
    return true;
  } catch (err) {
    // Destroyed between the guard and the send.
    console.warn(`[ExtApi] Dropped "${channel}" — renderer is gone:`, err);
    return false;
  }
}
