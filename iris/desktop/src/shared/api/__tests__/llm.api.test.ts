/**
 * LLM API (editor chat stream) Unit Tests
 *
 * The LLM service verifies the Bearer token on /api/llm/chat/stream, so an
 * expired access token is refreshed once and the request retried.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

const tokens = vi.hoisted(() => ({ current: null as string | null }));

vi.mock('../client', () => ({
  apiClient: { refreshAccessToken: vi.fn() },
}));

vi.mock('@/features/auth/lib/token-storage', () => ({
  getTokenStorage: () => ({ getToken: async () => tokens.current }),
}));

vi.mock('../encryption', () => ({
  encryptPayload: async (body: unknown) => body,
  decryptChunk: async (line: string) => JSON.parse(line),
}));

import { apiClient } from '../client';
import { streamEditorChat, type StreamChunk } from '../llm.api';

/** Just enough of a fetch Response for streamEditorChat. */
function fakeResponse(status: number, body: string) {
  let consumed = false;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => JSON.parse(body),
    text: async () => body,
    body: {
      getReader: () => ({
        read: async () => {
          if (consumed) return { done: true, value: undefined };
          consumed = true;
          return { done: false, value: new TextEncoder().encode(body) };
        },
        releaseLock: () => {},
      }),
    },
  };
}

const unauthorized = () =>
  fakeResponse(401, JSON.stringify({ error: 'AUTH_ERROR', message: 'Invalid or expired token', statusCode: 401 }));

async function collect(stream: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

const authorizationOf = (call: unknown[]) =>
  (call[1] as { headers: Record<string, string> }).headers.Authorization;

describe('streamEditorChat', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    tokens.current = 'expired-token';
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refreshes an expired token once and retries with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(fakeResponse(200, `${JSON.stringify({ text: 'hi' })}\n`));
    (apiClient.refreshAccessToken as Mock).mockImplementation(async () => {
      tokens.current = 'fresh-token';
      return true;
    });

    const chunks = await collect(streamEditorChat([{ role: 'user', content: 'hello' }]));

    expect(chunks).toEqual([{ text: 'hi' }]);
    expect(apiClient.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authorizationOf(fetchMock.mock.calls[0])).toBe('Bearer expired-token');
    expect(authorizationOf(fetchMock.mock.calls[1])).toBe('Bearer fresh-token');
  });

  it('surfaces the 401 when the refresh fails, without retrying', async () => {
    fetchMock.mockResolvedValueOnce(unauthorized());
    (apiClient.refreshAccessToken as Mock).mockResolvedValue(false);

    await expect(collect(streamEditorChat([{ role: 'user', content: 'hello' }]))).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refresh when the first request succeeds', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(200, `${JSON.stringify({ text: 'ok' })}\n`));

    const chunks = await collect(streamEditorChat([{ role: 'user', content: 'hello' }]));

    expect(chunks).toEqual([{ text: 'ok' }]);
    expect(apiClient.refreshAccessToken).not.toHaveBeenCalled();
  });
});
