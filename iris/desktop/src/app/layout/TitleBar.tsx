import { useState, useEffect } from 'react';
import { Minus, Square, X, Maximize2, Settings, Bell, Bug } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { IrisLogo } from '@/shared/components/common/IrisLogo';
import { useUIStore } from '@/shared/stores/ui.store';
import { AnnouncementsModal } from '@/features/announcements/components';
import { ConfirmDialog } from '@/shared/components/ui/Modal';
import { BugReportModal } from '@/features/bug-report/components/BugReportModal';
import { useEditorTabsStore } from '@/features/image-editor/stores/editorTabs.store';
import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import { useIrisEditorStore } from 'iris-editor';

interface TitleBarProps {
  leftContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  hideNav?: boolean;
}

const platform = window.electronAPI?.app?.getPlatform?.() || navigator.platform || '';
const isWindows = platform === 'win32' || navigator.platform?.startsWith('Win');
const isMac = platform === 'darwin' || navigator.platform?.startsWith('Mac');
const isLinux = !isWindows && !isMac;

export function TitleBar({ leftContent, rightContent, hideNav }: TitleBarProps = {}) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isAnnouncementsOpen, setIsAnnouncementsOpen] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showProcessingWarning, setShowProcessingWarning] = useState(false);
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const { currentPage, setCurrentPage } = useUIStore();
  const { t } = useTranslation('common');

  useEffect(() => {
    if (window.electronAPI?.window) {
      window.electronAPI.window.isMaximized().then(setIsMaximized);
      window.electronAPI.window.onMaximizeChange(setIsMaximized);
      window.electronAPI.window.onCloseRequested(() => {
        const imageEditorDirty = useEditorTabsStore.getState().tabs.some((t) => t.isDirty);
        const videoEditorDirty = useVideoProjectStore.getState().isDirty;
        const isClientProcessing = useEditorStore.getState().clientProcessingInProgress;
        const workflowDirty = useIrisEditorStore.getState().isDirty;
        if (isClientProcessing) {
          setShowProcessingWarning(true);
          return;
        }
        if (imageEditorDirty || videoEditorDirty || workflowDirty) {
          setShowCloseConfirm(true);
        } else {
          window.electronAPI?.window?.forceClose();
        }
      });
    }
    return () => {
      window.electronAPI?.window?.removeCloseRequestedListener?.();
    };
  }, []);

  const handleMinimize = () => window.electronAPI?.window?.minimize();
  const handleMaximize = () => window.electronAPI?.window?.maximize();

  const handleClose = () => {
    const imageEditorDirty = useEditorTabsStore.getState().tabs.some((t) => t.isDirty);
    const videoEditorDirty = useVideoProjectStore.getState().isDirty;
    const isClientProcessing = useEditorStore.getState().clientProcessingInProgress;
    const workflowDirty = useIrisEditorStore.getState().isDirty;

    if (isClientProcessing) {
      setShowProcessingWarning(true);
      return;
    }

    if (imageEditorDirty || videoEditorDirty || workflowDirty) {
      setShowCloseConfirm(true);
    } else {
      window.electronAPI?.window?.close();
    }
  };

  const handleBugReport = async () => {
    try {
      const dataUrl = await window.electronAPI?.bugReport?.captureScreen();
      setScreenshotDataUrl(dataUrl || null);
    } catch {
      setScreenshotDataUrl(null);
    }
    setIsBugReportOpen(true);
  };

  const handleConfirmClose = () => {
    setShowCloseConfirm(false);

    if (window.electronAPI?.window) {
      window.electronAPI.window.forceClose();
      return;
    }

    const tabsStore = useEditorTabsStore.getState();
    if (tabsStore.tabs.length > 0) {
      tabsStore.hideEditor();
    }
    if (useEditorStore.getState().isEditorOpen) {
      useVideoProjectStore.getState().closeProject();
      useEditorStore.getState().closeEditor();
    }
    setCurrentPage('home');
  };

  return (
    <div className={cn('dt-titlebar drag-region', isMac && 'dt-titlebar-mac')}>
      <div className="dt-titlebar-brand no-drag">
        {leftContent || (
          <div className="dt-titlebar-logo">
            <IrisLogo variant="white" size="sm" />
            <span className="dt-titlebar-beta">BETA</span>
          </div>
        )}
      </div>

      <div className="flex-1 h-full drag-region" />

      {rightContent && <div className="no-drag flex items-center mr-2">{rightContent}</div>}

      {!hideNav && (
        <div className="dt-titlebar-right no-drag">
          <button
            onClick={handleBugReport}
            className="dt-titlebar-icon"
            data-active={isBugReportOpen}
            title={t('titleBar.bugReport', 'Bug Report')}
          >
            <Bug className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsAnnouncementsOpen(true)}
            className="dt-titlebar-icon"
            data-active={isAnnouncementsOpen}
            title={t('titleBar.announcements', 'Announcements')}
          >
            <Bell className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentPage('settings')}
            className={cn('dt-titlebar-icon', isLinux && 'mr-2')}
            data-active={currentPage === 'settings'}
            title={t('nav.settings', 'Settings')}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      )}

      {(isLinux || isWindows) && (
        <div className="no-drag flex items-center">
          <button onClick={handleMinimize} className="dt-titlebar-win" title="Minimize">
            <Minus className="w-4 h-4" />
          </button>
          <button onClick={handleMaximize} className="dt-titlebar-win" title="Maximize">
            {isMaximized ? (
              <Maximize2 className="w-3.5 h-3.5" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
          </button>
          <button onClick={handleClose} className="dt-titlebar-win close" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <AnnouncementsModal
        isOpen={isAnnouncementsOpen}
        onClose={() => setIsAnnouncementsOpen(false)}
      />

      <ConfirmDialog
        isOpen={showCloseConfirm}
        onClose={() => setShowCloseConfirm(false)}
        onConfirm={handleConfirmClose}
        title={t('titleBar.unsavedChanges')}
        message={t('titleBar.unsavedMessage')}
        confirmText={t('titleBar.quitWithoutSaving')}
        cancelText={t('buttons.cancel')}
        variant="warning"
      />

      <ConfirmDialog
        isOpen={showProcessingWarning}
        onClose={() => setShowProcessingWarning(false)}
        onConfirm={() => {
          setShowProcessingWarning(false);
          window.electronAPI?.window?.close();
        }}
        title={t('titleBar.processingInProgress', '작업 진행 중')}
        message={t('titleBar.processingWarningMessage', '작업이 진행 중입니다. 프로그램을 닫으면 작업이 중단되거나 취소될 수 있습니다.')}
        confirmText={t('titleBar.quitAnyway', '종료')}
        cancelText={t('buttons.cancel')}
        variant="warning"
      />

      <BugReportModal
        isOpen={isBugReportOpen}
        onClose={() => {
          setIsBugReportOpen(false);
          setScreenshotDataUrl(null);
        }}
        screenshotDataUrl={screenshotDataUrl}
      />
    </div>
  );
}
