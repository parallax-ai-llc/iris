import { useState, useEffect } from 'react';
import { Minus, Square, X, Maximize2, Settings, Bell, Bug, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { IrisLogo } from '@/shared/components/common/IrisLogo';
import { ParallaxSymbol } from '@/shared/components/common/ParallaxSymbol';
import { useUIStore } from '@/shared/stores/ui.store';
import { formatCombo } from '@/shared/lib/shortcuts';
import { getPageHistoryKeymap } from '@/shared/hooks/useKeyboardShortcuts';
import { AnnouncementsModal } from '@/features/announcements/components';
import { ConfirmDialog } from '@/shared/components/ui/Modal';
import { BugReportModal } from '@/features/bug-report/components/BugReportModal';
import { useEditorTabsStore } from '@/features/image-editor/stores/editorTabs.store';
import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import { useIrisEditorStore } from 'iris-editor';
import { useAssistantStore, toggleAssistant } from '@/features/assistant';

interface TitleBarProps {
  leftContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  /** Editors: hide Bug report and Settings. Assistant toggle and Bell always show. */
  hideNav?: boolean;
  /** App-shell pages: show the page history back / forward buttons. */
  historyNav?: boolean;
}

const platform = window.electronAPI?.app?.getPlatform?.() || navigator.platform || '';
const isWindows = platform === 'win32' || navigator.platform?.startsWith('Win');
const isMac = platform === 'darwin' || navigator.platform?.startsWith('Mac');
const isLinux = !isWindows && !isMac;

export function TitleBar({ leftContent, rightContent, hideNav, historyNav }: TitleBarProps = {}) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isAnnouncementsOpen, setIsAnnouncementsOpen] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showProcessingWarning, setShowProcessingWarning] = useState(false);
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const { currentPage, setCurrentPage } = useUIStore();
  const canGoBack = useUIStore((s) => s.backStack.length > 0);
  const canGoForward = useUIStore((s) => s.forwardStack.length > 0);
  const goBack = useUIStore((s) => s.goBack);
  const goForward = useUIStore((s) => s.goForward);
  const isAssistantOpen = useAssistantStore((s) => s.isOpen);
  const { t } = useTranslation('common');
  const assistantShortcut = isMac ? '⌘/' : 'Ctrl+/';

  useEffect(() => {
    if (window.electronAPI?.window) {
      window.electronAPI.window.isMaximized().then(setIsMaximized);
      window.electronAPI.window.onMaximizeChange(setIsMaximized);
      window.electronAPI.window.onCloseRequested(() => {
        const imageEditorDirty = useEditorTabsStore.getState().tabs.some((t) => t.isDirty);
        const videoEditorDirty = useEditorStore.getState().hasUnsavedChanges();
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
    const videoEditorDirty = useEditorStore.getState().hasUnsavedChanges();
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

      {historyNav && (
        <HistoryNavButtons
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onBack={goBack}
          onForward={goForward}
        />
      )}

      <div className="flex-1 h-full drag-region" />

      {rightContent && <div className="no-drag flex items-center mr-2">{rightContent}</div>}

      {/* Assistant toggle + Bell show on every screen (editors included);
          Bug report and Settings only outside the editors. */}
      <div className="dt-titlebar-right no-drag">
        {!hideNav && (
          <button
            onClick={handleBugReport}
            className="dt-titlebar-icon"
            data-active={isBugReportOpen}
            title={t('titleBar.bugReport', 'Bug Report')}
          >
            <Bug className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={toggleAssistant}
          className="dt-titlebar-agent"
          data-active={isAssistantOpen}
          aria-pressed={isAssistantOpen}
          title={`${t('titleBar.workWithAgent', 'Work with Agent')} (${assistantShortcut})`}
          data-testid="assistant-toggle"
        >
          <ParallaxSymbol className="w-4 h-4" />
          <span>{t('titleBar.workWithAgent', 'Work with Agent')}</span>
        </button>
        <button
          onClick={() => setIsAnnouncementsOpen(true)}
          className={cn('dt-titlebar-icon', isLinux && hideNav && 'mr-2')}
          data-active={isAnnouncementsOpen}
          title={t('titleBar.announcements', 'Announcements')}
        >
          <Bell className="w-4 h-4" />
        </button>
        {!hideNav && (
          <button
            onClick={() => setCurrentPage('settings')}
            className={cn('dt-titlebar-icon', isLinux && 'mr-2')}
            data-active={currentPage === 'settings'}
            title={t('nav.settings', 'Settings')}
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>

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

interface HistoryNavButtonsProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
}

// Inline so it beats the shell CSS (`.dt-titlebar-icon:hover`) without touching it.
const DISABLED_STYLE = { opacity: 0.3, cursor: 'default', background: 'transparent' } as const;

/** Back / forward between shell pages; the tooltips show the real key (from the keymap). */
function HistoryNavButtons({ canGoBack, canGoForward, onBack, onForward }: HistoryNavButtonsProps) {
  const { t } = useTranslation('common');
  const keymap = getPageHistoryKeymap();
  const backLabel = t('titleBar.back', 'Back');
  const forwardLabel = t('titleBar.forward', 'Forward');
  return (
    <div className="no-drag flex items-center gap-0.5 ml-2">
      <button
        type="button"
        onClick={onBack}
        disabled={!canGoBack}
        style={canGoBack ? undefined : DISABLED_STYLE}
        className="dt-titlebar-icon"
        title={`${backLabel} (${formatCombo(keymap.navBack.keys[0])})`}
        aria-label={backLabel}
        data-testid="titlebar-back"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onForward}
        disabled={!canGoForward}
        style={canGoForward ? undefined : DISABLED_STYLE}
        className="dt-titlebar-icon"
        title={`${forwardLabel} (${formatCombo(keymap.navForward.keys[0])})`}
        aria-label={forwardLabel}
        data-testid="titlebar-forward"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
