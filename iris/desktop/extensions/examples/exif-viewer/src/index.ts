/**
 * EXIF / Metadata Viewer
 * Displays file info and EXIF metadata for the current image in a panel.
 */

export function activate(context: IrisExtensionContext) {
  context.subscriptions.push(
    iris.commands.register('iris-official.exif-viewer.show', async () => {
      const fileInfo = await iris.image.getActiveFileInfo();
      if (!fileInfo) {
        await iris.window.showMessage('No active image file.', 'warn');
        return;
      }

      // File info section
      const fileInfoRows = [
        { label: 'File Name', value: fileInfo.fileName },
        { label: 'Format', value: fileInfo.format.toUpperCase() },
        { label: 'MIME Type', value: fileInfo.mimeType },
        { label: 'Dimensions', value: `${fileInfo.width} × ${fileInfo.height}` },
        { label: 'File Size', value: formatFileSize(fileInfo.fileSize) },
        { label: 'Megapixels', value: ((fileInfo.width * fileInfo.height) / 1_000_000).toFixed(1) + ' MP' },
      ];

      const fileInfoHtml = fileInfoRows
        .map(
          (row) => `
          <tr>
            <td style="padding:4px 8px;font-size:12px;color:#6b7280;white-space:nowrap">${row.label}</td>
            <td style="padding:4px 8px;font-size:12px;font-weight:500">${row.value}</td>
          </tr>
        `
        )
        .join('');

      // EXIF metadata section
      let exifHtml = '';
      if (fileInfo.metadata && Object.keys(fileInfo.metadata).length > 0) {
        const exifCategories: Record<string, { label: string; value: string }[]> = {
          Camera: [],
          Exposure: [],
          Other: [],
        };

        const cameraKeys = ['Make', 'Model', 'LensModel', 'LensMake', 'Software'];
        const exposureKeys = [
          'ExposureTime', 'FNumber', 'ISO', 'ISOSpeedRatings',
          'FocalLength', 'ExposureMode', 'WhiteBalance', 'Flash',
        ];

        for (const [key, value] of Object.entries(fileInfo.metadata)) {
          const row = { label: key, value: String(value) };
          if (cameraKeys.includes(key)) {
            exifCategories.Camera.push(row);
          } else if (exposureKeys.includes(key)) {
            exifCategories.Exposure.push(row);
          } else {
            exifCategories.Other.push(row);
          }
        }

        for (const [category, rows] of Object.entries(exifCategories)) {
          if (rows.length === 0) continue;

          const rowsHtml = rows
            .map(
              (r) => `
              <tr>
                <td style="padding:3px 8px;font-size:12px;color:#6b7280;white-space:nowrap">${r.label}</td>
                <td style="padding:3px 8px;font-size:12px">${r.value}</td>
              </tr>
            `
            )
            .join('');

          exifHtml += `
            <h3 style="margin:16px 0 6px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;padding-bottom:4px">${category}</h3>
            <table style="width:100%;border-collapse:collapse">${rowsHtml}</table>
          `;
        }
      } else {
        exifHtml = '<p style="color:#9ca3af;font-size:13px;margin-top:16px">No EXIF metadata found.</p>';
      }

      const html = `
        <div style="padding:16px;font-family:system-ui;max-width:400px">
          <h2 style="margin:0 0 12px">File Info</h2>
          <table style="width:100%;border-collapse:collapse">${fileInfoHtml}</table>
          ${exifHtml}
        </div>
      `;

      await iris.window.createPanel(html, { title: 'EXIF Viewer', location: 'sidebar' });
    })
  );

  iris.log.info('EXIF Viewer activated');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function deactivate() {}
