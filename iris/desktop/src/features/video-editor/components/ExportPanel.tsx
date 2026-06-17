/**
 * ExportPanel - Video export configuration panel
 * Premiere Pro-style export dialog with format, codec, platform preset, and quality options
 *
 * Features:
 * - Platform presets (YouTube, Vimeo, Instagram, TikTok, etc.)
 * - Format selection (MP4, WebM, MOV, MXF, AVI, GIF, Image Sequence)
 * - Codec selection (H.264, H.265, ProRes, DNxHD, DNxHR, VP9, MPEG-2)
 * - Quality presets (Low, Medium, High, Ultra)
 * - Audio codec/bitrate/sample rate configuration
 * - Caption format selection (SRT, VTT, SCC, MCC, STL, DFXP)
 * - Image sequence format (PNG, JPEG, TIFF, DPX, OpenEXR)
 * - ProRes profile selection
 */

import { memo, useState, useCallback } from 'react';
import {
  Download,
  Monitor,
  Film,
  Music,
  Type,
  ChevronDown,
  ChevronRight,
  X,
  Check,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type {
  ExportFormat,
  ExportOptions,
  CaptionFormat,
  ImageSequenceFormat,
  PlatformPreset,
} from '@/types/videoProject.types';

interface ExportPanelProps {
  className?: string;
  projectName?: string;
  width?: number;
  height?: number;
  duration?: number;
  frameRate?: number;
  onExport?: (options: ExportOptions) => void;
  onClose?: () => void;
}

// Platform presets with their configurations
const PLATFORM_PRESETS: { id: PlatformPreset; name: string; width: number; height: number; codec: ExportOptions['codec']; format: ExportFormat }[] = [
  { id: 'youtube-4k', name: 'YouTube 4K', width: 3840, height: 2160, codec: 'h264', format: 'mp4' },
  { id: 'youtube-1080p', name: 'YouTube 1080p', width: 1920, height: 1080, codec: 'h264', format: 'mp4' },
  { id: 'youtube-720p', name: 'YouTube 720p', width: 1280, height: 720, codec: 'h264', format: 'mp4' },
  { id: 'vimeo-4k', name: 'Vimeo 4K', width: 3840, height: 2160, codec: 'h265', format: 'mp4' },
  { id: 'vimeo-1080p', name: 'Vimeo 1080p', width: 1920, height: 1080, codec: 'h264', format: 'mp4' },
  { id: 'facebook-1080p', name: 'Facebook 1080p', width: 1920, height: 1080, codec: 'h264', format: 'mp4' },
  { id: 'facebook-720p', name: 'Facebook 720p', width: 1280, height: 720, codec: 'h264', format: 'mp4' },
  { id: 'instagram-1080p', name: 'Instagram 1080p (16:9)', width: 1920, height: 1080, codec: 'h264', format: 'mp4' },
  { id: 'instagram-square', name: 'Instagram Square (1:1)', width: 1080, height: 1080, codec: 'h264', format: 'mp4' },
  { id: 'instagram-portrait', name: 'Instagram Portrait (4:5)', width: 1080, height: 1350, codec: 'h264', format: 'mp4' },
  { id: 'tiktok-1080p', name: 'TikTok (9:16)', width: 1080, height: 1920, codec: 'h264', format: 'mp4' },
  { id: 'twitter-720p', name: 'Twitter 720p', width: 1280, height: 720, codec: 'h264', format: 'mp4' },
  { id: 'broadcast-hd', name: 'Broadcast HD', width: 1920, height: 1080, codec: 'prores', format: 'mov' },
  { id: 'broadcast-uhd', name: 'Broadcast UHD', width: 3840, height: 2160, codec: 'prores', format: 'mov' },
];

const FORMAT_OPTIONS: { value: ExportFormat; label: string; description: string }[] = [
  { value: 'mp4', label: 'MP4', description: 'MPEG-4 Part 14 — Web/Mobile/Social' },
  { value: 'webm', label: 'WebM', description: 'Google WebM — Web Playback' },
  { value: 'mov', label: 'QuickTime (MOV)', description: 'Apple QuickTime — Professional' },
  { value: 'mxf', label: 'MXF', description: 'MXF OP1a — Broadcast Standard' },
  { value: 'avi', label: 'AVI', description: 'AVI — Windows Wrapper' },
  { value: 'gif', label: 'GIF', description: 'Animated GIF' },
  { value: 'image-sequence', label: 'Image Sequence', description: 'PNG/JPEG/TIFF/DPX/OpenEXR' },
  { value: 'wav', label: 'WAV', description: 'Waveform Audio — Uncompressed' },
  { value: 'aac', label: 'AAC', description: 'Advanced Audio Coding' },
  { value: 'flac', label: 'FLAC', description: 'Free Lossless Audio Codec' },
  { value: 'mp3', label: 'MP3', description: 'MPEG Audio Layer III' },
];

const CODEC_OPTIONS: { value: NonNullable<ExportOptions['codec']>; label: string; formats: ExportFormat[] }[] = [
  { value: 'h264', label: 'H.264 / AVC', formats: ['mp4', 'mov', 'mxf'] },
  { value: 'h265', label: 'H.265 / HEVC', formats: ['mp4', 'mov', 'mxf'] },
  { value: 'prores', label: 'Apple ProRes', formats: ['mov', 'mxf'] },
  { value: 'dnxhd', label: 'Avid DNxHD', formats: ['mxf', 'mov'] },
  { value: 'dnxhr', label: 'Avid DNxHR', formats: ['mxf', 'mov'] },
  { value: 'vp9', label: 'VP9', formats: ['webm'] },
  { value: 'mpeg-2', label: 'MPEG-2', formats: ['mp4', 'mxf', 'avi'] },
];

const QUALITY_OPTIONS = [
  { value: 'low' as const, label: 'Low', bitrate: '5 Mbps' },
  { value: 'medium' as const, label: 'Medium', bitrate: '15 Mbps' },
  { value: 'high' as const, label: 'High', bitrate: '35 Mbps' },
  { value: 'ultra' as const, label: 'Ultra', bitrate: '80 Mbps' },
];

const PRORES_PROFILES = ['422', '422-hq', '422-lt', '422-proxy', '4444'] as const;

const CAPTION_FORMATS: { value: CaptionFormat; label: string }[] = [
  { value: 'srt', label: 'SRT' },
  { value: 'vtt', label: 'WebVTT' },
  { value: 'scc', label: 'SCC' },
  { value: 'mcc', label: 'MCC' },
  { value: 'stl', label: 'STL' },
  { value: 'dfxp', label: 'DFXP/TTML' },
];

const IMAGE_SEQ_FORMATS: { value: ImageSequenceFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'tiff', label: 'TIFF' },
  { value: 'dpx', label: 'DPX' },
  { value: 'openexr', label: 'OpenEXR' },
];

