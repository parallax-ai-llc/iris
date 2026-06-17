/**
 * ActionsSection - Photoshop-style Actions panel for recording and playing macros
 */

import { memo, useCallback, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { useActionsStore } from '@/features/image-editor/stores/actions.store';
import { executeActionStep } from '@/features/image-editor/automation/actionExecutor';
import {
  Play, Square, CircleDot, Trash2, Plus, Copy,
  ChevronRight, Download, Upload,
} from 'lucide-react';
import { CollapsibleSection } from '../CollapsibleSection';

const ACTION_TYPE_LABELS: Record<string, string> = {
  'adjust:brightness-contrast': 'Brightness/Contrast',
  'adjust:hue-saturation': 'Hue/Saturation',
  'adjust:levels': 'Levels',
  'adjust:curves': 'Curves',
  'adjust:exposure': 'Exposure',
  'adjust:color-balance': 'Color Balance',
  'adjust:apply': 'Apply Adjustments',
  'filter:apply': 'Apply Filter',
  'transform:rotate': 'Rotate',
  'transform:flip-h': 'Flip Horizontal',
  'transform:flip-v': 'Flip Vertical',
  'transform:scale': 'Scale',
  'layer:add': 'Add Layer',
  'layer:delete': 'Delete Layer',
  'layer:duplicate': 'Duplicate Layer',
  'layer:merge-down': 'Merge Down',
  'layer:set-opacity': 'Set Opacity',
  'layer:set-blend-mode': 'Set Blend Mode',
  'layer:toggle-visibility': 'Toggle Visibility',
  'selection:invert': 'Invert Selection',
  'selection:clear': 'Clear Selection',
  'selection:content-aware-fill': 'Content-Aware Fill',
  'crop:apply': 'Crop',
  'ai:upscale': 'AI Upscale',
  'ai:bg-remove': 'AI Remove Background',
  'ai:inpaint': 'AI Inpaint',
  'ai:face-restore': 'AI Face Restore',
  'ai:colorize': 'AI Colorize',
};

export const ActionsSection = memo(function ActionsSection() {
  const {
    actionSets,
    activeSetId,
    isRecording,
    recordingSteps,
    playbackState,
    createSet,
    deleteSet,
    setActiveSet,
    duplicateSet,
    startRecording,
    stopRecording,
    cancelRecording,
    playSet,
    stopPlayback,
    exportSet,
    importSet,
    deleteStep,
  } = useActionsStore();

  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);

  const activeSet = actionSets.find((s) => s.id === activeSetId);

  const handleCreateSet = useCallback(() => {
    createSet('New Action');
  }, [createSet]);

  const handlePlay = useCallback(() => {
    if (!activeSetId) return;
    playSet(activeSetId, executeActionStep);
  }, [activeSetId, playSet]);

  const handleToggleRecord = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording(activeSetId ?? undefined);
    }
  }, [isRecording, activeSetId, startRecording, stopRecording]);

  const handleExport = useCallback(() => {
    if (!activeSetId) return;
    const json = exportSet(activeSetId);
    if (json) {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeSet?.name || 'action'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [activeSetId, exportSet, activeSet]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          importSet(reader.result);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [importSet]);

  return (
    <CollapsibleSection title="Actions" count={actionSets.length} defaultOpen={false}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-1 pb-2 border-b border-zinc-800">
        <button
          onClick={handlePlay}
          disabled={!activeSet || activeSet.steps.length === 0 || playbackState.isPlaying}
          className={cn(
            'p-1 rounded transition-colors',
            playbackState.isPlaying ? 'text-green-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-800',
            (!activeSet || activeSet.steps.length === 0) && 'opacity-30 cursor-not-allowed'
          )}
          title="Play"
        >
          <Play className="w-3.5 h-3.5" />
        </button>

        {playbackState.isPlaying && (
          <button
            onClick={stopPlayback}
            className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-zinc-800 transition-colors"
            title="Stop"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={handleToggleRecord}
          className={cn(
            'p-1 rounded transition-colors',
            isRecording ? 'text-red-500 animate-pulse' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
          )}
          title={isRecording ? 'Stop Recording' : 'Start Recording'}
        >
          <CircleDot className="w-3.5 h-3.5" />
        </button>

        <div className="flex-1" />

        <button
          onClick={handleCreateSet}
          className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          title="New Action Set"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        {activeSetId && (
          <>
            <button
              onClick={() => duplicateSet(activeSetId)}
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Duplicate"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => deleteSet(activeSetId)}
              className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        <button
          onClick={handleExport}
          disabled={!activeSetId}
          className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30"
          title="Export"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleImport}
          className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          title="Import"
        >
          <Upload className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Recording indicator */}
      {isRecording && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-red-500/10 border-b border-red-500/20">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] text-red-400 font-medium">Recording... ({recordingSteps.length} steps)</span>
          <button
            onClick={cancelRecording}
            className="ml-auto text-[10px] text-zinc-500 hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Playback progress */}
      {playbackState.isPlaying && (
        <div className="px-2 py-1.5 bg-blue-500/10 border-b border-blue-500/20">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-blue-400">
              Playing step {playbackState.currentStepIndex + 1}/{playbackState.totalSteps}
            </span>
          </div>
          <div className="mt-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-150"
              style={{ width: `${((playbackState.currentStepIndex + 1) / playbackState.totalSteps) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Action sets list */}
      <div className="max-h-[200px] overflow-y-auto">
        {actionSets.length === 0 ? (
          <div className="text-[10px] text-zinc-600 text-center py-4">
            No actions yet. Click + to create one.
          </div>
        ) : (
          actionSets.map((actionSet) => (
            <div key={actionSet.id}>
              <button
                onClick={() => {
                  setActiveSet(actionSet.id);
                  setExpandedSetId(expandedSetId === actionSet.id ? null : actionSet.id);
                }}
                className={cn(
                  'w-full flex items-center gap-1.5 px-2 py-1.5 text-left transition-colors',
                  actionSet.id === activeSetId
                    ? 'bg-blue-500/20 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                )}
              >
                <ChevronRight
                  className={cn(
                    'w-3 h-3 transition-transform flex-shrink-0',
                    expandedSetId === actionSet.id && 'rotate-90'
                  )}
                />
                <span className="text-[11px] font-medium truncate">{actionSet.name}</span>
                <span className="text-[9px] text-zinc-600 ml-auto flex-shrink-0">
                  {actionSet.steps.length} steps
                </span>
              </button>

              {/* Expanded steps */}
              {expandedSetId === actionSet.id && actionSet.steps.length > 0 && (
                <div className="bg-zinc-900/50">
                  {actionSet.steps.map((step, i) => (
                    <div
                      key={step.id}
                      className={cn(
                        'flex items-center gap-1.5 pl-6 pr-2 py-1 text-[10px]',
                        playbackState.isPlaying && playbackState.currentStepIndex === i
                          ? 'bg-blue-500/10 text-blue-400'
                          : 'text-zinc-500'
                      )}
                    >
                      <span className="text-zinc-600 w-4 text-right">{i + 1}</span>
                      <span className="truncate">{ACTION_TYPE_LABELS[step.type] || step.type}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteStep(actionSet.id, i);
                        }}
                        className="ml-auto p-0.5 rounded text-zinc-700 hover:text-red-400 opacity-0 hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Playback error */}
      {playbackState.error && (
        <div className="px-2 py-1.5 bg-red-500/10 text-[10px] text-red-400">
          {playbackState.error}
        </div>
      )}
    </CollapsibleSection>
  );
});
