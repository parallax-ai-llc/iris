'use client';

import { memo, useState } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { cn } from '@editor/lib/convert/string';
import { IrisNodeData, useIrisEditorStore, NodeStatus } from '@editor/store/iris-editor';
import {
  getNodeDefinition,
  NodeCategory,
} from '../../../constants/node-definitions';
import {
  Trash2,
  Copy,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
  Eye,
} from 'lucide-react';
import { categoryColorClasses, categoryPalette, portTypeColors } from './nodeColors';
import { OutputPreviewTooltip, ErrorPreviewTooltip } from './NodeOutputPreview';

// Status icon component
function StatusIcon({ status }: { status: NodeStatus }) {
  switch (status) {
    case 'running':
      return <Loader2 size={14} className="animate-spin text-slate-300" />;
    case 'success':
      return <CheckCircle2 size={14} className="text-green-400 fill-green-400/20" />;
    case 'error':
      return <AlertTriangle size={14} className="text-red-400" />;
    case 'waiting':
      return <Clock size={14} className="text-yellow-400" />;
    default:
      return null;
  }
}

// Main IrisNode component
export type IrisFlowNode = Node<IrisNodeData, 'irisNode'>;
export const IrisNode = memo(function IrisNode({ id, data, selected }: NodeProps<IrisFlowNode>) {
  const { deleteNode, duplicateNode, selectNode, executionProgress, validationErrors, clearNodeValidationError, edges, nodeConfigs } = useIrisEditorStore();

  // State for output preview tooltip
  const [activeOutputPreview, setActiveOutputPreview] = useState<string | null>(null);

  // Get node config from store (for settings that user changes via panel)
  const storeConfig = nodeConfigs[id];

  // Check if a specific input is connected via edge
  const isInputConnected = (inputName: string) => {
    return edges.some(
      (edge) => edge.target === id && edge.targetHandle === inputName
    );
  };

  // Check if a specific input is configured (has value via user input, node reference, or storage)
  const isInputConfigured = (inputName: string) => {
    const inputConfig = storeConfig?.inputs?.[inputName];
    if (!inputConfig) return false;

    // Check for node reference
    if (inputConfig.nodeId && inputConfig.outputName) return true;
    // Check for storage asset
    if (inputConfig.storageAssetId) return true;
    // Check for direct value (regardless of source setting)
    if (inputConfig.value && inputConfig.value.trim()) return true;
    
    return false;
  };
  const nodeDef = getNodeDefinition(data.type);

  const colors = categoryColorClasses[data.category as NodeCategory] || categoryColorClasses.UTILITY;
  const palette = categoryPalette[data.category as NodeCategory] || categoryPalette.UTILITY;
  const nodeProgress = executionProgress[id];
  const currentStatus = nodeProgress?.status || data.status || 'idle';
  const validationError = validationErrors[id];

  // Get the icon component
  const Icon = nodeDef?.icon;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Select the node and let WorkflowCanvas handle the delete confirmation
    selectNode(id);
    // Dispatch a custom event to trigger delete confirmation modal
    window.dispatchEvent(new CustomEvent('iris-node-delete-request', { detail: { nodeId: id, nodeName: data.label } }));
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    duplicateNode(id);
  };

  const handleCloseValidationError = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearNodeValidationError(id);
  };

  return (
    <div className="relative">
      {/* Validation Error Tooltip */}
      {validationError && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-max max-w-[250px]">
          <div className="bg-amber-500 text-white text-xs rounded-lg px-3 py-2 shadow-lg flex items-start gap-2">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span className="flex-1">{validationError}</span>
            <button
              onClick={handleCloseValidationError}
              className="flex-shrink-0 hover:bg-amber-600 rounded p-0.5 transition-colors"
            >
              <X size={12} />
            </button>
          </div>
          {/* Arrow */}
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-1">
            <div className="w-2 h-2 bg-amber-500 rotate-45" />
          </div>
        </div>
      )}

      <div
        className="relative transition-all duration-200"
        style={{
          minWidth: 220,
          maxWidth: 280,
          background:
            'linear-gradient(180deg, rgba(22,22,28,0.92), rgba(14,14,20,0.96))',
          backdropFilter: 'blur(14px) saturate(140%)',
          WebkitBackdropFilter: 'blur(14px) saturate(140%)',
          border:
            '1px solid ' +
            (validationError
              ? '#fbbf24'
              : currentStatus === 'error'
              ? '#f87171'
              : selected
              ? palette.stroke
              : 'rgba(255,255,255,0.10)'),
          borderRadius: 14,
          boxShadow:
            validationError
              ? '0 0 0 4px rgba(251,191,36,0.18), 0 24px 60px -20px rgba(251,191,36,0.45)'
              : currentStatus === 'error'
              ? '0 0 0 4px rgba(248,113,113,0.18), 0 24px 60px -20px rgba(248,113,113,0.45)'
              : selected
              ? `0 0 0 4px ${palette.soft}, 0 24px 60px -20px ${palette.glow}`
              : '0 12px 32px -16px rgba(0,0,0,0.7)',
          overflow: 'visible',
        }}
      >
        {/* Top accent stripe */}
        <div
          style={{
            position: 'relative',
            left: 5,
            height: 3,
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            background: `linear-gradient(90deg, ${palette.stroke}, ${palette.stroke}80 60%, transparent)`,
            opacity: selected ? 1 : 0.6,
          }}
        />

        {/* Header */}
        <div
          className="flex items-center"
          style={{
            padding: '10px 12px',
            gap: 9,
            borderBottom: '1px solid var(--color-iris-line-1)',
          }}
        >
          <span
            className="inline-flex items-center justify-center flex-shrink-0"
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: palette.soft,
              color: palette.text,
              border: `1px solid ${palette.stroke}33`,
            }}
          >
            {Icon && <Icon size={14} />}
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="flex items-center"
              style={{
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: '-0.005em',
                gap: 5,
                color: 'var(--color-iris-text-1)',
              }}
            >
              <span
                className="truncate"
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {data.label}
              </span>
            </div>
            {nodeDef?.label && nodeDef.label !== data.label && (
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--color-iris-text-4)',
                  marginTop: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {nodeDef.label}
              </div>
            )}
          </div>
          {validationError ? (
            <AlertTriangle size={14} style={{ color: '#fbbf24' }} />
          ) : (
            <StatusIcon status={currentStatus} />
          )}
        </div>

        {/* Trigger Info Display (left side, no handle) */}
        {data.type.startsWith('TRIGGER_') && (() => {
          const config = data.config as unknown as Record<string, unknown> | undefined;
          const settings = storeConfig?.settings ?? (config?.settings as Record<string, unknown> | undefined) ?? {};

          // TRIGGER_MANUAL: Show user input type and label
          if (data.type === 'TRIGGER_MANUAL') {
            const inputType = (settings.inputType as string) ??
              (config?.inputs as Record<string, unknown> | undefined)?.inputType ?? 'text';
            const inputLabel = (settings.inputLabel as string) ??
              (config?.inputs as Record<string, unknown> | undefined)?.inputLabel ??
              (
                inputType === 'text'
                  ? 'Text Input'
                  : inputType === 'image'
                    ? 'Image Upload'
                    : inputType === 'file'
                      ? 'File Upload'
                      : 'Signal Only'
              );
            const inputTypeLabel =
              inputType === 'none' ? 'Signal' : inputType === 'text' ? 'Text' : inputType === 'image' ? 'Image' : 'File';

            return (
              <TriggerKv
                k={inputType === 'none' ? 'Signal' : `User ${inputTypeLabel}`}
                v={inputLabel}
                accent={palette}
              />
            );
          }

          // TRIGGER_SCHEDULE: Show input type and value preview
          if (data.type === 'TRIGGER_SCHEDULE') {
            const inputType = (settings.inputType as string) || 'text';
            const inputValue = (settings.inputValue as string) || '';
            const inputTypeLabel = inputType === 'none' ? 'None' : inputType === 'text' ? 'Text' : 'Image';
            const previewValue = inputValue.length > 30 ? inputValue.substring(0, 30) + '...' : inputValue;

            return (
              <div style={{ padding: '8px 12px 4px' }}>
                <TriggerKv k="Input" v={inputTypeLabel} accent={palette} inline />
                {inputType !== 'none' && inputValue && (
                  <div
                    title={inputValue}
                    style={{
                      fontSize: 10,
                      color: 'var(--color-iris-text-3)',
                      paddingLeft: 16,
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {previewValue}
                  </div>
                )}
              </div>
            );
          }

          // TRIGGER_WEBHOOK: Show POST method
          if (data.type === 'TRIGGER_WEBHOOK') {
            return <TriggerKv k="Method" v="POST" mono accent={palette} />;
          }

          // TRIGGER_EVENT: Show event type
          if (data.type === 'TRIGGER_EVENT') {
            const eventType = (settings.eventType as string) || 'custom';
            const eventName = (settings.eventName as string) || '';
            const eventLabel = eventType === 'file_uploaded' ? 'File Uploaded' :
              eventType === 'workflow_completed' ? 'Workflow Completed' :
                eventName || 'Custom Event';

            return <TriggerKv k="Event" v={eventLabel} accent={palette} />;
          }

          return null;
        })()}

        {/* Input Handles */}
        {nodeDef?.inputs && nodeDef.inputs.length > 0 && (
          <div
            className="flex flex-col"
            style={{ padding: '8px 12px', gap: 4 }}
          >
            {nodeDef.inputs.map((input) => (
              <div
                key={input.name}
                className="flex items-center"
                style={{
                  gap: 8,
                  padding: '3px 0',
                  fontSize: 11,
                  color: 'var(--color-iris-text-3)',
                  position: 'relative',
                }}
              >
                <Handle
                  type="target"
                  position={Position.Left}
                  id={input.name}
                  className="!border-2"
                  style={{
                    width: 10,
                    height: 10,
                    left: -16,
                    background: 'var(--color-iris-canvas)',
                    borderColor: palette.stroke,
                    boxShadow: 'none',
                    transition: 'box-shadow 0.18s',
                  }}
                />
                <span style={{ position: 'relative', top: 4 }}>{input.label}</span>
                {input.required && (
                  <span
                    style={{
                      fontSize: 11,
                      color:
                        isInputConnected(input.name) || isInputConfigured(input.name)
                          ? 'var(--color-iris-ok)'
                          : 'var(--color-iris-err)',
                    }}
                  >
                    *
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Execution Progress */}
        {nodeProgress && currentStatus === 'running' && typeof nodeProgress.progress === 'number' && (
          <div style={{ padding: '4px 12px 6px' }}>
            <div
              style={{
                height: 4,
                background: 'var(--color-iris-surf-3)',
                borderRadius: 999,
                overflow: 'hidden',
              }}
            >
              <div
                className="transition-all duration-300"
                style={{
                  height: '100%',
                  width: `${nodeProgress.progress}%`,
                  background: `linear-gradient(90deg, ${palette.stroke}, ${palette.stroke}80)`,
                }}
              />
            </div>
            <span
              style={{
                fontSize: 10,
                color: 'var(--color-iris-text-4)',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                marginTop: 4,
                display: 'inline-block',
              }}
            >
              {nodeProgress.progress}%
            </span>
          </div>
        )}

        {/* Output Handles */}
        {nodeDef?.outputs && nodeDef.outputs.length > 0 && (
          <div
            className="flex flex-col"
            style={{ padding: '8px 12px 12px', gap: 4 }}
          >
            {nodeDef.outputs
              // Filter outputs for trigger nodes
              .filter((output) => {
                // hideHandle ports render in the footer as a debug eye icon, not in the ports list
                if (output.hideHandle) return false;
                // TRIGGER_MANUAL: Hide 'trigger', show only the matching inputType output
                if (data.type === 'TRIGGER_MANUAL') {
                  if (output.name === 'trigger') return false;
                  const config = data.config as unknown as Record<string, unknown> | undefined;
                  const inputType =
                    storeConfig?.settings?.inputType ??
                    (config?.settings as Record<string, unknown> | undefined)?.inputType ??
                    (config?.inputs as Record<string, unknown> | undefined)?.inputType ??
                    'text';
                  const effectiveOutputName = inputType === 'none' ? 'text' : inputType;
                  return output.name === effectiveOutputName;
                }
                // TRIGGER_SCHEDULE: Show output based on inputType (like TRIGGER_MANUAL)
                if (data.type === 'TRIGGER_SCHEDULE') {
                  if (output.name === 'trigger') return false;
                  const config = data.config as unknown as Record<string, unknown> | undefined;
                  const inputType =
                    storeConfig?.settings?.inputType ??
                    (config?.settings as Record<string, unknown> | undefined)?.inputType ??
                    'text';
                  if (inputType === 'none') return false;
                  return output.name === inputType;
                }
                // TRIGGER_WEBHOOK: Hide 'trigger', show payload and headers
                if (data.type === 'TRIGGER_WEBHOOK') {
                  return output.name !== 'trigger';
                }
                // TRIGGER_EVENT: Hide 'trigger', show event data
                if (data.type === 'TRIGGER_EVENT') {
                  return output.name !== 'trigger';
                }
                return true;
              })
              .map((output, index) => {
                // Simplified labels for trigger outputs
                let outputLabel = output.label;
                if (data.type === 'TRIGGER_MANUAL') {
                  const config = data.config as unknown as Record<string, unknown> | undefined;
                  const inputType =
                    storeConfig?.settings?.inputType ??
                    (config?.settings as Record<string, unknown> | undefined)?.inputType ??
                    (config?.inputs as Record<string, unknown> | undefined)?.inputType ??
                    'text';
                  outputLabel = inputType === 'none' ? 'Signal' : 'Output';
                } else if (data.type === 'TRIGGER_SCHEDULE') {
                  outputLabel = 'Output';
                } else if (data.type === 'TRIGGER_WEBHOOK') {
                  outputLabel = output.name === 'payload' ? 'Payload' : output.name === 'headers' ? 'Headers' : output.label;
                } else if (data.type === 'TRIGGER_EVENT') {
                  outputLabel = output.name === 'event' ? 'Event Data' : output.label;
                }

                // Check if this output has data (node completed successfully)
                const hasOutput = currentStatus === 'success' && nodeProgress?.output !== undefined && nodeProgress?.output !== null;
                const hasError = currentStatus === 'error' && nodeProgress?.error;
                const isPreviewOpen = activeOutputPreview === output.name;

                return (
                  <div
                    key={output.name}
                    className="flex items-center justify-end relative"
                    style={{
                      gap: 8,
                      padding: '3px 0',
                      fontSize: 11,
                      color: 'var(--color-iris-text-3)',
                    }}
                  >
                    {/* Output Preview Tooltip */}
                    {isPreviewOpen && hasOutput && (
                      <OutputPreviewTooltip
                        output={nodeProgress!.output}
                        outputType={output.type}
                        portName={output.name}
                        prompt={storeConfig?.settings?.prompt as string || (data.config as unknown as Record<string, unknown>)?.prompt as string}
                        onClose={() => setActiveOutputPreview(null)}
                      />
                    )}

                    {/* Error Preview Tooltip */}
                    {isPreviewOpen && hasError && (
                      <ErrorPreviewTooltip
                        error={nodeProgress!.error!}
                        onClose={() => setActiveOutputPreview(null)}
                      />
                    )}

                    {/* Clickable output label when has output or error */}
                    {hasOutput ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveOutputPreview(isPreviewOpen ? null : output.name);
                        }}
                        className={cn(
                          'flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-all',
                          isPreviewOpen
                            ? 'bg-green-500/30 text-green-300'
                            : 'bg-green-500/20 text-green-400 hover:bg-green-500/30 hover:text-green-300'
                        )}
                        title="Click to preview output"
                      >
                        <Eye size={10} />
                        <span>{outputLabel}</span>
                      </button>
                    ) : hasError ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveOutputPreview(isPreviewOpen ? null : output.name);
                        }}
                        className={cn(
                          'flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-all',
                          isPreviewOpen
                            ? 'bg-red-500/30 text-red-300'
                            : 'bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300'
                        )}
                        title="Click to view error"
                      >
                        <AlertTriangle size={10} />
                        <span>{outputLabel}</span>
                      </button>
                    ) : (
                      <span style={{ position: 'relative', top: 4 }}>{outputLabel}</span>
                    )}
                    {!output.hideHandle && (
                      <Handle
                        type="source"
                        position={Position.Right}
                        id={output.name}
                        className="!border-2"
                        style={{
                          width: 10,
                          height: 10,
                          right: -17,
                          background: 'var(--color-iris-canvas)',
                          borderColor: palette.stroke,
                          boxShadow: hasOutput
                            ? `0 0 0 4px ${palette.soft}`
                            : currentStatus === 'running'
                            ? `0 0 0 4px ${palette.soft}`
                            : 'none',
                          transition: 'box-shadow 0.18s',
                        }}
                      />
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {/* Footer: status + duration */}
        <div
          className="flex items-center"
          style={{
            padding: '6px 12px',
            borderTop: '1px solid var(--color-iris-line-1)',
            gap: 6,
            fontSize: 10,
            color: 'var(--color-iris-text-4)',
          }}
        >
          {currentStatus === 'running' ? (
            <>
              <Loader2 size={10} className="animate-spin" style={{ color: palette.stroke }} />
              <span>Running…</span>
            </>
          ) : currentStatus === 'success' ? (
            <>
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: 'var(--color-iris-ok)',
                }}
              />
              <span style={{ color: 'var(--color-iris-text-3)' }}>OK</span>
            </>
          ) : currentStatus === 'error' ? (
            <>
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: 'var(--color-iris-err)',
                }}
              />
              <span style={{ color: 'var(--color-iris-err)' }}>Error</span>
            </>
          ) : (
            <>
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.2)',
                }}
              />
              <span>Idle</span>
            </>
          )}
          {/* Debug eye icons for hideHandle outputs (e.g. HTTP Request's `request`) */}
          {(currentStatus === 'success' || currentStatus === 'error') &&
            nodeDef?.outputs
              ?.filter((o) => o.hideHandle)
              .map((output) => {
                const isOpen = activeOutputPreview === output.name;
                const hasOutput =
                  currentStatus === 'success' &&
                  nodeProgress?.output !== undefined &&
                  nodeProgress?.output !== null;
                if (!hasOutput) return null;
                return (
                  <div key={output.name} className="relative">
                    {isOpen && (
                      <OutputPreviewTooltip
                        output={nodeProgress!.output}
                        outputType={output.type}
                        portName={output.name}
                        prompt={undefined}
                        onClose={() => setActiveOutputPreview(null)}
                      />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveOutputPreview(isOpen ? null : output.name);
                      }}
                      className={cn(
                        'inline-flex items-center justify-center rounded transition-colors',
                        isOpen
                          ? 'bg-white/20 text-white/90'
                          : 'text-white/40 hover:text-white/80 hover:bg-white/10',
                      )}
                      style={{ width: 16, height: 16 }}
                      title={output.label}
                    >
                      <Eye size={10} />
                    </button>
                  </div>
                );
              })}
          <span style={{ flex: 1 }} />
          {nodeProgress?.startedAt && nodeProgress?.completedAt && (
            <span
              style={{
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              }}
            >
              {((nodeProgress.completedAt - nodeProgress.startedAt) / 1000).toFixed(2)}s
            </span>
          )}
        </div>

        {/* Actions (visible on hover/select) */}
        {selected && (
          <div
            className="absolute flex"
            style={{ top: -34, right: 0, gap: 6 }}
          >
            <button
              onClick={handleDuplicate}
              className="we-iconbtn"
              title="Duplicate"
            >
              <Copy size={18} />
            </button>
            <button
              onClick={handleDelete}
              className="we-iconbtn"
              style={{ color: 'var(--color-iris-err)' }}
              title="Delete"
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

interface TriggerKvProps {
  k: string;
  v: string;
  mono?: boolean;
  inline?: boolean;
  accent: { stroke: string; soft: string; text: string };
}

function TriggerKv({ k, v, mono, inline, accent }: TriggerKvProps) {
  return (
    <div
      className="flex items-center"
      style={inline ? undefined : { padding: '8px 12px' }}
    >
      <div
        className="flex items-center"
        style={{ gap: 8, fontSize: 11, width: '100%' }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 4,
            color: accent.text,
            background: accent.soft,
            border: `1px solid ${accent.stroke}22`,
            flexShrink: 0,
          }}
        >
          {k}
        </span>
        <span
          className="truncate"
          style={{
            color: 'var(--color-iris-text-2)',
            fontFamily: mono ? 'var(--font-mono, ui-monospace, monospace)' : undefined,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={v}
        >
          {v}
        </span>
      </div>
    </div>
  );
}
