/**
 * Version Tracker
 * Automatically snapshot image versions during editing sessions with comparison and restore.
 */

interface VersionEntry {
  id: number;
  timestamp: string;
  width: number;
  height: number;
  memo: string;
  dataBase64: string;
}

export function activate(context: IrisExtensionContext) {
  const VERSIONS_KEY = 'versions';
  let nextId = 1;

  async function getVersions(): Promise<VersionEntry[]> {
    return ((await iris.storage.get(VERSIONS_KEY)) as VersionEntry[]) || [];
  }

  async function saveVersions(versions: VersionEntry[]) {
    await iris.storage.set(VERSIONS_KEY, versions);
  }

  function encodeImageData(data: Uint8Array): string {
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.subarray(i, Math.min(i + chunkSize, data.length));
      for (let j = 0; j < chunk.length; j++) {
        binary += String.fromCharCode(chunk[j]);
      }
    }
    return btoa(binary);
  }

  function decodeImageData(base64: string): Uint8Array {
    const binary = atob(base64);
    const data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      data[i] = binary.charCodeAt(i);
    }
    return data;
  }

  // Manual snapshot
  context.subscriptions.push(
    iris.commands.register('iris-official.version-tracker.snapshot', async () => {
      const image = await iris.image.getActive();
      if (!image) {
        await iris.window.showMessage('No active image to snapshot.', 'warn');
        return;
      }

      const memo = await iris.window.showInputBox({
        prompt: 'Version memo (optional)',
        placeholder: 'e.g. "adjusted colors"',
      });

      const versions = await getVersions();
      const maxVersions =
        ((await iris.storage.get('maxVersions')) as number) || 20;

      const entry: VersionEntry = {
        id: nextId++,
        timestamp: new Date().toISOString(),
        width: image.width,
        height: image.height,
        memo: memo || '',
        dataBase64: encodeImageData(image.data),
      };

      versions.unshift(entry);
      if (versions.length > maxVersions) {
        versions.length = maxVersions;
      }

      await saveVersions(versions);
      await iris.window.showMessage(
        `Version ${entry.id} saved. ${versions.length} version(s) total.`,
        'info'
      );
    })
  );

  // Version history panel
  context.subscriptions.push(
    iris.commands.register('iris-official.version-tracker.history', async () => {
      const versions = await getVersions();

      if (versions.length === 0) {
        await iris.window.showMessage('No versions saved yet.', 'info');
        return;
      }

      const rows = versions
        .map(
          (v, index) => `
          <tr>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;font-weight:600">v${v.id}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px">${v.width}×${v.height}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px">${v.memo || '-'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#9ca3af">${new Date(v.timestamp).toLocaleString()}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">
              <button onclick="window.parent.postMessage({type:'restoreVersion',index:${index}},'*')"
                style="padding:2px 8px;border:1px solid #d1d5db;background:white;border-radius:4px;cursor:pointer;font-size:11px">
                Restore
              </button>
            </td>
          </tr>
        `
        )
        .join('');

      const html = `
        <div style="padding:16px;font-family:system-ui">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <h2 style="margin:0">Version History</h2>
            <span style="font-size:13px;color:#6b7280">${versions.length} version(s)</span>
          </div>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr>
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:11px;color:#9ca3af">Ver</th>
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:11px;color:#9ca3af">Size</th>
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:11px;color:#9ca3af">Memo</th>
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:11px;color:#9ca3af">Date</th>
              <th style="padding:6px 8px;border-bottom:2px solid #e5e7eb"></th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>

          <button onclick="window.parent.postMessage({type:'clearVersions'},'*')"
            style="margin-top:12px;padding:6px 16px;border:1px solid #fca5a5;background:#fef2f2;color:#dc2626;border-radius:8px;cursor:pointer;font-size:12px">
            Clear All Versions
          </button>
        </div>
      `;

      await iris.window.createPanel(html, {
        title: 'Version History',
        location: 'sidebar',
      });
    })
  );

  // Restore version
  context.subscriptions.push(
    iris.commands.register('iris-official.version-tracker.restore', async () => {
      const versions = await getVersions();
      if (versions.length === 0) {
        await iris.window.showMessage('No versions to restore.', 'info');
        return;
      }

      const versionLabel = await iris.window.showInputBox({
        prompt: `Enter version number to restore (1-${versions.length})`,
        placeholder: '1',
      });

      if (!versionLabel) return;

      const index = parseInt(versionLabel, 10) - 1;
      if (isNaN(index) || index < 0 || index >= versions.length) {
        await iris.window.showMessage('Invalid version number.', 'error');
        return;
      }

      const version = versions[index];
      const data = decodeImageData(version.dataBase64);

      await iris.image.putImage({
        width: version.width,
        height: version.height,
        data,
      });

      await iris.window.showMessage(
        `Restored version ${version.id}${version.memo ? ` (${version.memo})` : ''}.`,
        'info'
      );
    })
  );

  // Auto-snapshot on image change (if enabled)
  const autoSnapshot = iris.image.onDidChangeActive(async () => {
    const autoEnabled = (await iris.storage.get('autoSnapshot')) as boolean;
    if (!autoEnabled) return;

    const image = await iris.image.getActive();
    if (!image) return;

    const versions = await getVersions();
    const maxVersions =
      ((await iris.storage.get('maxVersions')) as number) || 20;

    const entry: VersionEntry = {
      id: nextId++,
      timestamp: new Date().toISOString(),
      width: image.width,
      height: image.height,
      memo: 'auto',
      dataBase64: encodeImageData(image.data),
    };

    versions.unshift(entry);
    if (versions.length > maxVersions) {
      versions.length = maxVersions;
    }

    await saveVersions(versions);
    iris.log.debug(`Auto-snapshot v${entry.id} saved`);
  });
  context.subscriptions.push(autoSnapshot);

  iris.log.info('Version Tracker activated');
}

export function deactivate() {}
