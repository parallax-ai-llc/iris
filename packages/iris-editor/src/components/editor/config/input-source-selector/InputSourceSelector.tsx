'use client';

import { useMemo } from 'react';
import { cn } from '@editor/lib/convert/string';
import { useIrisEditorStore, InputSourceType } from '@editor/store/iris-editor';
import { getNodeDefinition, PortType } from '../../../../constants/node-definitions';
import { Edit3, Link, LinkIcon, Globe } from 'lucide-react';

import { portTypeIcons } from './constants';
import { InputSourceSelectorProps, AvailableOutput, ConnectedNodeInfo } from './types';
import { SourceTypeButton } from './SourceTypeButton';
import { UserInputContent } from './UserInputContent';
import { NodeInputContent } from './NodeInputContent';
import { UrlInputContent } from './UrlInputContent';
import { ConnectedNodeIndicator } from './ConnectedNodeIndicator';

export function InputSourceSelector({
  nodeId,
  inputName,
  inputLabel,
  inputType,
  inputConfig,
  required,
  disabled,
  disabledReason,
}: InputSourceSelectorProps) {
  const { nodes, edges, updateNodeInput, getUpstreamNodes } = useIrisEditorStore();

  // Detect direct edge connection to this input
  const connectedEdge = useMemo(() => {
    return edges.find((edge) => {
      if (edge.target !== nodeId) return false;
      if (edge.targetHandle === inputName) return true;
      if (edge.targetHandle === `${nodeId}-${inputName}`) return true;
      if (!edge.targetHandle && inputName === 'prompt') return true;
      if (!edge.targetHandle && inputName === 'data') return true;
      if (!edge.targetHandle && inputName === 'input') return true;
      if (!edge.targetHandle && inputName === 'image') return true;
      if (!edge.targetHandle && inputName === 'video') return true;
      if (!edge.targetHandle && inputName === 'text') return true;
      return false;
    });
  }, [edges, nodeId, inputName]);

  // Get connected node info
  const connectedNodeInfo = useMemo((): ConnectedNodeInfo | null => {
    if (!connectedEdge) return null;
    const sourceNode = nodes.find((n) => n.id === connectedEdge.source);
    if (!sourceNode) return null;
    const nodeDef = getNodeDefinition(sourceNode.data.type);
    if (!nodeDef) return null;

    const sourceOutput = nodeDef.outputs.find((o) =>
      o.name === connectedEdge.sourceHandle ||
      (inputType === 'any' || o.type === 'any' || o.type === inputType)
    );

    return {
      nodeId: sourceNode.id,
      nodeName: sourceNode.data.label,
      outputName: sourceOutput?.name || nodeDef.outputs[0]?.name || 'output',
      outputLabel: sourceOutput?.label || nodeDef.outputs[0]?.label || 'Output',
    };
  }, [connectedEdge, nodes, inputType]);

  const effectiveSource = connectedNodeInfo ? 'node' : (inputConfig?.source || 'user');
  const currentValue = inputConfig?.value || '';
  const currentNodeRef = connectedNodeInfo?.nodeId || inputConfig?.nodeId;
  const currentOutputRef = connectedNodeInfo?.outputName || inputConfig?.outputName;

  // Get upstream nodes that can provide data
  const upstreamNodes = useMemo(() => {
    return getUpstreamNodes(nodeId);
  }, [nodeId, getUpstreamNodes]);

  // Get available outputs from upstream nodes
  const availableOutputs = useMemo((): AvailableOutput[] => {
    const outputs: AvailableOutput[] = [];

    for (const node of upstreamNodes) {
      const nodeDef = getNodeDefinition(node.data.type);
      if (!nodeDef) continue;

      for (const output of nodeDef.outputs) {
        if (inputType === 'any' || output.type === 'any' || output.type === inputType) {
          outputs.push({
            nodeId: node.id,
            nodeName: node.data.label,
            outputName: output.name,
            outputLabel: output.label,
            type: output.type,
          });
        }
      }
    }

    return outputs;
  }, [upstreamNodes, inputType]);

  const handleSourceChange = (source: InputSourceType) => {
    if (connectedNodeInfo && source !== 'node') return;
    updateNodeInput(nodeId, inputName, {
      source,
      value: source === 'user' ? currentValue : undefined,
      nodeId: source === 'node' ? currentNodeRef : undefined,
      outputName: source === 'node' ? currentOutputRef : undefined,
      storageAssetId: undefined,
    });
  };

  const handleValueChange = (value: string) => {
    updateNodeInput(nodeId, inputName, { value });
  };

  const handleNodeRefChange = (targetNodeId: string, outputName: string) => {
    updateNodeInput(nodeId, inputName, {
      source: 'node',
      nodeId: targetNodeId,
      outputName,
    });
  };

  const TypeIcon = portTypeIcons[inputType];

  const isRequiredSatisfied = useMemo(() => {
    if (!required) return true;
    if (connectedNodeInfo) return true;
    if (inputConfig?.nodeId && inputConfig?.outputName) return true;
    if (inputConfig?.storageAssetId) return true;
    if (inputConfig?.value && inputConfig.value.trim() !== '') return true;
    return false;
  }, [required, connectedNodeInfo, inputConfig]);

  const showUrlOption = inputType === 'video' || inputType === 'image' || inputType === 'audio';

  return (
    <div className={cn('space-y-2', disabled && 'opacity-50 pointer-events-none')}>
      {/* Input Label */}
      <div className="flex items-center gap-2">
        <TypeIcon size={12} className="text-white/40" />
        <span className="text-xs text-white/70">{inputLabel}</span>
        {required && !disabled && (
          <span className={cn('text-xs', isRequiredSatisfied ? 'text-green-400' : 'text-red-400')}>*</span>
        )}
        {connectedNodeInfo && !disabled && (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <LinkIcon size={10} />
            Connected
          </span>
        )}
      </div>

      {/* Disabled message */}
      {disabled && disabledReason && (
        <div className="p-2 rounded-md bg-amber-500/10 border border-amber-500/30">
          <p className="text-xs text-amber-400">{disabledReason}</p>
        </div>
      )}

      {/* Connected node indicator */}
      {connectedNodeInfo && (
        <ConnectedNodeIndicator
          nodeName={connectedNodeInfo.nodeName}
          outputLabel={connectedNodeInfo.outputLabel}
        />
      )}

      {/* Source Selector */}
      {!connectedNodeInfo && !disabled && (
        <div className="flex gap-1 flex-wrap">
          <SourceTypeButton
            source="user"
            currentSource={effectiveSource}
            onClick={() => handleSourceChange('user')}
            icon={<Edit3 size={12} />}
            label="Input"
          />
          <SourceTypeButton
            source="node"
            currentSource={effectiveSource}
            onClick={() => handleSourceChange('node')}
            disabled={availableOutputs.length === 0}
            icon={<Link size={12} />}
            label="Node"
          />
          {/* For media types, storage is integrated into FileAttachment, so only show URL option */}
          {showUrlOption && (
            <SourceTypeButton
              source={'url' as InputSourceType}
              currentSource={effectiveSource}
              onClick={() => handleSourceChange('url' as InputSourceType)}
              icon={<Globe size={12} />}
              label="URL"
            />
          )}
        </div>
      )}

      {/* Source-specific content */}
      {!connectedNodeInfo && !disabled && effectiveSource === 'user' && (
        <UserInputContent
          inputType={inputType}
          inputLabel={inputLabel}
          value={currentValue}
          onChange={handleValueChange}
        />
      )}

      {!connectedNodeInfo && !disabled && effectiveSource === 'node' && (
        <NodeInputContent
          availableOutputs={availableOutputs}
          currentNodeRef={currentNodeRef}
          currentOutputRef={currentOutputRef}
          onNodeRefChange={handleNodeRefChange}
        />
      )}

      {!connectedNodeInfo && !disabled && effectiveSource === 'url' && (
        <UrlInputContent
          inputType={inputType}
          value={currentValue}
          onChange={handleValueChange}
        />
      )}
    </div>
  );
}
