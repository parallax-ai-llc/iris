/**
 * Watermark Stamper
 * Add customizable text watermarks to images with position and opacity controls.
 */

type Position = 'bottom-right' | 'bottom-left' | 'center' | 'top-right';

// Simple 5x7 bitmap font for uppercase alphanumeric
const CHAR_W = 5;
const CHAR_H = 7;

const FONT: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  A: [0x04, 0x0a, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0e],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x11, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0e, 0x11, 0x10, 0x0e, 0x01, 0x11, 0x0e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x0a, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04],
  '-': [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  '@': [0x0e, 0x11, 0x17, 0x15, 0x17, 0x10, 0x0e],
};

function calculatePosition(
  imgW: number,
  imgH: number,
  textW: number,
  textH: number,
  position: Position,
  margin: number
): { x: number; y: number } {
  switch (position) {
    case 'bottom-right':
      return { x: imgW - textW - margin, y: imgH - textH - margin };
    case 'bottom-left':
      return { x: margin, y: imgH - textH - margin };
    case 'top-right':
      return { x: imgW - textW - margin, y: margin };
    case 'center':
      return { x: Math.round((imgW - textW) / 2), y: Math.round((imgH - textH) / 2) };
  }
}

export function activate(context: IrisExtensionContext) {
  context.subscriptions.push(
    iris.commands.register('iris-official.watermark-stamper.apply', async () => {
      const image = await iris.image.getActive();
      if (!image) {
        await iris.window.showMessage('No active image found.', 'warn');
        return;
      }

      const text = ((await iris.storage.get('text')) as string) || 'IRIS';
      const position = ((await iris.storage.get('position')) as Position) || 'bottom-right';
      const scale = 3;
      const opacity = 128; // 50%
      const margin = 20;

      const { width, height, data } = image;
      const result = new Uint8Array(data);

      const upperText = text.toUpperCase();
      const textWidthPx = upperText.length * (CHAR_W + 1) * scale;
      const textHeightPx = CHAR_H * scale;

      const pos = calculatePosition(width, height, textWidthPx, textHeightPx, position, margin);

      let cursorX = pos.x;
      for (const char of upperText) {
        const bitmap = FONT[char];
        if (!bitmap) {
          cursorX += (CHAR_W + 1) * scale;
          continue;
        }

        for (let row = 0; row < CHAR_H; row++) {
          for (let col = 0; col < CHAR_W; col++) {
            if (bitmap[row] & (1 << (CHAR_W - 1 - col))) {
              for (let sy = 0; sy < scale; sy++) {
                for (let sx = 0; sx < scale; sx++) {
                  const px = cursorX + col * scale + sx;
                  const py = pos.y + row * scale + sy;

                  if (px >= 0 && px < width && py >= 0 && py < height) {
                    const idx = (py * width + px) * 4;
                    const alpha = opacity / 255;
                    result[idx] = Math.round(result[idx] * (1 - alpha) + 255 * alpha);
                    result[idx + 1] = Math.round(result[idx + 1] * (1 - alpha) + 255 * alpha);
                    result[idx + 2] = Math.round(result[idx + 2] * (1 - alpha) + 255 * alpha);
                  }
                }
              }
            }
          }
        }

        cursorX += (CHAR_W + 1) * scale;
      }

      await iris.image.putImage({ width, height, data: result });
      await iris.window.showMessage(
        `Watermark "${text}" applied at ${position}.`,
        'info'
      );
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.watermark-stamper.configure', async () => {
      const currentText = ((await iris.storage.get('text')) as string) || 'IRIS';
      const currentPos = ((await iris.storage.get('position')) as string) || 'bottom-right';

      const html = `
        <div style="padding:16px;font-family:system-ui;max-width:350px">
          <h2 style="margin:0 0 16px">Watermark Settings</h2>

          <label style="display:block;margin-bottom:12px">
            <span style="font-size:14px;font-weight:600">Watermark Text</span>
            <input type="text" id="wmText" value="${currentText}"
              style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px;box-sizing:border-box">
          </label>

          <label style="display:block;margin-bottom:12px">
            <span style="font-size:14px;font-weight:600">Position</span>
            <select id="wmPosition" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px">
              <option value="bottom-right" ${currentPos === 'bottom-right' ? 'selected' : ''}>Bottom Right</option>
              <option value="bottom-left" ${currentPos === 'bottom-left' ? 'selected' : ''}>Bottom Left</option>
              <option value="top-right" ${currentPos === 'top-right' ? 'selected' : ''}>Top Right</option>
              <option value="center" ${currentPos === 'center' ? 'selected' : ''}>Center</option>
            </select>
          </label>

          <div style="margin-bottom:16px;padding:12px;background:#f3f4f6;border-radius:8px">
            <div style="font-size:11px;color:#6b7280;margin-bottom:4px">Preview:</div>
            <div id="preview" style="font-family:monospace;font-size:18px;letter-spacing:2px;color:#374151">${currentText.toUpperCase()}</div>
          </div>

          <button onclick="
            window.parent.postMessage({
              type: 'saveConfig',
              text: document.getElementById('wmText').value,
              position: document.getElementById('wmPosition').value,
            }, '*');
          " style="padding:10px 20px;border:none;background:#0a0a0a;color:white;border-radius:20px;cursor:pointer;width:100%">
            Save Settings
          </button>
        </div>
      `;

      await iris.window.createPanel(html, { title: 'Watermark Config', location: 'floating' });
    })
  );

  iris.log.info('Watermark Stamper activated');
}

export function deactivate() {}
