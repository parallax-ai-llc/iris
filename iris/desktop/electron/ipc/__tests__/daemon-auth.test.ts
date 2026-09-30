// @vitest-environment node
/**
 * electron/ipc/daemon-auth.ts — the daemon token is attached to the app's own
 * requests to the daemon, and to nothing else.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from 'electron';

vi.mock('electron', () => ({
  app: { isReady: () => true },
  session: { defaultSession: undefined },
}));

import {
  DAEMON_TOKEN_HEADER,
  attachDaemonTokenToAppRequests,
  daemonOrigins,
} from '../daemon-auth';

type Listener = (
  details: { url: string; requestHeaders: Record<string, string> },
  callback: (response: { requestHeaders?: Record<string, string> }) => void,
) => void;

function fakeSession() {
  const onBeforeSendHeaders = vi.fn();
  return {
    session: { webRequest: { onBeforeSendHeaders } } as unknown as Session,
    onBeforeSendHeaders,
    listener: () => onBeforeSendHeaders.mock.calls[onBeforeSendHeaders.mock.calls.length - 1]?.[1] as Listener,
    filter: () => onBeforeSendHeaders.mock.calls[onBeforeSendHeaders.mock.calls.length - 1]?.[0] as { urls: string[] },
  };
}

function run(listener: Listener, url: string, headers: Record<string, string> = {}) {
  let result: { requestHeaders?: Record<string, string> } | undefined;
  listener({ url, requestHeaders: headers }, (r) => {
    result = r;
  });
  return result;
}

describe('daemonOrigins', () => {
  it('covers both loopback spellings of the daemon port', () => {
    expect(daemonOrigins('http://localhost:51234')).toEqual([
      'http://localhost:51234',
      'http://127.0.0.1:51234',
    ]);
  });

  it.each(['', 'not a url', 'https://localhost:1', 'http://localhost'])('ignores %s', (url) => {
    expect(daemonOrigins(url)).toEqual([]);
  });
});

describe('attachDaemonTokenToAppRequests', () => {
  const TOKEN = 'f'.repeat(48);
  let ses: ReturnType<typeof fakeSession>;

  beforeEach(() => {
    ses = fakeSession();
  });

  it('scopes the injector to the daemon origin', () => {
    attachDaemonTokenToAppRequests('http://localhost:51234', TOKEN, ses.session);
    expect(ses.filter()).toEqual({
      urls: ['http://localhost:51234/*', 'http://127.0.0.1:51234/*'],
    });
  });

  it('adds the token to daemon requests and keeps the other headers', () => {
    attachDaemonTokenToAppRequests('http://localhost:51234', TOKEN, ses.session);
    const result = run(ses.listener(), 'http://127.0.0.1:51234/api/iris/assets', {
      Accept: 'application/json',
    });
    expect(result).toEqual({
      requestHeaders: { Accept: 'application/json', [DAEMON_TOKEN_HEADER]: TOKEN },
    });
  });

  it.each([
    'http://localhost:4747/api/health',
    'https://api.parallax.kr/extensions',
    'http://evil.example:51234/steal',
  ])('never sends the token to %s, even if the filter matched loosely', (url) => {
    attachDaemonTokenToAppRequests('http://localhost:51234', TOKEN, ses.session);
    expect(run(ses.listener(), url)).toEqual({});
  });

  it('removes the injector when the daemon stops', () => {
    attachDaemonTokenToAppRequests('', '', ses.session);
    expect(ses.onBeforeSendHeaders).toHaveBeenCalledWith(null);
  });
});
