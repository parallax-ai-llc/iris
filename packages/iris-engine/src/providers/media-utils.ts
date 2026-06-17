/**
 * Parallax Iris - Media Utilities
 * Common utilities for handling images, videos, and audio across all adapters
 */

import { MediaInput } from '../types.js';

// ============================================================
// TYPES
// ============================================================

export interface ParsedMedia {
  base64: string;
  mimeType: string;
}

export interface FetchedMedia extends ParsedMedia {
  buffer: Buffer;
}

// ============================================================
// DATA URI PARSING
// ============================================================

/**
 * Parse a data URI into base64 and mimeType components
 * Handles various formats:
 * - data:image/png;base64,ABC123...
 * - data:image/png,ABC123... (without ;base64)
 * - Raw base64 string
 */
export function parseDataUri(value: string): ParsedMedia {
  const trimmed = value.trim();

  // Standard format: data:mimeType;base64,data
  const match = trimmed.match(/^data:([^;,]+)(?:;[^,]*)*;base64,(.+)$/s);
  if (match) {
    return { mimeType: match[1], base64: match[2].trim() };
  }

  // Simpler format: data:mimeType,data (without ;base64 marker)
  const simpleMatch = trimmed.match(/^data:([^;,]+),(.+)$/s);
  if (simpleMatch) {
    return { mimeType: simpleMatch[1], base64: simpleMatch[2].trim() };
  }

  // If it starts with data: but doesn't match patterns, extract after comma
  if (trimmed.startsWith('data:')) {
    const commaIndex = trimmed.indexOf(',');
    if (commaIndex !== -1) {
      const base64Part = trimmed.substring(commaIndex + 1).trim();
      const mimeMatch = trimmed.match(/^data:([^;,]+)/);
      return {
        base64: base64Part,
        mimeType: mimeMatch ? mimeMatch[1] : 'application/octet-stream',
      };
    }
  }

  // Not a data URI - assume raw base64
  return { base64: trimmed, mimeType: 'application/octet-stream' };
}

/**
 * Detect MIME type from base64 magic bytes
 */
export function detectMimeTypeFromBase64(base64: string): string {
  // Image magic bytes
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  if (base64.startsWith('UklGR')) return 'image/webp';

  // Video magic bytes (after base64 encoding)
  if (base64.startsWith('AAAAI') || base64.startsWith('AAAA'))
    return 'video/mp4';

  // Audio magic bytes
  if (base64.startsWith('SUQz')) return 'audio/mpeg'; // ID3 header for MP3
  if (base64.startsWith('//u')) return 'audio/mpeg';

  return 'application/octet-stream';
}

// ============================================================
// URL FETCHING
// ============================================================

/**
 * Fetch a URL and return as base64
 */
export async function fetchAsBase64(url: string): Promise<FetchedMedia> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch: ${response.status} ${response.statusText}`
    );
  }

  const contentType =
    response.headers.get('content-type') || 'application/octet-stream';
  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    base64: buffer.toString('base64'),
    mimeType: contentType,
    buffer,
  };
}

// ============================================================
// MEDIA INPUT CONVERSION
// ============================================================

/**
 * Convert a MediaInput to a URL (data URI for base64, original URL for URL type)
 * Useful for APIs that accept both URL and data URI
 */
export function mediaInputToUrl(
  input: MediaInput,
  defaultMimeType = 'image/png'
): string {
  if (input.type === 'url') {
    return input.value;
  }

  if (input.type === 'base64') {
    // Check if already a data URI
    if (input.value.startsWith('data:')) {
      return input.value;
    }

    // Check if it's actually a URL (sometimes misclassified)
    if (
      input.value.startsWith('http://') ||
      input.value.startsWith('https://')
    ) {
      return input.value;
    }

    const mimeType = input.mimeType || defaultMimeType;
    return `data:${mimeType};base64,${input.value}`;
  }

  // GCS type - return as-is (usually a gs:// or https:// URL)
  return input.value;
}

/**
 * Convert a MediaInput to base64 data
 * Fetches from URL if needed
 */
export async function mediaInputToBase64(
  input: MediaInput,
  defaultMimeType = 'image/png'
): Promise<ParsedMedia> {
  if (input.type === 'url') {
    return fetchAsBase64(input.value);
  }

  if (input.type === 'base64') {
    // Check if it's actually a URL
    if (
      input.value.startsWith('http://') ||
      input.value.startsWith('https://')
    ) {
      return fetchAsBase64(input.value);
    }

    // Check if it's a data URI
    if (input.value.startsWith('data:')) {
      return parseDataUri(input.value);
    }

    // Raw base64
    const mimeType =
      input.mimeType ||
      detectMimeTypeFromBase64(input.value) ||
      defaultMimeType;
    return { base64: input.value, mimeType };
  }

  // GCS type - try to fetch
  if (input.value.startsWith('gs://')) {
    // Convert gs:// to https:// public URL
    const publicUrl = gcsUriToPublicUrl(input.value);
    return fetchAsBase64(publicUrl);
  }

  return fetchAsBase64(input.value);
}

/**
 * Convert a MediaInput to a Buffer
 */
export async function mediaInputToBuffer(
  input: MediaInput,
  defaultMimeType = 'image/png'
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (input.type === 'url') {
    const fetched = await fetchAsBase64(input.value);
    return { buffer: fetched.buffer, mimeType: fetched.mimeType };
  }

  if (input.type === 'base64') {
    // Check if it's actually a URL
    if (
      input.value.startsWith('http://') ||
      input.value.startsWith('https://')
    ) {
      const fetched = await fetchAsBase64(input.value);
      return { buffer: fetched.buffer, mimeType: fetched.mimeType };
    }

    // Check if it's a data URI
    if (input.value.startsWith('data:')) {
      const parsed = parseDataUri(input.value);
      return {
        buffer: Buffer.from(parsed.base64, 'base64'),
        mimeType: parsed.mimeType,
      };
    }

    // Raw base64
    const mimeType =
      input.mimeType ||
      detectMimeTypeFromBase64(input.value) ||
      defaultMimeType;
    return { buffer: Buffer.from(input.value, 'base64'), mimeType };
  }

  // GCS type
  if (input.value.startsWith('gs://')) {
    const publicUrl = gcsUriToPublicUrl(input.value);
    const fetched = await fetchAsBase64(publicUrl);
    return { buffer: fetched.buffer, mimeType: fetched.mimeType };
  }

  const fetched = await fetchAsBase64(input.value);
  return { buffer: fetched.buffer, mimeType: fetched.mimeType };
}

// ============================================================
// GCS UTILITIES
// ============================================================

/**
 * Convert a GCS URI (gs://bucket/path) to a public HTTPS URL
 */
export function gcsUriToPublicUrl(gcsUri: string): string {
  if (!gcsUri.startsWith('gs://')) {
    return gcsUri; // Already a URL
  }

  // gs://bucket/path -> https://storage.googleapis.com/bucket/path
  const withoutPrefix = gcsUri.slice(5); // Remove "gs://"
  return `https://storage.googleapis.com/${withoutPrefix}`;
}

