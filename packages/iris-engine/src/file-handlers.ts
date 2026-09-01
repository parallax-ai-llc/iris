/**
 * Parallax Iris — File & data handlers (Phase 4: file & data processing).
 *
 * Pure helpers behind the UTIL_FILE_EXTRACT / UTIL_FILE_CONVERT /
 * UTIL_HTML_EXTRACT nodes:
 *   - delimited-text (CSV/TSV) parse + serialize — hand-rolled RFC4180-ish,
 *     no dependency (engine stays dep-light)
 *   - XLSX parse + build via lazily-imported `exceljs` (same lazy-import
 *     pattern as pdf-parse/mammoth in doc-handlers, so the engine's top
 *     level and jest's CJS runtime never load it)
 *   - CSS-selector HTML extraction via lazily-imported `cheerio` (dual
 *     CJS/ESM, unlike the jsdom v28 chain which is ESM-only and breaks
 *     jest's CJS runtime — jsdom stays for WEB_SCRAPER's full-DOM needs)
 *   - `resolveFileToBuffer` — the host-coupled file-input → bytes resolver
 *     (asset URLs through the host port, http(s)/data URLs through the
 *     guarded media fetch)
 */

import type { NodeExecutorHost } from './node-host.js';
import type { HttpRequestPolicy } from './safe-http.js';
import { fetchMediaAsBuffer } from './media-source.js';

/** Hard cap on the source file size UTIL_FILE_EXTRACT will parse. Parsing is
 *  in-memory (split/exceljs), so this bounds heap on a 1Gi instance. */
export const MAX_FILE_EXTRACT_BYTES = 20 * 1024 * 1024; // 20MB

/** Hard cap on the file UTIL_FILE_CONVERT will emit. The data URL lands in
 *  the node-result row, so this also bounds DB bloat. */
export const MAX_FILE_CONVERT_BYTES = 10 * 1024 * 1024; // 10MB

// ============================================================
// Delimited text (CSV / TSV)
// ============================================================

export interface TabularParseOptions {
  /** Explicit delimiter; empty/undefined → auto-detect from the first line. */
  delimiter?: string;
  /** First row is a header row → rows become objects keyed by it. */
  hasHeader: boolean;
  /** Rows beyond this are dropped and `truncated` is set. */
  maxRows: number;
}

export interface TabularParseResult {
  /** Objects (hasHeader) or arrays of cells (no header). */
  rows: Array<Record<string, string> | string[]>;
  headers: string[];
  rowCount: number;
  truncated: boolean;
}

const DELIMITER_CANDIDATES = [',', ';', '\t', '|'] as const;

/** Pick the candidate delimiter that appears most often outside quotes in
 *  the first non-empty line. Falls back to ','. */
export function detectDelimiter(text: string): string {
  const firstLine =
    text.split(/\r?\n/).find(line => line.trim().length > 0) ?? '';
  let best: string = ',';
  let bestCount = 0;
  for (const candidate of DELIMITER_CANDIDATES) {
    let count = 0;
    let inQuotes = false;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && ch === candidate) count++;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * RFC4180-ish delimited-text parser: quoted fields, escaped quotes (`""`),
 * delimiters/newlines inside quotes, CRLF or LF. Trailing empty line ignored.
 */
export function parseDelimited(
  text: string,
  opts: TabularParseOptions
): TabularParseResult {
  // Strip UTF-8 BOM — Excel exports carry one and it corrupts the first header.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delimiter =
    opts.delimiter && opts.delimiter.length > 0
      ? opts.delimiter === '\\t'
        ? '\t'
        : opts.delimiter
      : detectDelimiter(source);

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    record.push(field);
    field = '';
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      pushField();
    } else if (ch === '\n') {
      pushRecord();
    } else if (ch === '\r') {
      if (source[i + 1] === '\n') i++;
      pushRecord();
    } else {
      field += ch;
    }
  }
  // Flush the final record unless the file ended exactly on a newline.
  if (field.length > 0 || record.length > 0) pushRecord();

  // Drop records that are entirely empty (blank trailing lines).
  const nonEmpty = records.filter(
    r => !(r.length === 1 && r[0].trim() === '')
  );

  let headers: string[] = [];
  let dataRecords = nonEmpty;
  if (opts.hasHeader && nonEmpty.length > 0) {
    headers = dedupeHeaders(nonEmpty[0]);
    dataRecords = nonEmpty.slice(1);
  }

  const truncated = dataRecords.length > opts.maxRows;
  if (truncated) dataRecords = dataRecords.slice(0, opts.maxRows);

  const rows = dataRecords.map(cells => {
    if (!opts.hasHeader) return cells;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? '';
    });
    return obj;
  });

  return { rows, headers, rowCount: rows.length, truncated };
}

