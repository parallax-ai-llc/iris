'use client';

import { useCallback, useRef, useMemo, useState, useEffect, useId } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  Connection,
  NodeTypes,
  DefaultEdgeOptions,
  Panel,
  BackgroundVariant,
  ConnectionLineType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useIrisEditorStore, type IrisNodeData } from '@editor/store/iris-editor';
import { toast } from 'sonner';
import { cn } from '@editor/lib/convert/string';
import { IrisNode } from './nodes/IrisNode';
import { ConfirmModal } from '../common/ConfirmModal';
import { ZoomIn, ZoomOut, Maximize2, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useExecutionPolling } from '../../hooks/useExecutionPolling';
import { useI18n } from '@editor/hooks/usei18n';
import { useSeams } from '@editor/seams';

// Custom node types
const nodeTypes: NodeTypes = {
  irisNode: IrisNode,
};

// Custom edge options — Iris handoff: bezier with iris-grad
const defaultEdgeOptions: DefaultEdgeOptions = {
  type: 'smoothstep',
  animated: true,
  style: {
    stroke: 'url(#weEdgeIris)',
    strokeWidth: 1.8,
  },
  deletable: true,
  focusable: true,
  interactionWidth: 20,
};

const edgeStyles = {
  default: {
    stroke: 'url(#weEdgeIris)',
    strokeWidth: 1.8,
  },
  selected: {
    stroke: 'var(--color-iris-err, #f87171)',
    strokeWidth: 2.5,
    filter: 'drop-shadow(0 0 6px rgba(248,113,113,0.45))',
  },
};

/** Fallback clipboard when the system clipboard cannot be read. */
let lastCopiedFragment: unknown = null;

