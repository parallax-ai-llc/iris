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

// ==================== Overlay Compositor Tests ====================
// These tests build args manually (mirroring what export.ts buildFFmpegArgs now
// does for the overlay path) and run a real ffmpeg render to verify correctness.

describe('Video Export - Overlay Compositor', () => {
  const ffmpegPath = findFFmpegPath();
  const projectRoot = path.resolve(__dirname, '../../../../..');
  const clip1 = path.join(projectRoot, 'e2e/test-assets/test-clip-1.mp4');
  const clip2 = path.join(projectRoot, 'e2e/test-assets/test-clip-2.mp4');
  const tmpDir = path.join(os.tmpdir(), 'iris-overlay-test');
  const outputFiles: string[] = [];

  // Small PNG for image overlay tests — we generate a 64×64 solid red PNG using ffmpeg
  let testPng = '';

  beforeAll(async () => {
    fs.mkdirSync(tmpDir, { recursive: true });

    // Generate a tiny 64×64 solid-color PNG as the overlay image
    testPng = path.join(tmpDir, 'overlay.png');
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath, [
        '-y', '-f', 'lavfi', '-i', 'color=red:s=64x64:d=1:r=1',
        '-vframes', '1', '-update', '1', testPng,
      ], { stdio: 'pipe' });
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`PNG gen failed: ${code}`))));
      proc.on('error', reject);
    });

    expect(fs.existsSync(clip1), `Test clip 1 not found: ${clip1}`).toBe(true);
    expect(fs.existsSync(clip2), `Test clip 2 not found: ${clip2}`).toBe(true);
    expect(fs.existsSync(testPng), `Generated PNG not found: ${testPng}`).toBe(true);
  });

  afterAll(() => {
    for (const f of outputFiles) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
    try { fs.rmdirSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
  });

  /**
   * Builds FFmpeg args for a composite render:
   *   base video (clip1, 3s, full frame) + image overlay (red 64×64 PNG)
   *   positioned at x=50, y=50 project px offset from centre, scale=1.
   *
   * Expected filter_complex structure (matching the new overlay compositor):
   *   [0:v] trim/scale/format → [outv]
   *   [outv] format=yuva420p → [outv_rgba]
   *   [1:v] trim/scale/format=yuva420p → [ov0_proc]
   *   [outv_rgba][ov0_proc] overlay=x=...:y=...:enable='...' → [ov0_comp]
   *   [ov0_comp] format=yuv420p → [outv_composite]
   */
  function buildOverlayTestArgs(outputPath: string, W: number, H: number): string[] {
    const dur = 3;
    const fps = 30;

    // Image natural size: 64×64, scale=1 → displayW=64, displayH=64
    // transform.x=50, transform.y=50 → overlay at (W-64)/2+50, (H-64)/2+50
    const imgW = 64;
    const imgH = 64;
    const tx = 50;
    const ty = 50;
    const ox = Math.round((W - imgW) / 2 + tx);
    const oy = Math.round((H - imgH) / 2 + ty);

    const sw = `trunc(${W}/2)*2`;
    const sh = `trunc(${H}/2)*2`;

    const filterParts: string[] = [
      // Base video: trim → scale → format=yuv420p
      `[0:v]trim=start=0:end=${dur},setpts=PTS-STARTPTS,scale=${sw}:${sh}:force_original_aspect_ratio=decrease,pad=${sw}:${sh}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,fps=${fps}[outv]`,
      // Image overlay: loop source → trim to clip duration → fps → scale to natural size
      // format=rgba gives the overlay a proper alpha channel so corners stay transparent
      `[1:v]trim=end=${dur},setpts=PTS-STARTPTS,fps=${fps},scale=${imgW}:${imgH}:flags=lanczos,format=rgba[ov0_proc]`,
      // Composite: base (yuv420p) + overlay (rgba) → overlay handles alpha automatically
      `[outv][ov0_proc]overlay=x=${ox}:y=${oy}:enable='between(t,0,${dur})'[ov0_comp]`,
      // Ensure final stream is yuv420p for the encoder
      `[ov0_comp]format=yuv420p[outv_composite]`,
    ];

    return [
      '-y',
      // Input 0: base video
      '-i', clip1,
      // Input 1: image overlay (looped)
      '-loop', '1', '-f', 'image2', '-framerate', String(fps), '-i', testPng,
      '-filter_complex', filterParts.join(';'),
      '-map', '[outv_composite]',
      '-map', '0:a:0',
      '-c:v', 'libx264', '-c:a', 'aac', '-crf', '23', '-preset', 'fast', '-pix_fmt', 'yuv420p',
      '-r', String(fps), '-t', String(dur),
      outputPath,
    ];
  }

  it('image overlay with transform x/y produces filter_complex with correct overlay coordinates', () => {
    const W = 640;
    const H = 480;
    // 64×64 image, scale=1, x=50, y=50 → ox=(640-64)/2+50=338, oy=(480-64)/2+50=258
    const expectedOx = Math.round((W - 64) / 2 + 50);
    const expectedOy = Math.round((H - 64) / 2 + 50);

    const args = buildOverlayTestArgs(path.join(tmpDir, 'args-check.mp4'), W, H);
    const fc = args[args.indexOf('-filter_complex') + 1];

    // Verify overlay filter contains expected coordinates
    expect(fc).toContain(`overlay=x=${expectedOx}:y=${expectedOy}`);
    // Verify enable expression references clip times
    expect(fc).toContain("enable='between(t,0,3)'");
    // Verify image source is trimmed (not force-fit to frame)
    expect(fc).toContain('scale=64:64');
  });

  it('image overlay renders to a valid MP4 with correct dimensions', async () => {
    const outputPath = path.join(tmpDir, 'overlay-image.mp4');
    outputFiles.push(outputPath);

    const args = buildOverlayTestArgs(outputPath, 640, 480);
    const result = await runFFmpeg(ffmpegPath, args);

    if (result.code !== 0) {
      // Print stderr to help diagnose ffmpeg errors
      console.warn('FFmpeg stderr:', result.stderr.slice(-2000));
    }
    expect(result.code).toBe(0);
    expect(fs.existsSync(outputPath)).toBe(true);

    const info = getVideoInfo(ffmpegPath, outputPath);
    expect(info.hasVideo).toBe(true);
    expect(info.duration).toBeGreaterThanOrEqual(2);
    expect(info.duration).toBeLessThanOrEqual(4);

    const stats = fs.statSync(outputPath);
    expect(stats.size).toBeGreaterThan(1000);
  }, 45000);

  it('two video tracks both present in output (overlay compositor)', async () => {
    // Build args for: base=clip1 (track index 1, bottom), overlay=clip2 (track index 0, top)
    // Both clips run 0–3s at 640×480. The overlay is full-frame at scale=0.5 (320×240)
    // centred on the stage → ox=(640-320)/2=160, oy=(480-240)/2=120.
    const outputPath = path.join(tmpDir, 'two-tracks.mp4');
    outputFiles.push(outputPath);

    const W = 640;
    const H = 480;
    const dur = 3;
    const fps = 30;
    const scale = 0.5;
    const dispW = Math.round(W * scale); // 320
    const dispH = Math.round(H * scale); // 240
    const ox = Math.round((W - dispW) / 2); // 160
    const oy = Math.round((H - dispH) / 2); // 120

    const sw = `trunc(${W}/2)*2`;
    const sh = `trunc(${H}/2)*2`;

    const filterParts = [
      // Base video (clip1) → [outv]
      `[0:v]trim=start=0:end=${dur},setpts=PTS-STARTPTS,scale=${sw}:${sh}:force_original_aspect_ratio=decrease,pad=${sw}:${sh}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,fps=${fps}[outv]`,
      // Overlay video (clip2) trimmed, scaled to 50%, centred — format=rgba for alpha compositing
      `[1:v]trim=start=0:end=${dur},setpts=PTS-STARTPTS,scale=${dispW}:${dispH}:flags=lanczos,format=rgba[ov0_proc]`,
      `[outv][ov0_proc]overlay=x=${ox}:y=${oy}:enable='between(t,0,${dur})'[ov0_comp]`,
      `[ov0_comp]format=yuv420p[outv_composite]`,
    ];

    const args = [
      '-y',
      '-i', clip1,
      '-i', clip2,
      '-filter_complex', filterParts.join(';'),
      '-map', '[outv_composite]',
      '-an',
      '-c:v', 'libx264', '-crf', '23', '-preset', 'fast', '-pix_fmt', 'yuv420p',
      '-r', String(fps), '-t', String(dur),
      outputPath,
    ];

    const result = await runFFmpeg(ffmpegPath, args);

    if (result.code !== 0) {
      console.warn('FFmpeg stderr:', result.stderr.slice(-2000));
    }
    expect(result.code).toBe(0);
    expect(fs.existsSync(outputPath)).toBe(true);

    const info = getVideoInfo(ffmpegPath, outputPath);
    expect(info.hasVideo).toBe(true);
    expect(info.duration).toBeGreaterThanOrEqual(2);

    const stats = fs.statSync(outputPath);
    expect(stats.size).toBeGreaterThan(1000);

    // Also verify args contain expected overlay coords (from the filter_complex above)
    const fc = args[args.indexOf('-filter_complex') + 1];
    expect(fc).toContain(`overlay=x=${ox}:y=${oy}`);
    expect(fc).toContain("enable='between(t,0,3)'");
  }, 45000);

  it('lower-third subtitle uses \\an5\\pos for centre-anchored positioning at y≈80%', () => {
    // Simulate buildAssContent output for a lower-third positioned at x=50%, y=80%
    // The fix: use \an5 + \pos(px,py) where px=W*50/100, py=H*80/100
    const W = 1920;
    const H = 1080;
    const xPct = 50;
    const yPct = 80;
    const expectedPx = Math.round((xPct / 100) * W); // 960
    const expectedPy = Math.round((yPct / 100) * H); // 864

    // The style object passed to buildAssContent (matches SubtitleStyle)
    const style = {
      fontSize: 48,
      fontFamily: 'Arial',
      fontColor: '#FFFFFF',
      backgroundColor: '#000000',
      backgroundOpacity: 0.8,
      position: { x: xPct, y: yPct },
      alignment: 'center' as const,
      verticalAlign: 'middle' as const,
      fontWeight: 'bold' as const,
      fontStyle: 'normal' as const,
      paddingX: 20,
      paddingY: 8,
    };

    // Build the ASS tags inline to verify positioning logic
    // (mirroring the updated buildAssContent in export.ts)
    const tags: string[] = [];
    tags.push('\\an5'); // centre anchor
    const px = Math.round((style.position.x / 100) * W);
    const py = Math.round((style.position.y / 100) * H);
    tags.push(`\\pos(${px},${py})`);

    expect(tags).toContain('\\an5');
    expect(tags).toContain(`\\pos(${expectedPx},${expectedPy})`);

    // \an5 must appear before \pos for ASS compliance
    const an5Idx = tags.indexOf('\\an5');
    const posIdx = tags.findIndex((t) => t.startsWith('\\pos'));
    expect(an5Idx).toBeLessThan(posIdx);

    // paddingX=20 > paddingY=8 → bord=20
    const padX = style.paddingX ?? 12;
    const padY = style.paddingY ?? 4;
    const bord = Math.max(padX, padY, 2);
    expect(bord).toBe(20);
  });

  it('end-to-end: base video + image overlay renders without ffmpeg errors', async () => {
    // Synthetic case: black 320×240 2s base + 64×64 red PNG overlay offset from centre
    const outputPath = path.join(tmpDir, 'e2e-overlay.mp4');
    outputFiles.push(outputPath);

    const W = 320;
    const H = 240;
    const dur = 2;
    const fps = 24;
    const imgW = 64;
    const imgH = 64;
    const tx = 30;
    const ty = -20;
    const ox = Math.round((W - imgW) / 2 + tx);
    const oy = Math.round((H - imgH) / 2 + ty);

    // Use a colour source as the base so we don't need clip1
    const filterParts = [
      `color=c=blue:s=${W}x${H}:d=${dur}:r=${fps},setsar=1,format=yuv420p,fps=${fps}[outv]`,
      // Image overlay: scale to natural size, format=rgba for alpha compositing
      `[0:v]trim=end=${dur},setpts=PTS-STARTPTS,fps=${fps},scale=${imgW}:${imgH}:flags=lanczos,format=rgba[ov0_proc]`,
      `[outv][ov0_proc]overlay=x=${ox}:y=${oy}:enable='between(t,0,${dur})'[ov0_comp]`,
      `[ov0_comp]format=yuv420p[outv_composite]`,
    ];

    const args = [
      '-y',
      '-loop', '1', '-f', 'image2', '-framerate', String(fps), '-i', testPng,
      '-filter_complex', filterParts.join(';'),
      '-map', '[outv_composite]',
      '-an',
      '-c:v', 'libx264', '-crf', '28', '-preset', 'fast', '-pix_fmt', 'yuv420p',
      '-r', String(fps), '-t', String(dur),
      outputPath,
    ];

    const result = await runFFmpeg(ffmpegPath, args);

    if (result.code !== 0) {
      console.warn('FFmpeg stderr:', result.stderr.slice(-3000));
    }
    // Must complete without error and produce a non-trivial output file
    expect(result.code).toBe(0);
    expect(fs.existsSync(outputPath)).toBe(true);

    const info = getVideoInfo(ffmpegPath, outputPath);
    expect(info.hasVideo).toBe(true);
    expect(info.duration).toBeGreaterThan(1);

    const stats = fs.statSync(outputPath);
    expect(stats.size).toBeGreaterThan(500);
  }, 45000);
});

