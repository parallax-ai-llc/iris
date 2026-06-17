/**
 * VideoEditorMenuBar - Photoshop-style menu bar for video editor
 * File, Edit, View, Tools
 */

import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn, getModifierKey } from '@/shared/lib/utils';
import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import { useVideoStore } from '@/features/videos/stores/video.store';
import { useConnectionStore } from '@/shared/stores/connection.store';

// ==================== Types ====================

interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

interface MenuDef {
  id: string;
  label: string;
  items: MenuItem[];
}

// ==================== MenuDropdown ====================

const MenuDropdown = memo(function MenuDropdown({
  menu,
  isOpen,
  onOpen,
  onClose,
  onHover,
  anyMenuOpen,
}: {
  menu: MenuDef;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onHover: () => void;
  anyMenuOpen: boolean;
}) {
  return (
    <div className="relative">
      <button
        onClick={onOpen}
        onMouseEnter={() => { if (anyMenuOpen) onHover(); }}
        className={cn(
          'px-3 h-10 text-xs transition-colors',
          isOpen
            ? 'bg-zinc-700 text-white'
            : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
        )}
      >
        {menu.label}
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-50 w-64 py-1 bg-zinc-800 rounded-b-lg shadow-xl border border-zinc-700 border-t-0">
          {menu.items.map((item) => {
            if (item.separator) {
              return <div key={item.id} className="my-1 border-t border-zinc-700" />;
            }
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.action && !item.disabled) {
                    item.action();
                    onClose();
                  }
                }}
                disabled={item.disabled}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-1.5 text-xs text-left transition-colors',
                  item.disabled
                    ? 'text-zinc-600 cursor-not-allowed'
                    : 'text-zinc-300 hover:bg-zinc-700 hover:text-white'
                )}
              >
                <span>{item.label}</span>
                {item.shortcut && (
                  <span className="text-zinc-600 text-[10px]">{item.shortcut}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

// ==================== Props ====================

export interface VideoEditorMenuBarProps {
  onNew: () => void;
  onOpenProject: () => void;
  onClose: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onGenerateAutoCaptions: () => void;
  onImportSubtitles: () => void;
  onExportSubtitlesSrt: () => void;
  onExportSubtitlesVtt: () => void;
  onSilenceRemoval: () => void;
  hasAsset: boolean;
  hasMediaClips: boolean;
  hasSubtitleClips: boolean;
  isSaving: boolean;
}

// ==================== Component ====================

export const VideoEditorMenuBar = memo(function VideoEditorMenuBar({
  onNew,
  onOpenProject,
  onClose,
  onSave,
  onSaveAs,
  onGenerateAutoCaptions,
  onImportSubtitles,
  onExportSubtitlesSrt,
  onExportSubtitlesVtt,
  onSilenceRemoval,
  hasAsset,
  hasMediaClips,
  hasSubtitleClips,
  isSaving,
}: VideoEditorMenuBarProps) {
  const {
    undo,
    redo,
    selectAll,
    deleteSelected,
    rippleDelete,
    duplicateSelectedClips,
    copyClips,
    pasteClips,
    zoomIn,
    zoomOut,
    snapToGrid,
    toggleSnapToGrid,
    showWaveforms,
    toggleWaveforms,
    selection,
    history,
    historyIndex,
  } = useEditorStore();

  const hasClipClipboard = useEditorStore((s) => !!s.clipClipboard);
  const noSelection = selection.clipIds.length === 0;

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const openToolModal = useVideoStore((s) => s.openToolModal);
  const isProcessing = useVideoStore((s) => s.isEditing);
  const isServerDisabled = !useConnectionStore((s) => s.isServerConnected);
  const aiDisabled = isProcessing || isServerDisabled;

  const { t } = useTranslation('menus');

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenuId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

  const closeMenu = useCallback(() => setOpenMenuId(null), []);

  const mod = getModifierKey();

  const menus: MenuDef[] = [
    {
      id: 'file',
      label: t('file.label'),
      items: [
        { id: 'new', label: t('file.newProject'), shortcut: `${mod}+N`, action: onNew },
        { id: 'open', label: t('file.openProject'), shortcut: `${mod}+O`, action: onOpenProject },
        { id: 'sep0', label: '', separator: true },
        { id: 'save', label: t('file.saveProject'), shortcut: `${mod}+S`, action: onSave, disabled: isSaving },
        { id: 'saveAs', label: t('file.saveProjectAs'), shortcut: `${mod}+Shift+S`, action: onSaveAs, disabled: isSaving },
        { id: 'sep1', label: '', separator: true },
        { id: 'close', label: t('file.goBack'), shortcut: 'Esc', action: onClose },
      ],
    },
    {
      id: 'edit',
      label: t('edit.label'),
      items: [
        { id: 'undo', label: t('edit.undo'), shortcut: `${mod}+Z`, action: undo, disabled: !canUndo },
        { id: 'redo', label: t('edit.redo'), shortcut: `${mod}+Shift+Z`, action: redo, disabled: !canRedo },
        { id: 'sep1', label: '', separator: true },
        { id: 'cut', label: t('edit.cut'), shortcut: `${mod}+X`, action: () => { copyClips(); deleteSelected(); }, disabled: noSelection },
        { id: 'copy', label: t('edit.copy'), shortcut: `${mod}+C`, action: copyClips, disabled: noSelection },
        { id: 'paste', label: t('edit.paste'), shortcut: `${mod}+V`, action: pasteClips, disabled: !hasClipClipboard },
        { id: 'duplicate', label: t('edit.duplicate'), shortcut: `${mod}+D`, action: duplicateSelectedClips, disabled: noSelection },
        { id: 'sep2', label: '', separator: true },
        { id: 'selectAll', label: t('edit.selectAll'), shortcut: `${mod}+A`, action: selectAll },
        { id: 'delete', label: t('edit.deleteSelected'), shortcut: 'Del', action: deleteSelected, disabled: noSelection },
        { id: 'rippleDelete', label: t('edit.rippleDelete'), shortcut: 'Shift+Del', action: rippleDelete, disabled: noSelection },
      ],
    },
    {
      id: 'view',
      label: t('view.label'),
      items: [
        { id: 'zoomIn', label: t('view.zoomIn'), shortcut: `${mod}++`, action: zoomIn },
        { id: 'zoomOut', label: t('view.zoomOut'), shortcut: `${mod}+-`, action: zoomOut },
        { id: 'sep1', label: '', separator: true },
        { id: 'snap', label: `${snapToGrid ? '✓ ' : ''}${t('view.snapToGrid')}`, action: toggleSnapToGrid },
        { id: 'waveforms', label: `${showWaveforms ? '✓ ' : ''}${t('view.showWaveforms')}`, action: toggleWaveforms },
      ],
    },
    {
      id: 'subtitles',
      label: t('subtitles.label'),
      items: [
        { id: 'generateCaptions', label: t('subtitles.generateAutoCaptions'), action: onGenerateAutoCaptions, disabled: !hasMediaClips || isServerDisabled },
        { id: 'sep0', label: '', separator: true },
        { id: 'importSub', label: t('subtitles.importSubtitles'), action: onImportSubtitles },
        { id: 'sep1', label: '', separator: true },
        { id: 'exportSrt', label: t('subtitles.exportSrt'), action: onExportSubtitlesSrt, disabled: !hasSubtitleClips },
        { id: 'exportVtt', label: t('subtitles.exportVtt'), action: onExportSubtitlesVtt, disabled: !hasSubtitleClips },
      ],
    },
    {
      id: 'ai',
      label: t('ai.label'),
      items: [
        { id: 'silenceRemoval', label: t('ai.silenceRemoval'), action: onSilenceRemoval, disabled: !hasMediaClips },
      ],
    },
    ...(hasAsset ? [{
      id: 'tools',
      label: t('tools.label'),
      items: [
        { id: 'upscale', label: t('tools.upscale'), action: () => openToolModal('upscale'), disabled: aiDisabled },
        { id: 'motionControl', label: t('tools.motionControl'), action: () => openToolModal('motion-control'), disabled: aiDisabled },
        { id: 'inpaint', label: t('tools.inpaint'), action: () => openToolModal('inpaint'), disabled: aiDisabled },
        { id: 'sep1', label: '', separator: true },
        { id: 'cut', label: t('tools.cut'), action: () => openToolModal('cut'), disabled: aiDisabled },
      ],
    }] : []),
  ];

  return (
    <div
      ref={menuBarRef}
      className="flex items-center h-full select-none"
    >
      {menus.map((menu) => (
        <MenuDropdown
          key={menu.id}
          menu={menu}
          isOpen={openMenuId === menu.id}
          onOpen={() => setOpenMenuId(openMenuId === menu.id ? null : menu.id)}
          onClose={closeMenu}
          onHover={() => setOpenMenuId(menu.id)}
          anyMenuOpen={openMenuId !== null}
        />
      ))}
    </div>
  );
});

export default VideoEditorMenuBar;
