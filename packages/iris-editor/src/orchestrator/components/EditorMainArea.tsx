'use client';

import { useEffect, useRef } from 'react';
import { Plus, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { cn } from '@editor/lib/convert/string';
import { useI18n } from '@editor/hooks/usei18n';
import { useIrisEditorStore } from '@editor/store/iris-editor';
import { WorkflowCanvas } from '@editor/components/editor/WorkflowCanvas';
import { NodePalette } from '@editor/components/editor/NodePalette';
import { NodeConfigPanel } from '@editor/components/editor/config/NodeConfigPanel';
import type { EditorTheme } from '@editor/hooks/useEditorTheme';

interface EditorMainAreaProps {
  isMobile: boolean;
  showLeftPanel: boolean;
  showRightPanel: boolean;
  onToggleLeftPanel: () => void;
  onToggleRightPanel: () => void;
  onClosePanels: () => void;
  onNodeAdded: () => void;
  onCloseLeftPanel: () => void;
  onOpenChat: () => void;
  theme: EditorTheme;
  onToggleTheme: () => void;
}

/**
 * Canvas-first layout: the canvas fills the screen and everything else floats
 * over it — a left tool rail, the "Create anything" node menu next to it, and
 * the selected node's settings card on the right.
 */
export function EditorMainArea({
  isMobile,
  showLeftPanel,
  showRightPanel,
  onToggleLeftPanel,
  onToggleRightPanel,
  onClosePanels,
  onNodeAdded,
  onCloseLeftPanel,
  onOpenChat,
  theme,
  onToggleTheme,
}: EditorMainAreaProps) {
  const { t } = useI18n();
  const { selectedNodeId, nodes } = useIrisEditorStore();
  const paletteRef = useRef<HTMLDivElement>(null);

  // The node menu starts open only on an empty workflow.
  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    if (!isMobile && nodes.length > 0 && showLeftPanel) onCloseLeftPanel();
  }, [isMobile, nodes.length, showLeftPanel, onCloseLeftPanel]);

  // Ctrl/⌘+K toggles the node menu; Escape closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onToggleLeftPanel();
      } else if (e.key === 'Escape' && showLeftPanel && paletteRef.current?.contains(document.activeElement)) {
        onCloseLeftPanel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onToggleLeftPanel, onCloseLeftPanel, showLeftPanel]);

  const paletteLabel = t('iris.editor.addNode') || 'Add node';
  const configLabel = showRightPanel
    ? t('iris.editor.hideConfigPanel') || 'Hide config panel'
    : t('iris.editor.showConfigPanel') || 'Show config panel';
  const showConfigCard = showRightPanel && (isMobile || !!selectedNodeId);

  return (
    <div className="flex-1 relative overflow-hidden">
      <div className="absolute inset-0">
        <WorkflowCanvas chrome={{ theme, onToggleTheme }} />
      </div>

      {/* Left tool rail */}
      <nav
        aria-label={t('iris.editor.tools') || 'Editor tools'}
        className="we-float hidden md:flex absolute flex-col items-center"
        style={{
          left: 16,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 48,
          padding: '8px 0',
          gap: 6,
          borderRadius: 16,
          zIndex: 15,
        }}
      >
        <button
          type="button"
          onClick={onToggleLeftPanel}
          aria-expanded={showLeftPanel}
          title={`${paletteLabel} (Ctrl+K)`}
          aria-label={paletteLabel}
          className="inline-flex items-center justify-center"
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            color: 'var(--we-primary-fg, #0b0b0c)',
            background: 'var(--we-primary-bg, #f4f4f5)',
            border: '1px solid var(--we-primary-border, transparent)',
            boxShadow: 'var(--we-primary-shadow, none)',
            transform: showLeftPanel ? 'rotate(45deg)' : 'none',
            transition: 'transform 0.2s ease',
          }}
        >
          <Plus size={17} strokeWidth={2} />
        </button>
        <span style={{ width: 20, height: 1, margin: '4px 0', background: 'var(--color-iris-line-2)' }} />
        <button
          type="button"
          onClick={onToggleRightPanel}
          className="we-tool"
          data-active={showRightPanel ? 'true' : undefined}
          aria-pressed={showRightPanel}
          title={configLabel}
          aria-label={configLabel}
          style={{ width: 34, height: 34 }}
        >
          <SlidersHorizontal size={15} />
        </button>
        <button
          type="button"
          onClick={onOpenChat}
          className="we-tool"
          title={t('iris.editor.aiAssistant')}
          aria-label={t('iris.editor.aiAssistant')}
          style={{ width: 34, height: 34 }}
        >
          <Sparkles size={15} />
        </button>
      </nav>

      {/* "Create anything" node menu */}
      {showLeftPanel && (
        <div
          ref={paletteRef}
          className={cn('we-float we-pop absolute flex flex-col overflow-hidden', isMobile ? 'inset-2' : '')}
          style={
            isMobile
              ? { zIndex: 30, borderRadius: 16 }
              : { left: 76, top: 64, bottom: 76, width: 340, maxHeight: 640, borderRadius: 16, zIndex: 16 }
          }
        >
          {isMobile && (
            <button
              type="button"
              onClick={onClosePanels}
              className="we-tool absolute"
              style={{ top: 14, right: 12, zIndex: 2 }}
              aria-label={t('iris.canvas.close') || 'Close'}
            >
              <X size={14} />
            </button>
          )}
          <div className="flex-1 min-h-0">
            <NodePalette variant="floating" autoFocus={!isMobile} onNodeAdded={onNodeAdded} />
          </div>
        </div>
      )}

      {/* Selected node settings */}
      {showConfigCard && (
        <div
          className={cn('we-float we-pop absolute flex flex-col overflow-hidden', isMobile ? 'inset-2' : '')}
          style={
            isMobile
              ? { zIndex: 30, borderRadius: 16 }
              : { right: 16, top: 64, bottom: 76, width: 360, borderRadius: 16, zIndex: 16 }
          }
        >
          {isMobile && (
            <div className="flex justify-end" style={{ padding: '8px 10px 0' }}>
              <button
                type="button"
                onClick={onClosePanels}
                className="we-tool"
                aria-label={t('iris.canvas.close') || 'Close'}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <div className="flex-1 min-h-0">
            <NodeConfigPanel variant="floating" />
          </div>
        </div>
      )}

      {/* Mobile: panel toggles + backdrop */}
      <div className="flex md:hidden absolute left-1/2 -translate-x-1/2 gap-2" style={{ bottom: 70, zIndex: 15 }}>
        <button onClick={onToggleLeftPanel} className="we-float we-chip" type="button">
          <Plus size={14} />
          {t('iris.editor.nodes')}
        </button>
        <button onClick={onToggleRightPanel} className="we-float we-chip" type="button">
          <SlidersHorizontal size={14} />
          {t('iris.editor.config')}
        </button>
      </div>
      {isMobile && (showLeftPanel || showConfigCard) && (
        <div
          className="md:hidden absolute inset-0"
          style={{ zIndex: 25, background: 'var(--we-backdrop, rgba(0,0,0,0.3))' }}
          onClick={onClosePanels}
        />
      )}
    </div>
  );
}
