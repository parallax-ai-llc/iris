/**
 * Batch Renamer
 * Rename multiple files in a directory using pattern-based rules.
 */

export function activate(context: IrisExtensionContext) {
  context.subscriptions.push(
    iris.commands.register('iris-official.batch-renamer.run', async () => {
      // Get pattern from user
      const pattern = await iris.window.showInputBox({
        prompt: 'Rename pattern (use {n} for number, {name} for original name)',
        value: '{name}_{n}',
        placeholder: 'e.g. photo_{n}, {name}_edited',
      });

      if (!pattern) return;

      const startNum = await iris.window.showInputBox({
        prompt: 'Start number',
        value: '1',
        placeholder: '1',
      });

      if (!startNum) return;

      const start = parseInt(startNum, 10) || 1;

      try {
        const entries = await iris.fs.listDirectory('.');
        const files = entries.filter((e) => e.isFile).sort((a, b) => a.name.localeCompare(b.name));

        if (files.length === 0) {
          await iris.window.showMessage('No files found in the current directory.', 'warn');
          return;
        }

        // Preview renames
        const renames: { from: string; to: string }[] = [];

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
          const nameWithoutExt = file.name.replace(/\.[^.]+$/, '');
          const num = String(start + i).padStart(3, '0');

          const newName =
            pattern
              .replace(/\{n\}/g, num)
              .replace(/\{name\}/g, nameWithoutExt) + ext;

          renames.push({ from: file.name, to: newName });
        }

        const previewRows = renames
          .map(
            (r) => `
            <tr>
              <td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280">${r.from}</td>
              <td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;font-size:12px">→</td>
              <td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;font-weight:600">${r.to}</td>
            </tr>
          `
          )
          .join('');

        const html = `
          <div style="padding:16px;font-family:system-ui">
            <h2 style="margin:0 0 4px">Batch Rename Preview</h2>
            <p style="color:#6b7280;font-size:14px;margin:0 0 12px">${renames.length} files will be renamed</p>
            <table style="width:100%;border-collapse:collapse">
              <thead><tr>
                <th style="padding:4px 8px;text-align:left;font-size:11px;color:#9ca3af;border-bottom:2px solid #e5e7eb">Current</th>
                <th style="padding:4px 8px;font-size:11px;border-bottom:2px solid #e5e7eb"></th>
                <th style="padding:4px 8px;text-align:left;font-size:11px;color:#9ca3af;border-bottom:2px solid #e5e7eb">New Name</th>
              </tr></thead>
              <tbody>${previewRows}</tbody>
            </table>
            <button onclick="window.parent.postMessage({type:'executeRename'},'*')"
              style="margin-top:12px;padding:8px 20px;border:none;background:#0a0a0a;color:white;border-radius:20px;cursor:pointer">
              Apply Rename
            </button>
          </div>
        `;

        await iris.window.createPanel(html, { title: 'Batch Rename', location: 'floating' });

        // Execute renames
        for (const r of renames) {
          if (r.from !== r.to) {
            await iris.fs.rename(`./${r.from}`, `./${r.to}`);
          }
        }

        await iris.window.showMessage(`Renamed ${renames.length} files.`, 'info');
      } catch (err) {
        iris.log.error('Batch rename failed', err);
        await iris.window.showMessage('Batch rename failed.', 'error');
      }
    })
  );

  iris.log.info('Batch Renamer activated');
}

export function deactivate() {}
