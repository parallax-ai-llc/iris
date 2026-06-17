/**
 * Pixel Art Converter
 * Convert images to pixel art style with customizable pixel size and color palette presets.
 */

const PALETTE_PRESETS: Record<string, number[][]> = {
  gameboy: [
    [15, 56, 15],
    [48, 98, 48],
    [139, 172, 15],
    [155, 188, 15],
  ],
  nes: [
    [0, 0, 0], [252, 252, 252], [188, 188, 188], [124, 124, 124],
    [164, 0, 0], [228, 92, 16], [248, 216, 0], [0, 168, 0],
    [0, 136, 136], [0, 120, 248], [104, 68, 252], [216, 0, 204],
    [248, 120, 88], [0, 184, 0], [60, 188, 252], [248, 164, 192],
  ],
  snes: [
    [0, 0, 0], [255, 255, 255], [128, 128, 128], [192, 192, 192],
    [128, 0, 0], [255, 0, 0], [128, 128, 0], [255, 255, 0],
    [0, 128, 0], [0, 255, 0], [0, 128, 128], [0, 255, 255],
    [0, 0, 128], [0, 0, 255], [128, 0, 128], [255, 0, 255],
  ],
  cga: [
    [0, 0, 0], [0, 170, 170], [170, 0, 170], [170, 170, 170],
  ],
  grayscale: [
    [0, 0, 0], [36, 36, 36], [73, 73, 73], [109, 109, 109],
    [146, 146, 146], [182, 182, 182], [219, 219, 219], [255, 255, 255],
  ],
};

function nearestColor(r: number, g: number, b: number, palette: number[][]): number[] {
  let minDist = Infinity;
  let nearest = palette[0];

  for (const color of palette) {
    const dist =
      (r - color[0]) ** 2 + (g - color[1]) ** 2 + (b - color[2]) ** 2;
    if (dist < minDist) {
      minDist = dist;
      nearest = color;
    }
  }

  return nearest;
}

function medianCutQuantize(pixels: number[][], maxColors: number): number[][] {
  if (pixels.length <= maxColors) return pixels;

  type Bucket = number[][];

  function getRange(bucket: Bucket, channel: number): number {
    let min = 255;
    let max = 0;
    for (const p of bucket) {
      if (p[channel] < min) min = p[channel];
      if (p[channel] > max) max = p[channel];
    }
    return max - min;
  }

  function splitBucket(bucket: Bucket): [Bucket, Bucket] {
    const ranges = [0, 1, 2].map((ch) => getRange(bucket, ch));
    const maxChannel = ranges.indexOf(Math.max(...ranges));
    bucket.sort((a, b) => a[maxChannel] - b[maxChannel]);
    const mid = Math.floor(bucket.length / 2);
    return [bucket.slice(0, mid), bucket.slice(mid)];
  }

  function average(bucket: Bucket): number[] {
    const sum = [0, 0, 0];
    for (const p of bucket) {
      sum[0] += p[0];
      sum[1] += p[1];
      sum[2] += p[2];
    }
    return sum.map((s) => Math.round(s / bucket.length));
  }

  let buckets: Bucket[] = [pixels];
  while (buckets.length < maxColors) {
    let maxRange = 0;
    let maxIdx = 0;
    for (let i = 0; i < buckets.length; i++) {
      const range = Math.max(
        getRange(buckets[i], 0),
        getRange(buckets[i], 1),
        getRange(buckets[i], 2)
      );
      if (range > maxRange && buckets[i].length > 1) {
        maxRange = range;
        maxIdx = i;
      }
    }
    if (maxRange === 0) break;
    const [a, b] = splitBucket(buckets[maxIdx]);
    buckets.splice(maxIdx, 1, a, b);
  }

  return buckets.map(average);
}

