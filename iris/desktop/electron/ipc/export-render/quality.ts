/**
 * Encoder parameters per output format / codec / quality preset.
 * Moved from electron/ipc/export.ts.
 */

// ==================== Quality Presets ====================

// ProRes profile name → FFmpeg profile number
const PRORES_PROFILE_MAP: Record<string, string> = {
  '422-proxy': '0',
  '422-lt': '1',
  '422': '2',
  '422-hq': '3',
  '4444': '4',
};

export function getQualityParams(
  quality: string,
  format: string,
  codec?: string,
  proResProfile?: string,
): string[] {
  const params: string[] = [];

  if (format === 'gif') {
    // GIF: only loop flag — fps/palette filters are merged into the main filter chain in buildFFmpegArgs
    params.push('-loop', '0');
    return params;
  }

  if (format === 'webm' || codec === 'vp9') {
    params.push('-c:v', 'libvpx-vp9', '-c:a', 'libopus');
    switch (quality) {
      case 'low':    params.push('-crf', '35', '-b:v', '1M'); break;
      case 'medium': params.push('-crf', '30', '-b:v', '2M'); break;
      case 'high':   params.push('-crf', '25', '-b:v', '4M'); break;
      case 'ultra':  params.push('-crf', '20', '-b:v', '8M'); break;
    }
    return params;
  }

  if (format === 'mov' && codec === 'prores') {
    const profileNum = PRORES_PROFILE_MAP[proResProfile ?? '422'] ?? '2';
    params.push('-c:v', 'prores_ks', '-profile:v', profileNum, '-c:a', 'pcm_s16le');
    return params; // ProRes has no CRF; quality is determined by profile
  }

  // H.265 (HEVC)
  if (codec === 'h265') {
    params.push('-c:v', 'libx265', '-c:a', 'aac');
    switch (quality) {
      case 'low':    params.push('-crf', '32', '-preset', 'fast'); break;
      case 'medium': params.push('-crf', '28', '-preset', 'medium'); break;
      case 'high':   params.push('-crf', '22', '-preset', 'slow'); break;
      case 'ultra':  params.push('-crf', '18', '-preset', 'slow'); break;
    }
    // Force standard 8-bit 4:2:0 chroma so the file plays in QuickTime/VLC/web.
    // Without this, color filters (curves/eq) push the stream to RGB and many
    // players refuse to decode the resulting file.
    params.push('-pix_fmt', 'yuv420p');
    return params;
  }

  // H.264 (default for mp4/mov)
  params.push('-c:v', 'libx264', '-c:a', 'aac');
  switch (quality) {
    case 'low':    params.push('-crf', '28', '-preset', 'fast'); break;
    case 'medium': params.push('-crf', '23', '-preset', 'medium'); break;
    case 'high':   params.push('-crf', '18', '-preset', 'slow'); break;
    case 'ultra':  params.push('-crf', '15', '-preset', 'slow'); break;
  }
  // See note above — required for broad player compatibility, especially when
  // the filter chain (curves/eq) emits RGB intermediates.
  params.push('-pix_fmt', 'yuv420p');
  return params;
}
