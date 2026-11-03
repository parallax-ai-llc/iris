'use client';

import { useCallback, useRef, useMemo, useState, useEffect, useId } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  useStore,
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
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Loader2,
  CheckCircle,
  XCircle,
  MousePointer2,
  Hand,
  Hash,
  Undo2,
  Redo2,
  Sun,
  Moon,
  Minus,
  Plus,
  Workflow as WorkflowIcon,
} from 'lucide-react';
import type { EditorTheme } from '../../hooks/useEditorTheme';
import { useExecutionPolling } from '../../hooks/useExecutionPolling';
import { useI18n } from '@editor/hooks/usei18n';
import { useSeams } from '@editor/seams';

// Custom node types
const nodeTypes: NodeTypes = {
  irisNode: IrisNode,
};

// Edges are thin bezier curves. Themed hosts set --we-edge; others keep the
// violet → cyan gradient.
const defaultEdgeOptions: DefaultEdgeOptions = {
  type: 'default',
  animated: false,
  style: {
    stroke: 'url(#weEdgeIris)',
    strokeWidth: 1.4,
  },
  deletable: true,
  focusable: true,
  interactionWidth: 20,
};

const edgeStyles = {
  default: {
    stroke: 'url(#weEdgeIris)',
    strokeWidth: 1.4,
  },
  selected: {
    stroke: 'var(--color-iris-err, #f87171)',
    strokeWidth: 2,
    filter: 'drop-shadow(0 0 6px rgba(248,113,113,0.45))',
  },
};

/** Floating canvas chrome (zoom pill + bottom toolbar). Hosts that draw their own toolbar omit it. */
export interface WorkflowCanvasChrome {
  theme: EditorTheme;
  onToggleTheme: () => void;
}

interface WorkflowCanvasProps {
  chrome?: WorkflowCanvasChrome;
}

/** Fallback clipboard when the system clipboard cannot be read. */
let lastCopiedFragment: unknown = null;

