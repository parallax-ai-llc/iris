/**
 * Social sign-in (Google, Apple) for the desktop app: one-time code + PKCE.
 *
 * 1. `start()` makes a random `state` and a PKCE `code_verifier`, keeps them in
 *    this (main) process only, and returns the URL to open in the system browser:
 *    `<api>/auth/desktop/<provider>?state=…&code_challenge=…&code_challenge_method=S256`.
 * 2. After the provider sign-in the browser lands on the web callback page,
 *    which opens `iris-desktop://auth/callback?code=…&state=…`. The URL only
 *    carries a one-time code that is useless without the verifier.
 * 3. `handleCallback()` accepts the link only when its `state` is the one this
 *    process made (so a link crafted by someone else cannot sign the app into
 *    their account), then trades code + verifier at `<api>/auth/desktop/token`.
 *
 * Links that carry tokens directly (the flow before 2026-10) are refused: the
 * server no longer sends them to apps that start with PKCE, and accepting them
 * would let any web page log the app into another account.
 *
 * No Electron imports here so the logic is unit-testable.
 */
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export type OAuthProvider = 'google' | 'apple';

/** Matches the server's signed-state lifetime for the provider round trip. */
export const PENDING_TTL_MS = 10 * 60 * 1000;
const EXCHANGE_TIMEOUT_MS = 15_000;

export interface OAuthUser {
  id: string;
  email: string;
  name?: string;
  profileImageThumbnail?: string;
  planId?: number;
}

export type CallbackResult =
  | { type: 'success'; data: { accessToken: string; refreshToken: string; user: OAuthUser } }
  | { type: 'error'; error: string }
  /** Not ours (no sign-in in progress, or another state). Nothing to show. */
  | { type: 'ignored'; reason: string };

interface Pending {
  provider: OAuthProvider;
  state: string;
  verifier: string;
  apiBaseUrl: string;
  createdAt: number;
}

type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function s256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** True for `iris-desktop://auth/callback` (and the older `…://callback` spellings). */
function isAuthCallback(url: URL): boolean {
  const pathname = url.pathname.replace(/^\/+/, '');
  return url.host === 'auth' || pathname === 'auth/callback' || pathname === 'callback';
}

/** Parameters from the fragment if there is one, else the query. */
function callbackParams(url: URL): URLSearchParams {
  return url.hash.length > 1
    ? new URLSearchParams(url.hash.slice(1))
    : url.searchParams;
}

function parseUser(value: unknown): OAuthUser | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.email !== 'string') return null;
  return {
    id: v.id,
    email: v.email,
    name: typeof v.name === 'string' ? v.name : undefined,
    profileImageThumbnail:
      typeof v.profileImageThumbnail === 'string' ? v.profileImageThumbnail : undefined,
    planId: typeof v.planId === 'number' ? v.planId : undefined,
  };
}

export class DesktopOAuthFlow {
  private pending: Pending | null = null;

  constructor(
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Starts a sign-in (replacing any unfinished one) and returns the URL to open. */
  start(provider: OAuthProvider, apiBaseUrl: string): string {
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    this.pending = { provider, state, verifier, apiBaseUrl, createdAt: this.now() };
    const params = new URLSearchParams({
      state,
      code_challenge: s256Challenge(verifier),
      code_challenge_method: 'S256',
    });
    return `${apiBaseUrl}/auth/desktop/${provider}?${params.toString()}`;
  }

  /** The sign-in in progress, if it has not timed out. */
  private live(): Pending | null {
    if (this.pending && this.now() - this.pending.createdAt >= PENDING_TTL_MS) {
      this.pending = null;
    }
    return this.pending;
  }

  /** Handles an `iris-desktop://` link. Never logs or returns the code, state or tokens. */
  async handleCallback(rawUrl: string): Promise<CallbackResult> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return { type: 'ignored', reason: 'unparseable_url' };
    }
    if (!isAuthCallback(url)) return { type: 'ignored', reason: 'not_auth_callback' };

    const pending = this.live();
    if (!pending) return { type: 'ignored', reason: 'no_sign_in_in_progress' };

    const params = callbackParams(url);
    const state = params.get('state');
    const stateMatches = state !== null && safeEqual(state, pending.state);

    if (params.has('accessToken') || params.has('refreshToken')) {
      // Old token-in-URL link. Never accepted (see head comment).
      return { type: 'ignored', reason: 'token_link_refused' };
    }

    const error = params.get('error');
    if (error) {
      // Errors before the server could read our state (bad start, expired
      // provider round trip) come without one. Either way the sign-in is over.
      if (state !== null && !stateMatches) return { type: 'ignored', reason: 'state_mismatch' };
      this.pending = null;
      return { type: 'error', error: error.slice(0, 300) };
    }

    const code = params.get('code');
    if (!code) return { type: 'ignored', reason: 'missing_code' };
    if (!stateMatches) {
      // Keep the real sign-in going: a stray link must not cancel it.
      return { type: 'ignored', reason: 'state_mismatch' };
    }

    // One use: clear before the network call so a second link cannot reuse it.
    this.pending = null;
    return this.exchange(pending, code);
  }

  private async exchange(pending: Pending, code: string): Promise<CallbackResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EXCHANGE_TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(`${pending.apiBaseUrl}/auth/desktop/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, code_verifier: pending.verifier, state: pending.state }),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        const message =
          body && typeof body.message === 'string'
            ? body.message
            : 'Sign-in failed. Please try again.';
        return { type: 'error', error: message.slice(0, 300) };
      }
      const user = parseUser(body?.user);
      if (
        !body ||
        typeof body.accessToken !== 'string' ||
        typeof body.refreshToken !== 'string' ||
        !user
      ) {
        return { type: 'error', error: 'Sign-in failed. Please try again.' };
      }
      return {
        type: 'success',
        data: { accessToken: body.accessToken, refreshToken: body.refreshToken, user },
      };
    } catch {
      return {
        type: 'error',
        error: 'Could not reach the server to finish signing in. Please try again.',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
