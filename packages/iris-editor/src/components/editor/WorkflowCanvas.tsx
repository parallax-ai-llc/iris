'use client';

import { useCallback, useRef, useMemo, useState, useEffect } from 'react';
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
import { useIrisEditorStore, IrisNodeData } from '@editor/store/iris-editor';
import { cn } from '@editor/lib/convert/string';
import { IrisNode } from './nodes/IrisNode';
import { ConfirmModal } from '../common/ConfirmModal';
import { getNodeDefinition, PortType } from '../../constants/node-definitions';
import { ZoomIn, ZoomOut, Maximize2, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useExecutionPolling } from '../../hooks/useExecutionPolling';
import { useI18n } from '@editor/hooks/usei18n';

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
    stroke: '#f87171',
    strokeWidth: 2.5,
    filter: 'drop-shadow(0 0 6px rgba(248,113,113,0.45))',
  },
};

// Validate connection
function isValidConnection(connection: Connection, nodes: any[]): boolean {
  if (!connection.source || !connection.target) return false;
  if (connection.source === connection.target) return false;

  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);

  if (!sourceNode || !targetNode) return false;

  const sourceNodeDef = getNodeDefinition(sourceNode.data?.type);
  const targetNodeDef = getNodeDefinition(targetNode.data?.type);

  if (!sourceNodeDef || !targetNodeDef) return true;

  // Find the source output port and target input port
  const sourcePort = sourceNodeDef.outputs.find(
    (p) => p.name === connection.sourceHandle
  );
  const targetPort = targetNodeDef.inputs.find(
    (p) => p.name === connection.targetHandle
  );

  if (!sourcePort || !targetPort) return true;

  // Type compatibility check
  const compatibleTypes: Record<PortType, PortType[]> = {
    any: ['text', 'image', 'video', 'audio', 'document', 'json', 'any', 'trigger'],
    trigger: ['trigger'],
    text: ['text', 'any', 'json'],
    image: ['image', 'any'],
    video: ['video', 'any'],
    audio: ['audio', 'any'],
    document: ['document', 'any'],
    json: ['json', 'any', 'text'],
  };

  const allowed = compatibleTypes[sourcePort.type] || [];
  return allowed.includes(targetPort.type) || targetPort.type === 'any';
}

// Inner canvas component (needs ReactFlowProvider context)
function CanvasInner() {
  const { t } = useI18n();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView, zoomIn, zoomOut, screenToFlowPosition } = useReactFlow();
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    nodeId: string | null;
    nodeName: string | null;
  }>({ isOpen: false, nodeId: null, nodeName: null });

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

    const completed = nodeIds.filter((id) => executionProgress[id]?.status === 'success').length;
    const failed = nodeIds.filter((id) => executionProgress[id]?.status === 'error').length;
    const running = nodeIds.filter((id) => executionProgress[id]?.status === 'running').length;
    const total = nodes.length;

    return { completed, failed, running, total };
  }, [executionProgress, nodes.length]);

  // 선택된 edge에 스타일 적용
  const styledEdges = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
      style: selectedEdgeIds.includes(edge.id) ? edgeStyles.selected : edgeStyles.default,
      animated: !selectedEdgeIds.includes(edge.id), // 선택되면 애니메이션 끄기
    }));
  }, [edges, selectedEdgeIds]);

  // Handle node/edge selection
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: any[]; edges: any[] }) => {
      // 노드 선택
      if (selectedNodes.length === 1) {
        selectNode(selectedNodes[0].id);
      } else if (selectedNodes.length === 0) {
        selectNode(null);
      }
      // Edge 선택 추적
      setSelectedEdgeIds(selectedEdges.map((e) => e.id));
    },
    [selectNode]
  );

  // Handle connection with validation
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (isValidConnection(connection, nodes)) {
        onConnect(connection);
      }
    },
    [nodes, onConnect]
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
  // Editable targets (inputs, textareas, contenteditable) are skipped so the
  // user can still use the browser's native undo while editing text fields.
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (target.isContentEditable) return true;
      return false;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (deleteConfirm.isOpen) return;
      if (isEditableTarget(event.target)) return;

      // Undo/Redo — handle "z" and "Z" since shift produces uppercase
      if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      // Delete selected edges with Backspace or Delete key (no confirmation needed)
      if ((event.key === 'Backspace' || event.key === 'Delete') && selectedEdgeIds.length > 0 && !selectedNodeId) {
        event.preventDefault();
        for (const edgeId of selectedEdgeIds) {
          deleteEdge(edgeId);
        }
        setSelectedEdgeIds([]);
        return;
      }

      // Delete selected node with Backspace or Delete key (with confirmation)
      if ((event.key === 'Backspace' || event.key === 'Delete') && selectedNodeId) {
        event.preventDefault();
        const selectedNode = nodes.find((n) => n.id === selectedNodeId);
        setDeleteConfirm({
          isOpen: true,
          nodeId: selectedNodeId,
          nodeName: selectedNode?.data?.label || null,
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectedNodeId, selectedEdgeIds, nodes, deleteConfirm.isOpen, deleteEdge]);

  // Handle delete confirmation
  const handleConfirmDelete = useCallback(() => {
    if (deleteConfirm.nodeId) {
      deleteNode(deleteConfirm.nodeId);
    }
    setDeleteConfirm({ isOpen: false, nodeId: null, nodeName: null });
  }, [deleteConfirm.nodeId, deleteNode]);

  // Minimap node colors — handoff palette
  const minimapNodeColor = useCallback((node: any) => {
    const colors: Record<string, string> = {
      TRIGGER: '#34d399',
      GENERATOR: '#a78bfa',
      ANALYZER: '#7dd3fc',
      EDITOR: '#fbbf24',
      UTILITY: '#94a3b8',
      OUTPUT: '#f0abfc',
    };
    return colors[node.data?.category] || '#94a3b8';
  }, []);

  return (
    <div
      ref={reactFlowWrapper}
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
        onSelectionChange={handleSelectionChange}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        deleteKeyCode={null}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        connectionLineStyle={{ stroke: '#a78bfa', strokeWidth: 1.8 }}
        connectionLineType={ConnectionLineType.SmoothStep}
        proOptions={{ hideAttribution: true }}
      >
        {/* SVG gradient defs for edges */}
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id="weEdgeIris" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.85" />
            </linearGradient>
          </defs>
        </svg>

        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="rgba(255,255,255,0.045)"
        />
        <MiniMap
          nodeColor={minimapNodeColor}
          maskColor="rgba(7,7,10,0.7)"
          style={{
            width: 196,
            height: 96,
            borderRadius: 10,
            background: 'rgba(7,7,10,0.7)',
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
            <span>{t('iris.canvas.dragToAdd') || '드래그해서 추가'}</span>
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
            <span>{t('iris.canvas.pan') || '이동'}</span>
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
            <span>{t('iris.canvas.run') || '실행'}</span>
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
