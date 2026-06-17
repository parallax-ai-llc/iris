/**
 * Cloud Sync Uploader
 * Upload finished images directly to S3, GCS, or Cloudinary with one click.
 */

interface UploadRecord {
  url: string;
  provider: string;
  timestamp: string;
  fileName: string;
}

function rgbaToBase64Png(data: Uint8Array, width: number, height: number): string {
  // Simplified: encode raw data as base64 for upload
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

export function activate(context: IrisExtensionContext) {
  const HISTORY_KEY = 'uploadHistory';

  context.subscriptions.push(
    iris.commands.register('iris-official.cloud-uploader.upload', async () => {
      const image = await iris.image.getActive();
      if (!image) {
        await iris.window.showMessage('No active image found.', 'warn');
        return;
      }

      const provider =
        ((await iris.storage.get('provider')) as string) || 'cloudinary';
      const apiKey = (await iris.storage.get('apiKey')) as string;
      const bucket = (await iris.storage.get('bucket')) as string;

      if (!apiKey || !bucket) {
        await iris.window.showMessage(
          'Please configure your cloud provider first (Configure Cloud Provider command).',
          'warn'
        );
        return;
      }

      const base64Data = rgbaToBase64Png(image.data, image.width, image.height);

      try {
        await iris.window.showMessage(`Uploading to ${provider}...`, 'info');

        let response: { status: number; body: string };
        let uploadedUrl = '';

        if (provider === 'cloudinary') {
          response = await iris.network.fetch(
            `https://api.cloudinary.com/v1_1/${bucket}/image/upload`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                file: `data:image/png;base64,${base64Data}`,
                api_key: apiKey,
                upload_preset: 'iris_upload',
              }),
            }
          );

          if (response.status === 200) {
            const result = JSON.parse(response.body);
            uploadedUrl = result.secure_url || result.url;
          }
        } else if (provider === 's3') {
          const fileName = `iris-upload-${Date.now()}.png`;
          response = await iris.network.fetch(
            `https://${bucket}.s3.amazonaws.com/${fileName}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'image/png',
                Authorization: `AWS ${apiKey}`,
              },
              body: base64Data,
            }
          );

          if (response.status === 200) {
            uploadedUrl = `https://${bucket}.s3.amazonaws.com/${fileName}`;
          }
        } else if (provider === 'gcs') {
          const fileName = `iris-upload-${Date.now()}.png`;
          response = await iris.network.fetch(
            `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?name=${fileName}&uploadType=media`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'image/png',
                Authorization: `Bearer ${apiKey}`,
              },
              body: base64Data,
            }
          );

          if (response.status === 200) {
            const result = JSON.parse(response.body);
            uploadedUrl = `https://storage.googleapis.com/${bucket}/${result.name}`;
          }
        }

        if (uploadedUrl) {
          await iris.clipboard.write(uploadedUrl);
          await iris.window.showMessage(
            `Uploaded! URL copied to clipboard.`,
            'info'
          );

          // Save to history
          const history =
            ((await iris.storage.get(HISTORY_KEY)) as UploadRecord[]) || [];
          history.unshift({
            url: uploadedUrl,
            provider,
            timestamp: new Date().toISOString(),
            fileName: `${image.width}x${image.height}.png`,
          });
          if (history.length > 100) history.length = 100;
          await iris.storage.set(HISTORY_KEY, history);
        } else {
          await iris.window.showMessage('Upload failed. Check your credentials.', 'error');
        }
      } catch (err) {
        iris.log.error('Upload failed', err);
        await iris.window.showMessage('Upload failed. Check console for details.', 'error');
      }
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.cloud-uploader.history', async () => {
      const history =
        ((await iris.storage.get(HISTORY_KEY)) as UploadRecord[]) || [];

      if (history.length === 0) {
        await iris.window.showMessage('No upload history yet.', 'info');
        return;
      }

      const rows = history
        .slice(0, 30)
        .map(
          (record) => `
          <tr>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px">${record.provider}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              <a href="${record.url}" target="_blank" style="color:#3b82f6">${record.url}</a>
            </td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px">${new Date(record.timestamp).toLocaleString()}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">
              <button onclick="navigator.clipboard.writeText('${record.url}')"
                style="padding:2px 8px;border:1px solid #d1d5db;background:white;border-radius:4px;cursor:pointer;font-size:11px">Copy</button>
            </td>
          </tr>
        `
        )
        .join('');

      const html = `
        <div style="padding:16px;font-family:system-ui">
          <h2 style="margin:0 0 12px">Upload History (${history.length})</h2>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr>
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:12px">Provider</th>
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:12px">URL</th>
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:12px">Date</th>
              <th style="padding:6px 8px;border-bottom:2px solid #e5e7eb"></th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;

      await iris.window.createPanel(html, { title: 'Upload History', location: 'floating' });
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.cloud-uploader.configure', async () => {
      const html = `
        <div style="padding:16px;font-family:system-ui;max-width:400px">
          <h2 style="margin:0 0 16px">Cloud Provider Settings</h2>

          <label style="display:block;margin-bottom:12px">
            <span style="font-size:14px;font-weight:600">Provider</span>
            <select id="provider" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px">
              <option value="cloudinary">Cloudinary</option>
              <option value="s3">Amazon S3</option>
              <option value="gcs">Google Cloud Storage</option>
            </select>
          </label>

          <label style="display:block;margin-bottom:12px">
            <span style="font-size:14px;font-weight:600">API Key / Token</span>
            <input type="password" id="apiKey" placeholder="Enter your API key"
              style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px;box-sizing:border-box">
          </label>

          <label style="display:block;margin-bottom:16px">
            <span style="font-size:14px;font-weight:600">Bucket / Cloud Name</span>
            <input type="text" id="bucket" placeholder="my-bucket-name"
              style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px;box-sizing:border-box">
          </label>

          <button onclick="
            const data = {
              provider: document.getElementById('provider').value,
              apiKey: document.getElementById('apiKey').value,
              bucket: document.getElementById('bucket').value,
            };
            window.parent.postMessage({ type: 'saveConfig', ...data }, '*');
          " style="padding:10px 20px;border:none;background:#0a0a0a;color:white;border-radius:20px;cursor:pointer;width:100%">
            Save Configuration
          </button>
        </div>
      `;

      await iris.window.createPanel(html, {
        title: 'Cloud Provider Config',
        location: 'floating',
      });
    })
  );

  iris.log.info('Cloud Sync Uploader activated');
}

export function deactivate() {}
