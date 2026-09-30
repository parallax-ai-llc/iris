/**
 * Attach the local engine's per-launch token to the app's own requests.
 *
 * The workflow daemon (iris-host-local) refuses browser requests that lack
 * `x-iris-daemon-token`: the packaged renderer loads from file:// (Origin
 * "null"), which the daemon cannot tell apart from a sandboxed iframe on any
 * website the user visits. Rather than threading the token through every
 * fetch, <img>, <video> and worker in the renderer, main adds it at the session
 * layer — only for requests to the daemon's own origin. Other browsers on the
 * machine never see it.
 */
import { app, session, type Session } from 'electron';

/** Must match iris-host-local `DAEMON_TOKEN_HEADER` (also used for the key push). */
export const DAEMON_TOKEN_HEADER = 'x-iris-daemon-token';

/** `http://localhost:4747` → the origins the renderer may use for it. */
export function daemonOrigins(baseUrl: string): string[] {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return [];
  }
  if (url.protocol !== 'http:' || !url.port) return [];
  return [`http://localhost:${url.port}`, `http://127.0.0.1:${url.port}`];
}

function isDaemonRequest(requestUrl: string, origins: readonly string[]): boolean {
  try {
    return origins.includes(new URL(requestUrl).origin);
  } catch {
    return false;
  }
}

/**
 * (Re)install the header injector for the daemon at `baseUrl`. Only one
 * onBeforeSendHeaders listener exists per session, so calling this again (the
 * daemon restarted on a new port/token) replaces the previous one; an empty
 * base URL or token removes it. A no-op before the app is ready (no session
 * exists yet, and nothing can have been loaded).
 */
export function attachDaemonTokenToAppRequests(
  baseUrl: string,
  token: string,
  ses?: Session,
): void {
  if (!ses && !app.isReady()) return;
  const target = ses ?? session.defaultSession;
  const origins = daemonOrigins(baseUrl);
  if (origins.length === 0 || !token) {
    target.webRequest.onBeforeSendHeaders(null);
    return;
  }
  target.webRequest.onBeforeSendHeaders(
    { urls: origins.map((o) => `${o}/*`) },
    (details, callback) => {
      // The URL filter already scopes this; re-check so a pattern that matched
      // more loosely than intended (e.g. ignoring the port) cannot leak the token.
      if (!isDaemonRequest(details.url, origins)) {
        callback({});
        return;
      }
      callback({ requestHeaders: { ...details.requestHeaders, [DAEMON_TOKEN_HEADER]: token } });
    },
  );
}
