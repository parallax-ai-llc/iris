'use client';

import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Coins,
  Lock,
  Menu,
  Play,
  Save,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { cn } from '@editor/lib/convert/string';
import { useI18n } from '@editor/hooks/usei18n';
import { Workflow as WorkflowType } from '@editor/lib/apis/iris-api-client';
import { formatCredits } from '@editor/lib/format-credits';
import { ValidationResult } from '../types';

interface EditorHeaderProps {
  workflow: WorkflowType;
  isDirty: boolean;
  isSaving: boolean;
  isValidating: boolean;
  isExecuting: boolean;
  isValidated: boolean;
  validationResult: ValidationResult | null;
  estimatedTokens: number;
  isPaidUser: boolean;
  onBack: () => void;
  onValidate: () => void;
  onSave: () => void;
  onExecute: () => void;
  onUpgrade: () => void;
  onMobileMenuToggle: () => void;
  onOpenChat: () => void;
}

export function EditorHeader({
  workflow,
  isDirty,
  isSaving,
  isValidating,
  isExecuting,
  isValidated,
  validationResult,
  estimatedTokens,
  isPaidUser,
  onBack,
  onValidate,
  onSave,
  onExecute,
  onUpgrade,
  onMobileMenuToggle,
  onOpenChat,
}: EditorHeaderProps) {
  const { t } = useI18n();

  const validationOk = validationResult?.valid;
  const validationFailed = validationResult && !validationResult.valid;

  return (
    <header
      className="flex items-center justify-between"
      style={{
        height: 54,
        padding: '0 12px',
        gap: 14,
        borderBottom: '1px solid var(--color-iris-line-1)',
        background: 'rgba(7,7,10,0.7)',
        backdropFilter: 'blur(20px) saturate(150%)',
        WebkitBackdropFilter: 'blur(20px) saturate(150%)',
        position: 'relative',
        zIndex: 2,
      }}
    >
      <div className="flex items-center min-w-0" style={{ gap: 14 }}>
        <button
          onClick={onBack}
          className={iconBtnClass}
          title={t('iris.editor.backToWorkflows') || 'Back to Workflows'}
        >
          <ArrowLeft size={16} />
        </button>
        <span className="hidden md:block" style={dividerStyle} />

        {/* Breadcrumb + title */}
        <div className="flex items-center min-w-0" style={{ gap: 10 }}>
          <span
            className="hidden md:inline"
            style={{ fontSize: 12, color: 'var(--color-iris-text-4)' }}
          >
            {t('iris.editor.workflows') || 'Workflows'}
          </span>
          <ChevronRight
            size={12}
            className="hidden md:inline"
            style={{ color: 'var(--color-iris-text-4)' }}
          />
          <span
            className="inline-flex items-center justify-center"
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background:
                'linear-gradient(135deg, rgba(167, 139, 250, 0.18) 0%, rgba(125, 211, 252, 0.18) 100%)',
              border: '1px solid rgba(167, 139, 250, 0.25)',
              color: 'var(--color-iris-violet)',
              flexShrink: 0,
            }}
          >
            <Workflow size={12} />
          </span>
          <span
            className="truncate"
            style={{
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: '-0.005em',
              color: 'var(--color-iris-text-1)',
              maxWidth: 240,
            }}
          >
            {workflow.name}
          </span>
          {isDirty && (
            <span
              title={t('iris.editor.unsavedChanges') || 'Unsaved changes'}
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: 'var(--color-iris-warn)',
                flexShrink: 0,
              }}
            />
          )}
        </div>
      </div>

      {/* Desktop Actions */}
      <div className="hidden md:flex items-center" style={{ gap: 8 }}>
        <button onClick={onOpenChat} className={chipClass} type="button">
          <Sparkles size={14} />
          <span>{t('iris.editor.aiAssistant')}</span>
        </button>

        {validationOk ? (
          <button onClick={onValidate} disabled={isValidating} className={chipOkClass} type="button">
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: 999,
                background: 'var(--color-iris-ok)',
                boxShadow: '0 0 0 3px rgba(52,211,153,0.18)',
              }}
            />
            <span>{t('iris.editor.valid') || 'Valid'}</span>
          </button>
        ) : (
          <button
            onClick={onValidate}
            disabled={isValidating}
            className={chipClass}
            type="button"
          >
            {isValidating ? (
              <span className={miniSpinnerClass} />
            ) : (
              <AlertCircle size={14} />
            )}
            <span>
              {validationFailed
                ? `${validationResult.errors?.length || 0} error${(validationResult.errors?.length || 0) > 1 ? 's' : ''}`
                : t('iris.editor.validate')}
            </span>
          </button>
        )}

        <button onClick={onSave} disabled={isSaving || !isDirty} className={chipClass} type="button">
          {isSaving ? <span className={miniSpinnerClass} /> : <Save size={14} />}
          <span>{t('iris.actions.save')}</span>
          <kbd
            style={{
              fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
              fontSize: 10,
              color: 'var(--color-iris-text-4)',
              padding: '1px 5px',
              border: '1px solid var(--color-iris-line-2)',
              borderRadius: 4,
              marginLeft: 2,
            }}
          >
            ⌘S
          </kbd>
        </button>

        <button
          onClick={isPaidUser ? onExecute : onUpgrade}
          disabled={isExecuting || (isPaidUser && !isValidated)}
          className={runBtnClass}
          type="button"
          title={
            !isPaidUser
              ? 'Upgrade to paid plan to run workflows'
              : !isValidated
              ? 'Validate workflow before running'
              : undefined
          }
        >
          {isExecuting ? (
            <span className={runSpinnerClass} />
          ) : !isPaidUser ? (
            <Lock size={14} />
          ) : (
            <Play size={14} />
          )}
          <span>{!isPaidUser ? t('iris.actions.upgrade') : t('iris.actions.run')}</span>
          {isPaidUser && estimatedTokens > 0 && (
            <span
              className="inline-flex items-center"
              style={{
                gap: 4,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'rgba(0,0,0,0.15)',
                fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                fontSize: 11,
                fontWeight: 600,
                color: 'rgba(0,0,0,0.7)',
              }}
            >
              <Coins size={10} />
              {formatCredits(estimatedTokens)}
            </span>
          )}
        </button>
      </div>

      {/* Mobile Actions */}
      <div className="flex md:hidden items-center" style={{ gap: 4 }}>
        <button onClick={onOpenChat} className={iconBtnClass} title={t('iris.editor.aiAssistant')}>
          <Sparkles size={16} />
        </button>
        <button
          onClick={onSave}
          disabled={isSaving || !isDirty}
          className={cn(iconBtnClass, isDirty ? 'opacity-100' : 'opacity-50')}
          title={t('iris.actions.save')}
        >
          {isSaving ? <span className={miniSpinnerClass} /> : <Save size={16} />}
        </button>
        <button
          onClick={isPaidUser ? onExecute : onUpgrade}
          disabled={isExecuting || (isPaidUser && !isValidated)}
          className={runBtnClass}
          style={{ height: 32, padding: '0 10px' }}
          title={!isPaidUser ? 'Upgrade to paid plan' : undefined}
        >
          {isExecuting ? (
            <span className={runSpinnerClass} />
          ) : !isPaidUser ? (
            <Lock size={14} />
          ) : (
            <Play size={14} />
          )}
        </button>
        <button onClick={onMobileMenuToggle} className={iconBtnClass} title="Menu">
          <Menu size={16} />
        </button>
      </div>
    </header>
  );
}

