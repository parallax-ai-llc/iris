/**
 * Who may talk to the local engine.
 *
 * The engine has no accounts: whoever reaches its HTTP API can create and run
 * workflows (spending the user's BYOK keys), read local assets and import
 * files. Other local processes are out of scope (they can read the data dir
 * anyway), but **browsers are not**: any website the user visits can send
 * requests to 127.0.0.1. So every request passes three checks.
 *
 *  1. Host — only loopback names (and configured hosts) on the listening port.
 *     Stops DNS rebinding, where `evil.example` resolves to 127.0.0.1 and the
 *     browser treats the engine as same-origin with the attacker's page.
 *  2. Origin — a request that carries an `Origin` must come from an allowed
 *     origin (the engine's own, plus `allowedOrigins`). This also covers
 *     "simple" cross-site requests (form posts, text/plain fetches) that never
 *     trigger a CORS preflight. CORS only ever reflects allowed origins.
 *  3. Token (desktop daemon) — the packaged desktop renderer loads from
 *     file://, whose Origin is "null", exactly like a sandboxed iframe on any
 *     website, so Origin cannot tell them apart. With `accessToken` set, a
 *     browser request must carry it in `x-iris-daemon-token` (Electron main
 *     adds it to the app's own requests). Requests with no browser markers — no
 *     `Origin`, no `Sec-Fetch-Site`: CLI tools, ffmpeg, the engine fetching its
 *     own asset URLs — are not browser-originated and pass.
 */
import { timingSafeEqual } from 'node:crypto';
import os from 'node:os';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/** Header the desktop app sends (and uses for the runtime key push). */
export const DAEMON_TOKEN_HEADER = 'x-iris-daemon-token';

const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];
const WILDCARD_BINDS = new Set(['0.0.0.0', '::', '']);

export interface AccessPolicyOptions {
  /** Address the server is bound to (`config.host`). */
  bindHost: string;
  /** Port used before the server is listening (e.g. `inject()` in tests). */
  fallbackPort: number;
  /** Extra origins allowed to call the API (e.g. `null` for a file:// app). */
  allowedOrigins?: readonly string[];
  /** Extra hostnames accepted in the Host header (LAN exposure). */
  allowedHosts?: readonly string[];
  /** When set, browser requests must carry this token. */
  accessToken?: string;
}

/** Constant-time comparison of a presented token with the expected one. */
export function tokenMatches(presented: unknown, expected: string | undefined): boolean {
  if (!expected || typeof presented !== 'string') return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function bracketIfIpv6(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

/** Hostnames (no port) the engine answers to. */
function allowedHostnames(opts: AccessPolicyOptions): Set<string> {
  const names = new Set<string>(LOOPBACK_HOSTNAMES);
  if (WILDCARD_BINDS.has(opts.bindHost)) {
    // Bound to every interface on purpose (LAN use): the machine's own addresses.
    for (const addrs of Object.values(os.networkInterfaces())) {
      for (const addr of addrs ?? []) names.add(bracketIfIpv6(addr.address).toLowerCase());
    }
  } else {
    names.add(bracketIfIpv6(opts.bindHost).toLowerCase());
  }
  for (const host of opts.allowedHosts ?? []) names.add(host.toLowerCase());
  return names;
}

/** `hostname[:port]` → parts. Returns null for anything unparsable. */
function splitHostHeader(value: string): { hostname: string; port: number } | null {
  const match = /^(\[[0-9a-fA-F:.]+\]|[^:[\]]+)(?::(\d{1,5}))?$/.exec(value.trim());
  if (!match) return null;
  return { hostname: match[1].toLowerCase(), port: match[2] ? Number(match[2]) : 80 };
}

export interface AccessPolicy {
  isAllowedHost(hostHeader: string | undefined, port: number): boolean;
  isAllowedOrigin(origin: string, port: number): boolean;
}

export function createAccessPolicy(opts: AccessPolicyOptions): AccessPolicy {
  const hostnames = allowedHostnames(opts);
  const extraOrigins = new Set(opts.allowedOrigins ?? []);

  return {
    isAllowedHost(hostHeader, port) {
      if (!hostHeader) return false;
      const parsed = splitHostHeader(hostHeader);
      return !!parsed && parsed.port === port && hostnames.has(parsed.hostname);
    },
    isAllowedOrigin(origin, port) {
      if (extraOrigins.has(origin)) return true;
      let url: URL;
      try {
        url = new URL(origin);
      } catch {
        return false; // includes "null"
      }
      if (url.protocol !== 'http:' || url.origin !== origin) return false;
      const urlPort = url.port ? Number(url.port) : 80;
      return urlPort === port && hostnames.has(url.hostname.toLowerCase());
    },
  };
}

/** The port the server actually listens on (the daemon may fall back to a free one). */
function listeningPort(app: FastifyInstance, fallbackPort: number): number {
  const address = app.server.address();
  return address && typeof address === 'object' ? address.port : fallbackPort;
}

function headerValue(req: FastifyRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Register the Host/Origin/token checks as the first `onRequest` hook, and
 * return the CORS `origin` callback that reflects only allowed origins. The
 * hook must be added before `@fastify/cors` so it runs first.
 */
export function registerAccessGuard(
  app: FastifyInstance,
  opts: AccessPolicyOptions,
): (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => void {
  const policy = createAccessPolicy(opts);
  const port = () => listeningPort(app, opts.fallbackPort);

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!policy.isAllowedHost(headerValue(req, 'host'), port())) {
      return reply.code(403).send({ error: 'Host not allowed' });
    }
    // A CORS preflight runs nothing; @fastify/cors answers it (allowed origins only).
    if (req.method === 'OPTIONS') return;

    const origin = headerValue(req, 'origin');
    if (opts.accessToken) {
      if (tokenMatches(headerValue(req, DAEMON_TOKEN_HEADER), opts.accessToken)) return;
      const fromBrowser = origin !== undefined || headerValue(req, 'sec-fetch-site') !== undefined;
      if (!fromBrowser) return;
      return reply.code(401).send({ error: 'Missing or invalid local engine token' });
    }
    if (origin !== undefined && !policy.isAllowedOrigin(origin, port())) {
      return reply.code(403).send({ error: 'Origin not allowed' });
    }
  });

  return (origin, cb) => {
    cb(null, origin !== undefined && policy.isAllowedOrigin(origin, port()));
  };
}
