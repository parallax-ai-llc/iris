/**
 * Local cron scheduler — the open-source mirror of the cloud's
 * `scheduler.service.ts`. Runs inside the long-lived server (the desktop daemon
 * or `npx iris-flow`) so scheduled workflows fire even with the UI closed.
 *
 * Every minute it scans workflows for ones whose `scheduleNextRun` is due,
 * `engine.execute()`s them with a `schedule` trigger, then recomputes the next
 * run from the cron expression. A re-entrancy guard skips a tick if the previous
 * one is still running (a long execution shouldn't stack ticks).
 *
 * No plan gating locally — every cron cadence is allowed (it's your machine).
 */

import { Cron } from 'croner';
import type { WorkflowEngine } from 'iris-engine';
import type { LocalWorkflowStore } from './local-workflow-store.js';

export interface CronPreset {
  label: string;
  cron: string;
}

/** Common cadences offered in the editor's schedule UI. */
export const CRON_PRESETS: CronPreset[] = [
  { label: 'Every minute', cron: '* * * * *' },
  { label: 'Every 5 minutes', cron: '*/5 * * * *' },
  { label: 'Every 15 minutes', cron: '*/15 * * * *' },
  { label: 'Every 30 minutes', cron: '*/30 * * * *' },
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Every 6 hours', cron: '0 */6 * * *' },
  { label: 'Daily at midnight', cron: '0 0 * * *' },
  { label: 'Daily at 9am', cron: '0 9 * * *' },
  { label: 'Weekly (Mon 9am)', cron: '0 9 * * 1' },
  { label: 'Monthly (1st, 9am)', cron: '0 9 1 * *' },
];

/** The OS-known IANA timezones (falls back to a small list on old runtimes). */
export function supportedTimezones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };
  try {
    return intl.supportedValuesOf?.('timeZone') ?? ['UTC'];
  } catch {
    return ['UTC'];
  }
}

/** Next fire time for a cron expr after `after` (now if omitted). null = invalid. */
export function nextRunTime(
  cron: string,
  timezone = 'UTC',
  after?: Date,
): Date | null {
  try {
    return new Cron(cron, { timezone }).nextRun(after ?? undefined) ?? null;
  } catch {
    return null;
  }
}

export interface CronValidation {
  valid: boolean;
  nextRuns?: string[];
  error?: string;
}

/** Validate a cron expression + preview the next `count` runs. */
export function validateCron(
  cron: string,
  timezone = 'UTC',
  count = 5,
): CronValidation {
  try {
    const job = new Cron(cron, { timezone });
    const runs: string[] = [];
    let cursor: Date | undefined;
    for (let i = 0; i < count; i++) {
      const next = job.nextRun(cursor);
      if (!next) break;
      runs.push(next.toISOString());
      cursor = next;
    }
    if (runs.length === 0) {
      return { valid: false, error: 'Cron expression yields no future runs' };
    }
    return { valid: true, nextRuns: runs };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : 'Invalid cron' };
  }
}

export class LocalScheduler {
  private job: Cron | null = null;
  private running = false;

  constructor(
    private readonly store: LocalWorkflowStore,
    private readonly engine: WorkflowEngine,
    private readonly userId: string,
  ) {}

  /** Start the every-minute tick. Idempotent. */
  start(): void {
    if (this.job) return;
    this.job = new Cron('* * * * *', () => {
      void this.tick();
    });
  }

  stop(): void {
    this.job?.stop();
    this.job = null;
  }

  /** One scan: execute every due workflow and reschedule it. */
  async tick(): Promise<void> {
    if (this.running) return; // don't stack ticks if a scan is slow
    this.running = true;
    try {
      const now = new Date();
      const workflows = await this.store.listWorkflows();
      for (const wf of workflows) {
        if (!wf.scheduleEnabled || !wf.scheduleCron || !wf.scheduleNextRun) {
          continue;
        }
        if (new Date(wf.scheduleNextRun) > now) continue;

        const tz = wf.scheduleTimezone || 'UTC';
        try {
          await this.engine.execute(wf.id, this.userId, {
            trigger: {
              type: 'schedule',
              data: { scheduledAt: now.toISOString(), cron: wf.scheduleCron },
            },
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(`[iris-scheduler] execute failed for ${wf.id}:`, e);
        }

        // Always advance the schedule — a failed run shouldn't wedge it.
        const next = nextRunTime(wf.scheduleCron, tz, now);
        await this.store.updateSchedule(
          wf.id,
          { lastRun: now.toISOString(), nextRun: next ? next.toISOString() : null },
          false,
        );
      }
    } finally {
      this.running = false;
    }
  }
}
