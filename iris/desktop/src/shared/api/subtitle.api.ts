/**
 * Iris API - Subtitle operations
 * API client for subtitle management, import/export, and AI generation
 */

import { apiClient } from './client';

// ==================== Types ====================

export type SubtitleFormat = 'srt' | 'vtt';
export type SubtitleStatus = 'DRAFT' | 'READY' | 'PROCESSING' | 'FAILED';

export interface SubtitleCue {
  id: string;
  subtitleId: string;
  index: number;
  startTime: number; // milliseconds (from server)
  endTime: number;   // milliseconds (from server)
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface Subtitle {
  id: string;
  assetId: string;
  name: string;
  language: string;
  format: SubtitleFormat;
  status: SubtitleStatus;
  cues: SubtitleCue[];
  cueCount: number;
  duration?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubtitleListResponse {
  subtitles: Subtitle[];
  total: number;
}

export interface CreateSubtitleData {
  assetId: string;
  name: string;
  language?: string;
  format?: SubtitleFormat;
}

export interface UpdateSubtitleData {
  name?: string;
  language?: string;
  format?: SubtitleFormat;
  status?: SubtitleStatus;
}

export interface UpsertCueData {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
}

export interface BulkUpdateCuesData {
  cues: UpsertCueData[];
  replaceAll?: boolean;
}

export interface ImportSubtitleData {
  assetId: string;
  name?: string;
  language?: string;
  format: SubtitleFormat;
  content: string; // raw SRT/VTT content
}

export interface GenerateSubtitleData {
  assetId: string;
  language?: string;
  name?: string;
  model?: string; // whisper model variant
}

export interface TranslateSubtitleData {
  targetLanguage: string;
  name?: string;
}

export interface ExportSubtitleOptions {
  format?: SubtitleFormat;
}

export interface BurnSubtitleData {
  subtitleId: string;
  style?: {
    fontSize?: number;
    fontColor?: string;
    backgroundColor?: string;
    position?: 'bottom' | 'top' | 'middle';
  };
}

export interface RemoveFillerWordsData {
  language?: string;
}

export interface RemoveFillerWordsResponse {
  subtitle: Subtitle;
  removedCount: number;
  message: string;
}

// ==================== API Functions ====================

/**
 * Create a new subtitle track
 */
export async function createSubtitle(data: CreateSubtitleData): Promise<Subtitle | null> {
  const response = await apiClient.post<Subtitle>(
    '/api/iris/subtitles',
    data,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * List subtitles (optionally filtered by assetId)
 */
export async function listSubtitles(assetId?: string): Promise<SubtitleListResponse | null> {
  const query = assetId ? `?assetId=${encodeURIComponent(assetId)}` : '';
  const response = await apiClient.get<SubtitleListResponse>(
    `/api/iris/subtitles${query}`,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Get a single subtitle by ID (includes cues)
 */
export async function getSubtitle(id: string): Promise<Subtitle | null> {
  const response = await apiClient.get<Subtitle>(
    `/api/iris/subtitles/${id}`,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Update subtitle metadata
 */
export async function updateSubtitle(
  id: string,
  data: UpdateSubtitleData
): Promise<Subtitle | null> {
  const response = await apiClient.patch<Subtitle>(
    `/api/iris/subtitles/${id}`,
    data,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Delete a subtitle track
 */
export async function deleteSubtitle(id: string): Promise<boolean> {
  const response = await apiClient.delete(
    `/api/iris/subtitles/${id}`,
    { requireAuth: true }
  );
  return response.success;
}

/**
 * Upsert a single cue
 */
export async function upsertCue(
  subtitleId: string,
  data: UpsertCueData
): Promise<SubtitleCue | null> {
  const response = await apiClient.put<SubtitleCue>(
    `/api/iris/subtitles/${subtitleId}/cues`,
    data,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Bulk update/replace all cues in a subtitle
 */
export async function bulkUpdateCues(
  subtitleId: string,
  data: BulkUpdateCuesData
): Promise<SubtitleCue[] | null> {
  const response = await apiClient.put<{ cues: SubtitleCue[] }>(
    `/api/iris/subtitles/${subtitleId}/cues/bulk`,
    data,
    { requireAuth: true }
  );
  return response.success ? response.data!.cues : null;
}

/**
 * Delete a single cue by index
 */
export async function deleteCue(
  subtitleId: string,
  cueIndex: number
): Promise<boolean> {
  const response = await apiClient.delete(
    `/api/iris/subtitles/${subtitleId}/cues/${cueIndex}`,
    { requireAuth: true }
  );
  return response.success;
}

/**
 * Import subtitle from SRT/VTT content string
 */
export async function importSubtitle(data: ImportSubtitleData): Promise<Subtitle | null> {
  const response = await apiClient.post<Subtitle>(
    '/api/iris/subtitles/import',
    data,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Import subtitle from an SRT/VTT file using Electron file dialog
 */
export async function importSubtitleFromFile(
  assetId: string,
  language = 'en'
): Promise<Subtitle | null> {
  try {
    // Open file dialog via Electron
    const filePath = await window.electronAPI.files.selectFile({
      filters: [
        { name: 'Subtitle Files', extensions: ['srt', 'vtt'] },
        { name: 'SRT Files', extensions: ['srt'] },
        { name: 'VTT Files', extensions: ['vtt'] },
      ],
    });

    if (!filePath) return null;

    // Read the file
    const arrayBuffer = await window.electronAPI.files.readFile(filePath);
    const decoder = new TextDecoder('utf-8');
    const content = decoder.decode(arrayBuffer);

    // Determine format from extension
    const isSrt = filePath.toLowerCase().endsWith('.srt');
    const format: SubtitleFormat = isSrt ? 'srt' : 'vtt';

    // Extract filename without extension for name
    const fileName = filePath.split(/[/\\]/).pop() || 'Subtitle';
    const name = fileName.replace(/\.(srt|vtt)$/i, '');

    return importSubtitle({ assetId, name, language, format, content });
  } catch {
    return null;
  }
}

/**
 * Export subtitle to SRT/VTT and optionally save to file
 */
export async function exportSubtitle(
  subtitleId: string,
  options?: ExportSubtitleOptions
): Promise<string | null> {
  const query = options?.format ? `?format=${options.format}` : '';
  const response = await apiClient.get<{ content: string; format: SubtitleFormat }>(
    `/api/iris/subtitles/${subtitleId}/export${query}`,
    { requireAuth: true }
  );
  return response.success ? response.data!.content : null;
}

/**
 * Export subtitle to file using Electron save dialog
 */
export async function exportSubtitleToFile(
  subtitle: Subtitle,
  format?: SubtitleFormat
): Promise<boolean> {
  try {
    const content = await exportSubtitle(subtitle.id, { format });
    if (!content) return false;

    const ext = format || subtitle.format || 'srt';
    const savePath = await window.electronAPI.files.saveFile({
      defaultPath: `${subtitle.name}.${ext}`,
      filters: [
        { name: ext.toUpperCase() + ' Files', extensions: [ext] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (!savePath) return false;

    const encoder = new TextEncoder();
    const arrayBuffer = encoder.encode(content).buffer;
    await window.electronAPI.files.writeFile(savePath, arrayBuffer as ArrayBuffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * AI-generate subtitles using Whisper transcription.
 * If audioBuffer is provided, uploads extracted audio directly (fast path).
 * Otherwise falls back to server-side extraction via assetId.
 */
export async function generateSubtitles(
  data: GenerateSubtitleData,
  audioBuffer?: ArrayBuffer
): Promise<Subtitle | null> {
  type GenerateResponse = { subtitle: Subtitle; message: string; detectedLanguage: string; tokensUsed?: number };

  if (audioBuffer) {
    // Fast path: upload audio file via multipart to /generate-audio
    const blob = new Blob([audioBuffer], { type: 'audio/wav' });
    const response = await apiClient.uploadFile<GenerateResponse>(
      '/api/iris/subtitles/generate-audio',
      blob,
      'file',
      {
        assetId: data.assetId,
        language: data.language ?? 'en',
        model: data.model ?? 'gemini-2.5-flash',
        name: data.name ?? '',
      },
      { requireAuth: true }
    );
    return response.success ? response.data!.subtitle : null;
  }

  // Fallback: server-side extraction
  const response = await apiClient.post<GenerateResponse>(
    '/api/iris/subtitles/generate',
    data,
    { requireAuth: true }
  );
  return response.success ? response.data!.subtitle : null;
}

/**
 * Translate subtitle to another language
 */
export async function translateSubtitle(
  subtitleId: string,
  data: TranslateSubtitleData
): Promise<Subtitle | null> {
  const response = await apiClient.post<Subtitle>(
    `/api/iris/subtitles/${subtitleId}/translate`,
    data,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Burn subtitles into the video
 */
export async function burnSubtitlesIntoVideo(
  assetId: string,
  data: BurnSubtitleData
): Promise<{ jobId: string } | null> {
  const response = await apiClient.post<{ jobId: string }>(
    `/api/iris/subtitles/burn/${assetId}`,
    data,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Remove filler words (um, uh, etc.) from subtitle cues
 */
export async function removeFillerWords(
  subtitleId: string,
  data?: RemoveFillerWordsData
): Promise<RemoveFillerWordsResponse | null> {
  const response = await apiClient.post<RemoveFillerWordsResponse>(
    `/api/iris/subtitles/${subtitleId}/remove-fillers`,
    data ?? {},
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

// ==================== Parsing Utilities ====================

/**
 * Parse SRT format string into cues
 */
export function parseSRT(content: string): Omit<SubtitleCue, 'id' | 'subtitleId' | 'createdAt' | 'updatedAt'>[] {
  const cues: Omit<SubtitleCue, 'id' | 'subtitleId' | 'createdAt' | 'updatedAt'>[] = [];
  const blocks = content.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;

    const index = parseInt(lines[0].trim(), 10);
    if (isNaN(index)) continue;

    const timeLine = lines[1].trim();
    const timeMatch = timeLine.match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!timeMatch) continue;

    const startTime =
      parseInt(timeMatch[1]) * 3600 +
      parseInt(timeMatch[2]) * 60 +
      parseInt(timeMatch[3]) +
      parseInt(timeMatch[4]) / 1000;

    const endTime =
      parseInt(timeMatch[5]) * 3600 +
      parseInt(timeMatch[6]) * 60 +
      parseInt(timeMatch[7]) +
      parseInt(timeMatch[8]) / 1000;

    const text = lines.slice(2).join('\n').trim();

    cues.push({ index, startTime, endTime, text });
  }

  return cues;
}

/**
 * Parse VTT format string into cues
 */
export function parseVTT(content: string): Omit<SubtitleCue, 'id' | 'subtitleId' | 'createdAt' | 'updatedAt'>[] {
  const cues: Omit<SubtitleCue, 'id' | 'subtitleId' | 'createdAt' | 'updatedAt'>[] = [];
  const lines = content.split('\n');
  let index = 0;
  let i = 0;

  // Skip WEBVTT header
  while (i < lines.length && !lines[i].includes('-->')) i++;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.includes('-->')) {
      const timeMatch = line.match(
        /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/
      );
      if (timeMatch) {
        const startTime =
          parseInt(timeMatch[1]) * 3600 +
          parseInt(timeMatch[2]) * 60 +
          parseInt(timeMatch[3]) +
          parseInt(timeMatch[4]) / 1000;

        const endTime =
          parseInt(timeMatch[5]) * 3600 +
          parseInt(timeMatch[6]) * 60 +
          parseInt(timeMatch[7]) +
          parseInt(timeMatch[8]) / 1000;

        i++;
        const textLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== '') {
          textLines.push(lines[i].trim());
          i++;
        }

        const text = textLines.join('\n');
        if (text) {
          index++;
          cues.push({ index, startTime, endTime, text });
        }
      }
    }
    i++;
  }

  return cues;
}

/**
 * Convert cues to SRT format
 */
export function cuesToSRT(cues: SubtitleCue[]): string {
  return cues
    .sort((a, b) => a.startTime - b.startTime)
    .map((cue, i) => {
      const start = secondsToSRTTime(cue.startTime);
      const end = secondsToSRTTime(cue.endTime);
      return `${i + 1}\n${start} --> ${end}\n${cue.text}`;
    })
    .join('\n\n');
}

/**
 * Convert cues to VTT format
 */
export function cuesToVTT(cues: SubtitleCue[]): string {
  const body = cues
    .sort((a, b) => a.startTime - b.startTime)
    .map((cue) => {
      const start = secondsToVTTTime(cue.startTime);
      const end = secondsToVTTTime(cue.endTime);
      return `${start} --> ${end}\n${cue.text}`;
    })
    .join('\n\n');
  return `WEBVTT\n\n${body}`;
}

function secondsToSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function secondsToVTTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

function pad(n: number, length = 2): string {
  return String(n).padStart(length, '0');
}

// ==================== Language Options ====================

export const SUBTITLE_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어 (Korean)' },
  { code: 'ja', label: '日本語 (Japanese)' },
  { code: 'zh', label: '中文 (Chinese)' },
  { code: 'es', label: 'Español (Spanish)' },
  { code: 'fr', label: 'Français (French)' },
  { code: 'de', label: 'Deutsch (German)' },
  { code: 'it', label: 'Italiano (Italian)' },
  { code: 'pt', label: 'Português (Portuguese)' },
  { code: 'ru', label: 'Русский (Russian)' },
  { code: 'ar', label: 'العربية (Arabic)' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'nl', label: 'Nederlands (Dutch)' },
  { code: 'pl', label: 'Polski (Polish)' },
  { code: 'tr', label: 'Türkçe (Turkish)' },
  { code: 'vi', label: 'Tiếng Việt (Vietnamese)' },
  { code: 'th', label: 'ภาษาไทย (Thai)' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'sv', label: 'Svenska (Swedish)' },
  { code: 'da', label: 'Dansk (Danish)' },
] as const;

export type LanguageCode = (typeof SUBTITLE_LANGUAGES)[number]['code'];

/**
 * Format seconds to display time (MM:SS.ms)
 */
export function formatSubtitleTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 100);

  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms)}`;
  }
  return `${pad(m)}:${pad(s)}.${pad(ms)}`;
}

/**
 * Format seconds to SMPTE timecode (HH:MM:SS:FF)
 * @param seconds - Time in seconds
 * @param frameRate - Frames per second (default 30)
 */
export function formatSMPTE(seconds: number, frameRate: number = 30): string {
  const absSeconds = Math.abs(seconds);
  const sign = seconds < 0 ? '-' : '';
  const h = Math.floor(absSeconds / 3600);
  const m = Math.floor((absSeconds % 3600) / 60);
  const s = Math.floor(absSeconds % 60);
  const f = Math.floor((absSeconds % 1) * frameRate);

  return `${sign}${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

/**
 * Parse display time string back to seconds
 */
export function parseSubtitleTime(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    const [m, s] = parts;
    return parseInt(m) * 60 + parseFloat(s);
  }
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
  }
  return 0;
}
