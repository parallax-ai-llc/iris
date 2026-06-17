/**
 * Keyboard Shortcut Cheatsheet
 * Display all keyboard shortcuts in a searchable panel with usage frequency tracking.
 */

interface ShortcutCategory {
  name: string;
  shortcuts: { key: string; description: string }[];
}

const DEFAULT_SHORTCUTS: ShortcutCategory[] = [
  {
    name: 'File',
    shortcuts: [
      { key: 'Ctrl+N', description: 'New Project' },
      { key: 'Ctrl+O', description: 'Open File' },
      { key: 'Ctrl+S', description: 'Save' },
      { key: 'Ctrl+Shift+S', description: 'Save As' },
      { key: 'Ctrl+E', description: 'Export' },
    ],
  },
  {
    name: 'Edit',
    shortcuts: [
      { key: 'Ctrl+Z', description: 'Undo' },
      { key: 'Ctrl+Shift+Z', description: 'Redo' },
      { key: 'Ctrl+C', description: 'Copy' },
      { key: 'Ctrl+V', description: 'Paste' },
      { key: 'Ctrl+X', description: 'Cut' },
      { key: 'Ctrl+A', description: 'Select All' },
      { key: 'Delete', description: 'Delete Selection' },
    ],
  },
  {
    name: 'View',
    shortcuts: [
      { key: 'Ctrl++', description: 'Zoom In' },
      { key: 'Ctrl+-', description: 'Zoom Out' },
      { key: 'Ctrl+0', description: 'Fit to Screen' },
      { key: 'Ctrl+1', description: 'Actual Size (100%)' },
      { key: 'F11', description: 'Fullscreen' },
      { key: 'Tab', description: 'Toggle Panels' },
    ],
  },
  {
    name: 'Tools',
    shortcuts: [
      { key: 'V', description: 'Selection Tool' },
      { key: 'B', description: 'Brush Tool' },
      { key: 'E', description: 'Eraser Tool' },
      { key: 'G', description: 'Fill Tool' },
      { key: 'T', description: 'Text Tool' },
      { key: 'C', description: 'Crop Tool' },
      { key: 'I', description: 'Eyedropper' },
    ],
  },
  {
    name: 'Extensions',
    shortcuts: [
      { key: 'Ctrl+Shift+C', description: 'AI Captioner' },
      { key: 'Ctrl+Shift+B', description: 'Take Snapshot (Before)' },
      { key: 'Ctrl+Shift+D', description: 'Compare Before/After' },
      { key: 'Ctrl+Shift+O', description: 'Social Media Preview' },
      { key: 'Ctrl+Shift+H', description: 'Color Harmony' },
      { key: 'Ctrl+Shift+X', description: 'Pixel Art Convert' },
      { key: 'Ctrl+Shift+U', description: 'Cloud Upload' },
    ],
  },
];

export function activate(context: IrisExtensionContext) {
  const STATS_KEY = 'shortcutUsageStats';

  context.subscriptions.push(
    iris.commands.register('iris-official.shortcut-cheatsheet.show', async () => {
      const sections = DEFAULT_SHORTCUTS.map((category) => {
        const rows = category.shortcuts
          .map(
            (s) => `
            <tr>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6">
                <kbd style="padding:2px 6px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;font-size:12px;font-family:monospace">${s.key}</kbd>
              </td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:13px">${s.description}</td>
            </tr>
          `
          )
          .join('');

        return `
          <div style="margin-bottom:20px">
            <h3 style="margin:0 0 8px;font-size:14px;color:#374151;border-bottom:2px solid #e5e7eb;padding-bottom:4px">${category.name}</h3>
            <table style="width:100%;border-collapse:collapse">${rows}</table>
          </div>
        `;
      }).join('');

      const html = `
        <div style="padding:16px;font-family:system-ui;max-width:500px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
            <h2 style="margin:0">Keyboard Shortcuts</h2>
          </div>

          <input type="text" id="searchInput" placeholder="Search shortcuts..."
            style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;margin-bottom:16px;font-size:14px;box-sizing:border-box"
            oninput="
              const q = this.value.toLowerCase();
              document.querySelectorAll('tr').forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(q) ? '' : 'none';
              });
            ">

          ${sections}

          <div style="margin-top:8px;padding:8px;background:#f9fafb;border-radius:8px;font-size:11px;color:#9ca3af">
            Tip: Press Ctrl+Shift+/ anytime to open this cheatsheet.
          </div>
        </div>
      `;

      await iris.window.createPanel(html, {
        title: 'Shortcut Cheatsheet',
        location: 'sidebar',
      });
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.shortcut-cheatsheet.stats', async () => {
      const stats =
        ((await iris.storage.get(STATS_KEY)) as Record<string, number>) || {};

      const sorted = Object.entries(stats).sort(([, a], [, b]) => b - a);

      if (sorted.length === 0) {
        await iris.window.showMessage('No usage data collected yet.', 'info');
        return;
      }

      const maxCount = sorted[0][1];
      const bars = sorted
        .slice(0, 15)
        .map(
          ([key, count]) => `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <kbd style="padding:2px 6px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;font-size:11px;font-family:monospace;min-width:100px;text-align:center">${key}</kbd>
            <div style="flex:1;height:20px;background:#f3f4f6;border-radius:4px;overflow:hidden">
              <div style="height:100%;width:${(count / maxCount) * 100}%;background:#0a0a0a;border-radius:4px"></div>
            </div>
            <span style="font-size:12px;color:#6b7280;min-width:30px;text-align:right">${count}</span>
          </div>
        `
        )
        .join('');

      const html = `
        <div style="padding:16px;font-family:system-ui">
          <h2 style="margin:0 0 16px">Shortcut Usage Stats</h2>
          ${bars}
        </div>
      `;

      await iris.window.createPanel(html, {
        title: 'Usage Stats',
        location: 'floating',
      });
    })
  );

  iris.log.info('Keyboard Shortcut Cheatsheet activated');
}

export function deactivate() {}
