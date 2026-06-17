/**
 * EditorTabBar - Tab bar for multiple open image editors
 * Sits between TitleBar and the editor header
 */

import { memo, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { useEditorTabsStore, type EditorTab } from '@/features/image-editor/stores/editorTabs.store';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { ConfirmDialog } from '@/shared/components/ui/Modal';
import { X, ImageIcon } from 'lucide-react';
import { useCachedAssetUrl } from '@/shared/hooks/useCachedAssetUrl';
import { openImageFile } from '@/features/image-editor/lib/openImageFile';

interface TabItemProps {
  tab: EditorTab;
  isActive: boolean;
  onActivate: () => void;
  onClose: (e: React.MouseEvent) => void;
}

const TabItem = memo(function TabItem({ tab, isActive, onActivate, onClose }: TabItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  const { url: thumbnailUrl } = useCachedAssetUrl(tab.asset, {
    type: 'thumbnail',
    enabled: !!tab.asset,
  });

  return (
    <div
      onClick={onActivate}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'group flex items-center gap-1.5 px-3 h-full min-w-[120px] max-w-[200px] cursor-pointer',
        'border-r border-zinc-800 transition-colors select-none',
        isActive
          ? 'bg-zinc-800 text-white border-b-2 border-b-white/30'
          : 'bg-zinc-950 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
      )}
    >
      {/* Thumbnail */}
      <div className="w-4 h-4 rounded-sm overflow-hidden flex-shrink-0 bg-zinc-700">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-full h-full p-0.5 text-zinc-500" />
        )}
      </div>

      {/* File name */}
      <span className="text-xs truncate flex-1">{tab.asset.name}</span>

      {/* Dirty indicator / Close button */}
      <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
        {isHovered || isActive ? (
          <button
            onClick={onClose}
            className={cn(
              'p-0.5 rounded-sm transition-colors',
              'hover:bg-zinc-600 hover:text-white',
              isActive ? 'text-zinc-400' : 'text-zinc-600'
            )}
            title="Close tab"
          >
            <X className="w-3 h-3" />
          </button>
        ) : tab.isDirty ? (
          <span className="w-2 h-2 rounded-full bg-white/60" title="Unsaved changes" />
        ) : null}
      </div>
    </div>
  );
});

export const EditorTabBar = memo(function EditorTabBar() {
  const { t } = useTranslation('common');
  const tabs = useEditorTabsStore(state => state.tabs);
  const activeTabId = useEditorTabsStore(state => state.activeTabId);
  const switchTab = useEditorTabsStore(state => state.switchTab);
  const closeTab = useEditorTabsStore(state => state.closeTab);
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null);

  const handleClose = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const tab = tabs.find(t => t.id === tabId);
    const isLocalAsset = tab?.asset.id.startsWith('local-') ?? false;
    // Check both synced isDirty and live store (active tab) for reliability
    const isLiveDirty = tab?.id === activeTabId && useImageEditorStore.getState().isDirty;
    const isDirtyCheck = (tab?.isDirty ?? false) || isLiveDirty;
    if (tab && (isDirtyCheck || isLocalAsset)) {
      setPendingCloseTabId(tabId);
      return;
    }
    closeTab(tabId);
  }, [closeTab, tabs, activeTabId]);

  // Drag-and-drop to open image as new tab
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(f => f.type.startsWith('image/') || f.name.toLowerCase().endsWith('.psd'));
    if (imageFiles.length === 0) return;

    for (const file of imageFiles) {
      const fileData = await file.arrayBuffer();
      await openImageFile(fileData, file.name);
    }
  }, []);

  if (tabs.length === 0 && !isDragOver) return null;

  return (
    <>
    <ConfirmDialog
      isOpen={!!pendingCloseTabId}
      onClose={() => setPendingCloseTabId(null)}
      onConfirm={() => {
        const id = pendingCloseTabId!;
        setPendingCloseTabId(null);
        closeTab(id);
      }}
      title={t('editor.closeTabWarning.title')}
      message={t('editor.closeTabWarning.message')}
      confirmText={t('editor.closeTabWarning.closeWithoutSaving')}
      cancelText={t('buttons.cancel')}
      variant="danger"
    />

    <div
      className={cn(
        'flex items-end h-8 bg-zinc-950 border-b border-zinc-800 overflow-x-auto scrollbar-none',
        isDragOver && 'bg-blue-500/10 border-b-blue-400'
      )}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {tabs.map(tab => (
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onActivate={() => switchTab(tab.id)}
          onClose={(e) => handleClose(e, tab.id)}
        />
      ))}
      {isDragOver && (
        <div className="flex items-center gap-1.5 px-3 h-full text-blue-400">
          <ImageIcon className="w-3.5 h-3.5" />
          <span className="text-xs">Drop to open</span>
        </div>
      )}
    </div>
    </>
  );
});

export default EditorTabBar;
