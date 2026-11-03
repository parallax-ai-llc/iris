/**
 * IrisWorkflowEditor — the editor as a single mountable component.
 *
 * This is the framework-agnostic port of iris/web's `app/workflows/[id]/edit/
 * page.tsx`: same layout, header, panels, status bar, dialogs, and execution
 * input modal — but driven by a `workflowId` prop and the injected seams
 * (navigation, chat) instead of Next.js router + a global chat-modal store.
 * Wrap it in <IrisEditorProvider value={...}>.
 */

import { ExecutionInputModal } from '@editor/components/editor/ExecutionInputModal';
import { useSeams } from '@editor/seams';
import { useEditorTheme } from '@editor/hooks/useEditorTheme';
import { useWorkflowEditor, useMobilePanel } from './orchestrator/hooks';
import {
  LoadingState,
  NotFoundState,
  LoadErrorState,
  ConfirmDialog,
  EditorHeader,
  MobileMenu,
  EditorMainArea,
  StatusBar,
} from './orchestrator/components';

export interface IrisWorkflowEditorProps {
  workflowId: string;
  /** Optional: open the AI workflow chat (iris/web). Hidden when omitted. */
  onOpenChat?: (workflowId: string) => void;
}

export function IrisWorkflowEditor({
  workflowId,
  onOpenChat,
}: IrisWorkflowEditorProps) {
  const { navigate } = useSeams();
  const { theme, toggleTheme } = useEditorTheme();

  const {
    workflow,
    isLoading,
    loadError,
    retryLoad,
    isSaving,
    isValidating,
    validationResult,
    isValidated,
    confirmDialog,
    showInputModal,
    costEstimate,
    manualTriggerNode,
    isDirty,
    isExecuting,
    isStopping,
    canStop,
    handleStop,
    handleValidate,
    handleSave,
    handleExecute,
    handleConfirmAction,
    closeConfirmDialog,
    closeInputModal,
    executeWithInput,
    ignoreCache,
    toggleIgnoreCache,
  } = useWorkflowEditor(workflowId);

  const {
    isMobile,
    showLeftPanel,
    showRightPanel,
    mobileMenuOpen,
    toggleLeftPanel,
    toggleRightPanel,
    closePanels,
    toggleMobileMenu,
    closeMobileMenu,
    setShowLeftPanel,
  } = useMobilePanel();

  // Allow all users to execute (matches iris/web: isPaidUser hardcoded true).
  const isPaidUser = true;

  if (isLoading) return <LoadingState />;
  if (!workflow) {
    if (loadError && loadError !== 'not_found') {
      return <LoadErrorState workflowId={workflowId} kind={loadError} onRetry={retryLoad} />;
    }
    return <NotFoundState />;
  }

  return (
    <div
      className="h-screen flex flex-col relative overflow-hidden"
      style={{
        background: 'var(--color-iris-canvas)',
        color: 'var(--color-iris-text-1)',
      }}
    >
      <EditorHeader
        workflow={workflow}
        isDirty={isDirty}
        isSaving={isSaving}
        isValidating={isValidating}
        isExecuting={isExecuting}
        isValidated={isValidated}
        validationResult={validationResult}
        costEstimate={costEstimate}
        isPaidUser={isPaidUser}
        onBack={() => navigate?.(`/workflows/${workflow.id}`)}
        onValidate={handleValidate}
        onSave={handleSave}
        onExecute={() => handleExecute()}
        ignoreCache={ignoreCache}
        onToggleIgnoreCache={toggleIgnoreCache}
        onUpgrade={() => navigate?.('/plan')}
        onMobileMenuToggle={toggleMobileMenu}
        onOpenChat={() => onOpenChat?.(workflow.id)}
        canStop={canStop}
        isStopping={isStopping}
        onStop={handleStop}
      />

      <MobileMenu
        isOpen={mobileMenuOpen}
        isValidating={isValidating}
        validationResult={validationResult}
        showLeftPanel={showLeftPanel}
        showRightPanel={showRightPanel}
        onValidate={handleValidate}
        onToggleLeftPanel={toggleLeftPanel}
        onToggleRightPanel={toggleRightPanel}
        onClose={closeMobileMenu}
      />

      <EditorMainArea
        isMobile={isMobile}
        showLeftPanel={showLeftPanel}
        showRightPanel={showRightPanel}
        onToggleLeftPanel={toggleLeftPanel}
        onToggleRightPanel={toggleRightPanel}
        onClosePanels={closePanels}
        onNodeAdded={() => setShowLeftPanel(false)}
        onCloseLeftPanel={() => setShowLeftPanel(false)}
        onOpenChat={() => onOpenChat?.(workflow.id)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <StatusBar
        isExecuting={isExecuting}
        costEstimate={costEstimate}
        isDirty={isDirty}
      />

      <ConfirmDialog
        dialog={confirmDialog}
        onClose={closeConfirmDialog}
        onConfirm={handleConfirmAction}
      />

      {manualTriggerNode && (
        <ExecutionInputModal
          isOpen={showInputModal}
          onClose={closeInputModal}
          onExecute={executeWithInput}
          inputType={manualTriggerNode.inputType}
          inputLabel={manualTriggerNode.inputLabel}
          isExecuting={isExecuting}
        />
      )}
    </div>
  );
}
