/**
 * Parallax Iris — Document handlers (pure parts).
 *
 * The host-independent half of document handling:
 *   - `extractFromBuffer` — bytes → plain text (PDF via pdf-parse, DOCX via
 *     mammoth, text/* utf-8). Heavyweight parsers are loaded with lazy
 *     `import()` so the engine's top level stays dep-light (and jest's CJS
 *     runtime never has to parse them).
 *   - `extractFromHttpUrl` — fetch a public URL → `extractFromBuffer`.
 *   - `docGrep` — pure line-oriented pattern search (DOC_GREP node).
 *
 * The host-coupled entry point `extractFileText` (asset-URL resolution) reaches
 * storage + asset reads only through the engine's `NodeExecutorHost` port, so it
 * lives here too now that node-executor runs in the engine.
 */

import type { NodeExecutorHost } from './node-host.js';
import { safeHttpFetchBuffer, type HttpRequestPolicy } from './safe-http.js';
import {
  AssetNotAccessibleError,
  parseAssetIdFromUrl,
  requireRunAssetFile,
} from './asset-access.js';

/** Deadline and size cap for fetching a document by URL. Documents (PDF,
 *  DOCX, text) are small next to media; 50 MB covers large PDFs. */
const DOC_FETCH_TIMEOUT_MS = 60_000;
const DOC_FETCH_MAX_BYTES = 50 * 1024 * 1024;

export interface FileExtractionResult {
  text: string;
  mimeType: string;
  /** Approximate byte size of the source file. */
  sizeBytes: number;
  /** True when the source was already text and no conversion happened. */
  passthrough: boolean;
}