const dividerStyle: React.CSSProperties = {
  width: 1,
  height: 22,
  background: 'var(--color-iris-line-1)',
};

const iconBtnClass =
  'inline-flex items-center justify-center w-8 h-8 rounded-lg ' +
  'text-[var(--color-iris-text-3)] hover:text-[var(--color-iris-text-1)] ' +
  'bg-[var(--color-iris-surf-1)] hover:bg-[var(--color-iris-surf-3)] ' +
  'border border-[var(--color-iris-line-2)] hover:border-[var(--color-iris-line-3)] ' +
  'transition-colors';

const chipClass =
  'inline-flex items-center gap-[7px] h-8 px-3 rounded-lg ' +
  'text-[12.5px] font-medium ' +
  'text-[var(--color-iris-text-2)] hover:text-[var(--color-iris-text-1)] ' +
  'bg-[var(--color-iris-surf-1)] hover:bg-[var(--color-iris-surf-3)] ' +
  'border border-[var(--color-iris-line-2)] hover:border-[var(--color-iris-line-3)] ' +
  'transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const chipOkClass =
  'inline-flex items-center gap-[7px] h-8 px-3 rounded-lg ' +
  'text-[12.5px] font-medium ' +
  'text-[var(--color-iris-ok)] ' +
  'bg-[var(--color-iris-ok-bg)] hover:bg-[rgba(52,211,153,0.18)] ' +
  'border border-[rgba(52,211,153,0.28)] ' +
  'transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const runBtnClass =
  'inline-flex items-center gap-2 h-8 pl-[14px] pr-[6px] rounded-[10px] ' +
  'text-[12.5px] font-semibold text-[#0a0a0c] ' +
  'bg-[linear-gradient(180deg,_#f5f5f7_0%,_#d4d4d8_50%,_#a1a1aa_100%)] ' +
  'hover:bg-[linear-gradient(180deg,_#fafafa_0%,_#e4e4e7_50%,_#b4b4b8_100%)] ' +
  'border border-white/40 ' +
  'shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,_0_-1px_0_rgba(0,0,0,0.2)_inset,_0_8px_28px_-8px_rgba(255,255,255,0.18)] ' +
  'disabled:opacity-70 disabled:cursor-not-allowed transition-[filter] active:translate-y-[0.5px]';

const miniSpinnerClass =
  'inline-block w-3 h-3 rounded-full border-[1.5px] border-[rgba(167,139,250,0.3)] border-t-[var(--color-iris-violet)] animate-spin';

const runSpinnerClass =
  'inline-block w-3 h-3 rounded-full border-[1.5px] border-[rgba(0,0,0,0.25)] border-t-[rgba(0,0,0,0.7)] animate-spin';
