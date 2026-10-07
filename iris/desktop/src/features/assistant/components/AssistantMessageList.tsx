import { useEffect, useRef } from 'react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { stripCommandBlocks } from '../lib/commandBlock';
import type { AssistantMessage, AssistantSurface } from '../types';

interface AssistantMessageListProps {
  messages: AssistantMessage[];
  streamingContent: string;
  isStreaming: boolean;
  /** Surface currently on screen; turns from other surfaces get a tag. */
  surface: AssistantSurface;
  surfaceLabel: (surface: AssistantSurface) => string;
}

function CommandStatusLine({ message }: { message: AssistantMessage }) {
  const { t } = useTranslation('common');
  if (!message.command || !message.commandStatus) return null;
  const action = <code className="ast-cmd-action">{message.command.action}</code>;

  switch (message.commandStatus) {
    case 'pending':
    case 'running':
      return (
        <div className="ast-cmd" data-status="running">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{t('assistant.status.running', 'Running')}</span>
          {action}
        </div>
      );
    case 'success':
      return (
        <div className="ast-cmd" data-status="success">
          <Check className="w-3 h-3" />
          <span>{message.commandNote || t('assistant.status.done', 'Done')}</span>
          {action}
        </div>
      );
    case 'error':
      return (
        <div className="ast-cmd" data-status="error">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <span>{message.commandError || t('assistant.status.failed', 'Failed')}</span>
          {action}
        </div>
      );
    default:
      return null;
  }
}

export function AssistantMessageList({
  messages,
  streamingContent,
  isStreaming,
  surface,
  surfaceLabel,
}: AssistantMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastStatus = messages[messages.length - 1]?.commandStatus;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, streamingContent, lastStatus]);

  const streamingText = stripCommandBlocks(streamingContent);

  return (
    <div className="ast-messages">
      {messages.map((msg) => (
        <div key={msg.id} className="ast-msg" data-role={msg.role}>
          {msg.surface !== surface && (
            <span className="ast-msg-surface">{surfaceLabel(msg.surface)}</span>
          )}
          {msg.content && <p className="ast-msg-text">{msg.content}</p>}
          <CommandStatusLine message={msg} />
        </div>
      ))}
      {isStreaming && (
        <div className="ast-msg" data-role="assistant">
          {streamingText ? (
            <p className="ast-msg-text">
              {streamingText}
              <span className="ast-caret" />
            </p>
          ) : (
            <div className="ast-typing" aria-hidden>
              <span />
              <span />
              <span />
            </div>
          )}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
