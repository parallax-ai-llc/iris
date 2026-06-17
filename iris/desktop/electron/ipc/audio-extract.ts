/**
 * Audio Extract IPC handler
 * Extracts audio from a LOCAL video file using FFmpeg.
 * Input: local file path (e.g. proxy path already on disk).
 * No download needed — the file is already on the user's machine.
 */

import { ipcMain } from 'electron';
import path from 'path';
import os from 'os';
import { existsSync } from 'fs';
import { unlink, readFile } from 'fs/promises';
import { spawn, type ChildProcess } from 'child_process';
import { findFFmpegPathSync } from './ffmpeg-resolver';

const findFFmpegPath = findFFmpegPathSync;

let activeProcess: ChildProcess | null = null;

export function setupAudioExtractHandlers(): void {
  ipcMain.handle(
    'audio:extract',
    async (_, { inputPath }: { inputPath: string }): Promise<{
      success: boolean;
      audioBuffer?: ArrayBuffer;
      error?: string;
    }> => {
      const ffmpegPath = findFFmpegPath();
      const outputPath = path.join(os.tmpdir(), `audio-${Date.now()}.wav`);

      try {
        if (!existsSync(inputPath)) {
          return { success: false, error: `File not found: ${inputPath}` };
        }

        await new Promise<void>((resolve, reject) => {
          const stderrChunks: string[] = [];
          // WAV PCM 16-bit, 16kHz mono — lossless, no codec delay/priming.
          // Avoids mp3's encoder delay that can cause cumulative timestamp drift.
          activeProcess = spawn(ffmpegPath, [
            '-i', inputPath,
            '-vn', '-acodec', 'pcm_s16le',
            '-ar', '16000', '-ac', '1',
            '-y', outputPath,
          ], { windowsHide: true });

          activeProcess.stderr?.on('data', (chunk: Buffer) => {
            stderrChunks.push(chunk.toString());
          });

          activeProcess.on('close', (code) => {
            activeProcess = null;
            if (code === 0) {
              resolve();
            } else {
              const stderr = stderrChunks.join('').slice(-500);
              reject(new Error(`FFmpeg failed (code ${code}): ${stderr}`));
            }
          });
          activeProcess.on('error', (err) => { activeProcess = null; reject(err); });
        });

        const buf = await readFile(outputPath);
        return { success: true, audioBuffer: buf.buffer as ArrayBuffer };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Audio extraction failed' };
      } finally {
        await unlink(outputPath).catch(() => {});
      }
    }
  );

  // Separate audio from video — original quality, saved to persistent local file
  ipcMain.handle(
    'audio:separate',
    async (_, { inputPath, outputPath }: { inputPath: string; outputPath: string }): Promise<{
      success: boolean;
      outputPath?: string;
      error?: string;
    }> => {
      const ffmpegPath = findFFmpegPath();

      try {
        if (!existsSync(inputPath)) {
          return { success: false, error: `File not found: ${inputPath}` };
        }

        // Create output directory if needed
        const outDir = path.dirname(outputPath);
        if (!existsSync(outDir)) {
          const { mkdir } = require('fs/promises');
          await mkdir(outDir, { recursive: true });
        }

        await new Promise<void>((resolve, reject) => {
          const proc = spawn(ffmpegPath, [
            '-i', inputPath,
            '-vn', '-acodec', 'copy',  // Copy audio stream without re-encoding
            '-y', outputPath,
          ], { windowsHide: true });

          proc.on('close', (code) => {
            if (code === 0) resolve();
            else {
              // Fallback: re-encode if codec copy fails
              const proc2 = spawn(ffmpegPath, [
                '-i', inputPath,
                '-vn', '-acodec', 'aac', '-b:a', '192k',
                '-y', outputPath,
              ], { windowsHide: true });
              proc2.on('close', (code2) => {
                code2 === 0 ? resolve() : reject(new Error(`FFmpeg audio separate failed (code ${code2})`));
              });
              proc2.on('error', reject);
            }
          });
          proc.on('error', reject);
        });

        return { success: true, outputPath };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Audio separation failed' };
      }
    }
  );

  ipcMain.handle('audio:extractCancel', async () => {
    if (activeProcess) { activeProcess.kill('SIGTERM'); activeProcess = null; }
    return { cancelled: true };
  });
}
