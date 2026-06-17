/**
 * Histogram calculation utility
 * Computes RGB channel distribution + luminance from ImageData
 */

export interface HistogramData {
  r: number[];  // 256 entries, normalized 0-1
  g: number[];  // 256 entries, normalized 0-1
  b: number[];  // 256 entries, normalized 0-1
  l: number[];  // 256 entries, luminance, normalized 0-1
}

/**
 * Calculate histogram from raw ImageData.
 * Returns per-channel frequency arrays (0-255), normalized to 0-1 by dividing by max count.
 */
export function calculateHistogram(imageData: ImageData): HistogramData {
  const { data, width, height } = imageData;
  const totalPixels = width * height;

  // Raw counts
  const rCounts = new Uint32Array(256);
  const gCounts = new Uint32Array(256);
  const bCounts = new Uint32Array(256);
  const lCounts = new Uint32Array(256);

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    // Skip fully transparent pixels
    if (data[offset + 3] === 0) continue;

    rCounts[r]++;
    gCounts[g]++;
    bCounts[b]++;

    // ITU-R BT.601 luminance
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    lCounts[lum]++;
  }

  // Find global max across all channels for normalization
  let maxCount = 1;
  for (let i = 0; i < 256; i++) {
    if (rCounts[i] > maxCount) maxCount = rCounts[i];
    if (gCounts[i] > maxCount) maxCount = gCounts[i];
    if (bCounts[i] > maxCount) maxCount = bCounts[i];
    if (lCounts[i] > maxCount) maxCount = lCounts[i];
  }

  // Normalize to 0-1
  const r = new Array<number>(256);
  const g = new Array<number>(256);
  const b = new Array<number>(256);
  const l = new Array<number>(256);

  for (let i = 0; i < 256; i++) {
    r[i] = rCounts[i] / maxCount;
    g[i] = gCounts[i] / maxCount;
    b[i] = bCounts[i] / maxCount;
    l[i] = lCounts[i] / maxCount;
  }

  return { r, g, b, l };
}

/**
 * Extract ImageData from a canvas element (uses willReadFrequently context).
 */
export function getCanvasImageData(canvas: HTMLCanvasElement): ImageData | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