// Inner canvas component (needs ReactFlowProvider context)
function CanvasInner() {
  const { t } = useI18n();
  const { hostHandlesHistoryKeys, isKeyboardActive, clipboard } = useSeams();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView, zoomIn, zoomOut, screenToFlowPosition } = useReactFlow();
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    nodeId: string | null;
    nodeName: string | null;
    /** Delete the whole selection (nodes + edges) instead of `nodeId`. */
    selection?: boolean;
  }>({ isOpen: false, nodeId: null, nodeName: null });
  // Last pointer position in flow coordinates (paste target).
  const pointerFlowPos = useRef<{ x: number; y: number } | null>(null);

  const {
    nodes,
    edges,
    selectedNodeId,
    onNodesChange,
    onEdgesChange,
    onConnect,
    selectNode,
    addNode,
    deleteNode,
    deleteEdge,
    undo,
    redo,
    canUndo,
    canRedo,
    isExecuting,
    executionProgress,
    checkConnection,
    deleteSelection,
    copySelection,
    pasteFragment,
    duplicateSelection,
    getSelectedNodeIds,
    history,
  } = useIrisEditorStore();

  // Execution polling - auto-starts when execution begins
  // Visual feedback is shown directly on canvas nodes, no toasts needed
  const { resetExecution } = useExecutionPolling({
    interval: 1000,
    fetchNodeResults: true,
  });

  // Listen for delete request from IrisNode (trash button click)
  useEffect(() => {
    const handleDeleteRequest = (e: CustomEvent<{ nodeId: string; nodeName: string }>) => {
      setDeleteConfirm({
        isOpen: true,
        nodeId: e.detail.nodeId,
        nodeName: e.detail.nodeName,
      });
    };

    window.addEventListener('iris-node-delete-request', handleDeleteRequest as EventListener);
    return () => {
      window.removeEventListener('iris-node-delete-request', handleDeleteRequest as EventListener);
    };
  }, []);

  // Calculate execution progress summary
  const executionSummary = useMemo(() => {
    const nodeIds = Object.keys(executionProgress);
    if (nodeIds.length === 0) return null;

    // Pruned (skipped) nodes count as settled: they are finished for the run
    // even though they never executed, so the progress counter reaches total.
    const completed = nodeIds.filter(
      (id) => executionProgress[id]?.status === 'success' || executionProgress[id]?.status === 'skipped',
    ).length;
    const failed = nodeIds.filter((id) => executionProgress[id]?.status === 'error').length;
    const running = nodeIds.filter((id) => executionProgress[id]?.status === 'running').length;
    const total = nodes.length;

    return { completed, failed, running, total };
  }, [executionProgress, nodes.length]);

  // The edge gradient id is unique per canvas: hosts that keep several editors
  // mounted (desktop tabs) would otherwise resolve `url(#…)` to the gradient
  // inside a hidden tab, and the edges would draw with no stroke.
  const gradientId = `weEdgeIris-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const edgeDefaultStyle = useMemo(() => ({ ...edgeStyles.default, stroke: `url(#${gradientId})` }), [gradientId]);
  const canvasEdgeOptions = useMemo<DefaultEdgeOptions>(
    () => ({ ...defaultEdgeOptions, style: { ...defaultEdgeOptions.style, stroke: `url(#${gradientId})` } }),
    [gradientId]
  );

  // 선택된 edge에 스타일 적용
  const styledEdges = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
      style: selectedEdgeIds.includes(edge.id) ? edgeStyles.selected : edgeDefaultStyle,
      animated: !selectedEdgeIds.includes(edge.id), // 선택되면 애니메이션 끄기
    }));
  }, [edges, selectedEdgeIds, edgeDefaultStyle]);

  // Handle node/edge selection
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: any[]; edges: any[] }) => {
      // 노드 선택: 하나면 설정 패널 대상, 여러 개면 패널 대상 없음(U-06)
      if (selectedNodes.length === 1) {
        selectNode(selectedNodes[0].id);
      } else {
        selectNode(null);
      }
      // Edge 선택 추적
      setSelectedEdgeIds(selectedEdges.map((e) => e.id));
    },
    [selectNode]
  );

  // Connections follow the shared rules (iris-nodes canConnect): the store
  // refuses what does not fit and replaces an edge already on the input.
  const handleConnect = useCallback(
    (connection: Connection) => {
      onConnect(connection);
    },
    [onConnect]
  );

  // Same rules while dragging, so a refused handle is shown before the drop.
  const isValidConnection = useCallback(
    (connection: Connection | { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) =>
      checkConnection(connection as Connection).ok,
    [checkConnection]
  );

  const handlePaneMouseMove = useCallback(
    (event: React.MouseEvent) => {
      pointerFlowPos.current = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    },
    [screenToFlowPosition]
  );

  // Handle drop for adding nodes from palette
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowWrapper.current) return;

      const nodeType = event.dataTransfer.getData('application/reactflow/nodeType');
      const nodeData = event.dataTransfer.getData('application/reactflow/nodeData');

      if (!nodeType || !nodeData) return;

      // Use screenToFlowPosition to convert screen coordinates to flow coordinates
      // This properly accounts for zoom and pan
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const data = JSON.parse(nodeData);
      addNode(nodeType, position, data);
    },
    [addNode, screenToFlowPosition]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Keyboard shortcuts — attached to window so they work without canvas focus.
  // Text fields inside the editor are marked data-history-scope="doc": their
  // Ctrl+Z goes to the document history (the field re-renders from the
  // document), so the field and the editor never keep two histories (U-03).
  // Fields outside (search, dialogs) keep the browser's own undo.
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (target.isContentEditable) return true;
      return false;
    };
    const historyScope = (target: EventTarget | null): string | null =>
      target instanceof HTMLElement
        ? target.closest('[data-history-scope]')?.getAttribute('data-history-scope') ?? null
        : null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (deleteConfirm.isOpen) return;
      // A hidden editor (another tab is in front) ignores the keyboard.
      if (isKeyboardActive && !isKeyboardActive()) return;
      // Never record mid-composition (Korean / Japanese IME).
      if (event.isComposing) return;
      const editable = isEditableTarget(event.target);
      if (editable && historyScope(event.target) !== 'doc') return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      // Undo/Redo — "z" (shift = redo) and "y"
      if (mod && (key === 'z' || key === 'y')) {
        if (hostHandlesHistoryKeys) return;
        event.preventDefault();
        history.breakMerge();
        if (key === 'y' || event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (editable) return;

      if (mod && key === 'c') {
        const fragment = copySelection();
        if (!fragment) return;
        event.preventDefault();
        lastCopiedFragment = fragment;
        void (clipboard ?? navigator.clipboard)?.writeText(JSON.stringify(fragment)).catch(() => undefined);
        return;
      }

      if (mod && key === 'v') {
        event.preventDefault();
        const at = pointerFlowPos.current ?? undefined;
        const applyPaste = (raw: unknown) => {
          const result = pasteFragment(raw, at);
          if (result.skippedTrigger) toast.warning('A workflow can have one trigger; the copied trigger was not pasted.');
          if (result.skippedTypes.length > 0) {
            toast.warning(`Unknown node types were not pasted: ${[...new Set(result.skippedTypes)].join(', ')}`);
          }
        };
        const read = (clipboard ?? navigator.clipboard)?.readText?.();
        if (!read) {
          if (lastCopiedFragment) applyPaste(lastCopiedFragment);
          return;
        }
        read
          .then((text) => {
            let parsed: unknown = null;
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = null;
            }
            applyPaste(parsed && typeof parsed === 'object' ? parsed : lastCopiedFragment);
          })
          .catch(() => {
            if (lastCopiedFragment) applyPaste(lastCopiedFragment);
          });
        return;
      }

      if (mod && key === 'd') {
        event.preventDefault();
        duplicateSelection();
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        const selectedIds = getSelectedNodeIds();
        const ids = selectedIds.length > 0 ? selectedIds : selectedNodeId ? [selectedNodeId] : [];
        if (ids.length === 0) {
          // Edges only: no confirmation, one undo step.
          if (selectedEdgeIds.length > 0) {
            event.preventDefault();
            deleteSelection();
            setSelectedEdgeIds([]);
          }
          return;
        }
        event.preventDefault();
        const first = nodes.find((n) => n.id === ids[0]);
        setDeleteConfirm({
          isOpen: true,
          nodeId: ids.length === 1 ? ids[0] : null,
          nodeName: ids.length === 1 ? first?.data?.label || null : `${ids.length} nodes`,
          selection: true,
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    undo,
    redo,
    history,
    selectedNodeId,
    selectedEdgeIds,
    nodes,
    deleteConfirm.isOpen,
    copySelection,
    pasteFragment,
    duplicateSelection,
    deleteSelection,
    getSelectedNodeIds,
    hostHandlesHistoryKeys,
    isKeyboardActive,
    clipboard,
  ]);

  // Handle delete confirmation
  const handleConfirmDelete = useCallback(() => {
    if (deleteConfirm.selection) {
      deleteSelection();
      setSelectedEdgeIds([]);
    } else if (deleteConfirm.nodeId) {
      deleteNode(deleteConfirm.nodeId);
    }
    setDeleteConfirm({ isOpen: false, nodeId: null, nodeName: null });
  }, [deleteConfirm.nodeId, deleteConfirm.selection, deleteNode, deleteSelection]);

  // Minimap node colors — handoff palette
  const minimapNodeColor = useCallback((node: any) => {
    const colors: Record<string, string> = {
      TRIGGER: 'var(--color-iris-cat-trigger, #34d399)',
      GENERATOR: 'var(--color-iris-cat-generator, #a78bfa)',
      ANALYZER: 'var(--color-iris-cat-analyzer, #7dd3fc)',
      EDITOR: 'var(--color-iris-cat-editor, #fbbf24)',
      UTILITY: 'var(--color-iris-cat-utility, #94a3b8)',
      OUTPUT: 'var(--color-iris-cat-output, #f0abfc)',
    };
    return colors[node.data?.category] || 'var(--color-iris-cat-utility, #94a3b8)';
  }, []);

  return (
    <div
      ref={reactFlowWrapper}
      data-history-scope="doc"
      onBlur={() => history.breakMerge()}
      className="w-full h-full"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        isValidConnection={isValidConnection}
        onPaneMouseMove={handlePaneMouseMove}
        onSelectionChange={handleSelectionChange}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={canvasEdgeOptions}
        deleteKeyCode={null}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        connectionLineStyle={{ stroke: 'var(--color-iris-violet, #a78bfa)', strokeWidth: 1.8 }}
        connectionLineType={ConnectionLineType.SmoothStep}
        proOptions={{ hideAttribution: true }}
      >
        {/* SVG gradient defs for edges */}
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" style={{ stopColor: 'var(--color-iris-violet, #a78bfa)', stopOpacity: 0.85 }} />
              <stop offset="100%" style={{ stopColor: 'var(--color-iris-cyan, #7dd3fc)', stopOpacity: 0.85 }} />
            </linearGradient>
          </defs>
        </svg>

        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="color-mix(in srgb, var(--color-iris-fg, #fff) 4.5%, transparent)"
        />
        <MiniMap
          nodeColor={minimapNodeColor}
          maskColor="var(--color-iris-minimap-mask, rgba(7,7,10,0.7))"
          style={{
            width: 196,
            height: 96,
            borderRadius: 10,
            background: 'var(--color-iris-minimap-bg, rgba(7,7,10,0.7))',
            border: '1px solid var(--color-iris-line-2)',
            backdropFilter: 'blur(14px)',
          }}
        />

        {/* Bottom-right zoom controls — column to the right of minimap is rendered below */}
        <Panel position="bottom-right" className="flex flex-col" style={{ gap: 4, marginRight: 208 }}>
          <button
            onClick={() => zoomIn()}
            className="we-iconbtn"
            title={t('iris.canvas.zoomIn')}
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => fitView({ padding: 0.2 })}
            className="we-iconbtn"
            title={t('iris.canvas.fitView')}
          >
            <Maximize2 size={14} />
          </button>
          <button
            onClick={() => zoomOut()}
            className="we-iconbtn"
            title={t('iris.canvas.zoomOut')}
          >
            <ZoomOut size={14} />
          </button>
        </Panel>

        {/* Bottom-left help hint */}
        <Panel position="bottom-left">
          <div
            className="flex items-center"
            style={{
              gap: 10,
              padding: '7px 12px',
              background: 'var(--color-iris-surf-1)',
              border: '1px solid var(--color-iris-line-2)',
              borderRadius: 999,
              fontSize: 11,
              color: 'var(--color-iris-text-4)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <span>{t('iris.canvas.dragToAdd') || 'Drag to add'}</span>
            <span style={{ color: 'var(--color-iris-text-5, rgba(255,255,255,0.22))' }}>·</span>
            <kbd
              style={{
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                padding: '1px 6px',
                border: '1px solid var(--color-iris-line-2)',
                borderRadius: 4,
              }}
            >
              Space
            </kbd>
            <span>{t('iris.canvas.pan') || 'Pan'}</span>
            <span style={{ color: 'var(--color-iris-text-5, rgba(255,255,255,0.22))' }}>·</span>
            <kbd
              style={{
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                padding: '1px 6px',
                border: '1px solid var(--color-iris-line-2)',
                borderRadius: 4,
              }}
            >
              ⌘ ↵
            </kbd>
            <span>{t('iris.canvas.run') || 'Run'}</span>
          </div>
        </Panel>

        {/* Execution Status Panel */}
        {(isExecuting || executionSummary) && (
          <Panel position="top-center" className="mt-2">
            <div
              className="flex items-center"
              style={{
                gap: 12,
                padding: '8px 14px',
                borderRadius: 10,
                background: isExecuting
                  ? 'rgba(167,139,250,0.10)'
                  : executionSummary?.failed
                  ? 'var(--color-iris-err-bg)'
                  : 'var(--color-iris-ok-bg)',
                border:
                  '1px solid ' +
                  (isExecuting
                    ? 'rgba(167,139,250,0.30)'
                    : executionSummary?.failed
                    ? 'rgba(248,113,113,0.30)'
                    : 'rgba(52,211,153,0.30)'),
                backdropFilter: 'blur(14px)',
              }}
            >
              {isExecuting ? (
                <>
                  <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-iris-violet)' }} />
                  <span style={{ fontSize: 12.5, color: 'var(--color-iris-text-1)' }}>
                    {t('iris.canvas.executing')}
                  </span>
                </>
              ) : executionSummary?.failed ? (
                <>
                  <XCircle size={14} style={{ color: 'var(--color-iris-err)' }} />
                  <span style={{ fontSize: 12.5, color: 'var(--color-iris-text-1)' }}>
                    {t('iris.canvas.errorInNodes', { count: executionSummary.failed })}
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle size={14} style={{ color: 'var(--color-iris-ok)' }} />
                  <span style={{ fontSize: 12.5, color: 'var(--color-iris-text-1)' }}>
                    {t('iris.canvas.executionComplete')}
                  </span>
                </>
              )}

              {executionSummary && (
                <div
                  className="flex items-center"
                  style={{
                    gap: 8,
                    marginLeft: 4,
                    paddingLeft: 10,
                    borderLeft: '1px solid var(--color-iris-line-2)',
                  }}
                >
                  <span style={{ fontSize: 11, color: 'var(--color-iris-text-3)' }}>
                    {t('iris.canvas.completedCount', {
                      completed: executionSummary.completed,
                      total: executionSummary.total,
                    })}
                  </span>
                  {executionSummary.running > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--color-iris-violet)' }}>
                      {t('iris.canvas.runningCount', { count: executionSummary.running })}
                    </span>
                  )}
                </div>
              )}

              {!isExecuting && executionSummary && (
                <button
                  onClick={resetExecution}
                  style={{
                    marginLeft: 4,
                    fontSize: 11,
                    color: 'var(--color-iris-text-3)',
                    background: 'transparent',
                  }}
                >
                  {t('iris.canvas.close')}
                </button>
              )}
            </div>
          </Panel>
        )}
      </ReactFlow>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, nodeId: null, nodeName: null })}
        onConfirm={handleConfirmDelete}
        type="delete"
        title={t('iris.messages.deleteConfirm')}
        message={
          deleteConfirm.nodeName
            ? `"${deleteConfirm.nodeName}" ${t('iris.editor.deleteNodeConfirmNamed')}\n\n${t('iris.editor.deleteNodeWarning')}`
            : `${t('iris.editor.deleteNodeConfirm')}\n\n${t('iris.editor.deleteNodeWarning')}`
        }
        confirmLabel={t('iris.actions.delete')}
        cancelLabel={t('iris.actions.cancel')}
      />
    </div>
  );
}

// Main component with provider wrapper
export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
