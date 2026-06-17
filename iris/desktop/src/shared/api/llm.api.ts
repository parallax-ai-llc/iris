/**
 * LLM API Client for Iris Desktop
 * Cloud Run 직접 호출로 스트리밍 LLM 응답 수신
 */

import { encryptPayload, decryptChunk } from './encryption';
import { getTokenStorage } from '@/features/auth/lib/token-storage';

const LLM_URL = import.meta.env.VITE_LLM_URL || 'http://localhost:8080';

async function getAccessToken(): Promise<string | null> {
  return getTokenStorage().getToken();
}

export interface EditorChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChunk {
  text?: string;
  done?: boolean;
  error?: boolean;
  errorMessage?: string;
  errorType?: string;
  type?: string; // 'heartbeat' etc.
}

/**
 * Cloud Run LLM 스트리밍 호출 (에디터 채팅용)
 * /api/llm/chat/stream 엔드포인트 사용 (tracked 아님 - 토큰 추적 불필요)
 */
export async function* streamEditorChat(
  messages: EditorChatMessage[],
  options: {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    abortSignal?: AbortSignal;
  } = {},
): AsyncGenerator<StreamChunk> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Authentication required');
  }

  const body = {
    provider: options.provider || 'google',
    model: options.model || 'gemini-2.5-flash',
    messages,
    temperature: options.temperature ?? 0.7,
    maxTokens: options.maxTokens ?? 4096,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000); // 2분

  if (options.abortSignal) {
    options.abortSignal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      controller.abort();
    });
  }

  try {
    const encryptedBody = await encryptPayload(body);
    const response = await fetch(`${LLM_URL}/api/llm/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(encryptedBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const errorData = await response.json();
        const err = new Error(errorData.message || `HTTP ${response.status}`) as Error & { statusCode?: number; errorType?: string };
        err.statusCode = response.status;
        err.errorType = errorData.errorType;
        throw err;
      }
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body reader not available');

    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let lastActivity = Date.now();
    const STREAM_TIMEOUT = 30_000;

    try {
      while (true) {
        if (Date.now() - lastActivity > STREAM_TIMEOUT) {
          throw new Error('Stream timeout');
        }

        const { done, value } = await reader.read();
        if (done) break;

        lastActivity = Date.now();
        buffer += decoder.decode(value, { stream: true });

        if (buffer.length > 1024 * 1024) {
          buffer = '';
          continue;
        }

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = await decryptChunk(line) as StreamChunk;
            if (chunk.error && chunk.done) {
              throw new Error(chunk.errorMessage || 'Stream error');
            }
            if (chunk.type === 'heartbeat') continue;
            yield chunk;
          } catch (e) {
            if (e instanceof Error && (e as Error & { errorType?: string }).errorType) throw e;
          }
        }
      }

      // 잔여 버퍼
      if (buffer.trim()) {
        try {
          const chunk = await decryptChunk(buffer) as StreamChunk;
          if (chunk.error && chunk.done) {
            throw new Error(chunk.errorMessage || 'Stream error');
          }
          yield chunk;
        } catch (e) {
          if (e instanceof Error && (e as Error & { errorType?: string }).errorType) throw e;
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return;
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
