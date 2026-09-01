/**
 * safe-http — guarded fetch for the UTIL_HTTP_REQUEST node and for media
 * downloads (`fetchMediaAsBuffer` in media-source.ts).
 *
 * The node lets workflow authors call arbitrary URLs, so the raw `fetch` it
 * used to run is a textbook SSRF vector on a cloud host: `http://169.254.169.254`
 * reaches the GCP/AWS metadata service (service-account token theft), and
 * `localhost` / RFC-1918 addresses reach internal services. It also had no
 * timeout, no response-size cap, and followed redirects blindly.
 *
 * This module provides `safeHttpFetch`, which:
 *   - only allows http:/https: URLs;
 *   - resolves the hostname via DNS and rejects private / loopback /
 *     link-local / reserved addresses BEFORE connecting (every A/AAAA record
 *     must be public), unless the host opts out via `allowPrivateNetwork`;
 *   - follows redirects manually (default max 5) and re-validates the target
 *     of every hop, stripping auth-bearing headers on cross-origin hops;
 *   - enforces one overall deadline via `AbortSignal.timeout` (default 30s)
 *     shared across all hops and the body read;
 *   - caps the buffered response body (default 10MB) so a huge response can't
 *     OOM a small instance.
 *
 * The policy comes from the host seam (`NodeExecutorHost.http`): the cloud
 * uses the strict defaults; a self-hosted local host (iris-host-local /
 * iris/desktop) runs on the user's own machine where calling localhost is
 * legitimate, so it sets `allowPrivateNetwork: true`. Timeout and size caps
 * apply on every host.
 *
 * Known residual risk (accepted): validation resolves DNS, then `fetch`
 * resolves it again — a rebinding DNS server could answer differently the
 * second time. Closing that gap needs connection-level IP pinning (a custom
 * undici dispatcher), which the dep-light engine intentionally avoids.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Per-host policy for the UTIL_HTTP_REQUEST node's outbound fetch. */
export interface HttpRequestPolicy {
  /** Allow requests that resolve to private / loopback / link-local /
   *  reserved addresses. Default `false` (SSRF guard ON). Only a self-hosted
   *  host running on the user's own machine should enable this. */
  allowPrivateNetwork?: boolean;
  /** Overall deadline for the whole request (all redirect hops + body read),
   *  in milliseconds. Default 30 000. */
  timeoutMs?: number;
  /** Maximum buffered response body size in bytes. Default 10 MiB. */
  maxResponseBytes?: number;
  /** Maximum number of redirects followed. Default 5. */
  maxRedirects?: number;
}

export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
export const DEFAULT_HTTP_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_HTTP_MAX_REDIRECTS = 5;

/** What the node needs back: status + buffered body (already size-capped). */
export interface SafeHttpResult {
  status: number;
  bodyText: string;
  /** URL of the final (non-redirect) response, after following redirects. */
  finalUrl: string;
}

/** Binary variant of `SafeHttpResult` — used for media downloads
 *  (`fetchMediaAsBuffer`), where the body must stay a raw Buffer and the
 *  Content-Type header matters. */
export interface SafeHttpBufferResult {
  status: number;
  body: Buffer;
  /** Raw Content-Type header of the final response, or null when absent. */
  contentType: string | null;
  /** URL of the final (non-redirect) response, after following redirects. */
  finalUrl: string;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    n = n * 256 + value;
  }
  // Coerce to unsigned so 224.0.0.0/4 and above compare correctly.
  return n >>> 0;
}

/** Blocked IPv4 ranges as [network, prefixLength]. Everything here is
 *  non-routable or infrastructure-internal: private (RFC 1918), loopback,
 *  link-local (cloud metadata lives at 169.254.169.254), CGNAT, benchmarking,
 *  multicast, and reserved space. */
const BLOCKED_IPV4_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT (some clouds expose metadata here too)
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local — GCP/AWS metadata service
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
];

const BLOCKED_IPV4 = BLOCKED_IPV4_RANGES.map(([network, prefix]) => {
  const base = ipv4ToInt(network) as number;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return { base: (base & mask) >>> 0, mask };
});

function isForbiddenIPv4Int(n: number): boolean {
  return BLOCKED_IPV4.some(({ base, mask }) => ((n & mask) >>> 0) === base);
}

