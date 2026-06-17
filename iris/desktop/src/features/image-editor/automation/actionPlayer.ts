/**
 * Action Player - Replays recorded action steps against the image editor store
 * Supports step-by-step execution with progress callbacks
 */

import type { ActionStep, ActionPlaybackState } from './actionTypes';

export type ActionExecutor = (step: ActionStep) => Promise<void>;

export class ActionPlayer {
  private _state: ActionPlaybackState = {
    isPlaying: false,
    currentStepIndex: 0,
    totalSteps: 0,
    error: null,
  };
  private _aborted = false;
  private onStateChange?: (state: ActionPlaybackState) => void;

  get state(): ActionPlaybackState {
    return { ...this._state };
  }

  /**
   * Play a sequence of action steps
   * @param steps - Action steps to replay
   * @param executor - Function that executes each step against the store
   * @param onStateChange - Callback for progress updates
   * @param delayMs - Delay between steps (for visual feedback)
   */
  async play(
    steps: ActionStep[],
    executor: ActionExecutor,
    onStateChange?: (state: ActionPlaybackState) => void,
    delayMs: number = 100
  ): Promise<void> {
    if (this._state.isPlaying) return;

    this.onStateChange = onStateChange;
    this._aborted = false;
    this.updateState({
      isPlaying: true,
      currentStepIndex: 0,
      totalSteps: steps.length,
      error: null,
    });

    for (let i = 0; i < steps.length; i++) {
      if (this._aborted) {
        this.updateState({ isPlaying: false, error: 'Playback aborted' });
        return;
      }

      this.updateState({ currentStepIndex: i });

      try {
        await executor(steps[i]);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        this.updateState({
          isPlaying: false,
          error: `Step ${i + 1} failed: ${errorMsg}`,
        });
        return;
      }

      // Delay between steps for visual feedback
      if (delayMs > 0 && i < steps.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    this.updateState({
      isPlaying: false,
      currentStepIndex: steps.length,
      error: null,
    });
  }

  /**
   * Abort current playback
   */
  abort(): void {
    this._aborted = true;
  }

  private updateState(partial: Partial<ActionPlaybackState>): void {
    this._state = { ...this._state, ...partial };
    this.onStateChange?.(this._state);
  }
}

// Singleton instance
export const globalPlayer = new ActionPlayer();
