/**
 * Image Info
 * Displays detailed information about the current canvas image.
 */

export function activate(context: IrisExtensionContext) {
  context.subscriptions.push(
    iris.commands.register('iris-official.image-info.show', async () => {
      const image = await iris.image.getActive();
      if (!image) {
        await iris.window.showMessage('No active image found.', 'warn');
        return;
      }

      const { width, height, data } = image;
      const totalPixels = width * height;
      const megapixels = (totalPixels / 1_000_000).toFixed(2);
      const aspectRatio = simplifyRatio(width, height);
      const memoryUsage = formatBytes(data.length);
      const orientation = width > height ? 'Landscape' : width < height ? 'Portrait' : 'Square';

      // Analyze color statistics
      let minR = 255, maxR = 0, totalR = 0;
      let minG = 255, maxG = 0, totalG = 0;
      let minB = 255, maxB = 0, totalB = 0;
      let totalAlpha = 0;
      let transparentPixels = 0;

      const step = Math.max(1, Math.floor(totalPixels / 10000));
      let sampledCount = 0;

      for (let i = 0; i < totalPixels; i += step) {
        const idx = i * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];

        minR = Math.min(minR, r); maxR = Math.max(maxR, r); totalR += r;
        minG = Math.min(minG, g); maxG = Math.max(maxG, g); totalG += g;
        minB = Math.min(minB, b); maxB = Math.max(maxB, b); totalB += b;
        totalAlpha += a;
        if (a < 255) transparentPixels++;
        sampledCount++;
      }

      const avgR = Math.round(totalR / sampledCount);
      const avgG = Math.round(totalG / sampledCount);
      const avgB = Math.round(totalB / sampledCount);
      const avgHex = `#${[avgR, avgG, avgB].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      const hasTransparency = transparentPixels > 0;

      const rows = [
        { label: 'Dimensions', value: `${width} × ${height} px` },
        { label: 'Megapixels', value: `${megapixels} MP` },
        { label: 'Aspect Ratio', value: aspectRatio },
        { label: 'Orientation', value: orientation },
        { label: 'Color Depth', value: '32-bit RGBA' },
        { label: 'Memory', value: memoryUsage },
        { label: 'Transparency', value: hasTransparency ? `Yes (${transparentPixels} sampled pixels)` : 'No' },
      ];

      const rowsHtml = rows
        .map(
          (r) => `
          <tr>
            <td style="padding:4px 8px;font-size:12px;color:#6b7280">${r.label}</td>
            <td style="padding:4px 8px;font-size:12px;font-weight:500">${r.value}</td>
          </tr>
        `
        )
        .join('');

      await iris.window.showMessage(
        `Image: ${width}×${height} (${megapixels} MP, ${aspectRatio}, ${orientation}, avg color: ${avgHex})`,
        'info'
      );
    })
  );

  iris.log.info('Image Info activated');
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function simplifyRatio(w: number, h: number): string {
  const d = gcd(w, h);
  return `${w / d}:${h / d}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function deactivate() {}
