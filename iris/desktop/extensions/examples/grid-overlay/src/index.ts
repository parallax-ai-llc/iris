/**
 * Grid & Guide Overlay
 * Display rule of thirds, golden ratio, and diagonal composition guides on the canvas.
 */

type GuideType = 'thirds' | 'golden-ratio' | 'diagonal' | 'center-cross' | 'custom-grid';

function parseHexColor(hex: string): { r: number; g: number; b: number; a: number } {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const a = h.length >= 8 ? parseInt(h.substring(6, 8), 16) : 128;
  return { r, g, b, a };
}

function drawLine(
  data: Uint8Array,
  width: number,
  height: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: { r: number; g: number; b: number; a: number }
) {
  // Bresenham's line algorithm
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;

  let cx = x1;
  let cy = y1;

  while (true) {
    if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
      const idx = (cy * width + cx) * 4;
      const alpha = color.a / 255;
      data[idx] = Math.round(data[idx] * (1 - alpha) + color.r * alpha);
      data[idx + 1] = Math.round(data[idx + 1] * (1 - alpha) + color.g * alpha);
      data[idx + 2] = Math.round(data[idx + 2] * (1 - alpha) + color.b * alpha);
    }

    if (cx === x2 && cy === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }
}

function drawGuides(
  data: Uint8Array,
  width: number,
  height: number,
  guideType: GuideType,
  color: { r: number; g: number; b: number; a: number }
) {
  const result = new Uint8Array(data);

  switch (guideType) {
    case 'thirds': {
      const x1 = Math.round(width / 3);
      const x2 = Math.round((width * 2) / 3);
      const y1 = Math.round(height / 3);
      const y2 = Math.round((height * 2) / 3);

      drawLine(result, width, height, x1, 0, x1, height - 1, color);
      drawLine(result, width, height, x2, 0, x2, height - 1, color);
      drawLine(result, width, height, 0, y1, width - 1, y1, color);
      drawLine(result, width, height, 0, y2, width - 1, y2, color);
      break;
    }

    case 'golden-ratio': {
      const phi = 1.618033988749;
      const x1 = Math.round(width / phi);
      const x2 = Math.round(width - width / phi);
      const y1 = Math.round(height / phi);
      const y2 = Math.round(height - height / phi);

      drawLine(result, width, height, x1, 0, x1, height - 1, color);
      drawLine(result, width, height, x2, 0, x2, height - 1, color);
      drawLine(result, width, height, 0, y1, width - 1, y1, color);
      drawLine(result, width, height, 0, y2, width - 1, y2, color);
      break;
    }

    case 'diagonal': {
      drawLine(result, width, height, 0, 0, width - 1, height - 1, color);
      drawLine(result, width, height, width - 1, 0, 0, height - 1, color);
      break;
    }

    case 'center-cross': {
      const cx = Math.round(width / 2);
      const cy = Math.round(height / 2);

      drawLine(result, width, height, cx, 0, cx, height - 1, color);
      drawLine(result, width, height, 0, cy, width - 1, cy, color);
      break;
    }

    case 'custom-grid': {
      const cols = 4;
      const rows = 4;

      for (let i = 1; i < cols; i++) {
        const x = Math.round((width * i) / cols);
        drawLine(result, width, height, x, 0, x, height - 1, color);
      }
      for (let i = 1; i < rows; i++) {
        const y = Math.round((height * i) / rows);
        drawLine(result, width, height, 0, y, width - 1, y, color);
      }
      break;
    }
  }

  return result;
}

export function activate(context: IrisExtensionContext) {
  let overlayActive = false;
  let originalData: Uint8Array | null = null;
  let originalWidth = 0;
  let originalHeight = 0;

  context.subscriptions.push(
    iris.commands.register('iris-official.grid-overlay.toggle', async () => {
      const image = await iris.image.getActive();
      if (!image) {
        await iris.window.showMessage('No active image found.', 'warn');
        return;
      }

      if (overlayActive && originalData) {
        // Remove overlay — restore original
        await iris.image.putImage({
          width: originalWidth,
          height: originalHeight,
          data: originalData,
        });
        overlayActive = false;
        originalData = null;
        await iris.window.showMessage('Grid overlay removed.', 'info');
        return;
      }

      // Apply overlay
      const guideType =
        ((await iris.storage.get('type')) as GuideType) || 'thirds';
      const colorHex =
        ((await iris.storage.get('color')) as string) || '#FF000080';
      const opacity = ((await iris.storage.get('opacity')) as number) || 40;

      const color = parseHexColor(colorHex);
      color.a = Math.round((opacity / 100) * 255);

      originalData = new Uint8Array(image.data);
      originalWidth = image.width;
      originalHeight = image.height;

      const result = drawGuides(
        image.data,
        image.width,
        image.height,
        guideType,
        color
      );

      await iris.image.putImage({
        width: image.width,
        height: image.height,
        data: result,
      });
      overlayActive = true;

      await iris.window.showMessage(
        `Grid overlay applied (${guideType}). Toggle again to remove.`,
        'info'
      );
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.grid-overlay.configure', async () => {
      const guideTypes: { value: GuideType; label: string }[] = [
        { value: 'thirds', label: 'Rule of Thirds' },
        { value: 'golden-ratio', label: 'Golden Ratio' },
        { value: 'diagonal', label: 'Diagonals' },
        { value: 'center-cross', label: 'Center Cross' },
        { value: 'custom-grid', label: 'Custom Grid (4×4)' },
      ];

      const options = guideTypes
        .map(
          (g) => `
          <option value="${g.value}">${g.label}</option>
        `
        )
        .join('');

      const html = `
        <div style="padding:16px;font-family:system-ui;max-width:320px">
          <h2 style="margin:0 0 16px">Grid Settings</h2>

          <label style="display:block;margin-bottom:12px">
            <span style="font-size:14px;font-weight:600">Guide Type</span>
            <select id="guideType" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px">
              ${options}
            </select>
          </label>

          <label style="display:block;margin-bottom:12px">
            <span style="font-size:14px;font-weight:600">Guide Color</span>
            <input type="color" id="guideColor" value="#FF0000"
              style="width:100%;height:36px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px;cursor:pointer">
          </label>

          <label style="display:block;margin-bottom:16px">
            <span style="font-size:14px;font-weight:600">Opacity</span>
            <input type="range" id="opacity" min="10" max="100" value="40"
              style="width:100%;margin-top:4px"
              oninput="document.getElementById('opLabel').textContent=this.value+'%'">
            <span id="opLabel" style="font-size:12px;color:#6b7280">40%</span>
          </label>

          <button onclick="
            window.parent.postMessage({
              type: 'saveGridConfig',
              guideType: document.getElementById('guideType').value,
              color: document.getElementById('guideColor').value,
              opacity: parseInt(document.getElementById('opacity').value),
            }, '*');
          " style="padding:10px 20px;border:none;background:#0a0a0a;color:white;border-radius:20px;cursor:pointer;width:100%">
            Apply Settings
          </button>
        </div>
      `;

      await iris.window.createPanel(html, {
        title: 'Grid Settings',
        location: 'sidebar',
      });
    })
  );

  iris.log.info('Grid & Guide Overlay activated');
}

export function deactivate() {}
