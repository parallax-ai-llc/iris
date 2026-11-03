'use client';

import {
  AlertCircle,
  ArrowLeft,
  Coins,
  Lock,
  Menu,
  Play,
  Save,
  Square,
  Sparkles,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@editor/lib/convert/string';
import { useI18n } from '@editor/hooks/usei18n';
import { Workflow as WorkflowType } from '@editor/lib/apis/iris-api-client';
import type { RunCostEstimate } from '@editor/lib/run-cost-estimate';
import { formatRunCostDetail, formatRunCostShort, hasRunCost } from './run-cost-text';
import { ValidationResult } from '../types';

interface EditorHeaderProps {
  workflow: WorkflowType;
  isDirty: boolean;
  isSaving: boolean;
  isValidating: boolean;
  isExecuting: boolean;
  isValidated: boolean;
  validationResult: ValidationResult | null;
  costEstimate: RunCostEstimate;
  isPaidUser: boolean;
  onBack: () => void;
  onValidate: () => void;
  onSave: () => void;
  onExecute: () => void;
  /** "Ignore cache (run all)" toggle state: session-only (node result cache spec 4.6). */
  ignoreCache: boolean;
  onToggleIgnoreCache: () => void;
  onUpgrade: () => void;
  onMobileMenuToggle: () => void;
  onOpenChat: () => void;
  /** Shown while a run is in progress when the host can stop runs (R-01). */
  canStop?: boolean;
  isStopping?: boolean;
  onStop?: () => void;
}

/**
 * Floating top chrome over the canvas: back tile + breadcrumb pill on the left,
 * the action pill and the primary Run button on the right. The container lets
 * pointer events through so the canvas stays pannable between the pills.
 */
export function EditorHeader({
  workflow,
  isDirty,
  isSaving,
  isValidating,
  isExecuting,
  isValidated,
  validationResult,
  costEstimate,
  isPaidUser,
  onBack,
  onValidate,
  onSave,
  onExecute,
  ignoreCache,
  onToggleIgnoreCache,
  onUpgrade,
  onMobileMenuToggle,
  onOpenChat,
  canStop = false,
  isStopping = false,
  onStop,
}: EditorHeaderProps) {
  const { t } = useI18n();
  const ignoreCacheLabel = t('iris.editor.ignoreCache') || 'Ignore cache (run all)';
  const ignoreCacheHint =
    t('iris.editor.ignoreCacheHint') || 'Reads nothing from the cache; results are still saved';

  const validationOk = validationResult?.valid;
  const validationFailed = validationResult && !validationResult.valid;
  const errorCount = validationResult?.errors?.length || 0;
  const backLabel = t('iris.editor.backToWorkflows') || 'Back to Workflows';
  const runTitle = !isPaidUser
    ? 'Upgrade to paid plan to run workflows'
    : !isValidated
    ? 'Validate workflow before running'
    : hasRunCost(costEstimate)
    ? formatRunCostDetail(costEstimate, t)
    : undefined;

  return (
    <header
      className="absolute inset-x-0 top-0 flex items-start justify-between pointer-events-none"
      style={{ padding: '14px 16px', gap: 12, zIndex: 20 }}
    >
      {/* Left: back tile + breadcrumb */}
      <div className="flex items-center min-w-0 pointer-events-auto" style={{ gap: 8 }}>
        <button
          type="button"
          onClick={onBack}
          className="we-float inline-flex items-center justify-center flex-shrink-0"
          style={{ width: 36, height: 36, borderRadius: 10, color: 'var(--color-iris-text-2)' }}
          title={backLabel}
          aria-label={backLabel}
        >
          <ArrowLeft size={15} />
        </button>

        <div
          className="we-float flex items-center min-w-0"
          style={{ height: 36, padding: '0 12px', borderRadius: 10, gap: 6 }}
        >
          <button
            type="button"
            onClick={onBack}
            className="hidden md:inline"
            style={{ fontSize: 12.5, color: 'var(--color-iris-text-4)', background: 'transparent' }}
          >
            {t('iris.editor.workflows') || 'Workflows'}
          </button>
          <span className="hidden md:inline" style={{ fontSize: 12.5, color: 'var(--color-iris-text-5, var(--color-iris-text-4))' }}>
            /
          </span>
          <span
            className="truncate"
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              letterSpacing: '-0.005em',
              color: 'var(--color-iris-text-1)',
              maxWidth: 260,
            }}
          >
            {workflow.name}
          </span>
          {isDirty && (
            <span
              title={t('iris.editor.unsavedChanges') || 'Unsaved changes'}
              aria-label={t('iris.editor.unsavedChanges') || 'Unsaved changes'}
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: 'var(--color-iris-warn)',
                flexShrink: 0,
              }}
            />
          )}
          {workflow.status && (
            <span
              className="hidden md:inline-flex items-center"
              style={{
                height: 18,
                padding: '0 6px',
                marginLeft: 4,
                borderRadius: 5,
                fontSize: 9.5,
                letterSpacing: '0.08em',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                color: 'var(--color-iris-text-4)',
                border: '1px solid var(--color-iris-line-2)',
              }}
            >
              {workflow.status}
            </span>
          )}
        </div>
      </div>

      {/* Desktop: action pill + Run */}
      <div className="hidden md:flex items-center pointer-events-auto flex-shrink-0" style={{ gap: 8 }}>
        <div className="we-float flex items-center" style={{ height: 36, padding: 2, borderRadius: 10, gap: 1 }}>
          <button onClick={onOpenChat} className="we-chip" type="button">
            <Sparkles size={13} />
            <span>{t('iris.editor.aiAssistant')}</span>
          </button>

          <span style={dividerStyle} />

          <button
            onClick={onValidate}
            disabled={isValidating}
            className="we-chip"
            type="button"
            style={validationOk ? { color: 'var(--color-iris-ok)' } : validationFailed ? { color: 'var(--color-iris-err)' } : undefined}
          >
            {isValidating ? (
              <span className={miniSpinnerClass} />
            ) : validationOk ? (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: 'var(--color-iris-ok)',
                  boxShadow: '0 0 0 3px var(--color-iris-ok-bg)',
                }}
              />
            ) : (
              <AlertCircle size={13} />
            )}
            <span>
              {validationOk
                ? t('iris.editor.valid') || 'Valid'
                : validationFailed
                ? `${errorCount} error${errorCount > 1 ? 's' : ''}`
                : t('iris.editor.validate')}
            </span>
          </button>

          {isPaidUser && (
            <label
              className={cn('we-chip cursor-pointer select-none', ignoreCache && 'text-[var(--color-iris-text-1)]')}
              title={ignoreCacheHint}
            >
              <input
                type="checkbox"
                checked={ignoreCache}
                onChange={onToggleIgnoreCache}
                className="accent-[var(--color-iris-text-1)]"
                style={{ width: 13, height: 13 }}
              />
              <span>{ignoreCacheLabel}</span>
            </label>
          )}

          <span style={dividerStyle} />

          <button onClick={onSave} disabled={isSaving || !isDirty} className="we-chip" type="button">
            {isSaving ? <span className={miniSpinnerClass} /> : <Save size={13} />}
            <span>{t('iris.actions.save')}</span>
            <kbd className="we-kbd">⌘S</kbd>
          </button>
        </div>

        {isExecuting && canStop && onStop && (
          <button
            onClick={onStop}
            disabled={isStopping}
            className="we-float inline-flex items-center justify-center"
            style={{ width: 36, height: 36, borderRadius: 10, color: 'var(--color-iris-err)' }}
            type="button"
            title={isStopping ? 'Stopping…' : 'Stop the run'}
            aria-label={isStopping ? 'Stopping' : 'Stop the run'}
            data-testid="workflow-stop"
          >
            <Square size={13} />
          </button>
        )}

        <button
          onClick={isPaidUser ? onExecute : onUpgrade}
          disabled={isExecuting || (isPaidUser && !isValidated)}
          className="we-primary"
          style={{ height: 36, paddingRight: isPaidUser && hasRunCost(costEstimate) ? 5 : 14 }}
          type="button"
          title={runTitle}
        >
          {isExecuting ? (
            <span className={runSpinnerClass} />
          ) : !isPaidUser ? (
            <Lock size={13} />
          ) : (
            <Play size={13} fill="currentColor" />
          )}
          <span>{!isPaidUser ? t('iris.actions.upgrade') : t('iris.actions.run')}</span>
          {isPaidUser && hasRunCost(costEstimate) && (
            <span
              className="inline-flex items-center"
              style={{
                gap: 4,
                height: 24,
                padding: '0 8px',
                borderRadius: 6,
                background: 'color-mix(in srgb, currentColor 12%, transparent)',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <Coins size={10} />
              {formatRunCostShort(costEstimate, t)}
            </span>
          )}
        </button>
      </div>

      {/* Mobile */}
      <div className="flex md:hidden items-center pointer-events-auto" style={{ gap: 6 }}>
        <button onClick={onOpenChat} className={mobileBtnClass} title={t('iris.editor.aiAssistant')} type="button">
          <MessageSquare size={15} />
        </button>
        <button
          onClick={onSave}
          disabled={isSaving || !isDirty}
          className={cn(mobileBtnClass, isDirty ? 'opacity-100' : 'opacity-50')}
          title={t('iris.actions.save')}
          type="button"
        >
          {isSaving ? <span className={miniSpinnerClass} /> : <Save size={15} />}
        </button>
        {isPaidUser && (
          <label className={cn(mobileBtnClass, 'cursor-pointer')} title={`${ignoreCacheLabel}: ${ignoreCacheHint}`}>
            <input
              type="checkbox"
              checked={ignoreCache}
              onChange={onToggleIgnoreCache}
              aria-label={ignoreCacheLabel}
              className="accent-[var(--color-iris-text-1)]"
              style={{ width: 14, height: 14 }}
            />
          </label>
        )}
        <button
          onClick={isPaidUser ? onExecute : onUpgrade}
          disabled={isExecuting || (isPaidUser && !isValidated)}
          className="we-primary"
          style={{ width: 36, height: 36, padding: 0 }}
          title={!isPaidUser ? 'Upgrade to paid plan' : t('iris.actions.run')}
          type="button"
        >
          {isExecuting ? (
            <span className={runSpinnerClass} />
          ) : !isPaidUser ? (
            <Lock size={14} />
          ) : (
            <Play size={14} fill="currentColor" />
          )}
        </button>
        <button onClick={onMobileMenuToggle} className={mobileBtnClass} title="Menu" type="button">
          <Menu size={15} />
        </button>
      </div>
    </header>
  );
}

const dividerStyle: React.CSSProperties = {
  width: 1,
  height: 18,
  margin: '0 3px',
  background: 'var(--color-iris-line-2)',
};

const mobileBtnClass =
  'we-float inline-flex items-center justify-center w-9 h-9 rounded-[10px] ' +
  'text-[var(--color-iris-text-2)] disabled:cursor-not-allowed';

const miniSpinnerClass =
  'inline-block w-3 h-3 rounded-full border-[1.5px] border-[var(--color-iris-line-3)] border-t-[var(--color-iris-text-1)] animate-spin';

const runSpinnerClass =
  'inline-block w-3 h-3 rounded-full border-[1.5px] border-[color-mix(in_srgb,currentColor_25%,transparent)] border-t-current animate-spin';