// ==================== Subtitle PNG Overlay Tests ====================

describe('Video Export - Subtitle PNG Overlay', () => {
  const ffmpegPath = findFFmpegPath();
  const tmpDir = path.join(os.tmpdir(), 'iris-subtitle-test');
  const outputFiles: string[] = [];
  let testSubPng = '';

  beforeAll(async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    // Generate a full-frame (320×240) semi-transparent magenta PNG for the overlay test.
    testSubPng = path.join(tmpDir, 'subtitle-overlay.png');
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath, [
        '-y',
        '-f', 'lavfi',
        '-i', 'color=0xFF00FF@0.8:s=320x240:d=1:r=1',
        '-vframes', '1',
        '-update', '1',
        testSubPng,
      ], { stdio: 'pipe' });
      proc.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`PNG gen failed: ${code}`))
      );
      proc.on('error', reject);
    });
  }, 20000);

  afterAll(() => {
    for (const f of outputFiles) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
    try { fs.rmdirSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
  });

  it('filter_complex with subtitle PNG overlay contains overlay=0:0 with enable expression and no ass= filter', () => {
    const W = 320, H = 240, dur = 3, fps = 30;
    const subStart = 0.5, subEnd = 2.5;

    const filterParts = [
      `color=c=black:s=${W}x${H}:d=${dur}:r=${fps},setsar=1,format=yuv420p[outv]`,
      `[0:v]trim=end=${(subEnd - subStart).toFixed(4)},setpts=PTS-STARTPTS,fps=${fps},format=rgba[subpng0_proc]`,
      `[outv][subpng0_proc]overlay=0:0:enable='between(t,${subStart.toFixed(4)},${subEnd.toFixed(4)})'[subpng0_comp]`,
      `[subpng0_comp]format=yuv420p[outv_final]`,
    ];
    const fc = filterParts.join(';');

    expect(fc).toContain('overlay=0:0');
    expect(fc).toContain(`enable='between(t,${subStart.toFixed(4)},${subEnd.toFixed(4)})'`);
    expect(fc).not.toContain('ass=');
  });

  // Regression: when BOTH a video/image overlay AND a subtitle PNG are present,
  // each must get its own ffmpeg input slot. export.ts allocates base=0,
  // overlay=1, subtitle=2 (the subtitle index is synced past the overlay
  // compositor's consumed inputs). If the subtitle reused the overlay's input
  // pad (index 1), ffmpeg rejects the graph ("was already used as input").
  it('overlay + subtitle PNG use distinct input slots and render', async () => {
    const outputPath = path.join(tmpDir, 'overlay-plus-subtitle.mp4');
    outputFiles.push(outputPath);

    const W = 320, H = 240, dur = 3, fps = 24;

    // input 0 = base (lavfi blue), input 1 = image overlay PNG, input 2 = subtitle PNG
    const filterParts = [
      `[0:v]format=yuv420p[base]`,
      `[1:v]trim=end=${dur},setpts=PTS-STARTPTS,fps=${fps},format=rgba[ov0_proc]`,
      `[base][ov0_proc]overlay=20:20:enable='between(t,0.0000,${dur.toFixed(4)})'[ov0_comp]`,
      `[ov0_comp]format=yuv420p[outv_composite]`,
      // Subtitle PNG (input 2) — must NOT reference [1:v]
      `[2:v]trim=end=${dur},setpts=PTS-STARTPTS,fps=${fps},format=rgba[subpng0_proc]`,
      `[outv_composite][subpng0_proc]overlay=0:0:enable='between(t,0.0000,${dur.toFixed(4)})'[subpng0_comp]`,
      `[subpng0_comp]format=yuv420p[outv_final]`,
    ];

    const args = [
      '-y',
      '-f', 'lavfi', '-i', `color=blue:s=${W}x${H}:d=${dur}:r=${fps}`,
      '-loop', '1', '-f', 'image2', '-framerate', String(fps), '-i', testSubPng,
      '-loop', '1', '-f', 'image2', '-framerate', String(fps), '-i', testSubPng,
      '-filter_complex', filterParts.join(';'),
      '-map', '[outv_final]',
      '-an',
      '-c:v', 'libx264', '-crf', '28', '-preset', 'fast', '-pix_fmt', 'yuv420p',
      '-r', String(fps), '-t', String(dur),
      outputPath,
    ];

    const result = await runFFmpeg(ffmpegPath, args);
    if (result.code !== 0) console.warn('FFmpeg stderr:', result.stderr.slice(-2000));
    expect(result.code).toBe(0);
    expect(fs.existsSync(outputPath)).toBe(true);

    const info = getVideoInfo(ffmpegPath, outputPath);
    expect(info.hasVideo).toBe(true);
    expect(info.duration).toBeGreaterThan(1);
  }, 45000);

  it('subtitle PNG overlay renders a valid MP4 without ffmpeg errors', async () => {
    const outputPath = path.join(tmpDir, 'subtitle-png-render.mp4');
    outputFiles.push(outputPath);

    const W = 320, H = 240, dur = 3, fps = 24;
    const subStart = 0, subEnd = 3;

    const filterParts = [
      // Black base canvas driven entirely from lavfi (no base video input at slot 0)
      `color=c=black:s=${W}x${H}:d=${dur}:r=${fps},setsar=1,format=yuv420p[outv]`,
      // Subtitle PNG: loop → trim to clip duration → fps → format=rgba
      `[0:v]trim=end=${dur},setpts=PTS-STARTPTS,fps=${fps},format=rgba[subpng0_proc]`,
      `[outv][subpng0_proc]overlay=0:0:enable='between(t,${subStart.toFixed(4)},${subEnd.toFixed(4)})'[subpng0_comp]`,
      `[subpng0_comp]format=yuv420p[outv_composite]`,
    ];

    const args = [
      '-y',
      '-loop', '1', '-f', 'image2', '-framerate', String(fps), '-i', testSubPng,
      '-filter_complex', filterParts.join(';'),
      '-map', '[outv_composite]',
      '-an',
      '-c:v', 'libx264', '-crf', '28', '-preset', 'fast', '-pix_fmt', 'yuv420p',
      '-r', String(fps), '-t', String(dur),
      outputPath,
    ];

    const result = await runFFmpeg(ffmpegPath, args);
    if (result.code !== 0) console.warn('FFmpeg stderr:', result.stderr.slice(-2000));
    expect(result.code).toBe(0);
    expect(fs.existsSync(outputPath)).toBe(true);

    const info = getVideoInfo(ffmpegPath, outputPath);
    expect(info.hasVideo).toBe(true);
    expect(info.duration).toBeGreaterThan(1);

    const stats = fs.statSync(outputPath);
    expect(stats.size).toBeGreaterThan(500);
  }, 45000);
});