export function activate(context: IrisExtensionContext) {
  context.subscriptions.push(
    iris.commands.register('iris-official.pixel-art.convert', async () => {
      const image = await iris.image.getActive();
      if (!image) {
        await iris.window.showMessage('No active image found.', 'warn');
        return;
      }

      const pixelSize =
        ((await iris.storage.get('pixelSize')) as number) || 8;
      const maxColors =
        ((await iris.storage.get('maxColors')) as number) || 16;
      const paletteKey =
        ((await iris.storage.get('palette')) as string) || 'auto';

      const { width, height, data } = image;

      // Determine palette
      let palette: number[][];
      if (paletteKey !== 'auto' && PALETTE_PRESETS[paletteKey]) {
        palette = PALETTE_PRESETS[paletteKey];
      } else {
        // Auto: sample pixels and quantize
        const sampled: number[][] = [];
        const step = Math.max(1, Math.floor(width * height / 2000));
        for (let i = 0; i < width * height; i += step) {
          const idx = i * 4;
          sampled.push([data[idx], data[idx + 1], data[idx + 2]]);
        }
        palette = medianCutQuantize(sampled, maxColors);
      }

      // Pixelate and apply palette
      const result = new Uint8Array(data.length);

      for (let by = 0; by < height; by += pixelSize) {
        for (let bx = 0; bx < width; bx += pixelSize) {
          // Average color in block
          let totalR = 0;
          let totalG = 0;
          let totalB = 0;
          let count = 0;

          const blockH = Math.min(pixelSize, height - by);
          const blockW = Math.min(pixelSize, width - bx);

          for (let dy = 0; dy < blockH; dy++) {
            for (let dx = 0; dx < blockW; dx++) {
              const idx = ((by + dy) * width + (bx + dx)) * 4;
              totalR += data[idx];
              totalG += data[idx + 1];
              totalB += data[idx + 2];
              count++;
            }
          }

          const avgR = Math.round(totalR / count);
          const avgG = Math.round(totalG / count);
          const avgB = Math.round(totalB / count);

          const [nr, ng, nb] = nearestColor(avgR, avgG, avgB, palette);

          // Fill block with nearest color
          for (let dy = 0; dy < blockH; dy++) {
            for (let dx = 0; dx < blockW; dx++) {
              const idx = ((by + dy) * width + (bx + dx)) * 4;
              result[idx] = nr;
              result[idx + 1] = ng;
              result[idx + 2] = nb;
              result[idx + 3] = 255;
            }
          }
        }
      }

      await iris.image.putImage({ width, height, data: result });
      await iris.window.showMessage(
        `Pixel art applied (${pixelSize}px blocks, ${palette.length} colors)`,
        'info'
      );
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.pixel-art.configure', async () => {
      const paletteNames = ['auto', ...Object.keys(PALETTE_PRESETS)];
      const swatches = paletteNames
        .map((name) => {
          const colors = name === 'auto'
            ? [
                [100, 100, 100],
                [150, 150, 150],
                [200, 200, 200],
              ]
            : PALETTE_PRESETS[name].slice(0, 8);

          const colorDivs = colors
            .map(
              ([r, g, b]) =>
                `<div style="width:16px;height:16px;background:rgb(${r},${g},${b});border-radius:2px"></div>`
            )
            .join('');

          return `
            <div onclick="window.parent.postMessage({type:'selectPalette',palette:'${name}'},'*')"
              style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;margin-bottom:4px">
              <strong style="width:60px;font-size:13px;text-transform:capitalize">${name}</strong>
              <div style="display:flex;gap:2px">${colorDivs}</div>
            </div>
          `;
        })
        .join('');

      const html = `
        <div style="padding:16px;font-family:system-ui;max-width:400px">
          <h2 style="margin:0 0 16px">Pixel Art Settings</h2>
          <label style="display:block;margin-bottom:12px">
            <span style="font-size:14px;font-weight:600">Pixel Size</span>
            <input type="range" min="2" max="32" value="8" id="pixelSize"
              style="width:100%;margin-top:4px"
              oninput="document.getElementById('pxLabel').textContent=this.value+'px'">
            <span id="pxLabel" style="font-size:12px;color:#6b7280">8px</span>
          </label>
          <label style="display:block;margin-bottom:12px">
            <span style="font-size:14px;font-weight:600">Max Colors (auto palette)</span>
            <input type="range" min="2" max="64" value="16" id="maxColors"
              style="width:100%;margin-top:4px"
              oninput="document.getElementById('colLabel').textContent=this.value">
            <span id="colLabel" style="font-size:12px;color:#6b7280">16</span>
          </label>
          <div style="margin-bottom:8px;font-size:14px;font-weight:600">Palette Preset</div>
          ${swatches}
        </div>
      `;

      await iris.window.createPanel(html, {
        title: 'Pixel Art Settings',
        location: 'sidebar',
      });
    })
  );

  iris.log.info('Pixel Art Converter activated');
}

export function deactivate() {}
