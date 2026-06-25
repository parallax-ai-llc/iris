/**
 * Local media URL helpers
 *
 * Convert local file paths to HTTP URLs served by the Electron main process,
 * which supports Range requests so <video>/<audio> can stream and seek.
 *
 * Split from `ImportMediaModal.tsx` so the modal file only exports its React
 * component (required by `react-refresh/only-export-components`).
 */

let _localMediaPort: number | null = null;

async function getLocalMediaPort(): Promise<number> {
  if (_localMediaPort) return _localMediaPort;
  _localMediaPort = await window.electronAPI.app.getLocalMediaPort();
  return _localMediaPort;
}

/**
 * Convert a local file path to an HTTP URL served by the Electron main process.
 * Uses a local HTTP server with proper Range request support for <video> playback.
 */
export async function toLocalMediaUrl(filePath: string): Promise<string> {
  const port = await getLocalMediaPort();
  const normalized = filePath.replace(/\\/g, '/');
  return `http://127.0.0.1:${port}/?path=${encodeURIComponent(normalized)}`;
}

/** Check if a URL is a local media URL */
export function isLocalMediaUrl(url: string | null | undefined): boolean {
  return !!url && url.startsWith('http://127.0.0.1:') && url.includes('path=');
}

/**
 * Re-point a (possibly stale) local media URL at the CURRENT server port.
 *
 * The Electron local media server binds to `listen(0)` — a fresh random port
 * on every app launch. A `fileUrl`/`thumbnailUrl` persisted inside a saved
 * project therefore bakes in the port from the session it was imported in, and
 * points at a dead port when the project is reopened later (→ media shows as a
 * placeholder). The underlying file path lives in the `?path=` query, so we can
 * rebuild the URL against the live port. No-op for non-local URLs (cloud assets,
 * data URLs, blobs).
 */
export async function rehydrateLocalMediaUrl<T extends string | null | undefined>(
  url: T,
): Promise<T> {
  if (!isLocalMediaUrl(url)) return url;
  try {
    const filePath = new URL(url as string).searchParams.get('path');
    if (!filePath) return url;
    const port = await getLocalMediaPort();
    return `http://127.0.0.1:${port}/?path=${encodeURIComponent(filePath)}` as T;
  } catch {
    return url;
  }
}
