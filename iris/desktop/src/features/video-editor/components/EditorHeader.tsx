/**
 * EditorHeader - Video editor header toolbar with title, undo/redo, tools, and actions
 */

import { memo } from 'react';
import {
  X,
  Save,
  Undo,
  Redo,
  Download,
  Keyboard,
  Loader2,
  Maximize2,
  Move,
  Paintbrush,
  Scissors,
  Captions,
  Sparkles,
  Crop,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { VideoToolsMenu } from './VideoToolsMenu';
import { useConnectionStore } from '@/shared/stores/connection.store';

export interface EditorHeaderProps {
  title?: string;
  assetId?: string;
  onClose?: () => void;
  onSave?: () => void;
  onExport?: () => void;
  onShowShortcuts: () => void;
  onUpscale?: () => void;
  onMotionControl?: () => void;
  onInpaint?: () => void;
  onCut?: () => void;
  onDownload?: () => void;
  onAutoCaptions?: () => void;
  onAutoCut?: () => void;
  onAutoReframe?: () => void;
  isSaving: boolean;
  isProcessing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export const EditorHeader = memo(function EditorHeader({
  title,
  assetId,
  onClose,
  onSave,
  onExport,
  onShowShortcuts,
  onUpscale,
  onMotionControl,
  onInpaint,
  onCut,
  onDownload,
  onAutoCaptions,
  onAutoCut,
  onAutoReframe,
  isSaving,
  isProcessing,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: EditorHeaderProps) {
  const isServerDisabled = !useConnectionStore((s) => s.isServerConnected);
  const aiDisabled = isProcessing || isServerDisabled;
  const { t } = useTranslation('editor');

  return (
    <div className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4">
      {/* Left: Title and close */}
      <div className="flex items-center gap-3">
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded transition-colors"
            title={t('header.closeEditor')}
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        )}
        <h1 className="text-white font-medium truncate max-w-[300px]">
          {title || t('header.title')}
        </h1>
      </div>

      {/* Center: Undo/Redo */}
      <div className="flex items-center gap-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={cn(
            'p-2 rounded transition-colors',
            canUndo
              ? 'hover:bg-zinc-800 text-zinc-300'
              : 'text-zinc-600 cursor-not-allowed'
          )}
          title={t('undo')}
        >
          <Undo className="w-4 h-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={cn(
            'p-2 rounded transition-colors',
            canRedo
              ? 'hover:bg-zinc-800 text-zinc-300'
              : 'text-zinc-600 cursor-not-allowed'
          )}
          title={t('redo')}
        >
          <Redo className="w-4 h-4" />
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* AI Tools Dropdown */}
        {assetId && (
          <>
            <VideoToolsMenu
              options={[
                {
                  id: 'upscale',
                  label: t('tools.upscale.label'),
                  description: t('tools.upscale.description'),
                  icon: <Maximize2 className="w-4 h-4" />,
                  action: () => onUpscale?.(),
                },
                {
                  id: 'motion-control',
                  label: t('tools.motionControl.label'),
                  description: t('tools.motionControl.description'),
                  icon: <Move className="w-4 h-4" />,
                  action: () => onMotionControl?.(),
                },
                {
                  id: 'inpaint',
                  label: t('tools.inpaint.label'),
                  description: t('tools.inpaint.description'),
                  icon: <Paintbrush className="w-4 h-4" />,
                  action: () => onInpaint?.(),
                },
                {
                  id: 'cut',
                  label: t('tools.cut.label'),
                  description: t('tools.cut.description'),
                  icon: <Scissors className="w-4 h-4" />,
                  action: () => onCut?.(),
                },
              ]}
              disabled={aiDisabled}
            />
            <div className="w-px h-6 bg-zinc-700" />
          </>
        )}

        {/* Auto Captions */}
        {assetId && onAutoCaptions && (
          <button
            onClick={onAutoCaptions}
            disabled={aiDisabled}
            className={cn(
              'p-2 rounded transition-colors',
              aiDisabled ? 'text-zinc-600 cursor-not-allowed' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'
            )}
            title={isServerDisabled ? t('header.serverRequired') : t('header.autoCaptions')}
          >
            <Captions className="w-4 h-4" />
          </button>
        )}

        {/* AutoCut */}
        {assetId && onAutoCut && (
          <button
            onClick={onAutoCut}
            disabled={aiDisabled}
            className={cn(
              'p-2 rounded transition-colors',
              aiDisabled ? 'text-zinc-600 cursor-not-allowed' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'
            )}
            title={isServerDisabled ? t('header.serverRequired') : t('header.autocut')}
          >
            <Sparkles className="w-4 h-4" />
          </button>
        )}

        {/* Auto-Reframe */}
        {assetId && onAutoReframe && (
          <button
            onClick={onAutoReframe}
            disabled={aiDisabled}
            className={cn(
              'p-2 rounded transition-colors',
              aiDisabled ? 'text-zinc-600 cursor-not-allowed' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'
            )}
            title={isServerDisabled ? t('header.serverRequired') : t('header.autoReframe')}
          >
            <Crop className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={onShowShortcuts}
          className="p-2 hover:bg-zinc-800 rounded transition-colors text-zinc-400"
          title={t('header.keyboardShortcuts')}
        >
          <Keyboard className="w-4 h-4" />
        </button>

        {/* Download */}
        {assetId && (
          <button
            onClick={onDownload}
            disabled={isProcessing}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded transition-colors text-sm',
              isProcessing
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white'
            )}
            title={t('header.downloadVideo')}
          >
            <Download className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={onSave}
          disabled={isSaving}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded transition-colors',
            isSaving
              ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
              : 'bg-zinc-800 hover:bg-zinc-700 text-white'
          )}
          title={t('header.saveProject')}
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span className="text-sm">{t('header.save')}</span>
        </button>
        <button
          onClick={onExport}
          className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white rounded transition-colors text-sm font-medium"
          title={t('header.exportVideo')}
        >
          <Download className="w-4 h-4" />
          {t('header.export')}
        </button>
      </div>
    </div>
  );
});
