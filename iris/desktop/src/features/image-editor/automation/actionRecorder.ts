/**
 * Action Recorder - Records editor operations as replayable action steps
 * Captures store mutations and converts them to ActionStep objects
 */

import { type ActionStep, type ActionStepType, createActionStep } from './actionTypes';

export class ActionRecorder {
  private steps: ActionStep[] = [];
  private _isRecording = false;

  get isRecording(): boolean {
    return this._isRecording;
  }

  get recordedSteps(): ActionStep[] {
    return [...this.steps];
  }

  get stepCount(): number {
    return this.steps.length;
  }

  startRecording(): void {
    this._isRecording = true;
    this.steps = [];
  }

  stopRecording(): ActionStep[] {
    this._isRecording = false;
    return [...this.steps];
  }

  cancelRecording(): void {
    this._isRecording = false;
    this.steps = [];
  }

  /**
   * Record an action step if currently recording
   */
  record(type: ActionStepType, params: Record<string, unknown> = {}): void {
    if (!this._isRecording) return;
    this.steps.push(createActionStep(type, params));
  }

  /**
   * Remove the last recorded step (for corrections)
   */
  undoLastStep(): ActionStep | undefined {
    if (!this._isRecording) return undefined;
    return this.steps.pop();
  }
}

// Singleton instance for global use
export const globalRecorder = new ActionRecorder();