// Inner canvas component (needs ReactFlowProvider context)
function CanvasInner({ chrome }: WorkflowCanvasProps) {
  const { t } = useI18n();
  const [tool, setTool] = useState<'select' | 'hand'>('select');
  const [snap, setSnap] = useState(true);
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

  // Palette click (instead of drag): add the node at the middle of the view.
  useEffect(() => {
    const handleAddRequest = (e: CustomEvent<{ nodeType: string; nodeData: Record<string, unknown> }>) => {
      if (isKeyboardActive && !isKeyboardActive()) return;
      const rect = reactFlowWrapper.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const center = screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      addNode(e.detail.nodeType, { x: center.x - 120, y: center.y - 60 }, e.detail.nodeData);
    };
    window.addEventListener('iris-node-add-request', handleAddRequest as EventListener);
    return () => window.removeEventListener('iris-node-add-request', handleAddRequest as EventListener);
  }, [addNode, screenToFlowPosition, isKeyboardActive]);

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
  const edgeStroke = `var(--we-edge, url(#${gradientId}))`;
  const edgeDefaultStyle = useMemo(() => ({ ...edgeStyles.default, stroke: edgeStroke }), [edgeStroke]);
  const edgeLiveStyle = useMemo(
    () => ({ ...edgeStyles.default, stroke: `var(--we-edge-live, url(#${gradientId}))` }),
    [gradientId],
  );
  const canvasEdgeOptions = useMemo<DefaultEdgeOptions>(
    () => ({ ...defaultEdgeOptions, style: { ...defaultEdgeOptions.style, stroke: edgeStroke } }),
    [edgeStroke]
  );

  // Selected edges turn red; while a run is in progress the rest flow.
  const styledEdges = useMemo(() => {
    return edges.map((edge) => {
      const isSelected = selectedEdgeIds.includes(edge.id);
      return {
        ...edge,
        // Floating-chrome hosts draw bezier curves; others keep the stored type.
        type: chrome ? 'default' : edge.type,
        style: isSelected ? edgeStyles.selected : isExecuting ? edgeLiveStyle : edgeDefaultStyle,
        animated: !isSelected && isExecuting,
      };
    });
  }, [edges, selectedEdgeIds, edgeDefaultStyle, edgeLiveStyle, isExecuting, chrome]);

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
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        snapToGrid={snap}
        snapGrid={[16, 16]}
        panOnDrag={chrome && tool === 'select' ? [1, 2] : true}
        selectionOnDrag={!!chrome && tool === 'select'}
        connectionLineStyle={{ stroke: 'var(--we-edge-live, var(--color-iris-violet, #a78bfa))', strokeWidth: 1.4 }}
        connectionLineType={ConnectionLineType.Bezier}
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
          gap={chrome ? 20 : 24}
          size={chrome ? 1.2 : 1}
          // An SVG fill attribute cannot read CSS variables, so the dot colour is resolved here.
          color={
            chrome
              ? chrome.theme === 'light'
                ? 'rgba(0,0,0,0.2)'
                : 'rgba(255,255,255,0.13)'
              : 'color-mix(in srgb, var(--color-iris-fg, #fff) 4.5%, transparent)'
          }
        />
        {chrome && (
          <>
            <Panel position="top-center" className="hidden md:block" style={{ marginTop: 14 }}>
              <ZoomPill />
            </Panel>
            <Panel position="bottom-center" style={{ marginBottom: 18 }}>
              <CanvasToolbar
                tool={tool}
                onTool={setTool}
                snap={snap}
                onToggleSnap={() => setSnap((v) => !v)}
                onFit={() => fitView({ padding: 0.25, maxZoom: 1, duration: 250 })}
                onUndo={undo}
                onRedo={redo}
                canUndo={canUndo()}
                canRedo={canRedo()}
                theme={chrome.theme}
                onToggleTheme={chrome.onToggleTheme}
              />
            </Panel>
          </>
        )}
        {!chrome && (
        <>
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
        </>
        )}

        {/* Execution status toast */}
        {(isExecuting || executionSummary) && (
          <Panel
            position={chrome ? 'bottom-center' : 'top-center'}
            style={chrome ? { marginBottom: 76 } : { marginTop: 8 }}
          >
            <RunToast
              isExecuting={isExecuting}
              summary={executionSummary}
              onClose={resetExecution}
            />
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
export function WorkflowCanvas({ chrome }: WorkflowCanvasProps = {}) {
  return (
    <ReactFlowProvider>
      <CanvasInner chrome={chrome} />
    </ReactFlowProvider>
  );
}

/** Top-centre zoom readout: − 100% +; the number resets to 100%. */
function ZoomPill() {
  const { t } = useI18n();
  const { zoomIn, zoomOut, zoomTo } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  return (
    <div className="we-float flex items-center" style={{ height: 34, padding: 2, borderRadius: 10 }}>
      <button
        type="button"
        onClick={() => zoomOut({ duration: 150 })}
        className="we-tool"
        title={t('iris.canvas.zoomOut') || 'Zoom out'}
        aria-label={t('iris.canvas.zoomOut') || 'Zoom out'}
      >
        <Minus size={13} />
      </button>
      <button
        type="button"
        onClick={() => zoomTo(1, { duration: 150 })}
        className="we-tool"
        style={{
          minWidth: 52,
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          fontSize: 11,
          color: 'var(--color-iris-text-2)',
        }}
        title={t('iris.canvas.resetZoom') || 'Reset to 100%'}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={() => zoomIn({ duration: 150 })}
        className="we-tool"
        title={t('iris.canvas.zoomIn') || 'Zoom in'}
        aria-label={t('iris.canvas.zoomIn') || 'Zoom in'}
      >
        <Plus size={13} />
      </button>
    </div>
  );
}

interface CanvasToolbarProps {
  tool: 'select' | 'hand';
  onTool: (tool: 'select' | 'hand') => void;
  snap: boolean;
  onToggleSnap: () => void;
  onFit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  theme: EditorTheme;
  onToggleTheme: () => void;
}

type ToolbarItem =
  | { label: string; icon: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean }
  | 'divider';

/** Some locales already put the shortcut in the label. */
function withShortcut(label: string, shortcut: string): string {
  return label.includes(shortcut) ? label : `${label} (${shortcut})`;
}

/** Bottom-centre tool dock. */
function CanvasToolbar({
  tool,
  onTool,
  snap,
  onToggleSnap,
  onFit,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  theme,
  onToggleTheme,
}: CanvasToolbarProps) {
  const { t } = useI18n();
  const items: ToolbarItem[] = [
    { label: `${t('iris.canvas.selectTool') || 'Select'} (V)`, icon: <MousePointer2 size={14} />, onClick: () => onTool('select'), active: tool === 'select' },
    { label: `${t('iris.canvas.handTool') || 'Hand'} (H)`, icon: <Hand size={14} />, onClick: () => onTool('hand'), active: tool === 'hand' },
    'divider',
    { label: t('iris.canvas.snapToGrid') || 'Snap to grid', icon: <Hash size={14} />, onClick: onToggleSnap, active: snap },
    { label: t('iris.canvas.fitView') || 'Fit view', icon: <Maximize2 size={14} />, onClick: onFit },
    'divider',
    { label: withShortcut(t('iris.canvas.undo') || 'Undo', 'Ctrl+Z'), icon: <Undo2 size={14} />, onClick: onUndo, disabled: !canUndo },
    { label: withShortcut(t('iris.canvas.redo') || 'Redo', 'Ctrl+Shift+Z'), icon: <Redo2 size={14} />, onClick: onRedo, disabled: !canRedo },
    'divider',
    {
      label: theme === 'dark' ? t('iris.canvas.lightMode') || 'Light mode' : t('iris.canvas.darkMode') || 'Dark mode',
      icon: theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />,
      onClick: onToggleTheme,
    },
  ];

  // V / H switch tools like design apps (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'v') onTool('select');
      else if (k === 'h') onTool('hand');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onTool]);

  return (
    <div
      role="toolbar"
      aria-label={t('iris.canvas.toolbar') || 'Canvas tools'}
      className="we-float flex items-center"
      style={{ height: 40, padding: 4, borderRadius: 12, gap: 2 }}
    >
      {items.map((item, i) =>
        item === 'divider' ? (
          <span
            key={`d${i}`}
            style={{ width: 1, height: 18, margin: '0 4px', background: 'var(--color-iris-line-2)' }}
          />
        ) : (
          <button
            key={item.label}
            type="button"
            className="we-tool"
            data-active={item.active ? 'true' : undefined}
            aria-pressed={item.active}
            disabled={item.disabled}
            onClick={item.onClick}
            title={item.label}
            aria-label={item.label}
          >
            {item.icon}
          </button>
        ),
      )}
    </div>
  );
}

interface RunToastProps {
  isExecuting: boolean;
  summary: { completed: number; failed: number; running: number; total: number } | null;
  onClose: () => void;
}

/** Run status card: icon tile, title, mono progress line and a thin bar. */
function RunToast({ isExecuting, summary, onClose }: RunToastProps) {
  const { t } = useI18n();
  const done = summary ? summary.completed + summary.failed : 0;
  const pct = summary && summary.total > 0 ? Math.min(100, Math.round((done / summary.total) * 100)) : 0;
  const failed = !isExecuting && !!summary?.failed;
  const title = isExecuting
    ? t('iris.canvas.executing')
    : failed
    ? t('iris.canvas.errorInNodes', { count: summary!.failed })
    : t('iris.canvas.executionComplete');
  const accent = failed
    ? 'var(--color-iris-err)'
    : isExecuting
    ? 'var(--color-iris-text-1)'
    : 'var(--color-iris-ok)';

  return (
    <div
      className="we-float we-pop flex items-center"
      style={{ gap: 12, padding: '8px 14px 8px 8px', borderRadius: 14, minWidth: 340 }}
      role="status"
    >
      <span
        className="inline-flex items-center justify-center flex-shrink-0"
        style={{
          width: 36,
          height: 36,
          borderRadius: 9,
          background: 'var(--color-iris-surf-3)',
          border: '1px solid var(--color-iris-line-2)',
          color: accent,
        }}
      >
        {isExecuting ? (
          <Loader2 size={15} className="animate-spin" />
        ) : failed ? (
          <XCircle size={15} />
        ) : summary ? (
          <CheckCircle size={15} />
        ) : (
          <WorkflowIcon size={15} />
        )}
      </span>
      <div className="min-w-0" style={{ flex: '0 1 auto' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-iris-text-1)', whiteSpace: 'nowrap' }}>
          {title}
        </div>
        {summary && (
          <div
            style={{
              fontSize: 10.5,
              marginTop: 2,
              color: 'var(--color-iris-text-4)',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              whiteSpace: 'nowrap',
            }}
          >
            {t('iris.canvas.completedCount', { completed: summary.completed, total: summary.total })}
            {summary.running > 0 && ` · ${t('iris.canvas.runningCount', { count: summary.running })}`}
            {` · ${pct}%`}
          </div>
        )}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 90,
          height: 3,
          borderRadius: 999,
          background: 'var(--color-iris-surf-3)',
          overflow: 'hidden',
        }}
      >
        <div
          className="transition-all duration-500"
          style={{
            width: `${isExecuting ? Math.max(pct, 4) : 100}%`,
            height: '100%',
            borderRadius: 999,
            background: accent,
          }}
        />
      </div>
      {!isExecuting && summary && (
        <button
          type="button"
          onClick={onClose}
          className="we-chip"
          style={{ height: 26, padding: '0 8px', fontSize: 11.5 }}
        >
          {t('iris.canvas.close')}
        </button>
      )}
    </div>
  );
}

