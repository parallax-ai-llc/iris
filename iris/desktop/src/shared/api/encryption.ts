/**
 * 클라이언트-서버 간 body 데이터 암호화/복호화 유틸리티
 * AES-256-GCM 방식 - web/lib/api-helpers/encryption.ts와 동일 구현
 */

const ENABLE_ENCRYPTION = import.meta.env.VITE_ENABLE_ENCRYPTION === 'true';
const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY || 'parallax-default-encryption-key-32';

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  let result = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    result += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(result);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function normalizeKey(key: string): ArrayBuffer {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const buffer = new ArrayBuffer(32);
  const normalized = new Uint8Array(buffer);
  for (let i = 0; i < 32; i++) {
    normalized[i] = keyData[i % keyData.length];
  }
  return buffer;
}

let cachedKey: CryptoKey | null = null;

async function getCryptoKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const keyData = normalizeKey(ENCRYPTION_KEY);
  cachedKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return cachedKey;
}

export async function encryptData(data: unknown): Promise<string> {
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(jsonString);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getCryptoKey();
  const encryptedBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, dataBuffer);
  const encryptedArray = new Uint8Array(encryptedBuffer);
  const combined = new Uint8Array(iv.length + encryptedArray.length);
  combined.set(iv, 0);
  combined.set(encryptedArray, iv.length);
  return uint8ArrayToBase64(combined);
}

export async function decryptData(encryptedData: string): Promise<unknown> {
  const combined = base64ToUint8Array(encryptedData);
  const iv = combined.slice(0, 12);
  const encryptedArray = combined.slice(12);
  const key = await getCryptoKey();
  const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encryptedArray);
  const decoder = new TextDecoder();
  const jsonString = decoder.decode(decryptedBuffer);
  try {
    return JSON.parse(jsonString);
  } catch {
    return jsonString;
  }
}

function isEncryptedPayload(body: unknown): body is { _d: string } {
  return !!body && typeof body === 'object' && '_d' in (body as Record<string, unknown>) && typeof (body as Record<string, string>)._d === 'string';
}

export async function encryptPayload(body: unknown): Promise<{ _d: string } | unknown> {
  if (!ENABLE_ENCRYPTION) return body;
  const encrypted = await encryptData(body);
  return { _d: encrypted };
}

export async function decryptChunk(chunkString: string): Promise<unknown> {
  const parsed = JSON.parse(chunkString);
  if (!ENABLE_ENCRYPTION) return parsed;
  if (!isEncryptedPayload(parsed)) return parsed;
  return await decryptData(parsed._d);
}

export function isEncryptionEnabled(): boolean {
  return ENABLE_ENCRYPTION;
}
