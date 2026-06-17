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
import { useWorkflowEditor, useMobilePanel } from './orchestrator/hooks';
import {
  LoadingState,
  NotFoundState,
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

  const {
    workflow,
    isLoading,
    isSaving,
    isValidating,
    validationResult,
    isValidated,
    confirmDialog,
    showInputModal,
    estimatedTokens,
    manualTriggerNode,
    isDirty,
    isExecuting,
    handleValidate,
    handleSave,
    handleExecute,
    handleConfirmAction,
    closeConfirmDialog,
    closeInputModal,
    performExecute,
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
  if (!workflow) return <NotFoundState />;

  return (
    <div
      className="h-screen flex flex-col"
      style={{
        background:
          'radial-gradient(50% 40% at 50% 30%, rgba(167,139,250,0.10), transparent 70%),' +
          'radial-gradient(40% 30% at 80% 90%, rgba(125,211,252,0.07), transparent 60%),' +
          'var(--color-iris-canvas)',
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
        estimatedTokens={estimatedTokens}
        isPaidUser={isPaidUser}
        onBack={() => navigate?.(`/workflows/${workflow.id}`)}
        onValidate={handleValidate}
        onSave={handleSave}
        onExecute={handleExecute}
        onUpgrade={() => navigate?.('/plan')}
        onMobileMenuToggle={toggleMobileMenu}
        onOpenChat={() => onOpenChat?.(workflow.id)}
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
        onNodeAdded={() => {
          if (isMobile) setShowLeftPanel(false);
        }}
      />

      <StatusBar
        isExecuting={isExecuting}
        estimatedTokens={estimatedTokens}
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
          onExecute={performExecute}
          inputType={manualTriggerNode.inputType}
          inputLabel={manualTriggerNode.inputLabel}
          isExecuting={isExecuting}
        />
      )}
    </div>
  );
}
