/**
 * Subtitle Parser Utilities
 * Client-side SRT/VTT parsing and serialization for timeline subtitle import/export.
 *
 * These utilities operate on a lightweight SubtitleEntry type (no DB references)
 * and are designed for converting between file formats and editor timeline clips.
 */

// ==================== Types ====================

export interface SubtitleEntry {
  /** 1-based cue index */
  index: number;
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Subtitle text (may contain newlines for multi-line cues) */
  text: string;
}

export type SubtitleFormat = 'srt' | 'vtt';

// ==================== Parsing ====================

/**
 * Parse an SRT format string into subtitle entries.
 *
 * SRT block structure:
 * ```
 * 1
 * 00:00:01,000 --> 00:00:04,000
 * Hello world
 * ```
 */
export function parseSrt(content: string): SubtitleEntry[] {
  const entries: SubtitleEntry[] = [];
  // Split on blank lines (handles \r\n and \n)
  const blocks = content.trim().replace(/\r\n/g, '\n').split(/\n\s*\n/);

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
    if (text) {
      entries.push({ index, startTime, endTime, text });
    }
  }

  return entries;
}

/**
 * Parse a WebVTT format string into subtitle entries.
 *
 * VTT block structure:
 * ```
 * WEBVTT
 *
 * 00:00:01.000 --> 00:00:04.000
 * Hello world
 * ```
 *
 * Also supports optional cue identifiers and short-form timestamps (MM:SS.mmm).
 */
export function parseVtt(content: string): SubtitleEntry[] {
  const entries: SubtitleEntry[] = [];
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let index = 0;
  let i = 0;

  // Skip WEBVTT header and any metadata lines until the first timestamp
  while (i < lines.length && !lines[i].includes('-->')) i++;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.includes('-->')) {
      // Support both HH:MM:SS.mmm and MM:SS.mmm formats
      const timeMatch = line.match(
        /(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})/
      );
      if (timeMatch) {
        const startTime =
          (parseInt(timeMatch[1] || '0') * 3600) +
          parseInt(timeMatch[2]) * 60 +
          parseInt(timeMatch[3]) +
          parseInt(timeMatch[4]) / 1000;

        const endTime =
          (parseInt(timeMatch[5] || '0') * 3600) +
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
          entries.push({ index, startTime, endTime, text });
        }
      }
    }
    i++;
  }

  return entries;
}

/**
 * Auto-detect format and parse accordingly.
 * Returns null if the content cannot be parsed.
 */
export function parseSubtitleFile(content: string): { format: SubtitleFormat; entries: SubtitleEntry[] } | null {
  const trimmed = content.trim();

  if (trimmed.startsWith('WEBVTT')) {
    return { format: 'vtt', entries: parseVtt(trimmed) };
  }

  // Try SRT — first non-empty line should be a number
  const firstLine = trimmed.split('\n')[0].trim();
  if (/^\d+$/.test(firstLine)) {
    return { format: 'srt', entries: parseSrt(trimmed) };
  }

  // Fallback: try both and return whichever produced entries
  const srtEntries = parseSrt(trimmed);
  if (srtEntries.length > 0) return { format: 'srt', entries: srtEntries };

  const vttEntries = parseVtt(trimmed);
  if (vttEntries.length > 0) return { format: 'vtt', entries: vttEntries };

  return null;
}

// ==================== Serialization ====================

/**
 * Serialize subtitle entries to SRT format.
 *
 * Output:
 * ```
 * 1
 * 00:00:01,000 --> 00:00:04,000
 * Hello world
 *
 * 2
 * ...
 * ```
 */
export function exportToSrt(entries: SubtitleEntry[]): string {
  return entries
    .slice()
    .sort((a, b) => a.startTime - b.startTime)
    .map((entry, i) => {
      const start = secondsToSrtTime(entry.startTime);
      const end = secondsToSrtTime(entry.endTime);
      return `${i + 1}\n${start} --> ${end}\n${entry.text}`;
    })
    .join('\n\n') + '\n';
}

/**
 * Serialize subtitle entries to WebVTT format.
 *
 * Output:
 * ```
 * WEBVTT
 *
 * 00:00:01.000 --> 00:00:04.000
 * Hello world
 *
 * ...
 * ```
 */
export function exportToVtt(entries: SubtitleEntry[]): string {
  const body = entries
    .slice()
    .sort((a, b) => a.startTime - b.startTime)
    .map((entry) => {
      const start = secondsToVttTime(entry.startTime);
      const end = secondsToVttTime(entry.endTime);
      return `${start} --> ${end}\n${entry.text}`;
    })
    .join('\n\n');

  return `WEBVTT\n\n${body}\n`;
}

// ==================== Helpers ====================

// Re-export shared time formatters
import { formatTimeSrt as secondsToSrtTime, formatTimeVtt as secondsToVttTime } from '@/shared/lib/utils/timeFormat';
