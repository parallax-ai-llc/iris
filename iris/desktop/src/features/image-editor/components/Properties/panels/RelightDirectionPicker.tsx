/**
 * RelightDirectionPicker - 3x3 light direction grid for the Relight panel.
 *
 * Center = auto, edges = left/right/top/bottom. Diagonal cells are shown
 * disabled (IC-Light direction control is not wired yet, see relight-design.md).
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Sparkles } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { RelightDirection } from '@/features/image-editor/lib/relightPrompt';

type Cell = RelightDirection | 'diagonal';

const GRID: Cell[] = [
  'diagonal', 'top', 'diagonal',
  'left', 'auto', 'right',
  'diagonal', 'bottom', 'diagonal',
];

const ICONS: Record<RelightDirection, typeof ArrowUp> = {
  auto: Sparkles,
  top: ArrowDown,
  bottom: ArrowUp,
  left: ArrowRight,
  right: ArrowLeft,
};

interface RelightDirectionPickerProps {
  value: RelightDirection;
  onChange: (direction: RelightDirection) => void;
  disabled?: boolean;
}

export const RelightDirectionPicker = memo(function RelightDirectionPicker({
  value,
  onChange,
  disabled,
}: RelightDirectionPickerProps) {
  const { t } = useTranslation('editor');

  return (
    <div
      role="group"
      aria-label={t('relight.direction.label')}
      className="grid grid-cols-3 gap-1 w-28"
    >
      {GRID.map((cell, index) => {
        if (cell === 'diagonal') {
          return (
            <button
              key={index}
              type="button"
              disabled
              title={t('relight.direction.diagonalSoon')}
              aria-label={t('relight.direction.diagonalSoon')}
              className="h-8 rounded-md bg-zinc-800/40 cursor-not-allowed"
            />
          );
        }
        const Icon = ICONS[cell];
        const selected = value === cell;
        const label = t(`relight.direction.${cell}`);
        return (
          <button
            key={index}
            type="button"
            onClick={() => onChange(cell)}
            disabled={disabled}
            aria-pressed={selected}
            aria-label={label}
            title={label}
            className={cn(
              'h-8 flex items-center justify-center rounded-md transition-colors',
              selected
                ? 'bg-white/15 text-white ring-1 ring-white/30'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
});
