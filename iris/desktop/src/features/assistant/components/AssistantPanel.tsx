import { useCallback, useRef } from 'react';
import { Trash2, X } from 'lucide-react';
import { ParallaxSymbol } from '@/shared/components/common/ParallaxSymbol';
import { useTranslation } from 'react-i18next';
import { useAssistantStore, ASSISTANT_PANEL_DEFAULT_WIDTH } from '../stores/assistant.store';
import type { AssistantAdapter, AssistantCommand, AssistantSurface } from '../types';
import { AssistantMessageList } from './AssistantMessageList';
import { AssistantInput } from './AssistantInput';
import './assistant.css';

/** Why the prompt can't be used right now (not signed in, self-host build …). */
export interface AssistantBlock {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface AssistantPanelProps<TSnapshot, TCommand extends AssistantCommand> {
  adapter: AssistantAdapter<TSnapshot, TCommand>;
  /** Extra context next to the surface name, e.g. the open file or project. */
  contextDetail?: string | null;
  blocked?: AssistantBlock | null;
}

const SURFACE_KEY: Record<AssistantSurface, 'imageEditor' | 'videoEditor' | 'workspace'> = {
  'image-editor': 'imageEditor',
  'video-editor': 'videoEditor',
  workspace: 'workspace',
};

const EXAMPLE_COUNT = 3;

/**
 * The app-wide prompt panel. Rendered once by the app shell on the left of
 * every screen; the adapter decides what the prompt can act on.
 */
export function AssistantPanel<TSnapshot, TCommand extends AssistantCommand>({
  adapter,
  contextDetail,
  blocked,
}: AssistantPanelProps<TSnapshot, TCommand>) {
  const { t } = useTranslation('common');
  const panelWidth = useAssistantStore((s) => s.panelWidth);
  const messages = useAssistantStore((s) => s.messages);
  const isStreaming = useAssistantStore((s) => s.isStreaming);
  const streamingContent = useAssistantStore((s) => s.streamingContent);
  const draft = useAssistantStore((s) => s.draft);
  const setDraft = useAssistantStore((s) => s.setDraft);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const setPanelWidth = useAssistantStore((s) => s.setPanelWidth);
  const sendMessage = useAssistantStore((s) => s.sendMessage);
  const abortStream = useAssistantStore((s) => s.abortStream);
  const clearHistory = useAssistantStore((s) => s.clearHistory);

  const surfaceKey = SURFACE_KEY[adapter.surface];
  const surfaceLabel = useCallback(
    (surface: AssistantSurface) => t(`assistant.surface.${SURFACE_KEY[surface]}`),
    [t],
  );

  const handleSend = useCallback(
    (text: string) => {
      if (blocked) return;
      setDraft('');
      void sendMessage(text, adapter);
    },
    [adapter, blocked, sendMessage, setDraft],
  );

  // Drag the right edge to resize.
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: panelWidth };
      document.body.classList.add('ast-resizing');

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        setPanelWidth(dragRef.current.startWidth + (ev.clientX - dragRef.current.startX));
      };
      const onUp = () => {
        dragRef.current = null;
        document.body.classList.remove('ast-resizing');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [panelWidth, setPanelWidth],
  );

  const examples = Array.from({ length: EXAMPLE_COUNT }, (_, i) =>
    t(`assistant.examples.${surfaceKey}.${i + 1}`),
  );
  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <section
      className="ast-panel"
      style={{ width: panelWidth }}
      aria-label={t('assistant.title', 'Assistant')}
      data-surface={adapter.surface}
    >
      <header className="ast-head">
        <ParallaxSymbol className="w-3.5 h-3.5 ast-head-icon" />
        <div className="ast-head-meta">
          <span className="ast-head-surface">{t(`assistant.surface.${surfaceKey}`)}</span>
          {contextDetail && <span className="ast-head-detail">{contextDetail}</span>}
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearHistory}
            className="ast-icon-btn"
            title={t('assistant.clear', 'Clear conversation')}
            aria-label={t('assistant.clear', 'Clear conversation')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ast-icon-btn"
          title={t('assistant.close', 'Close assistant')}
          aria-label={t('assistant.close', 'Close assistant')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </header>

      {isEmpty ? (
        <div className="ast-empty">
          <p className="ast-empty-title">{t(`assistant.empty.${surfaceKey}`)}</p>
          {!blocked && (
            <div className="ast-examples">
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="ast-example"
                  onClick={() => handleSend(example)}
                >
                  {example}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <AssistantMessageList
          messages={messages}
          streamingContent={streamingContent}
          isStreaming={isStreaming}
          surface={adapter.surface}
          surfaceLabel={surfaceLabel}
        />
      )}

      {blocked?.message && (
        <div className="ast-blocked">
          <p>{blocked.message}</p>
          {blocked.actionLabel && blocked.onAction && (
            <button type="button" className="ast-blocked-action" onClick={blocked.onAction}>
              {blocked.actionLabel}
            </button>
          )}
        </div>
      )}

      <AssistantInput
        value={draft}
        onChange={setDraft}
        onSend={handleSend}
        onAbort={abortStream}
        isStreaming={isStreaming}
        disabled={!!blocked}
        placeholder={t(`assistant.placeholder.${surfaceKey}`)}
      />

      <div
        className="ast-resize"
        onMouseDown={handleResizeStart}
        onDoubleClick={() => setPanelWidth(ASSISTANT_PANEL_DEFAULT_WIDTH)}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('assistant.resize', 'Resize assistant panel')}
      />
    </section>
  );
}