const AUDIO_CODECS: { value: NonNullable<ExportOptions['audioCodec']>; label: string }[] = [
  { value: 'aac', label: 'AAC' },
  { value: 'wav', label: 'WAV (Uncompressed)' },
  { value: 'flac', label: 'FLAC (Lossless)' },
  { value: 'mp3', label: 'MP3' },
  { value: 'pcm', label: 'PCM' },
];

// Section component
const Section = memo(function Section({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: typeof Download;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-zinc-800">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-4 py-2 hover:bg-zinc-800/50 transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
        <Icon className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-medium text-white">{title}</span>
      </button>
      {open && <div className="px-4 pb-3 space-y-2">{children}</div>}
    </div>
  );
});

// Select component
const Select = memo(function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; description?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="text-xs text-zinc-400 min-w-[80px]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}{opt.description ? ` — ${opt.description}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
});

export const ExportPanel = memo(function ExportPanel({
  className,
  projectName = 'Untitled',
  width = 1920,
  height = 1080,
  duration = 0,
  frameRate = 30,
  onExport,
  onClose,
}: ExportPanelProps) {
  const [options, setOptions] = useState<ExportOptions>({
    format: 'mp4',
    quality: 'high',
    frameRate: 30,
    width,
    height,
    includeSubtitles: false,
    codec: 'h264',
  });
  const [selectedPreset, setSelectedPreset] = useState<PlatformPreset | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateOption = useCallback((key: keyof ExportOptions, value: any) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handlePresetSelect = useCallback((preset: typeof PLATFORM_PRESETS[0]) => {
    setSelectedPreset(preset.id);
    setOptions((prev) => ({
      ...prev,
      width: preset.width,
      height: preset.height,
      codec: preset.codec,
      format: preset.format,
      platformPreset: preset.id,
    }));
  }, []);

  const handleExport = useCallback(() => {
    onExport?.(options);
  }, [options, onExport]);

  const availableCodecs = CODEC_OPTIONS.filter((c) => c.formats.includes(options.format));
  const isVideoFormat = !['wav', 'aac', 'flac', 'mp3'].includes(options.format);

  return (
    <div className={cn('flex flex-col h-full bg-zinc-900 w-[380px]', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-zinc-400" />
          <h3 className="text-sm font-medium text-white">Export</h3>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Project info */}
      <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-800/30">
        <p className="text-xs text-zinc-400">
          {projectName} — {width}×{height} @ {frameRate}fps — {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
        {/* Platform Presets */}
        <Section title="Platform Presets" icon={Monitor}>
          <div className="grid grid-cols-2 gap-1">
            {PLATFORM_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handlePresetSelect(preset)}
                className={cn(
                  'px-2 py-1.5 rounded text-[10px] text-left transition-colors',
                  selectedPreset === preset.id
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-white border border-transparent'
                )}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </Section>

        {/* Format & Codec */}
        <Section title="Video" icon={Film}>
          <Select
            label="Format"
            value={options.format}
            options={FORMAT_OPTIONS}
            onChange={(v) => updateOption('format', v)}
          />
          {isVideoFormat && availableCodecs.length > 0 && (
            <Select
              label="Codec"
              value={options.codec ?? 'h264'}
              options={availableCodecs}
              onChange={(v) => updateOption('codec', v)}
            />
          )}
          {options.codec === 'prores' && (
            <Select
              label="Profile"
              value={options.proResProfile ?? '422'}
              options={PRORES_PROFILES.map((p) => ({ value: p, label: `ProRes ${p.toUpperCase()}` }))}
              onChange={(v) => updateOption('proResProfile', v)}
            />
          )}
          <Select
            label="Quality"
            value={options.quality}
            options={QUALITY_OPTIONS.map((q) => ({ value: q.value, label: `${q.label} (${q.bitrate})` }))}
            onChange={(v) => updateOption('quality', v)}
          />
          <Select
            label="Frame Rate"
            value={String(options.frameRate) as '24' | '30' | '60'}
            options={[
              { value: '24', label: '24 fps' },
              { value: '30', label: '30 fps' },
              { value: '60', label: '60 fps' },
            ]}
            onChange={(v) => updateOption('frameRate', Number(v) as 24 | 30 | 60)}
          />
          {/* Resolution */}
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-zinc-400 min-w-[80px]">Resolution</label>
            <div className="flex gap-1 flex-1">
              <input
                type="number"
                value={options.width}
                onChange={(e) => updateOption('width', Number(e.target.value))}
                className="w-1/2 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30"
              />
              <span className="text-zinc-500 text-xs self-center">×</span>
              <input
                type="number"
                value={options.height}
                onChange={(e) => updateOption('height', Number(e.target.value))}
                className="w-1/2 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
          </div>
          {/* Image Sequence Format */}
          {options.format === 'image-sequence' && (
            <Select
              label="Sequence"
              value={options.imageSequenceFormat ?? 'png'}
              options={IMAGE_SEQ_FORMATS}
              onChange={(v) => updateOption('imageSequenceFormat', v)}
            />
          )}
        </Section>

        {/* Audio */}
        <Section title="Audio" icon={Music} defaultOpen={false}>
          <Select
            label="Audio Codec"
            value={options.audioCodec ?? 'aac'}
            options={AUDIO_CODECS}
            onChange={(v) => updateOption('audioCodec', v)}
          />
          <Select
            label="Bitrate"
            value={String(options.audioBitrate ?? 256)}
            options={[
              { value: '128', label: '128 kbps' },
              { value: '192', label: '192 kbps' },
              { value: '256', label: '256 kbps' },
              { value: '320', label: '320 kbps' },
            ]}
            onChange={(v) => updateOption('audioBitrate', Number(v) as 128 | 192 | 256 | 320)}
          />
          <Select
            label="Sample Rate"
            value={String(options.audioSampleRate ?? 48000)}
            options={[
              { value: '44100', label: '44.1 kHz' },
              { value: '48000', label: '48 kHz' },
              { value: '96000', label: '96 kHz' },
            ]}
            onChange={(v) => updateOption('audioSampleRate', Number(v) as 44100 | 48000 | 96000)}
          />
        </Section>

        {/* Captions/Subtitles */}
        <Section title="Captions" icon={Type} defaultOpen={false}>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="includeSubtitles"
              checked={options.includeSubtitles}
              onChange={(e) => updateOption('includeSubtitles', e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700"
            />
            <label htmlFor="includeSubtitles" className="text-xs text-zinc-400">
              Include subtitles/captions
            </label>
          </div>
          {options.includeSubtitles && (
            <>
              <Select
                label="Subtitle"
                value={options.subtitleFormat ?? 'burned'}
                options={[
                  { value: 'burned', label: 'Burned-in' },
                  { value: 'srt', label: 'Separate SRT' },
                  { value: 'vtt', label: 'Separate VTT' },
                ]}
                onChange={(v) => updateOption('subtitleFormat', v)}
              />
              <Select
                label="Caption"
                value={options.captionFormat ?? 'srt'}
                options={CAPTION_FORMATS}
                onChange={(v) => updateOption('captionFormat', v)}
              />
            </>
          )}
        </Section>
      </div>

      {/* Export button */}
      <div className="px-4 py-3 border-t border-zinc-800">
        <button
          onClick={handleExport}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors"
        >
          <Check className="w-4 h-4" />
          Export
        </button>
      </div>
    </div>
  );
});

export default ExportPanel;