/** Expand an IPv6 literal (as validated by `net.isIP`) into 8 hextets, or
 *  null if it can't be parsed. Handles `::` compression, zone ids, and an
 *  embedded IPv4 tail (`::ffff:1.2.3.4`). */
function expandIPv6(ip: string): number[] | null {
  const zoneIdx = ip.indexOf('%');
  if (zoneIdx !== -1) ip = ip.slice(0, zoneIdx);

  // Rewrite an embedded IPv4 tail as two hex groups so one code path below
  // handles both forms.
  if (ip.includes('.')) {
    const lastColon = ip.lastIndexOf(':');
    const v4 = ipv4ToInt(ip.slice(lastColon + 1));
    if (v4 === null) return null;
    const high = ((v4 >>> 16) & 0xffff).toString(16);
    const low = (v4 & 0xffff).toString(16);
    ip = `${ip.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];

  let groups: string[];
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    groups = [...head, ...Array<string>(fill).fill('0'), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;

  const hextets = groups.map(g => parseInt(g, 16));
  if (hextets.some(h => Number.isNaN(h) || h < 0 || h > 0xffff)) return null;
  return hextets;
}

function isForbiddenIPv6(hextets: number[]): boolean {
  const allZeroThrough = (end: number) =>
    hextets.slice(0, end).every(h => h === 0);

  // ::(unspecified) and ::1 (loopback)
  if (allZeroThrough(7) && (hextets[7] === 0 || hextets[7] === 1)) return true;
  // fc00::/7 — unique local addresses
  if ((hextets[0] & 0xfe00) === 0xfc00) return true;
  // fe80::/10 — link-local
  if ((hextets[0] & 0xffc0) === 0xfe80) return true;
  // fec0::/10 — deprecated site-local
  if ((hextets[0] & 0xffc0) === 0xfec0) return true;

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): defer to
  // the embedded IPv4 verdict so e.g. ::ffff:169.254.169.254 stays blocked.
  if (allZeroThrough(5) && (hextets[5] === 0xffff || hextets[5] === 0)) {
    return isForbiddenIPv4Int(((hextets[6] << 16) | hextets[7]) >>> 0);
  }
  // 64:ff9b::/96 — NAT64, also embeds an IPv4 address.
  if (
    hextets[0] === 0x64 &&
    hextets[1] === 0xff9b &&
    hextets.slice(2, 6).every(h => h === 0)
  ) {
    return isForbiddenIPv4Int(((hextets[6] << 16) | hextets[7]) >>> 0);
  }
  return false;
}

/** True when the address is private / loopback / link-local / reserved — i.e.
 *  a request there from a cloud host would be an SSRF. Unparseable input is
 *  treated as forbidden. */
export function isForbiddenIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = ipv4ToInt(ip);
    return n === null ? true : isForbiddenIPv4Int(n);
  }
  if (kind === 6) {
    const hextets = expandIPv6(ip);
    return hextets === null ? true : isForbiddenIPv6(hextets);
  }
  return true;
}

/** Parse + validate a URL for outbound fetch: http/https only, and (unless
 *  `allowPrivateNetwork`) every address the hostname resolves to must be
 *  public. Throws a user-facing Error when the URL is not allowed. */
export async function assertHttpUrlAllowed(
  rawUrl: string,
  allowPrivateNetwork: boolean
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Unsupported protocol "${parsed.protocol.replace(/:$/, '')}" — only http and https are allowed.`
    );
  }
  if (allowPrivateNetwork) return parsed;

  // URL.hostname keeps brackets around IPv6 literals.
  const hostname = parsed.hostname;
  const bare =
    hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname;

  if (isIP(bare)) {
    if (isForbiddenIp(bare)) {
      throw new Error(
        `Request to "${hostname}" was blocked: private, loopback, and reserved addresses are not allowed on this host.`
      );
    }
    return parsed;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(bare, { all: true, verbatim: true });
  } catch {
    throw new Error(`Could not resolve host "${bare}".`);
  }
  if (addresses.length === 0) {
    throw new Error(`Could not resolve host "${bare}".`);
  }
  for (const { address } of addresses) {
    if (isForbiddenIp(address)) {
      throw new Error(
        `Request to "${bare}" was blocked: it resolves to a private or reserved address (${address}), which is not allowed on this host.`
      );
    }
  }
  return parsed;
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return true;
  const cause = (error as { cause?: unknown }).cause;
  return (
    cause instanceof Error &&
    (cause.name === 'TimeoutError' || cause.name === 'AbortError')
  );
}