export async function extractFromHttpUrl(
  url: string,
  policy?: HttpRequestPolicy
): Promise<FileExtractionResult> {
  // The URL is user-supplied and the extracted text becomes node output, so
  // fetch through the SSRF guard (private and reserved addresses refused per
  // host policy, redirects re-checked, deadline and size capped).
  const response = await safeHttpFetchBuffer(
    url,
    { method: 'GET', headers: {} },
    {
      ...policy,
      timeoutMs: policy?.timeoutMs ?? DOC_FETCH_TIMEOUT_MS,
      maxResponseBytes: policy?.maxResponseBytes ?? DOC_FETCH_MAX_BYTES,
    }
  );
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Failed to fetch file: ${response.status}`);
  }
  const mimeType =
    response.contentType?.split(';')[0]?.trim() || 'application/octet-stream';
  return extractFromBuffer(response.body, mimeType);
}

/**
 * Decode `buffer` into plain text based on `mimeType`. The supported
 * matrix matches our existing document-handling stack:
 *   - PDF        → pdf-parse
 *   - DOCX       → mammoth (raw text mode)
 *   - text/*     → utf-8 decode
 *   - everything else throws so the user sees the unsupported format
 *     rather than a silent garbage transcription.
 */
export async function extractFromBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<FileExtractionResult> {
  const lower = mimeType.toLowerCase();
  if (lower === 'application/pdf' || lower.endsWith('/pdf')) {
    // pdf-parse v2 ships an awkward export shape — the default is a module
    // object with `.PDFParse` constructor. Use unknown then cast to the
    // narrow runtime shape we actually depend on.
    const pdfModule = (await import('pdf-parse')) as unknown as {
      default: {
        PDFParse: new (opts: { data: Buffer }) => {
          getText(): Promise<{ text: string }>;
        };
      };
    };
    const PDFParseCtor = pdfModule.default.PDFParse;
    const parser = new PDFParseCtor({ data: buffer });
    const result = await parser.getText();
    return {
      text: result.text,
      mimeType,
      sizeBytes: buffer.byteLength,
      passthrough: false,
    };
  }

  if (
    lower ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower === 'application/msword' ||
    lower.endsWith('/docx')
  ) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value,
      mimeType,
      sizeBytes: buffer.byteLength,
      passthrough: false,
    };
  }

  if (lower.startsWith('text/') || lower === 'application/json') {
    return {
      text: buffer.toString('utf8'),
      mimeType,
      sizeBytes: buffer.byteLength,
      passthrough: false,
    };
  }

  throw new Error(
    `DOC handler: unsupported MIME type ${mimeType}. Supported: PDF, DOCX, text/*.`
  );
}

// ============================================================
// DOC_GREP
// ============================================================

export interface DocGrepConfig {
  mode: 'literal' | 'literal-ci' | 'regex';
  pattern: string;
  contextLines: number;
  maxMatches: number;
}

export interface DocGrepMatch {
  line: string;
  lineNumber: number;
  context: string[];
}

export interface DocGrepResult {
  matches: DocGrepMatch[];
  context: string;
  count: number;
  truncated: boolean;
}

/**
 * Pure text grep. No LLM, no external API — runs in-process.
 * Streams line by line so even large files don't blow heap.
 */
export function docGrep(text: string, config: DocGrepConfig): DocGrepResult {
  const { mode, pattern, contextLines, maxMatches } = config;
  if (!pattern) {
    return { matches: [], context: '', count: 0, truncated: false };
  }

  let matcher: (line: string) => boolean;
  if (mode === 'regex') {
    let re: RegExp;
    try {
      re = new RegExp(pattern);
    } catch (err) {
      throw new Error(`Invalid regex pattern: ${(err as Error).message}`);
    }
    matcher = line => re.test(line);
  } else if (mode === 'literal-ci') {
    const needle = pattern.toLowerCase();
    matcher = line => line.toLowerCase().includes(needle);
  } else {
    matcher = line => line.includes(pattern);
  }

  const lines = text.split(/\r?\n/);
  const matches: DocGrepMatch[] = [];
  let truncated = false;

  for (let i = 0; i < lines.length; i++) {
    if (!matcher(lines[i])) continue;
    if (matches.length >= maxMatches) {
      truncated = true;
      break;
    }
    const ctxStart = Math.max(0, i - contextLines);
    const ctxEnd = Math.min(lines.length, i + contextLines + 1);
    matches.push({
      line: lines[i],
      lineNumber: i + 1,
      context: lines.slice(ctxStart, ctxEnd),
    });
  }

  // Build the joined `context` output — readable excerpts for downstream
  // LLM prompts. Format: `--- line N ---\n<context lines>`.
  const contextParts = matches.map(
    m => `--- line ${m.lineNumber} ---\n${m.context.join('\n')}`
  );

  return {
    matches,
    context: contextParts.join('\n\n'),
    count: matches.length,
    truncated,
  };
}

// ============================================================
// extractFileText — host-coupled file → text resolver
// ============================================================

/**
 * Best-effort file → plain text extraction. Supports PDF and DOCX via
 * pdf-parse and mammoth; everything else is treated as utf-8 text.
 *
 * Asset URLs (`/api/iris/assets/<id>/download`) resolve via the host port
 * (asset lookup + decrypt), only for assets owned by `userId` (the run user,
 * see asset-access.ts); http(s) URLs fetch directly; data URLs decode in
 * place. Errors throw — callers wrap them into a node-level failure.
 */
export async function extractFileText(
  fileInput: unknown,
  host: NodeExecutorHost,
  userId: string
): Promise<FileExtractionResult> {
  // 1) Plain string fast paths
  if (typeof fileInput === 'string') {
    // Asset URL → resolve via the host (owner-checked lookup + decrypt)
    if (fileInput.startsWith('/api/iris/assets/')) {
      return extractFromAssetUrl(fileInput, host, userId);
    }
    // http(s) URL → fetch directly (engine helper)
    if (fileInput.startsWith('http://') || fileInput.startsWith('https://')) {
      return extractFromHttpUrl(fileInput, host.http);
    }
    // data URL → decode and extract
    if (fileInput.startsWith('data:')) {
      const match = fileInput.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error('Invalid data URL');
      const mimeType = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      return extractFromBuffer(buffer, mimeType);
    }
    // Otherwise assume the upstream already passed raw text.
    return {
      text: fileInput,
      mimeType: 'text/plain',
      sizeBytes: Buffer.byteLength(fileInput, 'utf8'),
      passthrough: true,
    };
  }

  // 2) Object input — common shape from media nodes
  if (fileInput && typeof fileInput === 'object') {
    const obj = fileInput as Record<string, unknown>;
    const url = obj.url ?? obj.value;
    if (typeof url === 'string') {
      return extractFileText(url, host, userId);
    }
    if (typeof obj.base64 === 'string') {
      const mimeType = (obj.mimeType as string) ?? 'application/octet-stream';
      const buffer = Buffer.from(obj.base64, 'base64');
      return extractFromBuffer(buffer, mimeType);
    }
  }

  throw new Error(
    'DOC handler: file input must be a URL, data URL, raw text, or {url|base64}'
  );
}

async function extractFromAssetUrl(
  url: string,
  host: NodeExecutorHost,
  userId: string
): Promise<FileExtractionResult> {
  const assetId = parseAssetIdFromUrl(url);
  if (!assetId) throw new AssetNotAccessibleError();

  const asset = await requireRunAssetFile(host.assets, assetId, userId);

  // Read with the run user's id, never asset.userId (see asset-access.ts).
  const downloaded = await host.media.downloadDecrypted({
    userId,
    storagePath: asset.storagePath,
  });
  return extractFromBuffer(
    downloaded.buffer,
    asset.mimeType ?? 'application/octet-stream'
  );
}
