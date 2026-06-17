/**
 * Image Comparison Slider
 * Compare before/after images with an interactive slider panel.
 */

interface Snapshot {
  width: number;
  height: number;
  dataUrl: string;
}

export function activate(context: IrisExtensionContext) {
  let beforeSnapshot: Snapshot | null = null;

  function rgbaToDataUrl(data: Uint8Array, width: number, height: number): string {
    // Encode RGBA data as base64 BMP-like format for panel display
    const header = `data:image/rgba;width=${width};height=${height};base64,`;
    let binary = '';
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return header + btoa(binary);
  }

  context.subscriptions.push(
    iris.commands.register('iris-official.image-comparison.snapshot', async () => {
      const image = await iris.image.getActive();
      if (!image) {
        await iris.window.showMessage('No active image to snapshot.', 'warn');
        return;
      }

      beforeSnapshot = {
        width: image.width,
        height: image.height,
        dataUrl: rgbaToDataUrl(image.data, image.width, image.height),
      };

      await iris.window.showMessage(
        `Snapshot saved (${image.width}x${image.height}). Edit the image, then use "Compare Before/After".`,
        'info'
      );
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.image-comparison.compare', async () => {
      if (!beforeSnapshot) {
        await iris.window.showMessage(
          'No "before" snapshot. Use "Take Snapshot" first.',
          'warn'
        );
        return;
      }

      const afterImage = await iris.image.getActive();
      if (!afterImage) {
        await iris.window.showMessage('No active image to compare.', 'warn');
        return;
      }

      const afterDataUrl = rgbaToDataUrl(
        afterImage.data,
        afterImage.width,
        afterImage.height
      );

      const html = `
        <div style="padding:16px;font-family:system-ui">
          <h2 style="margin:0 0 12px">Before / After Comparison</h2>
          <div style="display:flex;gap:8px;margin-bottom:12px">
            <span style="padding:4px 8px;background:#e5e7eb;border-radius:4px;font-size:12px">
              Before: ${beforeSnapshot.width}x${beforeSnapshot.height}
            </span>
            <span style="padding:4px 8px;background:#e5e7eb;border-radius:4px;font-size:12px">
              After: ${afterImage.width}x${afterImage.height}
            </span>
          </div>

          <div id="slider-container" style="position:relative;width:100%;max-width:600px;overflow:hidden;border-radius:8px;border:1px solid #e5e7eb;aspect-ratio:${afterImage.width}/${afterImage.height}">
            <canvas id="before-canvas" style="position:absolute;top:0;left:0;width:100%;height:100%"></canvas>
            <canvas id="after-canvas" style="position:absolute;top:0;left:0;width:100%;height:100%;clip-path:inset(0 0 0 50%)"></canvas>
            <div id="slider-line" style="position:absolute;top:0;left:50%;width:2px;height:100%;background:white;box-shadow:0 0 4px rgba(0,0,0,0.5);cursor:ew-resize;z-index:10">
              <div style="position:absolute;top:50%;left:-12px;width:26px;height:26px;border-radius:50%;background:white;box-shadow:0 2px 4px rgba(0,0,0,0.3);transform:translateY(-50%);display:flex;align-items:center;justify-content:center;font-size:12px">⇔</div>
            </div>
          </div>

          <div style="display:flex;gap:8px;margin-top:12px">
            <button onclick="setSlider(0)" style="padding:6px 12px;border:1px solid #d1d5db;background:white;border-radius:6px;cursor:pointer">Before Only</button>
            <button onclick="setSlider(50)" style="padding:6px 12px;border:1px solid #d1d5db;background:white;border-radius:6px;cursor:pointer">50/50</button>
            <button onclick="setSlider(100)" style="padding:6px 12px;border:1px solid #d1d5db;background:white;border-radius:6px;cursor:pointer">After Only</button>
          </div>
        </div>

        <script>
          const container = document.getElementById('slider-container');
          const afterCanvas = document.getElementById('after-canvas');
          const sliderLine = document.getElementById('slider-line');
          let isDragging = false;

          function setSlider(pct) {
            afterCanvas.style.clipPath = 'inset(0 0 0 ' + pct + '%)';
            sliderLine.style.left = pct + '%';
          }

          container.addEventListener('mousedown', () => isDragging = true);
          document.addEventListener('mouseup', () => isDragging = false);
          container.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const rect = container.getBoundingClientRect();
            const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
            setSlider(pct);
          });
        </script>
      `;

      await iris.window.createPanel(html, {
        title: 'Image Comparison',
        location: 'floating',
      });
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.image-comparison.clear', async () => {
      beforeSnapshot = null;
      await iris.window.showMessage('Snapshots cleared.', 'info');
    })
  );

  iris.log.info('Image Comparison Slider activated');
}

export function deactivate() {}
