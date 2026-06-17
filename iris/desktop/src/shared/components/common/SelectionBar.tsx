/**
 * SelectionBar - Selection mode toolbar for multi-select operations
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckSquare, Square, Trash2, XCircle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface SelectionBarProps {
  isSelectionMode: boolean;
  selectedCount: number;
  totalCount: number;
  onToggleSelectionMode: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDeleteSelected: () => void;
}

export const SelectionBar = memo(function SelectionBar({
  isSelectionMode,
  selectedCount,
  totalCount,
  onToggleSelectionMode,
  onSelectAll,
  onDeselectAll,
  onDeleteSelected,
}: SelectionBarProps) {
  const { t } = useTranslation('common');
  return (
    <div className="flex items-center gap-2">
      {isSelectionMode && (
        <>
          <button
            onClick={onSelectAll}
            disabled={selectedCount === totalCount}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm transition-colors',
              selectedCount === totalCount
                ? 'bg-zinc-800/50 border-zinc-700 text-zinc-500 cursor-not-allowed'
                : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300 hover:text-white'
            )}
          >
            <CheckSquare size={16} />
            <span>{t('buttons.selectAll')}</span>
          </button>
          <button
            onClick={onDeleteSelected}
            disabled={selectedCount === 0}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm transition-colors',
              selectedCount > 0
                ? 'bg-red-500/20 hover:bg-red-500/30 border-red-500/30 text-red-400 hover:text-red-300'
                : 'bg-zinc-800/50 border-zinc-700 text-zinc-500 cursor-not-allowed'
            )}
          >
            <Trash2 size={16} />
            <span>
              {t('buttons.delete')}
              {selectedCount > 0 && ` (${selectedCount})`}
            </span>
          </button>
          <button
            onClick={onDeselectAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-300 hover:text-white text-sm transition-colors"
          >
            <XCircle size={16} />
            <span>{t('buttons.cancel')}</span>
          </button>
        </>
      )}
      <button
        onClick={onToggleSelectionMode}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm transition-colors',
          isSelectionMode
            ? 'bg-white/20 border-white/30 text-white ring-1 ring-white/30'
            : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300 hover:text-white'
        )}
      >
        {isSelectionMode ? <CheckSquare size={16} /> : <Square size={16} />}
        <span>{t('buttons.select')}</span>
      </button>
    </div>
  );
});

export default SelectionBar;
