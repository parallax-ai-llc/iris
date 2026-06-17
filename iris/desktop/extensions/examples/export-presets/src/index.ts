/**
 * Export Presets
 * Quick-apply platform export presets (YouTube, TikTok, Instagram, etc.).
 */

interface Preset {
  id: string;
  label: string;
  icon: string;
  width: number;
  height: number;
  fps: number;
  format: string;
  quality: string;
}

const PRESETS: Preset[] = [
  { id: 'youtube', label: 'YouTube', icon: '▶', width: 1920, height: 1080, fps: 60, format: 'mp4', quality: 'high' },
  { id: 'youtube-4k', label: 'YouTube 4K', icon: '▶', width: 3840, height: 2160, fps: 60, format: 'mp4', quality: 'high' },
  { id: 'youtube-shorts', label: 'YouTube Shorts', icon: '▶', width: 1080, height: 1920, fps: 30, format: 'mp4', quality: 'high' },
  { id: 'tiktok', label: 'TikTok', icon: '♪', width: 1080, height: 1920, fps: 30, format: 'mp4', quality: 'medium' },
  { id: 'instagram-reel', label: 'Instagram Reel', icon: '◎', width: 1080, height: 1920, fps: 30, format: 'mp4', quality: 'high' },
  { id: 'instagram-post', label: 'Instagram Post', icon: '◎', width: 1080, height: 1080, fps: 30, format: 'mp4', quality: 'high' },
  { id: 'twitter', label: 'Twitter / X', icon: '𝕏', width: 1280, height: 720, fps: 30, format: 'mp4', quality: 'medium' },
  { id: 'web-720p', label: 'Web 720p', icon: '🌐', width: 1280, height: 720, fps: 30, format: 'webm', quality: 'medium' },
  { id: 'gif', label: 'Animated GIF', icon: 'G', width: 480, height: 480, fps: 15, format: 'gif', quality: 'medium' },
];

export function activate(context: IrisExtensionContext) {
  context.subscriptions.push(
    iris.commands.register('iris-official.export-presets.show', async () => {
      const presets = await iris.export.getPresets();
      const allPresets = presets.length > 0 ? presets : PRESETS;

      const cards = (allPresets as Preset[])
        .map(
          (preset) => `
          <div onclick="window.parent.postMessage({type:'applyPreset',id:'${preset.id}'},'*')"
            style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;margin-bottom:6px;transition:all 0.15s"
            onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='transparent'">
            <span style="font-size:20px;width:28px;text-align:center">${preset.icon}</span>
            <div style="flex:1">
              <div style="font-weight:600;font-size:13px">${preset.label}</div>
              <div style="font-size:11px;color:#6b7280">${preset.width}×${preset.height} · ${preset.fps}fps · ${preset.format.toUpperCase()}</div>
            </div>
            <span style="font-size:11px;padding:2px 8px;background:#f3f4f6;border-radius:4px">${preset.quality}</span>
          </div>
        `
        )
        .join('');

      const html = `
        <div style="padding:16px;font-family:system-ui;max-width:400px">
          <h2 style="margin:0 0 12px">Export Presets</h2>
          ${cards}
          <p style="font-size:11px;color:#9ca3af;margin-top:8px">Click a preset to apply it to the current export settings.</p>
        </div>
      `;

      await iris.window.createPanel(html, { title: 'Export Presets', location: 'sidebar' });

      // In real implementation, panel postMessage would trigger applyPreset
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.export-presets.show-settings', async () => {
      const settings = await iris.export.getSettings();

      const rows = [
        { label: 'Format', value: settings.format },
        { label: 'Quality', value: settings.quality },
        { label: 'Frame Rate', value: `${settings.frameRate} fps` },
        { label: 'Resolution', value: `${settings.width} × ${settings.height}` },
      ];

      const rowsHtml = rows
        .map(
          (r) => `
          <tr>
            <td style="padding:6px 8px;font-size:13px;color:#6b7280">${r.label}</td>
            <td style="padding:6px 8px;font-size:13px;font-weight:600">${r.value}</td>
          </tr>
        `
        )
        .join('');

      const html = `
        <div style="padding:16px;font-family:system-ui;max-width:350px">
          <h2 style="margin:0 0 12px">Current Export Settings</h2>
          <table style="width:100%;border-collapse:collapse">${rowsHtml}</table>
        </div>
      `;

      await iris.window.createPanel(html, { title: 'Export Settings', location: 'floating' });
    })
  );

  iris.log.info('Export Presets activated');
}

export function deactivate() {}