/**
 * Convert a public GCS URL to a GCS URI
 */
export function publicUrlToGcsUri(url: string): string {
  if (url.startsWith('gs://')) {
    return url; // Already a GCS URI
  }

  // https://storage.googleapis.com/bucket/path -> gs://bucket/path
  const match = url.match(/^https:\/\/storage\.googleapis\.com\/(.+)$/);
  if (match) {
    return `gs://${match[1]}`;
  }

  // https://storage.cloud.google.com/bucket/path -> gs://bucket/path
  const match2 = url.match(/^https:\/\/storage\.cloud\.google\.com\/(.+)$/);
  if (match2) {
    return `gs://${match2[1]}`;
  }

  return url; // Return as-is if not a GCS URL
}

// ============================================================
// ASPECT RATIO UTILITIES
// ============================================================

/**
 * Parse aspect ratio string to width/height
 */
export function parseAspectRatio(
  aspectRatio: string,
  baseSize = 1024
): { width: number; height: number } {
  const ratioMap: Record<string, { width: number; height: number }> = {
    '1:1': { width: baseSize, height: baseSize },
    '16:9': { width: Math.round((baseSize * 16) / 9), height: baseSize },
    '9:16': { width: baseSize, height: Math.round((baseSize * 16) / 9) },
    '4:3': { width: Math.round((baseSize * 4) / 3), height: baseSize },
    '3:4': { width: baseSize, height: Math.round((baseSize * 4) / 3) },
    '3:2': { width: Math.round((baseSize * 3) / 2), height: baseSize },
    '2:3': { width: baseSize, height: Math.round((baseSize * 3) / 2) },
    '21:9': { width: Math.round((baseSize * 21) / 9), height: baseSize },
    '9:21': { width: baseSize, height: Math.round((baseSize * 21) / 9) },
  };

  return ratioMap[aspectRatio] || ratioMap['1:1'];
}

/**
 * Map aspect ratio to provider-specific format
 */
export function mapAspectRatio(
  aspectRatio: string | undefined,
  format: 'standard' | 'sora' | 'ideogram' | 'runway' = 'standard'
): string {
  if (!aspectRatio) {
    return format === 'sora' ? 'landscape' : '16:9';
  }

  if (format === 'sora') {
    // Sora uses landscape/portrait/square
    if (aspectRatio === '16:9') return 'landscape';
    if (aspectRatio === '9:16') return 'portrait';
    if (aspectRatio === '1:1') return 'square';
    return 'landscape';
  }

  if (format === 'ideogram') {
    // Ideogram uses NxM format (e.g., '16x9', '9x16', '1x1')
    // Valid values: '1x3', '3x1', '1x2', '2x1', '9x16', '16x9', '10x16', '16x10', '2x3', '3x2', '3x4', '4x3', '4x5', '5x4', '1x1'
    const ideogramMap: Record<string, string> = {
      '1:1': '1x1',
      '16:9': '16x9',
      '9:16': '9x16',
      '4:3': '4x3',
      '3:4': '3x4',
      '3:2': '3x2',
      '2:3': '2x3',
      '16:10': '16x10',
      '10:16': '10x16',
      '3:1': '3x1',
      '1:3': '1x3',
      '2:1': '2x1',
      '1:2': '1x2',
      '5:4': '5x4',
      '4:5': '4x5',
    };
    return ideogramMap[aspectRatio] || '1x1';
  }

  if (format === 'runway') {
    // Runway gen3a_turbo uses 768:1280 or 1280:768
    if (aspectRatio === '9:16') return '768:1280';
    return '1280:768';
  }

  return aspectRatio;
}

// ============================================================
// FILE EXTENSION UTILITIES
// ============================================================

/**
 * Get file extension from MIME type
 */
export function mimeToExtension(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
  };

  return mimeMap[mimeType] || mimeType.split('/')[1] || 'bin';
}

/**
 * Get MIME type from file extension
 */
export function extensionToMime(extension: string): string {
  const extMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
  };

  const ext = extension.toLowerCase().replace('.', '');
  return extMap[ext] || 'application/octet-stream';
}
