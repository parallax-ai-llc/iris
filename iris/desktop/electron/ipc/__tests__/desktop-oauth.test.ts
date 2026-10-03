// @vitest-environment node
/**
 * electron/ipc/desktop-oauth.ts: the app accepts only the sign-in it started,
 * trades the one-time code with its PKCE verifier, and refuses token links.
 */
import { describe, it, expect, vi } from 'vitest';
import { DesktopOAuthFlow, PENDING_TTL_MS, s256Challenge } from '../desktop-oauth';

const API = 'https://api.example.test';
const TOKENS = {
  success: true,
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  user: { id: 'u1', email: 'owner@gmail.com', name: 'Owner', profileImageThumbnail: null, planId: 2 },
};

function setup(response: { ok: boolean; status: number; body: unknown } = { ok: true, status: 200, body: TOKENS }) {
  let now = 1_000_000;
  const fetchImpl = vi.fn(async () => ({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
  }));
  const flow = new DesktopOAuthFlow(fetchImpl, () => now);
  return {
    flow,
    fetchImpl,
    advance: (ms: number) => {
      now += ms;
    },
    /** Starts a sign-in and returns its state + verifier as the server would see them. */
    begin(provider: 'google' | 'apple' = 'google') {
      const url = new URL(flow.start(provider, API));
      return {
        url,
        state: url.searchParams.get('state')!,
        challenge: url.searchParams.get('code_challenge')!,
      };
    },
  };
}

describe('DesktopOAuthFlow.start', () => {
  it('opens the provider start URL with state and an S256 challenge, never the verifier', () => {
    const t = setup();
    const { url, state, challenge } = t.begin('apple');
    expect(`${url.origin}${url.pathname}`).toBe(`${API}/auth/desktop/apple`);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Array.from(url.searchParams.keys()).sort()).toEqual(['code_challenge', 'code_challenge_method', 'state']);
  });
});

describe('DesktopOAuthFlow.handleCallback', () => {
  it('trades the code with the verifier that matches the challenge', async () => {
    const t = setup();
    const { state, challenge } = t.begin();
    const result = await t.flow.handleCallback(`iris-desktop://auth/callback?code=the-code&state=${state}`);
    expect(result).toEqual({
      type: 'success',
      data: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: { id: 'u1', email: 'owner@gmail.com', name: 'Owner', profileImageThumbnail: undefined, planId: 2 },
      },
    });
    const [url, init] = t.fetchImpl.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe(`${API}/auth/desktop/token`);
    const body = JSON.parse(init.body);
    expect(body.code).toBe('the-code');
    expect(body.state).toBe(state);
    expect(s256Challenge(body.code_verifier)).toBe(challenge);
  });

  it('reads the parameters from the fragment too', async () => {
    const t = setup();
    const { state } = t.begin();
    const result = await t.flow.handleCallback(`iris-desktop://auth/callback#code=c&state=${state}`);
    expect(result.type).toBe('success');
  });

  it('uses a sign-in once: a second link with the same state is ignored', async () => {
    const t = setup();
    const { state } = t.begin();
    await t.flow.handleCallback(`iris-desktop://auth/callback?code=c&state=${state}`);
    const again = await t.flow.handleCallback(`iris-desktop://auth/callback?code=c2&state=${state}`);
    expect(again).toEqual({ type: 'ignored', reason: 'no_sign_in_in_progress' });
    expect(t.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('ignores a link with another state and keeps the real sign-in going (login CSRF)', async () => {
    const t = setup();
    const { state } = t.begin();
    const forged = await t.flow.handleCallback('iris-desktop://auth/callback?code=attacker&state=attacker-state');
    expect(forged).toEqual({ type: 'ignored', reason: 'state_mismatch' });
    expect(t.fetchImpl).not.toHaveBeenCalled();
    const real = await t.flow.handleCallback(`iris-desktop://auth/callback?code=c&state=${state}`);
    expect(real.type).toBe('success');
  });

  it('ignores any link when no sign-in was started', async () => {
    const t = setup();
    const result = await t.flow.handleCallback('iris-desktop://auth/callback?code=c&state=s');
    expect(result).toEqual({ type: 'ignored', reason: 'no_sign_in_in_progress' });
    expect(t.fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses token-bearing links (the pre-PKCE flow)', async () => {
    const t = setup();
    const { state } = t.begin();
    const result = await t.flow.handleCallback(
      `iris-desktop://auth/callback?accessToken=A&refreshToken=R&user=%7B%7D&state=${state}`,
    );
    expect(result).toEqual({ type: 'ignored', reason: 'token_link_refused' });
    expect(t.fetchImpl).not.toHaveBeenCalled();
  });

  it('expires a sign-in that was never finished', async () => {
    const t = setup();
    const { state } = t.begin();
    t.advance(PENDING_TTL_MS);
    const result = await t.flow.handleCallback(`iris-desktop://auth/callback?code=c&state=${state}`);
    expect(result).toEqual({ type: 'ignored', reason: 'no_sign_in_in_progress' });
  });

  it('reports a provider error for our sign-in and ends it', async () => {
    const t = setup();
    const { state } = t.begin();
    const result = await t.flow.handleCallback(
      `iris-desktop://auth/callback?error=${encodeURIComponent('access_denied')}&state=${state}`,
    );
    expect(result).toEqual({ type: 'error', error: 'access_denied' });
    const after = await t.flow.handleCallback(`iris-desktop://auth/callback?code=c&state=${state}`);
    expect(after.type).toBe('ignored');
  });

  it('passes the server message through when the exchange is refused', async () => {
    const t = setup({ ok: false, status: 400, body: { success: false, message: 'Expired', code: 'INVALID_DESKTOP_CODE' } });
    const { state } = t.begin();
    const result = await t.flow.handleCallback(`iris-desktop://auth/callback?code=c&state=${state}`);
    expect(result).toEqual({ type: 'error', error: 'Expired' });
  });

  it('ignores links for other hosts', async () => {
    const t = setup();
    t.begin();
    const result = await t.flow.handleCallback('iris-desktop://open/project?id=1');
    expect(result).toEqual({ type: 'ignored', reason: 'not_auth_callback' });
  });
});
