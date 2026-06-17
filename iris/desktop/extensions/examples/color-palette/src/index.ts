/**
 * Color Palette Extractor
 * Extract dominant colors from images and copy hex codes to clipboard.
 */

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  );
}

interface ColorBucket {
  r: number;
  g: number;
  b: number;
  count: number;
}

function extractDominantColors(data: Uint8Array, maxColors: number): string[] {
  // Simple k-means-like quantization via bucketing
  const bucketSize = 32;
  const buckets = new Map<string, ColorBucket>();

  const step = Math.max(4, Math.floor(data.length / 4 / 5000) * 4);

  for (let i = 0; i < data.length; i += step) {
    const r = Math.floor(data[i] / bucketSize) * bucketSize;
    const g = Math.floor(data[i + 1] / bucketSize) * bucketSize;
    const b = Math.floor(data[i + 2] / bucketSize) * bucketSize;
    const key = `${r},${g},${b}`;

    const existing = buckets.get(key);
    if (existing) {
      existing.r += data[i];
      existing.g += data[i + 1];
      existing.b += data[i + 2];
      existing.count++;
    } else {
      buckets.set(key, { r: data[i], g: data[i + 1], b: data[i + 2], count: 1 });
    }
  }

  const sorted = Array.from(buckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, maxColors);

  return sorted.map((b) =>
    rgbToHex(
      Math.round(b.r / b.count),
      Math.round(b.g / b.count),
      Math.round(b.b / b.count)
    )
  );
}

function getLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function activate(context: IrisExtensionContext) {
  context.subscriptions.push(
    iris.commands.register('iris-official.color-palette.extract', async () => {
      const image = await iris.image.getActive();
      if (!image) {
        await iris.window.showMessage('No active image found.', 'warn');
        return;
      }

      const colors = extractDominantColors(image.data, 8);

      const swatches = colors
        .map((hex) => {
          const textColor = getLuminance(hex) > 0.5 ? '#000' : '#fff';
          return `
            <div onclick="navigator.clipboard.writeText('${hex}');this.querySelector('.label').textContent='Copied!';setTimeout(()=>this.querySelector('.label').textContent='${hex}',800)"
              style="width:80px;height:80px;background:${hex};border-radius:12px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid rgba(0,0,0,0.1)">
              <span class="label" style="font-size:11px;font-weight:600;color:${textColor}">${hex}</span>
            </div>
          `;
        })
        .join('');

      const allColors = colors.join(', ');

      const html = `
        <div style="padding:16px;font-family:system-ui">
          <h2 style="margin:0 0 4px">Color Palette</h2>
          <p style="color:#6b7280;font-size:14px;margin:0 0 12px">
            ${colors.length} dominant colors from ${image.width}×${image.height} image
          </p>

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
            ${swatches}
          </div>

          <div style="display:flex;gap:8px">
            <button onclick="navigator.clipboard.writeText('${allColors}');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy All HEX',1000)"
              style="padding:8px 16px;border:none;background:#0a0a0a;color:white;border-radius:20px;cursor:pointer;font-size:13px">
              Copy All HEX
            </button>
            <button onclick="const css=\`${colors.map((c) => `  --color: ${c};`).join('\\n')}\`;navigator.clipboard.writeText(css);this.textContent='Copied!';setTimeout(()=>this.textContent='Copy as CSS',1000)"
              style="padding:8px 16px;border:1px solid #d1d5db;background:white;border-radius:20px;cursor:pointer;font-size:13px">
              Copy as CSS
            </button>
          </div>

          <p style="font-size:11px;color:#9ca3af;margin-top:8px">Click any swatch to copy its hex code.</p>
        </div>
      `;

      await iris.window.createPanel(html, { title: 'Color Palette', location: 'floating' });
    })
  );

  iris.log.info('Color Palette Extractor activated');
}

export function deactivate() {}