/** Headers never forwarded across a cross-origin redirect. */
const AUTH_HEADERS = ['authorization', 'cookie', 'proxy-authorization'];

async function readBodyCapped(
  response: Response,
  maxBytes: number
): Promise<Buffer> {
  const mb = maxBytes / (1024 * 1024);
  const capLabel = mb >= 1 ? `${Math.round(mb)}MB` : `${Math.round(maxBytes / 1024)}KB`;
  const sizeError = () =>
    new Error(
      `Response exceeded the ${capLabel} size limit and was discarded.`
    );

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    void response.body?.cancel().catch(() => {});
    throw sizeError();
  }

  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw sizeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * SSRF-guarded, deadline-bounded, size-capped fetch returning the raw body
 * bytes. Follows redirects manually so every hop is re-validated against the
 * policy. Throws an Error with a user-facing message on any policy violation,
 * timeout, or network failure.
 *
 * This is the shared core: `safeHttpFetch` (UTIL_HTTP_REQUEST, text bodies)
 * and `fetchMediaAsBuffer` (media downloads, binary bodies with larger caps)
 * both run through it.
 */
export async function safeHttpFetchBuffer(
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  },
  policy?: HttpRequestPolicy
): Promise<SafeHttpBufferResult> {
  const allowPrivateNetwork = policy?.allowPrivateNetwork ?? false;
  const timeoutMs = policy?.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
  const maxResponseBytes =
    policy?.maxResponseBytes ?? DEFAULT_HTTP_MAX_RESPONSE_BYTES;
  const maxRedirects = policy?.maxRedirects ?? DEFAULT_HTTP_MAX_REDIRECTS;

  // One deadline for the whole exchange: every hop and the body read share it.
  const signal = AbortSignal.timeout(timeoutMs);

  let currentUrl = url;
  let method = init.method;
  let body = init.body;
  let headers: Record<string, string> = { ...init.headers };

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const parsed = await assertHttpUrlAllowed(currentUrl, allowPrivateNetwork);

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        method,
        headers,
        body,
        redirect: 'manual',
        signal,
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new Error(
          `Request timed out after ${Math.round(timeoutMs / 1000)}s.`
        );
      }
      throw error;
    }

    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      void response.body?.cancel().catch(() => {});
      let next: URL;
      try {
        next = new URL(location, currentUrl);
      } catch {
        throw new Error(`Redirect target is not a valid URL: ${location}`);
      }
      // Match fetch's redirect semantics: 303 always becomes GET; 301/302
      // demote body-carrying methods to GET.
      if (
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) &&
          method !== 'GET' &&
          method !== 'HEAD')
      ) {
        method = 'GET';
        body = undefined;
      }
      // Never leak credentials to a different origin.
      if (next.origin !== parsed.origin) {
        headers = Object.fromEntries(
          Object.entries(headers).filter(
            ([key]) => !AUTH_HEADERS.includes(key.toLowerCase())
          )
        );
      }
      currentUrl = next.toString();
      continue;
    }

    let bodyBuffer: Buffer;
    try {
      bodyBuffer = await readBodyCapped(response, maxResponseBytes);
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new Error(
          `Request timed out after ${Math.round(timeoutMs / 1000)}s while reading the response.`
        );
      }
      throw error;
    }
    return {
      status: response.status,
      body: bodyBuffer,
      contentType: response.headers.get('content-type'),
      finalUrl: currentUrl,
    };
  }
  throw new Error(`Too many redirects (limit: ${maxRedirects}).`);
}

/**
 * SSRF-guarded, deadline-bounded, size-capped fetch. Follows redirects
 * manually so every hop is re-validated against the policy. Throws an Error
 * with a user-facing message on any policy violation, timeout, or network
 * failure — the caller surfaces `error.message` as the node's response.
 */
export async function safeHttpFetch(
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  },
  policy?: HttpRequestPolicy
): Promise<SafeHttpResult> {
  const result = await safeHttpFetchBuffer(url, init, policy);
  return {
    status: result.status,
    bodyText: result.body.toString('utf-8'),
    finalUrl: result.finalUrl,
  };
}
