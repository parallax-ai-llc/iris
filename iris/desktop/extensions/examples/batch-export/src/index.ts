/**
 * Batch Export
 * Export images to multiple resolutions and formats at once for web, mobile, and print.
 */

interface ExportProfile {
  name: string;
  label: string;
  formats: { suffix: string; width: number; height: number; format: string; quality: string }[];
}

const DEFAULT_PROFILES: ExportProfile[] = [
  {
    name: 'web',
    label: 'Web',
    formats: [
      { suffix: 'web_2x', width: 2048, height: 0, format: 'webp', quality: 'high' },
      { suffix: 'web_1x', width: 1024, height: 0, format: 'webp', quality: 'medium' },
      { suffix: 'thumb', width: 400, height: 0, format: 'webp', quality: 'medium' },
    ],
  },
  {
    name: 'mobile',
    label: 'Mobile',
    formats: [
      { suffix: 'mobile_3x', width: 1242, height: 0, format: 'png', quality: 'high' },
      { suffix: 'mobile_2x', width: 828, height: 0, format: 'png', quality: 'high' },
      { suffix: 'mobile_1x', width: 414, height: 0, format: 'png', quality: 'high' },
    ],
  },
  {
    name: 'print',
    label: 'Print (300 DPI)',
    formats: [
      { suffix: 'print_A4', width: 3508, height: 2480, format: 'png', quality: 'high' },
      { suffix: 'print_A5', width: 2480, height: 1748, format: 'png', quality: 'high' },
    ],
  },
  {
    name: 'social',
    label: 'Social Media',
    formats: [
      { suffix: 'ig_post', width: 1080, height: 1080, format: 'jpg', quality: 'high' },
      { suffix: 'ig_story', width: 1080, height: 1920, format: 'jpg', quality: 'high' },
      { suffix: 'yt_thumb', width: 1280, height: 720, format: 'jpg', quality: 'high' },
      { suffix: 'twitter', width: 1200, height: 675, format: 'jpg', quality: 'high' },
    ],
  },
];

export function activate(context: IrisExtensionContext) {
  context.subscriptions.push(
    iris.commands.register('iris-official.batch-export.run', async () => {
      const image = await iris.image.getActive();
      if (!image) {
        await iris.window.showMessage('No active image to export.', 'warn');
        return;
      }

      const profilesStr =
        ((await iris.storage.get('profiles')) as string) || 'web,mobile,print';
      const namingRule =
        ((await iris.storage.get('namingRule')) as string) ||
        '{name}_{profile}_{width}x{height}';

      const selectedNames = profilesStr.split(',').map((s) => s.trim());
      const selectedProfiles = DEFAULT_PROFILES.filter((p) =>
        selectedNames.includes(p.name)
      );

      if (selectedProfiles.length === 0) {
        await iris.window.showMessage('No export profiles selected.', 'warn');
        return;
      }

      // Build preview of what will be exported
      const profileSections = selectedProfiles
        .map((profile) => {
          const formatRows = profile.formats
            .map((f) => {
              const actualH = f.height || Math.round((image.height / image.width) * f.width);
              const fileName = namingRule
                .replace('{name}', 'image')
                .replace('{profile}', f.suffix)
                .replace('{width}', String(f.width))
                .replace('{height}', String(actualH));

              return `
                <tr>
                  <td style="padding:4px 8px;font-size:12px">${fileName}.${f.format}</td>
                  <td style="padding:4px 8px;font-size:12px">${f.width} × ${actualH}</td>
                  <td style="padding:4px 8px;font-size:12px">${f.format.toUpperCase()}</td>
                  <td style="padding:4px 8px;font-size:12px">${f.quality}</td>
                </tr>
              `;
            })
            .join('');

          return `
            <div style="margin-bottom:16px">
              <h3 style="margin:0 0 6px;font-size:14px">${profile.label}</h3>
              <table style="width:100%;border-collapse:collapse">
                <thead><tr style="border-bottom:1px solid #e5e7eb">
                  <th style="padding:4px 8px;text-align:left;font-size:11px;color:#9ca3af">File</th>
                  <th style="padding:4px 8px;text-align:left;font-size:11px;color:#9ca3af">Size</th>
                  <th style="padding:4px 8px;text-align:left;font-size:11px;color:#9ca3af">Format</th>
                  <th style="padding:4px 8px;text-align:left;font-size:11px;color:#9ca3af">Quality</th>
                </tr></thead>
                <tbody>${formatRows}</tbody>
              </table>
            </div>
          `;
        })
        .join('');

      const totalFiles = selectedProfiles.reduce(
        (sum, p) => sum + p.formats.length,
        0
      );

      const html = `
        <div style="padding:16px;font-family:system-ui">
          <h2 style="margin:0 0 4px">Batch Export</h2>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px">
            Source: ${image.width} × ${image.height} · ${totalFiles} files will be generated
          </p>

          ${profileSections}

          <button onclick="window.parent.postMessage({ type: 'startExport' }, '*')"
            style="padding:10px 24px;border:none;background:#0a0a0a;color:white;border-radius:20px;cursor:pointer;width:100%;font-size:14px;margin-top:8px">
            Export ${totalFiles} Files
          </button>
        </div>
      `;

      await iris.window.createPanel(html, {
        title: 'Batch Export',
        location: 'floating',
      });
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.batch-export.configure', async () => {
      const profileCheckboxes = DEFAULT_PROFILES.map(
        (p) => `
        <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer">
          <input type="checkbox" value="${p.name}" checked style="width:16px;height:16px">
          <span style="font-size:14px"><strong>${p.label}</strong> (${p.formats.length} variants)</span>
        </label>
      `
      ).join('');

      const html = `
        <div style="padding:16px;font-family:system-ui;max-width:400px">
          <h2 style="margin:0 0 16px">Export Profiles</h2>

          <div style="margin-bottom:16px">
            ${profileCheckboxes}
          </div>

          <label style="display:block;margin-bottom:16px">
            <span style="font-size:14px;font-weight:600">File Naming Rule</span>
            <input type="text" id="namingRule" value="{name}_{profile}_{width}x{height}"
              style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px;font-family:monospace;font-size:13px;box-sizing:border-box">
            <div style="font-size:11px;color:#9ca3af;margin-top:4px">
              Variables: {name}, {profile}, {width}, {height}
            </div>
          </label>
        </div>
      `;

      await iris.window.createPanel(html, {
        title: 'Export Profiles',
        location: 'sidebar',
      });
    })
  );

  iris.log.info('Batch Export activated');
}

export function deactivate() {}
