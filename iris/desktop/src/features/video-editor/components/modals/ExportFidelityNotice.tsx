/**
 * ExportFidelityNotice — warns before export about preview-only edits that the
 * FFmpeg renderer cannot reproduce yet (see lib/exportWarnings.ts).
 */

import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import type { Track } from '@/types/editor.types';
import { collectExportWarnings } from '@/features/video-editor/lib/exportWarnings';

interface ExportFidelityNoticeProps {
  tracks: Track[];
  /** Subtitles are burned into the picture (animation loss only matters then). */
  burnsSubtitles: boolean;
}

export const ExportFidelityNotice = memo(function ExportFidelityNotice({
  tracks,
  burnsSubtitles,
}: ExportFidelityNoticeProps) {
  const { t } = useTranslation('editor');
  const warnings = useMemo(() => collectExportWarnings(tracks), [tracks]);

  const lines: string[] = [];
  if (warnings.speedKeyframes > 0) {
    lines.push(t('exportModal.fidelitySpeedKeyframes', { count: warnings.speedKeyframes }));
  }
  if (warnings.blurKeyframes > 0) {
    lines.push(t('exportModal.fidelityBlurKeyframes', { count: warnings.blurKeyframes }));
  }
  if (burnsSubtitles && warnings.subtitleAnimations > 0) {
    lines.push(t('exportModal.fidelitySubtitleAnimation', { count: warnings.subtitleAnimations }));
  }
  if (lines.length === 0) return null;

  return (
    <div
      className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg"
      data-testid="export-fidelity-notice"
    >
      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-amber-300 font-medium">{t('exportModal.fidelityTitle')}</p>
        <ul className="mt-1 space-y-0.5">
          {lines.map((line) => (
            <li key={line} className="text-xs text-amber-400/80">{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
});