/** Empty/duplicate header cells become positional (`column3`) / suffixed
 *  (`name_2`) so object keys never collide or vanish. */
function dedupeHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((cell, idx) => {
    let name = cell.trim();
    if (!name) name = `column${idx + 1}`;
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}_${count + 1}`;
  });
}

/**
 * Cell-matrix → rows (objects when hasHeader, cell arrays otherwise).
 * Shared by SHEET_READ (Sheets values.get returns exactly this shape) and
 * any future matrix-shaped source. Header names are deduped/filled like the
 * CSV path so object keys never collide.
 */
export function valuesToRows(
  values: unknown[][],
  opts: { hasHeader: boolean; maxRows: number }
): TabularParseResult {
  let headers: string[] = [];
  let dataRecords = values;
  if (opts.hasHeader && values.length > 0) {
    headers = dedupeHeaders(values[0].map(cell => String(cell ?? '')));
    dataRecords = values.slice(1);
  }
  const truncated = dataRecords.length > opts.maxRows;
  if (truncated) dataRecords = dataRecords.slice(0, opts.maxRows);

  const rows = dataRecords.map(cells => {
    if (!opts.hasHeader) return cells.map(cellToString);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = cellToString(cells[idx]);
    });
    return obj;
  });
  return { rows, headers, rowCount: rows.length, truncated };
}

// ============================================================
// Row normalization (shared by convert + XLSX build)
// ============================================================

export interface NormalizedRows {
  /** Column names — union of object keys in first-appearance order, or
   *  positional names for array rows. */
  headers: string[];
  /** Each row as an array of cells aligned to `headers`. */
  cells: unknown[][];
}

/**
 * Accepts what workflows realistically wire in: an array of objects, an
 * array of arrays, a single object, or an array of scalars. Throws on
 * anything else so the node fails loudly instead of emitting garbage.
 */
export function normalizeRows(data: unknown): NormalizedRows {
  let list: unknown[];
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === 'object') {
    list = [data];
  } else if (typeof data === 'string') {
    // A JSON string is common when upstream stringified — try to parse.
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      throw new Error(
        'File Convert: `data` must be a JSON array/object (got a non-JSON string)'
      );
    }
    return normalizeRows(parsed);
  } else {
    throw new Error(
      'File Convert: `data` must be an array of objects/arrays or an object'
    );
  }

  if (list.length === 0) return { headers: [], cells: [] };

  const allArrays = list.every(item => Array.isArray(item));
  if (allArrays) {
    const width = Math.max(...list.map(item => (item as unknown[]).length));
    const headers = Array.from({ length: width }, (_, i) => `column${i + 1}`);
    return { headers, cells: list as unknown[][] };
  }

  const allObjects = list.every(
    item => item !== null && typeof item === 'object' && !Array.isArray(item)
  );
  if (allObjects) {
    const headers: string[] = [];
    for (const item of list) {
      for (const key of Object.keys(item as Record<string, unknown>)) {
        if (!headers.includes(key)) headers.push(key);
      }
    }
    const cells = list.map(item =>
      headers.map(h => (item as Record<string, unknown>)[h])
    );
    return { headers, cells };
  }

  // Scalar list → single "value" column.
  return { headers: ['value'], cells: list.map(item => [item]) };
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Serialize normalized rows as delimited text (CSV by default). */
export function toDelimited(
  normalized: NormalizedRows,
  opts: { delimiter?: string; includeHeader?: boolean } = {}
): string {
  const delimiter = opts.delimiter ?? ',';
  const escape = (raw: string): string => {
    if (
      raw.includes('"') ||
      raw.includes(delimiter) ||
      raw.includes('\n') ||
      raw.includes('\r')
    ) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  };
  const lines: string[] = [];
  if (opts.includeHeader !== false && normalized.headers.length > 0) {
    lines.push(normalized.headers.map(escape).join(delimiter));
  }
  for (const row of normalized.cells) {
    lines.push(row.map(cell => escape(cellToString(cell))).join(delimiter));
  }
  return lines.join('\n');
}

/** Serialize normalized rows as a GitHub-flavored Markdown table. */
export function toMarkdownTable(
  normalized: NormalizedRows,
  opts: { includeHeader?: boolean } = {}
): string {
  const escape = (raw: string): string =>
    raw.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const headers =
    opts.includeHeader !== false && normalized.headers.length > 0
      ? normalized.headers
      : normalized.headers.map((_, i) => `column${i + 1}`);
  const lines: string[] = [];
  lines.push(`| ${headers.map(escape).join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of normalized.cells) {
    lines.push(`| ${row.map(cell => escape(cellToString(cell))).join(' | ')} |`);
  }
  return lines.join('\n');
}

