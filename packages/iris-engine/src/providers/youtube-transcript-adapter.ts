/**
 * Parallax Iris — YouTube transcript adapter (Phase 2).
 *
 * Two stages:
 *   1. Try YouTube's official caption track via the `youtube-transcript`
 *      npm package (no API key, but rate-limited per IP).
 *   2. Optionally fall back to OpenAI Whisper if no official captions
 *      exist AND `fallbackWhisper` is enabled.
 *
 * Stage 2 (Whisper fallback) is deliberately stubbed for Phase 2 — it
 * requires `yt-dlp` available on the deploy environment and we don't
 * have that in the standard Cloud Run image yet. The hook is in place so
 * a future PR can light it up without changing the public node surface.
 */

import { YoutubeTranscript } from 'youtube-transcript';

export interface YoutubeTranscriptInput {
  url: string;
  language: string;
  withTimestamps: boolean;
  fallbackWhisper: boolean;
}

export interface YoutubeTranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface YoutubeTranscriptOutput {
  transcript: string;
  segments: YoutubeTranscriptSegment[];
  videoId: string;
  /**
   * Indicates the source of the transcript. `"captions"` means the
   * official caption track was returned directly. `"whisper"` would mean
   * we used the Whisper fallback (not implemented yet — see note above).
   */
  source: 'captions' | 'whisper';
  estimatedCostUsd: number;
}

const COST_CAPTIONS_USD = 0; // Free — youtube-transcript hits YouTube directly.

/**
 * Extract the 11-character YouTube video ID from common URL shapes.
 * Returns null if the URL doesn't look like a YouTube link.
 */
export function extractVideoId(url: string): string | null {
  // youtu.be/<id>
  let match = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (match) return match[1];
  // youtube.com/watch?v=<id>
  match = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (match) return match[1];
  // youtube.com/embed/<id>, /shorts/<id>, /live/<id>
  match = url.match(/\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
  if (match) return match[1];
  return null;
}

/**
 * Format a number of seconds as [HH:MM:SS] or [MM:SS] depending on length.
 */
export function formatTimestamp(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `[${h}:${pad(m)}:${pad(s)}]` : `[${pad(m)}:${pad(s)}]`;
}

export async function fetchYoutubeTranscript(
  input: YoutubeTranscriptInput
): Promise<YoutubeTranscriptOutput> {
  const videoId = extractVideoId(input.url);
  if (!videoId) {
    throw new Error(`Not a valid YouTube URL: ${input.url}`);
  }

  // Stage 1 — official captions
  try {
    // youtube-transcript accepts either a full URL or the video ID.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts: any = {};
    if (input.language !== 'auto') opts.lang = input.language;

    const raw = await YoutubeTranscript.fetchTranscript(videoId, opts);

    const segments: YoutubeTranscriptSegment[] = raw.map(item => ({
      // youtube-transcript reports offsets in milliseconds — normalize to s.
      start: (item.offset ?? 0) / 1000,
      end: ((item.offset ?? 0) + (item.duration ?? 0)) / 1000,
      text: item.text,
    }));

    const transcript = input.withTimestamps
      ? segments
          .map(s => `${formatTimestamp(s.start)} ${s.text}`)
          .join('\n')
      : segments.map(s => s.text).join(' ');

    return {
      transcript,
      segments,
      videoId,
      source: 'captions',
      estimatedCostUsd: COST_CAPTIONS_USD,
    };
  } catch (err) {
    // Stage 2 — Whisper fallback (not yet implemented)
    if (input.fallbackWhisper) {
      throw new Error(
        `WEB_YOUTUBE_TRANSCRIPT: official captions unavailable and ` +
          `Whisper fallback is not yet wired up in this build. ` +
          `Underlying error: ${(err as Error).message}`
      );
    }
    throw new Error(
      `WEB_YOUTUBE_TRANSCRIPT: no captions available for ${videoId}` +
        ` (enable fallbackWhisper in node config to retry via Whisper). ` +
        `Underlying error: ${(err as Error).message}`
    );
  }
}
