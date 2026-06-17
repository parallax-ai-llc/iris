'use client';

import { useMemo, useEffect } from 'react';
import { cn } from '@editor/lib/convert/string';
import { ChevronDown, Clock, AlertCircle } from 'lucide-react';
import { useAgentStore } from '@editor/store/agent';
import { useIrisEditorStore } from '@editor/store/iris-editor';

// Default duration options when model constraints are not available
const DEFAULT_VIDEO_DURATION_OPTIONS = [
  { value: '4', label: '4 seconds' },
  { value: '5', label: '5 seconds' },
  { value: '6', label: '6 seconds' },
  { value: '8', label: '8 seconds' },
];

// Provider-specific defaults when no model is selected
const PROVIDER_DURATION_DEFAULTS: Record<string, number[]> = {
  google: [4, 5, 6, 7, 8],
  luma: [5],
  runway: [5, 10],
  kling: [5, 10],
  stability: [4],
  fal: [5],
};

interface DurationSelectorProps {
  nodeId: string;
  value: string | undefined;
  onChange: (value: string) => void;
  isImageToVideo?: boolean;
}

export function DurationSelector({
  nodeId,
  value,
  onChange,
  isImageToVideo = false,
}: DurationSelectorProps) {
  const { agents } = useAgentStore();
  const { nodeConfigs } = useIrisEditorStore();

  const nodeConfig = nodeConfigs[nodeId];
  const selectedModel = nodeConfig?.model;
  const selectedProvider = nodeConfig?.provider?.toLowerCase();

  // Get duration options based on selected model
  const durationOptions = useMemo(() => {
    // For Google image-to-video, duration is fixed at 8 seconds
    if (isImageToVideo && selectedProvider === 'google') {
      return [{ value: '8', label: '8 seconds (fixed for image-to-video)' }];
    }

    // Find the selected model in agents store
    if (selectedModel) {
      const agent = agents.find(a => a.model === selectedModel);
      if (agent?.supportedDurations && agent.supportedDurations.length > 0) {
        return agent.supportedDurations.map(d => ({
          value: String(d),
          label: `${d} seconds`,
        }));
      }
    }

    // Fallback to provider defaults
    if (selectedProvider && PROVIDER_DURATION_DEFAULTS[selectedProvider]) {
      return PROVIDER_DURATION_DEFAULTS[selectedProvider].map(d => ({
        value: String(d),
        label: `${d} seconds`,
      }));
    }

    // Final fallback to default options
    return DEFAULT_VIDEO_DURATION_OPTIONS;
  }, [agents, selectedModel, selectedProvider, isImageToVideo]);

  // Check if current value is valid for the available options
  const isValueValid = useMemo(() => {
    if (!value) return true;
    return durationOptions.some(opt => opt.value === value);
  }, [value, durationOptions]);

  // Auto-correct invalid value
  useEffect(() => {
    if (!isValueValid && durationOptions.length > 0) {
      // Select the first available option
      onChange(durationOptions[0].value);
    }
  }, [isValueValid, durationOptions, onChange]);

  // For Google image-to-video, show fixed duration message
  if (isImageToVideo && selectedProvider === 'google') {
    return (
      <div>
        <label className="block text-xs text-white/50 mb-1">Duration</label>
        <div className={cn(
          'w-full px-3 py-2 text-sm rounded-md',
          'bg-white/5 border border-white/10',
          'text-white/70 flex items-center gap-2'
        )}>
          <Clock size={14} className="text-slate-300" />
          <span>8 seconds</span>
          <span className="text-white/40 text-xs">(fixed for image-to-video)</span>
        </div>
        <p className="text-xs text-white/40 mt-1">
          Google Veo image-to-video requires 8 second duration
        </p>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs text-white/50 mb-1">Duration</label>
      <div className="relative">
        <select
          value={value || durationOptions[0]?.value || ''}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full px-3 py-2 text-sm rounded-md appearance-none cursor-pointer',
            'bg-white/5 border border-white/10',
            'text-white',
            'focus:outline-none focus:border-slate-400/50',
            'pr-8'
          )}
        >
          {durationOptions.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-slate-800">
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
        />
      </div>
      {!selectedModel && (
        <p className="text-xs text-amber-400/70 mt-1 flex items-center gap-1">
          <AlertCircle size={10} />
          Select a model to see available durations
        </p>
      )}
    </div>
  );
}
