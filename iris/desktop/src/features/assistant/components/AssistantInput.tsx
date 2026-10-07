import { useCallback, useLayoutEffect, useRef } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ASSISTANT_INPUT_ATTR } from '../lib/focus';

interface AssistantInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  onAbort: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder: string;
}

const MAX_HEIGHT = 180;

/**
 * Multi-line prompt box. Enter sends, Shift+Enter adds a line. While the reply
 * streams, the send button turns into a stop button.
 */
export function AssistantInput({
  value,
  onChange,
  onSend,
  onAbort,
  isStreaming,
  disabled,
  placeholder,
}: AssistantInputProps) {
  const { t } = useTranslation('common');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow with the content up to MAX_HEIGHT, then scroll.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const canSend = !!value.trim() && !isStreaming && !disabled;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(value.trim());
  }, [canSend, onSend, value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Never send in the middle of an IME composition (Korean/Japanese input).
      if (e.nativeEvent.isComposing) return;
      // Escape only leaves the prompt box. Editors treat a window-level Escape
      // as "close the editor", so it must not bubble out of here.
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.currentTarget.blur();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="ast-input" data-disabled={disabled || undefined}>
      <textarea
        ref={textareaRef}
        {...{ [ASSISTANT_INPUT_ATTR]: '' }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        className="ast-input-field"
        aria-label={t('assistant.inputLabel', 'Prompt')}
      />
      <div className="ast-input-bar">
        <span className="ast-input-hint">{t('assistant.inputHint', 'Enter to send · Shift+Enter for a new line')}</span>
        {isStreaming ? (
          <button
            type="button"
            onClick={onAbort}
            className="ast-send ast-send-stop"
            title={t('assistant.stop', 'Stop')}
            aria-label={t('assistant.stop', 'Stop')}
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="ast-send"
            title={t('assistant.send', 'Send')}
            aria-label={t('assistant.send', 'Send')}
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
