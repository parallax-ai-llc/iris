/**
 * OpenDocumentsBar
 *
 * Back to Gallery (Esc) hides the image editor without closing its tabs. This
 * bar tells the user that documents are still open in the background (and how
 * many have unsaved changes) and brings the editor back on the last active tab.
 * Renders nothing when no tab is open.
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { isTabDirty, useEditorTabsStore } from '@/features/image-editor/stores/editorTabs.store';

export const OpenDocumentsBar = memo(function OpenDocumentsBar() {
  const { t } = useTranslation('images');
  const tabs = useEditorTabsStore((s) => s.tabs);
  const isEditorVisible = useEditorTabsStore((s) => s.isEditorVisible);
  const showEditor = useEditorTabsStore((s) => s.showEditor);

  if (tabs.length === 0 || isEditorVisible) return null;

  const unsaved = tabs.filter(isTabDirty).length;
  const names = tabs.map((tab) => tab.asset.name || tab.asset.id).join(', ');

  return (
    <div
      role="status"
      data-testid="open-documents-bar"
      className="mx-4 mt-3 px-4 py-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Layers className="w-5 h-5 text-white/60 flex-shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-white">
            <span>{t('openDocuments.label', { count: tabs.length })}</span>
            {unsaved > 0 && (
              <span className="text-xs text-amber-400">
                · {t('openDocuments.unsaved', { count: unsaved })}
              </span>
            )}
          </div>
          <div className="text-xs text-zinc-500 truncate">{names}</div>
        </div>
      </div>
      <button
        onClick={showEditor}
        className={cn(
          'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium',
          'bg-white text-zinc-900 hover:bg-zinc-200 transition-colors'
        )}
      >
        {t('openDocuments.return')}
      </button>
    </div>
  );
});
