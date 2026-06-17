'use client';

import { cn } from '@editor/lib/convert/string';
import { ChevronDown } from 'lucide-react';
import { AvailableOutput } from './types';

interface NodeInputContentProps {
  availableOutputs: AvailableOutput[];
  currentNodeRef: string | undefined;
  currentOutputRef: string | undefined;
  onNodeRefChange: (nodeId: string, outputName: string) => void;
}

export function NodeInputContent({
  availableOutputs,
  currentNodeRef,
  currentOutputRef,
  onNodeRefChange,
}: NodeInputContentProps) {
  if (availableOutputs.length === 0) {
    return (
      <p className="text-xs text-white/40 text-center py-2">
        No compatible upstream nodes
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <select
          value={currentNodeRef && currentOutputRef ? `${currentNodeRef}:${currentOutputRef}` : ''}
          onChange={(e) => {
            const [selectedNodeId, outputName] = e.target.value.split(':');
            onNodeRefChange(selectedNodeId, outputName);
          }}
          className={cn(
            'w-full px-3 py-2 text-sm rounded-md appearance-none cursor-pointer',
            'bg-white/5 border border-white/10',
            'text-white',
            'focus:outline-none focus:border-slate-400/50',
            'pr-8'
          )}
        >
          <option value="" className="bg-slate-800">
            Select output...
          </option>
          {availableOutputs.map((output) => (
            <option
              key={`${output.nodeId}:${output.outputName}`}
              value={`${output.nodeId}:${output.outputName}`}
              className="bg-slate-800"
            >
              {output.nodeName} / {output.outputLabel}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
        />
      </div>

      {/* Variable reference preview */}
      {currentNodeRef && currentOutputRef && (
        <div className="p-2 rounded-md bg-slate-400/10 border border-slate-400/30">
          <code className="text-xs text-slate-200">
            {`{{${currentNodeRef}.${currentOutputRef}}}`}
          </code>
        </div>
      )}
    </div>
  );
}
