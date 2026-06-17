/**
 * Session Timer
 * Track your creative session time with a status bar timer and Pomodoro mode.
 */

interface SessionStats {
  totalSessions: number;
  totalSeconds: number;
  longestSession: number;
  pomodorosCompleted: number;
  lastSessionDate: string;
}

export function activate(context: IrisExtensionContext) {
  const STATS_KEY = 'sessionStats';

  let isRunning = false;
  let elapsed = 0; // seconds
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let pomodoroTarget = 0; // 0 = no pomodoro

  const statusItem = iris.window.setStatusBarItem('Timer: 00:00', {
    tooltip: 'Session Timer - Click Start/Pause (Ctrl+Shift+S)',
    priority: 20,
  });
  context.subscriptions.push(statusItem);

  function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updateStatusBar() {
    const prefix = pomodoroTarget > 0 ? '🍅 ' : '';
    const suffix = pomodoroTarget > 0 ? ` / ${formatTime(pomodoroTarget)}` : '';
    const state = isRunning ? '▶' : '⏸';
    statusItem.text = `${prefix}${state} ${formatTime(elapsed)}${suffix}`;
  }

  function startTimer() {
    if (intervalId) return;
    isRunning = true;
    intervalId = setInterval(async () => {
      elapsed++;
      updateStatusBar();

      // Pomodoro check
      if (pomodoroTarget > 0 && elapsed >= pomodoroTarget) {
        stopTimer();
        pomodoroTarget = 0;

        // Update stats
        const stats = ((await iris.storage.get(STATS_KEY)) as SessionStats) || {
          totalSessions: 0, totalSeconds: 0, longestSession: 0, pomodorosCompleted: 0, lastSessionDate: '',
        };
        stats.pomodorosCompleted++;
        await iris.storage.set(STATS_KEY, stats);

        await iris.window.showMessage('Pomodoro complete! Take a 5-minute break.', 'info');
      }
    }, 1000);
    updateStatusBar();
  }

  function stopTimer() {
    isRunning = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    updateStatusBar();
  }

  // Start / Pause toggle
  context.subscriptions.push(
    iris.commands.register('iris-official.session-timer.toggle', async () => {
      if (isRunning) {
        stopTimer();
        await iris.window.showMessage(`Timer paused at ${formatTime(elapsed)}.`, 'info');
      } else {
        startTimer();
        await iris.window.showMessage('Timer started.', 'info');
      }
    })
  );

  // Reset timer
  context.subscriptions.push(
    iris.commands.register('iris-official.session-timer.reset', async () => {
      // Save session stats before reset
      if (elapsed > 0) {
        const stats = ((await iris.storage.get(STATS_KEY)) as SessionStats) || {
          totalSessions: 0, totalSeconds: 0, longestSession: 0, pomodorosCompleted: 0, lastSessionDate: '',
        };
        stats.totalSessions++;
        stats.totalSeconds += elapsed;
        stats.longestSession = Math.max(stats.longestSession, elapsed);
        stats.lastSessionDate = new Date().toISOString();
        await iris.storage.set(STATS_KEY, stats);
      }

      stopTimer();
      elapsed = 0;
      pomodoroTarget = 0;
      updateStatusBar();
      await iris.window.showMessage('Timer reset.', 'info');
    })
  );

  // Pomodoro mode
  context.subscriptions.push(
    iris.commands.register('iris-official.session-timer.pomodoro', async () => {
      stopTimer();
      elapsed = 0;
      pomodoroTarget = 25 * 60; // 25 minutes
      startTimer();
      await iris.window.showMessage('Pomodoro started (25 minutes).', 'info');
    })
  );

  // Stats panel
  context.subscriptions.push(
    iris.commands.register('iris-official.session-timer.stats', async () => {
      const stats = ((await iris.storage.get(STATS_KEY)) as SessionStats) || {
        totalSessions: 0, totalSeconds: 0, longestSession: 0, pomodorosCompleted: 0, lastSessionDate: '',
      };

      const avgSession = stats.totalSessions > 0
        ? formatTime(Math.round(stats.totalSeconds / stats.totalSessions))
        : '00:00';

      const html = `
        <div style="padding:16px;font-family:system-ui;max-width:350px">
          <h2 style="margin:0 0 16px">Session Stats</h2>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
            <div style="padding:12px;background:#f3f4f6;border-radius:8px;text-align:center">
              <div style="font-size:24px;font-weight:700">${stats.totalSessions}</div>
              <div style="font-size:12px;color:#6b7280">Sessions</div>
            </div>
            <div style="padding:12px;background:#f3f4f6;border-radius:8px;text-align:center">
              <div style="font-size:24px;font-weight:700">${formatTime(stats.totalSeconds)}</div>
              <div style="font-size:12px;color:#6b7280">Total Time</div>
            </div>
            <div style="padding:12px;background:#f3f4f6;border-radius:8px;text-align:center">
              <div style="font-size:24px;font-weight:700">${avgSession}</div>
              <div style="font-size:12px;color:#6b7280">Avg Session</div>
            </div>
            <div style="padding:12px;background:#f3f4f6;border-radius:8px;text-align:center">
              <div style="font-size:24px;font-weight:700">${formatTime(stats.longestSession)}</div>
              <div style="font-size:12px;color:#6b7280">Longest</div>
            </div>
          </div>

          <div style="padding:12px;background:#fef3c7;border-radius:8px;text-align:center;margin-bottom:12px">
            <div style="font-size:28px">🍅 ${stats.pomodorosCompleted}</div>
            <div style="font-size:12px;color:#92400e">Pomodoros Completed</div>
          </div>

          ${stats.lastSessionDate ? `<p style="font-size:11px;color:#9ca3af;text-align:center">Last session: ${new Date(stats.lastSessionDate).toLocaleString()}</p>` : ''}
        </div>
      `;

      await iris.window.createPanel(html, { title: 'Session Stats', location: 'floating' });
    })
  );

  iris.log.info('Session Timer activated');
}

export function deactivate() {}
