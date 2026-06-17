/**
 * Image Diff Checker
 * Visualize pixel-level differences between two images with similarity scoring.
 */

function parseHexColor(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

export function activate(context: IrisExtensionContext) {
  let referenceImage: { width: number; height: number; data: Uint8Array } | null = null;

  context.subscriptions.push(
    iris.commands.register('iris-official.image-diff.capture', async () => {
      const image = await iris.image.getActive();
      if (!image) {
        await iris.window.showMessage('No active image found.', 'warn');
        return;
      }

      referenceImage = {
        width: image.width,
        height: image.height,
        data: new Uint8Array(image.data),
      };

      await iris.window.showMessage(
        `Reference captured (${image.width}×${image.height}). Edit the image, then use "Show Diff".`,
        'info'
      );
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.image-diff.diff', async () => {
      if (!referenceImage) {
        await iris.window.showMessage(
          'No reference image. Use "Capture Reference Image" first.',
          'warn'
        );
        return;
      }

      const current = await iris.image.getActive();
      if (!current) {
        await iris.window.showMessage('No active image found.', 'warn');
        return;
      }

      if (
        current.width !== referenceImage.width ||
        current.height !== referenceImage.height
      ) {
        await iris.window.showMessage(
          `Image dimensions don't match. Reference: ${referenceImage.width}×${referenceImage.height}, Current: ${current.width}×${current.height}.`,
          'error'
        );
        return;
      }

      const threshold =
        ((await iris.storage.get('threshold')) as number) || 10;
      const highlightHex =
        ((await iris.storage.get('highlightColor')) as string) || '#FF0000';
      const [hR, hG, hB] = parseHexColor(highlightHex);

      const { width, height } = current;
      const totalPixels = width * height;
      const diffData = new Uint8Array(current.data.length);
      let changedPixels = 0;
      let totalDiff = 0;

      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        const dr = Math.abs(current.data[idx] - referenceImage.data[idx]);
        const dg = Math.abs(current.data[idx + 1] - referenceImage.data[idx + 1]);
        const db = Math.abs(current.data[idx + 2] - referenceImage.data[idx + 2]);
        const pixelDiff = (dr + dg + db) / 3;

        totalDiff += pixelDiff;

        if (pixelDiff > threshold) {
          changedPixels++;
          const intensity = Math.min(255, pixelDiff * 2);
          diffData[idx] = hR;
          diffData[idx + 1] = hG;
          diffData[idx + 2] = hB;
          diffData[idx + 3] = intensity;
        } else {
          // Show original as grayscale for unchanged areas
          const gray = Math.round(
            current.data[idx] * 0.299 +
              current.data[idx + 1] * 0.587 +
              current.data[idx + 2] * 0.114
          );
          diffData[idx] = gray;
          diffData[idx + 1] = gray;
          diffData[idx + 2] = gray;
          diffData[idx + 3] = 255;
        }
      }

      const similarity = (
        ((totalPixels - changedPixels) / totalPixels) *
        100
      ).toFixed(2);
      const avgDiff = (totalDiff / totalPixels).toFixed(1);
      const changedPct = ((changedPixels / totalPixels) * 100).toFixed(2);

      await iris.image.putImage({ width, height, data: diffData });

      const html = `
        <div style="padding:16px;font-family:system-ui;max-width:300px">
          <h2 style="margin:0 0 16px">Diff Results</h2>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
            <div style="padding:12px;background:#f3f4f6;border-radius:8px;text-align:center">
              <div style="font-size:24px;font-weight:700;color:${parseFloat(similarity) > 95 ? '#22c55e' : parseFloat(similarity) > 80 ? '#f59e0b' : '#ef4444'}">${similarity}%</div>
              <div style="font-size:12px;color:#6b7280">Similarity</div>
            </div>
            <div style="padding:12px;background:#f3f4f6;border-radius:8px;text-align:center">
              <div style="font-size:24px;font-weight:700">${changedPct}%</div>
              <div style="font-size:12px;color:#6b7280">Changed</div>
            </div>
          </div>

          <div style="font-size:13px;color:#374151;margin-bottom:12px">
            <div>Changed pixels: <strong>${changedPixels.toLocaleString()}</strong> / ${totalPixels.toLocaleString()}</div>
            <div>Average diff: <strong>${avgDiff}</strong> / 255</div>
            <div>Threshold: <strong>${threshold}</strong></div>
          </div>

          <div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f9fafb;border-radius:8px;font-size:12px">
            <div style="width:12px;height:12px;background:${highlightHex};border-radius:2px"></div>
            <span>Highlighted = changed pixels</span>
          </div>
        </div>
      `;

      await iris.window.createPanel(html, {
        title: 'Image Diff',
        location: 'sidebar',
      });
    })
  );

  iris.log.info('Image Diff Checker activated');
}

export function deactivate() {}
