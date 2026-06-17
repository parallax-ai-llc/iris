'use client';

import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Redo2,
  Undo2,
} from 'lucide-react';
import { cn } from '@editor/lib/convert/string';
import { useI18n } from '@editor/hooks/usei18n';
import { useIrisEditorStore } from '@editor/store/iris-editor';
import { WorkflowCanvas } from '@editor/components/editor/WorkflowCanvas';
import { NodePalette } from '@editor/components/editor/NodePalette';
import { NodeConfigPanel } from '@editor/components/editor/config/NodeConfigPanel';

interface EditorMainAreaProps {
  isMobile: boolean;
  showLeftPanel: boolean;
  showRightPanel: boolean;
  onToggleLeftPanel: () => void;
  onToggleRightPanel: () => void;
  onClosePanels: () => void;
  onNodeAdded: () => void;
}

const TOOLBAR_BTN_STYLE: React.CSSProperties = {
  width: 40,
  height: 40,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 10,
  color: 'var(--color-iris-text-3)',
  background: 'var(--color-iris-surf-1)',
  border: '1px solid var(--color-iris-line-2)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
};

export function EditorMainArea({
  isMobile,
  showLeftPanel,
  showRightPanel,
  onToggleLeftPanel,
  onToggleRightPanel,
  onClosePanels,
  onNodeAdded,
}: EditorMainAreaProps) {
  const { t } = useI18n();
  const { undo, redo, canUndo, canRedo } = useIrisEditorStore();
  const undoLabel =
    (t('iris.canvas.undo') || 'Undo') + ' (Ctrl+Z)';
  const redoLabel =
    (t('iris.canvas.redo') || 'Redo') + ' (Ctrl+Shift+Z)';

  return (
    <div className="flex-1 flex overflow-hidden relative">
      {/* Node Palette (Left Sidebar) — 280px per handoff */}
      <aside
        className={cn(
          'flex-shrink-0 transition-all duration-300 z-10',
          'absolute md:relative inset-y-0 left-0',
          'md:bg-transparent backdrop-blur-sm md:backdrop-blur-none',
          showLeftPanel
            ? 'w-60 md:w-[280px] translate-x-0 bg-iris-bg-panel-solid'
            : 'w-0 -translate-x-full md:translate-x-0 md:w-0',
        )}
      >
        {showLeftPanel && <NodePalette onNodeAdded={onNodeAdded} />}
      </aside>

      {/* Canvas Area */}
      <div className="flex-1 relative">
        <WorkflowCanvas />

        {/* Top-left toolbar — Hide-palette toggle attached to left edge, then Undo/Redo */}
        <div
          className="hidden md:flex absolute z-10 items-center"
          style={{ top: 14, left: 14, gap: 8 }}
        >
          <button
            onClick={onToggleLeftPanel}
            style={TOOLBAR_BTN_STYLE}
            title={
              showLeftPanel
                ? t('iris.editor.hideNodePalette') || 'Hide node palette'
                : t('iris.editor.showNodePalette') || 'Show node palette'
            }
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-iris-surf-3)';
              e.currentTarget.style.color = 'var(--color-iris-text-1)';
              e.currentTarget.style.borderColor = 'var(--color-iris-line-3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--color-iris-surf-1)';
              e.currentTarget.style.color = 'var(--color-iris-text-3)';
              e.currentTarget.style.borderColor = 'var(--color-iris-line-2)';
            }}
          >
            {showLeftPanel ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>

          <div
            style={{
              width: 1,
              height: 22,
              background: 'var(--color-iris-line-2)',
              margin: '0 2px',
            }}
          />

          <button
            onClick={undo}
            disabled={!canUndo()}
            style={{
              ...TOOLBAR_BTN_STYLE,
              opacity: canUndo() ? 1 : 0.4,
              cursor: canUndo() ? 'pointer' : 'not-allowed',
            }}
            title={undoLabel}
          >
            <Undo2 size={18} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo()}
            style={{
              ...TOOLBAR_BTN_STYLE,
              opacity: canRedo() ? 1 : 0.4,
              cursor: canRedo() ? 'pointer' : 'not-allowed',
            }}
            title={redoLabel}
          >
            <Redo2 size={18} />
          </button>
        </div>

        {/* Top-right toolbar — Hide-config toggle attached to right edge */}
        <div
          className="hidden md:flex absolute z-10"
          style={{ top: 14, right: 14 }}
        >
          <button
            onClick={onToggleRightPanel}
            style={TOOLBAR_BTN_STYLE}
            title={
              showRightPanel
                ? t('iris.editor.hideConfigPanel') || 'Hide config panel'
                : t('iris.editor.showConfigPanel') || 'Show config panel'
            }
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-iris-surf-3)';
              e.currentTarget.style.color = 'var(--color-iris-text-1)';
              e.currentTarget.style.borderColor = 'var(--color-iris-line-3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--color-iris-surf-1)';
              e.currentTarget.style.color = 'var(--color-iris-text-3)';
              e.currentTarget.style.borderColor = 'var(--color-iris-line-2)';
            }}
          >
            {showRightPanel ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
        </div>

        {/* Mobile Panel Toggle Buttons */}
        <div className="flex md:hidden absolute bottom-4 left-1/2 -translate-x-1/2 z-10 gap-2">
          <button
            onClick={onToggleLeftPanel}
            className="inline-flex items-center"
            style={{
              gap: 8,
              padding: '0 12px',
              height: 32,
              borderRadius: 10,
              fontSize: 12.5,
              fontWeight: 500,
              color: showLeftPanel
                ? 'var(--color-iris-violet)'
                : 'var(--color-iris-text-2)',
              background: showLeftPanel
                ? 'rgba(167,139,250,0.18)'
                : 'var(--color-iris-surf-1)',
              border:
                '1px solid ' +
                (showLeftPanel
                  ? 'rgba(167,139,250,0.4)'
                  : 'var(--color-iris-line-2)'),
            }}
          >
            {showLeftPanel ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
            {t('iris.editor.nodes')}
          </button>
          <button
            onClick={onToggleRightPanel}
            className="inline-flex items-center"
            style={{
              gap: 8,
              padding: '0 12px',
              height: 32,
              borderRadius: 10,
              fontSize: 12.5,
              fontWeight: 500,
              color: showRightPanel
                ? 'var(--color-iris-violet)'
                : 'var(--color-iris-text-2)',
              background: showRightPanel
                ? 'rgba(167,139,250,0.18)'
                : 'var(--color-iris-surf-1)',
              border:
                '1px solid ' +
                (showRightPanel
                  ? 'rgba(167,139,250,0.4)'
                  : 'var(--color-iris-line-2)'),
            }}
          >
            {showRightPanel ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
            {t('iris.editor.config')}
          </button>
        </div>
      </div>

      {/* Properties Panel (Right Sidebar) — 360px per handoff */}
      <aside
        className={cn(
          'flex-shrink-0 transition-all duration-300 z-10',
          'absolute md:relative inset-y-0 right-0',
          'md:bg-transparent backdrop-blur-sm md:backdrop-blur-none',
          showRightPanel
            ? 'w-72 sm:w-80 md:w-[360px] translate-x-0 bg-iris-bg-panel-solid'
            : 'w-0 translate-x-full md:translate-x-0 md:w-0',
        )}
      >
        {showRightPanel && <NodeConfigPanel />}
      </aside>

      {/* Mobile Backdrop */}
      {(showLeftPanel || showRightPanel) && (
        <div
          className="md:hidden absolute inset-0 bg-black/30 z-0"
          onClick={onClosePanels}
        />
      )}
    </div>
  );
}
