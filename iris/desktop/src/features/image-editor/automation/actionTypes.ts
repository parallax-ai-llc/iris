/**
 * Action Types - Serializable action step definitions for recording/playback
 * Each action step captures enough data to replay a Photoshop-style operation
 */

export interface ActionStep {
  id: string;
  type: ActionStepType;
  timestamp: number;
  params: Record<string, unknown>;
}

export type ActionStepType =
  // Adjustments
  | 'adjust:brightness-contrast'
  | 'adjust:hue-saturation'
  | 'adjust:levels'
  | 'adjust:curves'
  | 'adjust:exposure'
  | 'adjust:color-balance'
  | 'adjust:apply'
  // Filters
  | 'filter:apply'
  // Transform
  | 'transform:rotate'
  | 'transform:flip-h'
  | 'transform:flip-v'
  | 'transform:scale'
  // Layer operations
  | 'layer:add'
  | 'layer:delete'
  | 'layer:duplicate'
  | 'layer:merge-down'
  | 'layer:set-opacity'
  | 'layer:set-blend-mode'
  | 'layer:toggle-visibility'
  // Selection
  | 'selection:rectangle'
  | 'selection:ellipse'
  | 'selection:magic-wand'
  | 'selection:quick-select'
  | 'selection:invert'
  | 'selection:clear'
  | 'selection:content-aware-fill'
  // Drawing
  | 'draw:brush-stroke'
  | 'draw:fill'
  // Crop
  | 'crop:apply'
  // AI operations
  | 'ai:upscale'
  | 'ai:bg-remove'
  | 'ai:inpaint'
  | 'ai:face-restore'
  | 'ai:colorize'
  // Phase 4: Export/Import
  | 'file:export-as'
  | 'file:import-svg'
  | 'file:save-for-web'
  // Phase 4: Batch & Conditional
  | 'batch:run-action'
  | 'batch:image-processor'
  | 'conditional:if-then';

export interface ActionSet {
  id: string;
  name: string;
  steps: ActionStep[];
  createdAt: number;
  updatedAt: number;
}

export interface ActionPlaybackState {
  isPlaying: boolean;
  currentStepIndex: number;
  totalSteps: number;
  error: string | null;
}

export function createActionStep(
  type: ActionStepType,
  params: Record<string, unknown> = {}
): ActionStep {
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    timestamp: Date.now(),
    params,
  };
}

export function createActionSet(name: string, steps: ActionStep[] = []): ActionSet {
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    steps,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