// ============================================================
// XLSX (lazy exceljs)
// ============================================================

/** Minimal structural view of the exceljs surface we touch — keeps the
 *  dependency lazy at both runtime and type level (pdf-parse precedent). */
interface ExcelRowLike {
  /** 1-based sparse array (index 0 unused). */
  values: unknown[] | Record<string, unknown>;
}
interface ExcelWorksheetLike {
  name: string;
  eachRow(
    opts: { includeEmpty: boolean },
    cb: (row: ExcelRowLike, rowNumber: number) => void
  ): void;
  addRow(values: unknown[]): unknown;
}
interface ExcelWorkbookLike {
  worksheets: ExcelWorksheetLike[];
  getWorksheet(name: string): ExcelWorksheetLike | undefined;
  addWorksheet(name: string): ExcelWorksheetLike;
  xlsx: {
    load(buffer: Buffer): Promise<unknown>;
    writeBuffer(): Promise<ArrayBuffer>;
  };
}

async function loadWorkbookCtor(): Promise<new () => ExcelWorkbookLike> {
  const mod = (await import('exceljs')) as unknown as {
    default?: { Workbook?: new () => ExcelWorkbookLike };
    Workbook?: new () => ExcelWorkbookLike;
  };
  const ctor = mod.default?.Workbook ?? mod.Workbook;
  if (!ctor) throw new Error('exceljs: Workbook constructor not found');
  return ctor;
}

/** Flatten exceljs cell values (rich text, hyperlinks, formulas, dates) to
 *  plain scalars so downstream JSON stays clean. */
function normalizeExcelValue(value: unknown): unknown {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as Array<{ text?: string }>)
        .map(part => part.text ?? '')
        .join('');
    }
    if (v.text !== undefined) return normalizeExcelValue(v.text);
    if (v.result !== undefined) return normalizeExcelValue(v.result);
    if (v.error !== undefined) return String(v.error);
    return JSON.stringify(value);
  }
  return value;
}

export interface XlsxParseOptions {
  sheetName?: string;
  hasHeader: boolean;
  maxRows: number;
}

