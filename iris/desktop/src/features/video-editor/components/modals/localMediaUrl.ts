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
