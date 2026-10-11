/**
 * CloseTabConfirmDialog - the single "unsaved changes" dialog for every image
 * editor close path (tab X, Ctrl+W, File > Close Tab, Back / Esc on a dirty
 * local file). Driven by `editorTabs.pendingClose`; the decision to ask lives
 * in `editorTabs.store` (`requestCloseTab` / `requestLeaveEditor`).
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/shared/components/ui/Modal';
import { useEditorTabsStore } from '@/features/image-editor/stores/editorTabs.store';

interface CloseTabConfirmDialogProps {
  /** "Save and Close": save the (active) pending tab, then close it. */
  onSaveAndClose: (tabId: string) => void;
}

export const CloseTabConfirmDialog = memo(function CloseTabConfirmDialog({ onSaveAndClose }: CloseTabConfirmDialogProps) {
  const { t } = useTranslation('common');
  const pendingClose = useEditorTabsStore((s) => s.pendingClose);
  const confirmPendingClose = useEditorTabsStore((s) => s.confirmPendingClose);
  const cancelPendingClose = useEditorTabsStore((s) => s.cancelPendingClose);

  const leaving = pendingClose?.thenHide ?? false;

  return (
    <ConfirmDialog
      isOpen={!!pendingClose}
      onClose={cancelPendingClose}
      onConfirm={confirmPendingClose}
      title={leaving ? t('editor.localFileWarning.imageTitle') : t('editor.closeTabWarning.title')}
      message={leaving ? t('editor.localFileWarning.imageMessage') : t('editor.closeTabWarning.message')}
      confirmText={t('editor.closeTabWarning.closeWithoutSaving')}
      cancelText={t('buttons.cancel')}
      variant="danger"
      secondaryAction={
        leaving
          ? undefined
          : {
              text: t('editor.closeTabWarning.saveAndClose'),
              onClick: () => {
                const tabId = pendingClose?.tabId;
                cancelPendingClose();
                if (tabId) onSaveAndClose(tabId);
              },
            }
      }
    />
  );
});

export default CloseTabConfirmDialog;