export async function parseXlsxBuffer(
  buffer: Buffer,
  opts: XlsxParseOptions
): Promise<TabularParseResult> {
  const Workbook = await loadWorkbookCtor();
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = opts.sheetName
    ? workbook.getWorksheet(opts.sheetName)
    : workbook.worksheets[0];
  if (!sheet) {
    const available = workbook.worksheets.map(ws => ws.name).join(', ');
    throw new Error(
      `File Extract: worksheet "${opts.sheetName ?? '(first)'}" not found. Available: ${available || '(none)'}`
    );
  }

  const records: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, row => {
    const raw = row.values;
    // exceljs row.values is 1-based — drop the unused slot 0.
    const cells = Array.isArray(raw) ? raw.slice(1) : Object.values(raw);
    records.push(cells.map(normalizeExcelValue));
  });

  let headers: string[] = [];
  let dataRecords = records;
  if (opts.hasHeader && records.length > 0) {
    headers = dedupeHeaders(records[0].map(cell => String(cell ?? '')));
    dataRecords = records.slice(1);
  }

  const truncated = dataRecords.length > opts.maxRows;
  if (truncated) dataRecords = dataRecords.slice(0, opts.maxRows);

  const rows = dataRecords.map(cells => {
    if (!opts.hasHeader) return cells.map(cellToString);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = cellToString(cells[idx]);
    });
    return obj;
  });

  return { rows, headers, rowCount: rows.length, truncated };
}

export async function buildXlsxBuffer(
  normalized: NormalizedRows,
  opts: { sheetName?: string; includeHeader?: boolean } = {}
): Promise<Buffer> {
  const Workbook = await loadWorkbookCtor();
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(opts.sheetName || 'Data');
  if (opts.includeHeader !== false && normalized.headers.length > 0) {
    sheet.addRow(normalized.headers);
  }
  for (const row of normalized.cells) {
    sheet.addRow(
      row.map(cell =>
        cell === null ||
        cell === undefined ||
        typeof cell === 'number' ||
        typeof cell === 'boolean' ||
        typeof cell === 'string' ||
        cell instanceof Date
          ? cell
          : JSON.stringify(cell)
      )
    );
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// ============================================================
// HTML extraction (lazy jsdom)
// ============================================================

export interface HtmlExtractEntry {
  /** Key this entry's result lands under in the output object. */
  name: string;
  /** CSS selector (querySelectorAll semantics). */
  selector: string;
  /** '' / undefined → textContent; 'html' → innerHTML; 'table' → parse the
   *  matched <table> into row objects; anything else → getAttribute(name). */
  attribute?: string;
  /** false → first match only. Defaults to true. */
  multiple?: boolean;
}

export interface HtmlExtractResult {
  /** One entry → that entry's value; multiple entries → object keyed by name. */
  data: unknown;
  /** Total elements matched across all entries. */
  count: number;
  /** First matched value as text — convenient for wiring into text ports. */
  first: string;
}

/** Minimal structural view of the cheerio surface we touch, so the
 *  dependency stays lazy at both runtime and type level. */
interface CheerioSelectionLike {
  length: number;
  each(cb: (index: number, el: unknown) => void): unknown;
  first(): CheerioSelectionLike;
  find(selector: string): CheerioSelectionLike;
  eq(index: number): CheerioSelectionLike;
  is(selector: string): boolean;
  text(): string;
  html(): string | null;
  attr(name: string): string | undefined;
}
type CheerioRootLike = (target: unknown) => CheerioSelectionLike;

async function loadCheerio(html: string): Promise<CheerioRootLike> {
  const mod = (await import('cheerio')) as unknown as {
    load?: (html: string) => CheerioRootLike;
    default?: { load?: (html: string) => CheerioRootLike };
  };
  const load = mod.load ?? mod.default?.load;
  if (!load) throw new Error('cheerio: load() not found');
  return load(html);
}

export async function htmlExtract(
  html: string,
  entries: HtmlExtractEntry[]
): Promise<HtmlExtractResult> {
  const $ = await loadCheerio(html);

  let totalCount = 0;
  let first = '';
  const results: Record<string, unknown> = {};

  for (const entry of entries) {
    let selection: CheerioSelectionLike;
    try {
      selection = $(entry.selector as unknown);
      // Force selector evaluation — cheerio may defer bad selectors to use.
      void selection.length;
    } catch {
      throw new Error(`HTML Extract: invalid CSS selector "${entry.selector}"`);
    }
    totalCount += selection.length;

    const readOne = (el: unknown): unknown => {
      const node = $(el);
      const attr = (entry.attribute ?? '').trim();
      if (!attr) return node.text().trim();
      if (attr === 'html') return node.html() ?? '';
      if (attr === 'table') return parseHtmlTable($, node);
      return node.attr(attr) ?? '';
    };

    const values: unknown[] = [];
    selection.each((_idx, el) => {
      values.push(readOne(el));
    });
    if (!first && values.length > 0) {
      const candidate = values[0];
      first =
        typeof candidate === 'string' ? candidate : JSON.stringify(candidate);
    }
    results[entry.name] =
      entry.multiple === false ? (values[0] ?? null) : values;
  }

  const data =
    entries.length === 1 ? results[entries[0].name] : results;
  return { data, count: totalCount, first };
}

/** Parse a <table> element (or the first table under the match) into row
 *  objects keyed by header cells; arrays of cells when no header row exists. */
function parseHtmlTable(
  $: CheerioRootLike,
  node: CheerioSelectionLike
): unknown[] {
  const table = node.is('table') ? node : node.find('table').first();
  if (table.length === 0) return [];

  const rows: CheerioSelectionLike[] = [];
  table.find('tr').each((_idx, el) => {
    rows.push($(el));
  });
  if (rows.length === 0) return [];

  const rowCells = (tr: CheerioSelectionLike): string[] => {
    const cells: string[] = [];
    tr.find('th, td').each((_idx, el) => {
      cells.push($(el).text().trim());
    });
    return cells;
  };

  const hasHeader = rows[0].find('th').length > 0;
  if (!hasHeader) {
    return rows.map(rowCells);
  }

  const headers = dedupeHeaders(rowCells(rows[0]));
  return rows.slice(1).map(tr => {
    const cells = rowCells(tr);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? '';
    });
    return obj;
  });
}

