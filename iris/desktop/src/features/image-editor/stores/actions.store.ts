/**
 * Actions Store - Manages action sets (macros) for recording and playback
 * Photoshop-style Actions panel state management
 */

import { create } from 'zustand';
import {
  type ActionSet,
  type ActionStep,
  type ActionStepType,
  type ActionPlaybackState,
  createActionSet,
  createActionStep,
} from '@/features/image-editor/automation/actionTypes';
import { ActionPlayer } from '@/features/image-editor/automation/actionPlayer';

interface ActionsState {
  // Action sets
  actionSets: ActionSet[];
  activeSetId: string | null;

  // Recording
  isRecording: boolean;
  recordingSteps: ActionStep[];

  // Playback
  playbackState: ActionPlaybackState;
}

interface ActionsActions {
  // Action set CRUD
  createSet: (name: string) => string;
  deleteSet: (id: string) => void;
  renameSet: (id: string, name: string) => void;
  setActiveSet: (id: string | null) => void;
  duplicateSet: (id: string) => string;

  // Recording
  startRecording: (setId?: string) => void;
  stopRecording: () => void;
  cancelRecording: () => void;
  recordStep: (type: ActionStepType, params?: Record<string, unknown>) => void;

  // Playback
  playSet: (id: string, executor: (step: ActionStep) => Promise<void>) => Promise<void>;
  stopPlayback: () => void;

  // Step management
  deleteStep: (setId: string, stepIndex: number) => void;
  moveStep: (setId: string, fromIndex: number, toIndex: number) => void;

  // Persistence
  exportSet: (id: string) => string | null;
  importSet: (json: string) => string | null;
}

const player = new ActionPlayer();

export const useActionsStore = create<ActionsState & ActionsActions>()((set, get) => ({
  // Initial state
  actionSets: [],
  activeSetId: null,
  isRecording: false,
  recordingSteps: [],
  playbackState: {
    isPlaying: false,
    currentStepIndex: 0,
    totalSteps: 0,
    error: null,
  },

  // Action set CRUD
  createSet: (name) => {
    const newSet = createActionSet(name);
    set((state) => ({
      actionSets: [...state.actionSets, newSet],
      activeSetId: newSet.id,
    }));
    return newSet.id;
  },

  deleteSet: (id) => {
    set((state) => ({
      actionSets: state.actionSets.filter((s) => s.id !== id),
      activeSetId: state.activeSetId === id ? null : state.activeSetId,
    }));
  },

  renameSet: (id, name) => {
    set((state) => ({
      actionSets: state.actionSets.map((s) =>
        s.id === id ? { ...s, name, updatedAt: Date.now() } : s
      ),
    }));
  },

  setActiveSet: (id) => {
    set({ activeSetId: id });
  },

  duplicateSet: (id) => {
    const { actionSets } = get();
    const original = actionSets.find((s) => s.id === id);
    if (!original) return '';

    const copy = createActionSet(`${original.name} Copy`, [...original.steps]);
    set((state) => ({
      actionSets: [...state.actionSets, copy],
      activeSetId: copy.id,
    }));
    return copy.id;
  },

  // Recording
  startRecording: (setId) => {
    if (setId) {
      // Record into existing set
      set({ isRecording: true, recordingSteps: [], activeSetId: setId });
    } else {
      // Create new set and start recording
      const newSet = createActionSet('New Action');
      set((state) => ({
        actionSets: [...state.actionSets, newSet],
        activeSetId: newSet.id,
        isRecording: true,
        recordingSteps: [],
      }));
    }
  },

  stopRecording: () => {
    const { recordingSteps, activeSetId } = get();
    set((state) => ({
      isRecording: false,
      actionSets: state.actionSets.map((s) =>
        s.id === activeSetId
          ? { ...s, steps: [...s.steps, ...recordingSteps], updatedAt: Date.now() }
          : s
      ),
      recordingSteps: [],
    }));
  },

  cancelRecording: () => {
    set({ isRecording: false, recordingSteps: [] });
  },

  recordStep: (type, params = {}) => {
    const { isRecording } = get();
    if (!isRecording) return;

    const step = createActionStep(type, params);
    set((state) => ({
      recordingSteps: [...state.recordingSteps, step],
    }));
  },

  // Playback
  playSet: async (id, executor) => {
    const { actionSets } = get();
    const actionSet = actionSets.find((s) => s.id === id);
    if (!actionSet || actionSet.steps.length === 0) return;

    await player.play(
      actionSet.steps,
      executor,
      (state) => set({ playbackState: state }),
      150
    );
  },

  stopPlayback: () => {
    player.abort();
  },

  // Step management
  deleteStep: (setId, stepIndex) => {
    set((state) => ({
      actionSets: state.actionSets.map((s) =>
        s.id === setId
          ? { ...s, steps: s.steps.filter((_, i) => i !== stepIndex), updatedAt: Date.now() }
          : s
      ),
    }));
  },

  moveStep: (setId, fromIndex, toIndex) => {
    set((state) => ({
      actionSets: state.actionSets.map((s) => {
        if (s.id !== setId) return s;
        const steps = [...s.steps];
        const [moved] = steps.splice(fromIndex, 1);
        steps.splice(toIndex, 0, moved);
        return { ...s, steps, updatedAt: Date.now() };
      }),
    }));
  },

  // Persistence
  exportSet: (id) => {
    const { actionSets } = get();
    const actionSet = actionSets.find((s) => s.id === id);
    if (!actionSet) return null;
    return JSON.stringify(actionSet, null, 2);
  },

  importSet: (json) => {
    try {
      const data = JSON.parse(json) as ActionSet;
      if (!data.id || !data.name || !Array.isArray(data.steps)) return null;

      // Generate new ID to avoid conflicts
      const imported = createActionSet(data.name, data.steps);
      set((state) => ({
        actionSets: [...state.actionSets, imported],
        activeSetId: imported.id,
      }));
      return imported.id;
    } catch {
      return null;
    }
  },
}));
