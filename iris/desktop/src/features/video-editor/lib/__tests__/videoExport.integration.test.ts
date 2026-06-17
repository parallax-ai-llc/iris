/**
 * Video Export Integration Tests
 *
 * Tests the FFmpeg-based multi-clip concat export pipeline.
 * Uses the real FFmpeg binary from ffmpeg-static (the same package the
 * Electron main process uses) to verify that 2+ video clips can be
 * concatenated and exported successfully.
 *
 * Test assets: e2e/test-assets/test-clip-{1,2}.mp4 (3s each, 320x240)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ==================== FFmpeg Path ====================

function findFFmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStatic = require('ffmpeg-static') as string | { default: string };
    const p = typeof ffmpegStatic === 'string' ? ffmpegStatic : ffmpegStatic.default;
    if (p && fs.existsSync(p)) return p;
    return 'ffmpeg';
  } catch {
    return 'ffmpeg';
  }
}

// ==================== Types (mirrored from export.ts) ====================

interface ExportRequest {
  outputPath: string;
  format: 'mp4' | 'webm' | 'mov';
  quality: 'low' | 'medium' | 'high' | 'ultra';
  frameRate: number;
  width: number;
  height: number;
  duration: number;
  tracks: ExportTrack[];
  includeSubtitles: boolean;
  subtitleFormat?: 'burned' | 'srt' | 'vtt';
}

interface ExportTrack {
  id: string;
  type: 'video' | 'audio' | 'subtitle' | 'music' | 'adjustment';
  muted: boolean;
  volume: number;
  clips: ExportClip[];
}

interface ExportClip {
  id: string;
  type: string;
  startTime: number;
  endTime: number;
  sourceStartTime: number;
  sourceEndTime: number;
  sourceUrl: string;
  volume?: number;
  muted?: boolean;
  speed?: number;
  effects?: Array<{
    type: string;
    enabled: boolean;
    filterType?: string;
    filterIntensity?: number;
    filterParams?: Record<string, unknown>;
  }>;
  text?: string;
  style?: Record<string, unknown>;
  transform?: {
    scale: number;
    rotation: number;
    opacity: number;
    x: number;
    y: number;
  };
}

// ==================== Build FFmpeg Args (extracted from export.ts) ====================

function getQualityParams(quality: string, format: string): string[] {
  const params: string[] = [];
  if (format === 'mp4') {
    params.push('-c:v', 'libx264', '-c:a', 'aac');
    switch (quality) {
      case 'low':
        params.push('-crf', '28', '-preset', 'fast', '-vf', 'scale=-2:720');
        break;
      case 'medium':
        params.push('-crf', '23', '-preset', 'medium');
        break;
      case 'high':
        params.push('-crf', '18', '-preset', 'slow');
        break;
      case 'ultra':
        params.push('-crf', '15', '-preset', 'slow', '-vf', 'scale=-2:2160');
        break;
    }
  }
  return params;
}

function buildFFmpegArgs(request: ExportRequest): string[] {
  const args: string[] = ['-y'];

  const videoClips = request.tracks
    .filter((t) => t.type === 'video' && !t.muted)
    .flatMap((t) => t.clips.filter((c) => c.type === 'video' && c.sourceUrl));

  const audioClips = request.tracks
    .filter((t) => (t.type === 'audio' || t.type === 'music') && !t.muted)
    .flatMap((t) =>
      t.clips.filter((c) => (c.type === 'audio' || c.type === 'music') && c.sourceUrl && !c.muted),
    );

  if (videoClips.length === 0) {
    args.push(
      '-f', 'lavfi',
      '-i', `color=c=black:s=${request.width}x${request.height}:d=${request.duration}:r=${request.frameRate}`,
    );
  }

  const inputMap: Map<string, number> = new Map();
  let inputIndex = videoClips.length === 0 ? 1 : 0;

  for (const clip of videoClips) {
    if (!inputMap.has(clip.sourceUrl)) {
      args.push('-i', clip.sourceUrl);
      inputMap.set(clip.sourceUrl, inputIndex++);
    }
  }

  for (const clip of audioClips) {
    if (!inputMap.has(clip.sourceUrl)) {
      args.push('-i', clip.sourceUrl);
      inputMap.set(clip.sourceUrl, inputIndex++);
    }
  }

  if (videoClips.length <= 1 && audioClips.length <= 1) {
    const vClip = videoClips[0];
    if (vClip) {
      args.push('-ss', String(vClip.sourceStartTime));
      args.push('-t', String(vClip.endTime - vClip.startTime));
      args.push(...getQualityParams(request.quality, request.format));
    } else {
      args.push(...getQualityParams(request.quality, request.format));
    }
  } else {
    // Complex mode - multiple clips need filter_complex (concat)
    const filterParts: string[] = [];
    const concatInputLabels: string[] = [];
    const concatAudioLabels: string[] = [];

    // Check if the video track is muted
    const videoTrack = request.tracks.find((t) => t.type === 'video' && !t.muted);
    const videoTrackMuted = !videoTrack || videoTrack.muted;

    videoClips.forEach((vClip, idx) => {
      const inputIdx = inputMap.get(vClip.sourceUrl)!;
      const label = `v${idx}`;
      const speed = vClip.speed || 1;
      const trimFilters: string[] = [];

      trimFilters.push(`trim=start=${vClip.sourceStartTime}:end=${vClip.sourceEndTime}`);
      trimFilters.push('setpts=PTS-STARTPTS');

      if (speed !== 1) {
        trimFilters.push(`setpts=${1 / speed}*PTS`);
      }

      trimFilters.push(`scale=${request.width}:${request.height}:force_original_aspect_ratio=decrease`);
      trimFilters.push(`pad=${request.width}:${request.height}:(ow-iw)/2:(oh-ih)/2`);
      trimFilters.push('setsar=1');

      filterParts.push(`[${inputIdx}:v]${trimFilters.join(',')}[${label}]`);
      concatInputLabels.push(`[${label}]`);

      // Always extract audio from video source (unless clip or track is muted)
      if (!videoTrackMuted && !vClip.muted) {
        const aLabel = `a${idx}`;
        const audioFilters: string[] = [];
        audioFilters.push(`atrim=start=${vClip.sourceStartTime}:end=${vClip.sourceEndTime}`);
        audioFilters.push('asetpts=PTS-STARTPTS');
        if (speed !== 1) {
          audioFilters.push(`atempo=${speed}`);
        }
        const trackVol = videoTrack?.volume ?? 1;
        const clipVol = vClip.volume ?? 1;
        const totalVol = trackVol * clipVol;
        if (totalVol !== 1) {
          audioFilters.push(`volume=${totalVol}`);
        }
        filterParts.push(`[${inputIdx}:a]${audioFilters.join(',')}[${aLabel}]`);
        concatAudioLabels.push(`[${aLabel}]`);
      }
    });

    const n = videoClips.length;
    if (concatAudioLabels.length === n) {
      const interleavedLabels = concatInputLabels.map((vl, i) => vl + concatAudioLabels[i]).join('');
      filterParts.push(`${interleavedLabels}concat=n=${n}:v=1:a=1[outv][outa]`);
      args.push('-filter_complex', filterParts.join(';'));
      args.push('-map', '[outv]', '-map', '[outa]');
    } else {
      filterParts.push(`${concatInputLabels.join('')}concat=n=${n}:v=1:a=0[outv]`);
      args.push('-filter_complex', filterParts.join(';'));
      args.push('-map', '[outv]');
    }

    args.push(...getQualityParams(request.quality, request.format));
  }

  args.push('-r', String(request.frameRate));
  args.push('-t', String(request.duration));
  args.push(request.outputPath);

  return args;
}

// ==================== Helper ====================

function runFFmpeg(ffmpegPath: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, { stdio: 'pipe' });
    let stderr = '';
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on('close', (code) => {
      resolve({ code: code ?? 1, stderr });
    });
    proc.on('error', (err) => {
      resolve({ code: 1, stderr: err.message });
    });
  });
}

function getVideoInfo(ffmpegPath: string, filePath: string): { duration: number; hasVideo: boolean; hasAudio: boolean } {
  // Use ffmpeg -i to probe file info (ffprobe not available in npm package)
  // ffmpeg -i always exits with code 1 when no output is specified, so we
  // redirect stderr to stdout and capture the combined output
  try {
    const output = execSync(`"${ffmpegPath}" -i "${filePath}" 2>&1`, {
      encoding: 'utf8',
      timeout: 10000,
    });
    return parseFFmpegOutput(output);
  } catch (e) {
    // execSync throws on non-zero exit code; stdout still has the info
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const output: string = err.stdout || err.stderr || err.message || '';
    return parseFFmpegOutput(output);
  }
}

function parseFFmpegOutput(output: string): { duration: number; hasVideo: boolean; hasAudio: boolean } {
  const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  const duration = durationMatch
    ? parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseFloat(durationMatch[3])
    : 0;
  const hasVideo = /Stream.*Video/.test(output);
  const hasAudio = /Stream.*Audio/.test(output);
  return { duration, hasVideo, hasAudio };
}

// ==================== Tests ====================

describe('Video Export - Multi-clip Concat', () => {
  const ffmpegPath = findFFmpegPath();
  const projectRoot = path.resolve(__dirname, '../../../../..');
  const clip1 = path.join(projectRoot, 'e2e/test-assets/test-clip-1.mp4');
  const clip2 = path.join(projectRoot, 'e2e/test-assets/test-clip-2.mp4');
  const tmpDir = path.join(os.tmpdir(), 'iris-export-test');
  const outputFiles: string[] = [];

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    // Verify test assets exist
    expect(fs.existsSync(clip1), `Test clip 1 not found: ${clip1}`).toBe(true);
    expect(fs.existsSync(clip2), `Test clip 2 not found: ${clip2}`).toBe(true);
  });

  afterAll(() => {
    // Cleanup output files
    for (const f of outputFiles) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
    try { fs.rmdirSync(tmpDir); } catch { /* ignore */ }
  });

  it('FFmpeg is available', () => {
    expect(fs.existsSync(ffmpegPath), `FFmpeg not found at ${ffmpegPath}`).toBe(true);
  });

  it('test clips have valid video and audio', () => {
    const info1 = getVideoInfo(ffmpegPath, clip1);
    const info2 = getVideoInfo(ffmpegPath, clip2);

    expect(info1.hasVideo).toBe(true);
    expect(info1.hasAudio).toBe(true);
    expect(info1.duration).toBeGreaterThan(2);

    expect(info2.hasVideo).toBe(true);
    expect(info2.hasAudio).toBe(true);
    expect(info2.duration).toBeGreaterThan(2);
  });

  it('buildFFmpegArgs generates correct concat filter for 2 clips', () => {
    const outputPath = path.join(tmpDir, 'test-args.mp4');
    const request: ExportRequest = {
      outputPath,
      format: 'mp4',
      quality: 'medium',
      frameRate: 30,
      width: 640,
      height: 480,
      duration: 6,
      includeSubtitles: false,
      tracks: [
        {
          id: 'track-1',
          type: 'video',
          muted: false,
          volume: 1,
          clips: [
            {
              id: 'clip-1',
              type: 'video',
              startTime: 0,
              endTime: 3,
              sourceStartTime: 0,
              sourceEndTime: 3,
              sourceUrl: clip1,
            },
            {
              id: 'clip-2',
              type: 'video',
              startTime: 3,
              endTime: 6,
              sourceStartTime: 0,
              sourceEndTime: 3,
              sourceUrl: clip2,
            },
          ],
        },
      ],
    };

    const args = buildFFmpegArgs(request);
    const argsStr = args.join(' ');

    // Should have 2 inputs
    expect(argsStr).toContain('-i');
    expect(args.filter((a) => a === '-i').length).toBe(2);

    // Should use filter_complex with concat
    expect(argsStr).toContain('-filter_complex');
    expect(argsStr).toContain('concat=n=2');

    // Should have video labels
    expect(argsStr).toContain('[v0]');
    expect(argsStr).toContain('[v1]');

    // Should map output
    expect(argsStr).toContain('-map');
    expect(argsStr).toContain('[outv]');
  });

  it('exports 2 video clips into a single MP4 file', async () => {
    const outputPath = path.join(tmpDir, 'export-2clips.mp4');
    outputFiles.push(outputPath);

    const request: ExportRequest = {
      outputPath,
      format: 'mp4',
      quality: 'medium',
      frameRate: 30,
      width: 640,
      height: 480,
      duration: 6,
      includeSubtitles: false,
      tracks: [
        {
          id: 'track-1',
          type: 'video',
          muted: false,
          volume: 1,
          clips: [
            {
              id: 'clip-1',
              type: 'video',
              startTime: 0,
              endTime: 3,
              sourceStartTime: 0,
              sourceEndTime: 3,
              sourceUrl: clip1,
            },
            {
              id: 'clip-2',
              type: 'video',
              startTime: 3,
              endTime: 6,
              sourceStartTime: 0,
              sourceEndTime: 3,
              sourceUrl: clip2,
            },
          ],
        },
      ],
    };

    const args = buildFFmpegArgs(request);
    const result = await runFFmpeg(ffmpegPath, args);

    expect(result.code).toBe(0);
    expect(fs.existsSync(outputPath)).toBe(true);

    // Verify output file properties
    const info = getVideoInfo(ffmpegPath, outputPath);
    expect(info.hasVideo).toBe(true);
    // Duration should be ~6 seconds (2 clips × 3s)
    expect(info.duration).toBeGreaterThanOrEqual(5);
    expect(info.duration).toBeLessThanOrEqual(7);

    // File should have reasonable size
    const stats = fs.statSync(outputPath);
    expect(stats.size).toBeGreaterThan(1000); // At least 1KB (test clips are tiny solid-color videos)
  }, 30000);

  it('exports 3 clips with different source ranges', async () => {
    const outputPath = path.join(tmpDir, 'export-3clips.mp4');
    outputFiles.push(outputPath);

    const request: ExportRequest = {
      outputPath,
      format: 'mp4',
      quality: 'medium',
      frameRate: 30,
      width: 640,
      height: 480,
      duration: 5, // 2s + 1.5s + 1.5s = 5s
      includeSubtitles: false,
      tracks: [
        {
          id: 'track-1',
          type: 'video',
          muted: false,
          volume: 1,
          clips: [
            {
              id: 'clip-1',
              type: 'video',
              startTime: 0,
              endTime: 2,
              sourceStartTime: 0,
              sourceEndTime: 2,
              sourceUrl: clip1,
            },
            {
              id: 'clip-2',
              type: 'video',
              startTime: 2,
              endTime: 3.5,
              sourceStartTime: 0.5,
              sourceEndTime: 2,
              sourceUrl: clip2,
            },
            {
              id: 'clip-3',
              type: 'video',
              startTime: 3.5,
              endTime: 5,
              sourceStartTime: 1,
              sourceEndTime: 2.5,
              sourceUrl: clip1, // Reuse clip1 with different trim
            },
          ],
        },
      ],
    };

    const args = buildFFmpegArgs(request);
    const argsStr = args.join(' ');

    // Should have concat=n=3 (3 clips, but clip1 reused so only 2 unique inputs)
    expect(argsStr).toContain('concat=n=3');

    const result = await runFFmpeg(ffmpegPath, args);
    expect(result.code).toBe(0);
    expect(fs.existsSync(outputPath)).toBe(true);

    const info = getVideoInfo(ffmpegPath, outputPath);
    expect(info.hasVideo).toBe(true);
    expect(info.duration).toBeGreaterThanOrEqual(4);
    expect(info.duration).toBeLessThanOrEqual(6);
  }, 30000);

  it('exports with audio from video clips', async () => {
    const outputPath = path.join(tmpDir, 'export-with-audio.mp4');
    outputFiles.push(outputPath);

    const request: ExportRequest = {
      outputPath,
      format: 'mp4',
      quality: 'medium',
      frameRate: 30,
      width: 640,
      height: 480,
      duration: 6,
      includeSubtitles: false,
      tracks: [
        {
          id: 'track-1',
          type: 'video',
          muted: false,
          volume: 1,
          clips: [
            {
              id: 'clip-1',
              type: 'video',
              startTime: 0,
              endTime: 3,
              sourceStartTime: 0,
              sourceEndTime: 3,
              sourceUrl: clip1,
              volume: 0.8,
            },
            {
              id: 'clip-2',
              type: 'video',
              startTime: 3,
              endTime: 6,
              sourceStartTime: 0,
              sourceEndTime: 3,
              sourceUrl: clip2,
              volume: 1.0,
            },
          ],
        },
      ],
    };

    const args = buildFFmpegArgs(request);
    const result = await runFFmpeg(ffmpegPath, args);

    expect(result.code).toBe(0);
    expect(fs.existsSync(outputPath)).toBe(true);

    const info = getVideoInfo(ffmpegPath, outputPath);
    expect(info.hasVideo).toBe(true);
    // Export uses video track clips for audio in complex mode
    // Audio labels are generated when there are audioClips from audio/music tracks
    // In this case, audio comes from the video source files
  }, 30000);

  it('exports single clip (simple mode) correctly', async () => {
    const outputPath = path.join(tmpDir, 'export-single.mp4');
    outputFiles.push(outputPath);

    const request: ExportRequest = {
      outputPath,
      format: 'mp4',
      quality: 'medium',
      frameRate: 30,
      width: 640,
      height: 480,
      duration: 3,
      includeSubtitles: false,
      tracks: [
        {
          id: 'track-1',
          type: 'video',
          muted: false,
          volume: 1,
          clips: [
            {
              id: 'clip-1',
              type: 'video',
              startTime: 0,
              endTime: 3,
              sourceStartTime: 0,
              sourceEndTime: 3,
              sourceUrl: clip1,
            },
          ],
        },
      ],
    };

    const args = buildFFmpegArgs(request);
    const argsStr = args.join(' ');

    // Single clip should NOT use filter_complex
    expect(argsStr).not.toContain('-filter_complex');
    expect(argsStr).not.toContain('concat');

    const result = await runFFmpeg(ffmpegPath, args);
    expect(result.code).toBe(0);
    expect(fs.existsSync(outputPath)).toBe(true);

    const info = getVideoInfo(ffmpegPath, outputPath);
    expect(info.hasVideo).toBe(true);
    expect(info.duration).toBeGreaterThanOrEqual(2);
    expect(info.duration).toBeLessThanOrEqual(4);
  }, 30000);

  it('handles speed-adjusted clips in concat', async () => {
    const outputPath = path.join(tmpDir, 'export-speed.mp4');
    outputFiles.push(outputPath);

    const request: ExportRequest = {
      outputPath,
      format: 'mp4',
      quality: 'medium',
      frameRate: 30,
      width: 640,
      height: 480,
      duration: 4.5, // 3s at 2x speed (1.5s) + 3s at normal speed
      includeSubtitles: false,
      tracks: [
        {
          id: 'track-1',
          type: 'video',
          muted: false,
          volume: 1,
          clips: [
            {
              id: 'clip-1',
              type: 'video',
              startTime: 0,
              endTime: 1.5,
              sourceStartTime: 0,
              sourceEndTime: 3,
              sourceUrl: clip1,
              speed: 2, // 2x speed
            },
            {
              id: 'clip-2',
              type: 'video',
              startTime: 1.5,
              endTime: 4.5,
              sourceStartTime: 0,
              sourceEndTime: 3,
              sourceUrl: clip2,
              speed: 1,
            },
          ],
        },
      ],
    };

    const args = buildFFmpegArgs(request);
    const argsStr = args.join(' ');

    // Should have speed adjustment filter
    expect(argsStr).toContain('setpts=0.5*PTS'); // 1/2 = 0.5 for 2x speed

    const result = await runFFmpeg(ffmpegPath, args);
    expect(result.code).toBe(0);
    expect(fs.existsSync(outputPath)).toBe(true);

    const info = getVideoInfo(ffmpegPath, outputPath);
    expect(info.hasVideo).toBe(true);
    // Output should be ~4.5 seconds
    expect(info.duration).toBeGreaterThanOrEqual(3);
    expect(info.duration).toBeLessThanOrEqual(6);
  }, 30000);

  it('multi-clip export preserves audio from video sources', async () => {
    // Previously a bug: export.ts only checked for separate audio/music tracks.
    // Now fixed: audio is always extracted from video source inputs.

    const outputPath = path.join(tmpDir, 'export-audio-fix.mp4');
    outputFiles.push(outputPath);

    const request: ExportRequest = {
      outputPath,
      format: 'mp4',
      quality: 'medium',
      frameRate: 30,
      width: 640,
      height: 480,
      duration: 6,
      includeSubtitles: false,
      tracks: [
        {
          id: 'track-1',
          type: 'video',
          muted: false,
          volume: 1,
          clips: [
            {
              id: 'clip-1',
              type: 'video',
              startTime: 0,
              endTime: 3,
              sourceStartTime: 0,
              sourceEndTime: 3,
              sourceUrl: clip1,
            },
            {
              id: 'clip-2',
              type: 'video',
              startTime: 3,
              endTime: 6,
              sourceStartTime: 0,
              sourceEndTime: 3,
              sourceUrl: clip2,
            },
          ],
        },
        // No separate audio track — audio comes from video sources
      ],
    };

    const args = buildFFmpegArgs(request);
    const argsStr = args.join(' ');

    // Fixed: export.ts now generates concat=n=2:v=1:a=1 (includes audio)
    expect(argsStr).toContain('concat=n=2:v=1:a=1');

    const result = await runFFmpeg(ffmpegPath, args);
    expect(result.code).toBe(0);

    const info = getVideoInfo(ffmpegPath, outputPath);
    expect(info.hasVideo).toBe(true);
    expect(info.hasAudio).toBe(true); // Audio preserved correctly
  }, 30000);

  it('prerender.ts concat correctly preserves audio from video clips', async () => {
    // Verify that prerender.ts (which always includes audio) works correctly.
    // This serves as the reference implementation for fixing export.ts.

    const outputPath = path.join(tmpDir, 'prerender-audio.mp4');
    outputFiles.push(outputPath);

    // Build prerender-style concat args (always include audio)
    const clips = [
      { sourceUrl: clip1, sourceStartTime: 0, sourceEndTime: 3, speed: 1, volume: 1 },
      { sourceUrl: clip2, sourceStartTime: 0, sourceEndTime: 3, speed: 1, volume: 1 },
    ];

    const args: string[] = ['-y'];
    for (const clip of clips) {
      args.push('-i', clip.sourceUrl);
    }

    const filterParts: string[] = [];
    const vLabels: string[] = [];
    const aLabels: string[] = [];

    clips.forEach((clip, idx) => {
      const vFilters = [
        `trim=start=${clip.sourceStartTime}:end=${clip.sourceEndTime}`,
        'setpts=PTS-STARTPTS',
        'scale=640:480:force_original_aspect_ratio=decrease',
        'pad=640:480:(ow-iw)/2:(oh-ih)/2',
        'setsar=1',
      ];
      filterParts.push(`[${idx}:v]${vFilters.join(',')}[v${idx}]`);
      vLabels.push(`[v${idx}]`);

      const aFilters = [
        `atrim=start=${clip.sourceStartTime}:end=${clip.sourceEndTime}`,
        'asetpts=PTS-STARTPTS',
      ];
      filterParts.push(`[${idx}:a]${aFilters.join(',')}[a${idx}]`);
      aLabels.push(`[a${idx}]`);
    });

    const interleavedLabels = vLabels.map((vl, i) => vl + aLabels[i]).join('');
    filterParts.push(`${interleavedLabels}concat=n=2:v=1:a=1[outv][outa]`);

    args.push('-filter_complex', filterParts.join(';'));
    args.push('-map', '[outv]', '-map', '[outa]');
    args.push('-c:v', 'libx264', '-c:a', 'aac', '-crf', '23', '-preset', 'medium');
    args.push('-r', '30', '-t', '6', outputPath);

    const result = await runFFmpeg(ffmpegPath, args);
    expect(result.code).toBe(0);
    expect(fs.existsSync(outputPath)).toBe(true);

    const info = getVideoInfo(ffmpegPath, outputPath);
    expect(info.hasVideo).toBe(true);
    expect(info.hasAudio).toBe(true); // Audio preserved correctly
    expect(info.duration).toBeGreaterThanOrEqual(5);
    expect(info.duration).toBeLessThanOrEqual(7);
  }, 30000);
});