// ============================================================
// resolveFileToBuffer — host-coupled file input → bytes
// ============================================================

export interface ResolvedFileBuffer {
  buffer: Buffer;
  mimeType: string;
  /** Best-effort name hint (URL pathname tail) for format auto-detection. */
  nameHint?: string;
}

/**
 * Resolve the same input shapes `extractFileText` accepts, but to raw bytes:
 *   - `/api/iris/assets/<id>/download` → host asset lookup + decrypt
 *   - http(s) / data URLs → guarded media fetch (SSRF policy from the host)
 *   - raw string → utf-8 text bytes
 *   - { url | value | base64, mimeType } objects
 */
export async function resolveFileToBuffer(
  fileInput: unknown,
  host: NodeExecutorHost
): Promise<ResolvedFileBuffer> {
  const policy: HttpRequestPolicy | undefined = host.http;

  if (typeof fileInput === 'string') {
    if (fileInput.startsWith('/api/iris/assets/')) {
      const match = fileInput.match(/\/api\/iris\/assets\/([^/]+)/);
      if (!match) {
        throw new Error(`File Extract: cannot parse asset id from URL: ${fileInput}`);
      }
      const asset = await host.assets.getAssetById(match[1]);
      if (!asset?.storagePath) {
        throw new Error(`File Extract: asset not found: ${match[1]}`);
      }
      const downloaded = await host.media.downloadDecrypted({
        userId: asset.userId,
        storagePath: asset.storagePath,
      });
      return {
        buffer: downloaded.buffer,
        mimeType:
          downloaded.contentType ??
          asset.mimeType ??
          'application/octet-stream',
      };
    }

    if (
      fileInput.startsWith('http://') ||
      fileInput.startsWith('https://') ||
      fileInput.startsWith('data:')
    ) {
      const fetched = await fetchMediaAsBuffer(
        { type: 'url', value: fileInput },
        policy
      );
      if ('error' in fetched) {
        throw new Error(`File Extract: ${fetched.error}`);
      }
      let nameHint: string | undefined;
      if (!fileInput.startsWith('data:')) {
        try {
          const pathname = new URL(fileInput).pathname;
          nameHint = pathname.split('/').pop() || undefined;
        } catch {
          // URL constructor already succeeded inside the fetch — best effort.
        }
      }
      return { buffer: fetched.buffer, mimeType: fetched.mimeType, nameHint };
    }

    // Raw inline text (e.g. CSV pasted straight into a workflow).
    return {
      buffer: Buffer.from(fileInput, 'utf8'),
      mimeType: 'text/plain',
    };
  }

  if (fileInput && typeof fileInput === 'object') {
    const obj = fileInput as Record<string, unknown>;
    const url = obj.url ?? obj.value;
    if (typeof url === 'string') {
      const resolved = await resolveFileToBuffer(url, host);
      const mimeType =
        typeof obj.mimeType === 'string' ? obj.mimeType : resolved.mimeType;
      const nameHint =
        typeof obj.filename === 'string' ? obj.filename : resolved.nameHint;
      return { ...resolved, mimeType, nameHint };
    }
    if (typeof obj.base64 === 'string') {
      return {
        buffer: Buffer.from(obj.base64, 'base64'),
        mimeType:
          typeof obj.mimeType === 'string'
            ? obj.mimeType
            : 'application/octet-stream',
        nameHint: typeof obj.filename === 'string' ? obj.filename : undefined,
      };
    }
  }

  throw new Error(
    'File Extract: file input must be a URL, data URL, raw text, or {url|base64}'
  );
}

// ============================================================
// Format detection
// ============================================================

export type FileExtractFormat =
  | 'csv'
  | 'tsv'
  | 'json'
  | 'xlsx'
  | 'pdf'
  | 'docx'
  | 'text';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Decide the parse format from MIME type + filename hint + magic bytes. */
export function detectFileFormat(
  mimeType: string,
  nameHint: string | undefined,
  buffer: Buffer
): FileExtractFormat {
  const mime = mimeType.toLowerCase().split(';')[0].trim();
  const ext = (nameHint ?? '').toLowerCase().split('.').pop() ?? '';

  if (mime === 'text/csv' || ext === 'csv') return 'csv';
  if (mime === 'text/tab-separated-values' || ext === 'tsv') return 'tsv';
  if (mime === 'application/json' || ext === 'json') return 'json';
  if (mime === XLSX_MIME || ext === 'xlsx') return 'xlsx';
  if (mime === 'application/pdf' || mime.endsWith('/pdf') || ext === 'pdf') {
    return 'pdf';
  }
  if (mime === DOCX_MIME || mime === 'application/msword' || ext === 'docx') {
    return 'docx';
  }

  // Magic bytes: %PDF
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === '%PDF') {
    return 'pdf';
  }
  // ZIP container (xlsx/docx both) — without a mime/extension hint we can't
  // tell them apart cheaply; xlsx is the likelier workflow payload.
  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return 'xlsx';
  }

  // Text sniff: valid JSON → json; delimiter-looking text → csv; else text.
  const head = buffer.subarray(0, 4096).toString('utf8');
  const trimmed = head.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (mime.startsWith('text/')) {
    const delimiter = detectDelimiter(head);
    let inQuotes = false;
    let count = 0;
    for (const ch of head.split(/\r?\n/)[0] ?? '') {
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && ch === delimiter) count++;
    }
    if (count > 0) return delimiter === '\t' ? 'tsv' : 'csv';
  }
  return 'text';
}
