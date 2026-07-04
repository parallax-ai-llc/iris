/**
 * Pixelate filters
 *
 * Part of the image-editor filter library. See ./index.ts (barrel) and
 * ./registry.ts (Filter Gallery registry). Extracted from the former
 * monolithic filters.ts.
 */


/**
 * Pixelate effect
 */
export function pixelate(
  imageData: ImageData,
  blockSize: number
): ImageData {
  if (blockSize <= 1) return imageData;

  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  for (let by = 0; by < height; by += blockSize) {
    for (let bx = 0; bx < width; bx += blockSize) {
      // Calculate average color of block
      let r = 0, g = 0, b = 0, a = 0, count = 0;

      for (let dy = 0; dy < blockSize && by + dy < height; dy++) {
        for (let dx = 0; dx < blockSize && bx + dx < width; dx++) {
          const idx = ((by + dy) * width + (bx + dx)) * 4;
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          a += data[idx + 3];
          count++;
        }
      }

      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);
      a = Math.round(a / count);

      // Fill block with average color
      for (let dy = 0; dy < blockSize && by + dy < height; dy++) {
        for (let dx = 0; dx < blockSize && bx + dx < width; dx++) {
          const idx = ((by + dy) * width + (bx + dx)) * 4;
          resultData[idx] = r;
          resultData[idx + 1] = g;
          resultData[idx + 2] = b;
          resultData[idx + 3] = a;
        }
      }
    }
  }

  return result;
}

/**
 * Crystallize — Voronoi-style crystallization effect.
 * Divides the image into grid cells of the given size and fills each cell
 * with the average color of the pixels it contains.
 */
export function crystallize(imageData: ImageData, cellSize: number = 10): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const cs = Math.max(1, Math.round(cellSize));

  for (let cy = 0; cy < height; cy += cs) {
    for (let cx = 0; cx < width; cx += cs) {
      const x1 = cx;
      const y1 = cy;
      const x2 = Math.min(cx + cs, width);
      const y2 = Math.min(cy + cs, height);
      const count = (x2 - x1) * (y2 - y1);

      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          const i = (y * width + x) * 4;
          rSum += data[i];
          gSum += data[i + 1];
          bSum += data[i + 2];
          aSum += data[i + 3];
        }
      }

      const rAvg = Math.round(rSum / count);
      const gAvg = Math.round(gSum / count);
      const bAvg = Math.round(bSum / count);
      const aAvg = Math.round(aSum / count);

      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          const i = (y * width + x) * 4;
          d[i] = rAvg;
          d[i + 1] = gAvg;
          d[i + 2] = bAvg;
          d[i + 3] = aAvg;
        }
      }
    }
  }

  return result;
}

/**
 * Facet — Facet effect that posterizes using neighborhood median.
 * For each pixel, examines a 3x3 neighborhood and replaces the pixel
 * with the median color value, producing a faceted/posterized look.
 */
export function facet(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rArr: number[] = [];
      const gArr: number[] = [];
      const bArr: number[] = [];

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const px = Math.min(width - 1, Math.max(0, x + kx));
          const py = Math.min(height - 1, Math.max(0, y + ky));
          const idx = (py * width + px) * 4;
          rArr.push(data[idx]);
          gArr.push(data[idx + 1]);
          bArr.push(data[idx + 2]);
        }
      }

      rArr.sort((a, b) => a - b);
      gArr.sort((a, b) => a - b);
      bArr.sort((a, b) => a - b);

      const i = (y * width + x) * 4;
      d[i] = rArr[4];
      d[i + 1] = gArr[4];
      d[i + 2] = bArr[4];
      d[i + 3] = data[i + 3];
    }
  }

  return result;
}

/**
 * Fragment — Ghost/fragment effect.
 * Creates 4 copies of the image offset diagonally by the given distance
 * and averages them together, producing a ghosted/fragmented look.
 */
export function fragment(imageData: ImageData, distance: number = 5): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const dist = Math.round(distance);

  // 4 diagonal offsets
  const offsets = [
    [-dist, -dist],
    [dist, -dist],
    [-dist, dist],
    [dist, dist],
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (const [ox, oy] of offsets) {
        const sx = Math.min(width - 1, Math.max(0, x + ox));
        const sy = Math.min(height - 1, Math.max(0, y + oy));
        const idx = (sy * width + sx) * 4;
        r += data[idx];
        g += data[idx + 1];
        b += data[idx + 2];
        a += data[idx + 3];
      }

      const i = (y * width + x) * 4;
      d[i] = Math.round(r / 4);
      d[i + 1] = Math.round(g / 4);
      d[i + 2] = Math.round(b / 4);
      d[i + 3] = Math.round(a / 4);
    }
  }

  return result;
}

/**
 * Mezzotint — Mezzotint dithering effect.
 * Converts the image to luminance and applies random dithering patterns
 * based on the specified type.
 *
 * Supported types: 'fineDots', 'mediumDots', 'coarseDots',
 * 'fineLines', 'mediumLines', 'coarseLines',
 * 'shortStrokes', 'mediumStrokes', 'longStrokes', 'grainyDots'
 */
export function mezzotint(
  imageData: ImageData,
  type: 'fineDots' | 'mediumDots' | 'coarseDots' | 'fineLines' | 'mediumLines' | 'coarseLines' | 'shortStrokes' | 'mediumStrokes' | 'longStrokes' | 'grainyDots' = 'fineDots'
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  // Determine noise scale and pattern based on type
  const config: Record<string, { scale: number; lineMode: boolean; strokeLen: number }> = {
    fineDots:      { scale: 0.3, lineMode: false, strokeLen: 0 },
    mediumDots:    { scale: 0.5, lineMode: false, strokeLen: 0 },
    coarseDots:    { scale: 0.8, lineMode: false, strokeLen: 0 },
    fineLines:     { scale: 0.3, lineMode: true,  strokeLen: 0 },
    mediumLines:   { scale: 0.5, lineMode: true,  strokeLen: 0 },
    coarseLines:   { scale: 0.8, lineMode: true,  strokeLen: 0 },
    shortStrokes:  { scale: 0.4, lineMode: true,  strokeLen: 2 },
    mediumStrokes: { scale: 0.5, lineMode: true,  strokeLen: 4 },
    longStrokes:   { scale: 0.6, lineMode: true,  strokeLen: 8 },
    grainyDots:    { scale: 1.0, lineMode: false, strokeLen: 0 },
  };

  const { scale, lineMode, strokeLen } = config[type] || config.fineDots;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;

      let noise: number;
      if (lineMode && strokeLen > 0) {
        // Stroke pattern: use quantized x for coherence along strokes
        const qx = Math.floor(x / strokeLen) * strokeLen;
        noise = ((Math.sin(qx * 12.9898 + y * 78.233) * 43758.5453) % 1);
        noise = Math.abs(noise) * 255 * scale;
      } else if (lineMode) {
        // Line pattern: noise varies primarily along y
        noise = ((Math.sin(y * 12.9898 + Math.floor(x * 0.1) * 78.233) * 43758.5453) % 1);
        noise = Math.abs(noise) * 255 * scale;
      } else {
        // Dot pattern: fully random per pixel
        noise = Math.random() * 255 * scale;
      }

      const val = lum > noise ? 255 : 0;

      // Apply as color tint (preserve hue ratios)
      if (lum > 0) {
        const ratio = val / lum;
        d[i] = Math.min(255, Math.round(data[i] * ratio));
        d[i + 1] = Math.min(255, Math.round(data[i + 1] * ratio));
        d[i + 2] = Math.min(255, Math.round(data[i + 2] * ratio));
      } else {
        d[i] = d[i + 1] = d[i + 2] = val;
      }
      d[i + 3] = data[i + 3];
    }
  }

  return result;
}

/**
 * Pointillize — Pointillism effect.
 * Divides the image into cells and draws filled circles of each cell's
 * average color on a background color, simulating a pointillist painting.
 */
export function pointillize(
  imageData: ImageData,
  cellSize: number = 6,
  bgColor: [number, number, number] = [255, 255, 255]
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const cs = Math.max(2, Math.round(cellSize));
  const radius = cs / 2;

  // Fill background
  for (let i = 0; i < d.length; i += 4) {
    d[i] = bgColor[0];
    d[i + 1] = bgColor[1];
    d[i + 2] = bgColor[2];
    d[i + 3] = data[i + 3];
  }

  // For each cell, compute average color and draw a filled circle
  for (let cy = 0; cy < height; cy += cs) {
    for (let cx = 0; cx < width; cx += cs) {
      const x1 = cx;
      const y1 = cy;
      const x2 = Math.min(cx + cs, width);
      const y2 = Math.min(cy + cs, height);
      const count = (x2 - x1) * (y2 - y1);

      let rSum = 0, gSum = 0, bSum = 0;
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          const i = (y * width + x) * 4;
          rSum += data[i];
          gSum += data[i + 1];
          bSum += data[i + 2];
        }
      }

      const rAvg = Math.round(rSum / count);
      const gAvg = Math.round(gSum / count);
      const bAvg = Math.round(bSum / count);

      // Draw filled circle centered in the cell
      const centerX = cx + radius;
      const centerY = cy + radius;
      const r2 = radius * radius;

      const drawX1 = Math.max(0, Math.floor(centerX - radius));
      const drawY1 = Math.max(0, Math.floor(centerY - radius));
      const drawX2 = Math.min(width, Math.ceil(centerX + radius));
      const drawY2 = Math.min(height, Math.ceil(centerY + radius));

      for (let y = drawY1; y < drawY2; y++) {
        for (let x = drawX1; x < drawX2; x++) {
          const dx = x - centerX;
          const dy = y - centerY;
          if (dx * dx + dy * dy <= r2) {
            const i = (y * width + x) * 4;
            d[i] = rAvg;
            d[i + 1] = gAvg;
            d[i + 2] = bAvg;
          }
        }
      }
    }
  }

  return result;
}

/**
 * Color Halftone — CMYK halftone dot pattern.
 * For each CMYK channel, generates halftone dots at a specified screen angle.
 * Dot size is proportional to the channel intensity. Channels are combined
 * to produce the final color image.
 */
export function colorHalftone(
  imageData: ImageData,
  maxRadius: number = 8,
  channel1Angle: number = 108,
  channel2Angle: number = 162,
  channel3Angle: number = 90,
  channel4Angle: number = 45
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  // Initialize result to white
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
    d[i + 3] = data[i + 3];
  }

  const mr = Math.max(1, Math.round(maxRadius));
  const cellSize = mr * 2;
  const angles = [channel1Angle, channel2Angle, channel3Angle, channel4Angle];

  // Convert angles to radians
  const rads = angles.map(a => (a * Math.PI) / 180);

  // Convert RGB to CMYK for each pixel
  const cArr = new Float32Array(width * height);
  const mArr = new Float32Array(width * height);
  const yArr = new Float32Array(width * height);
  const kArr = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const r = data[idx] / 255;
    const g = data[idx + 1] / 255;
    const b = data[idx + 2] / 255;
    const k = 1 - Math.max(r, g, b);
    const invK = k < 1 ? 1 / (1 - k) : 0;
    cArr[i] = (1 - r - k) * invK;
    mArr[i] = (1 - g - k) * invK;
    yArr[i] = (1 - b - k) * invK;
    kArr[i] = k;
  }

  const channelData = [cArr, mArr, yArr, kArr];

  // For each channel, compute halftone dots
  const halftone: Float32Array[] = [
    new Float32Array(width * height),
    new Float32Array(width * height),
    new Float32Array(width * height),
    new Float32Array(width * height),
  ];

  for (let ch = 0; ch < 4; ch++) {
    const cos = Math.cos(rads[ch]);
    const sin = Math.sin(rads[ch]);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Rotate coordinates into screen space
        const rx = x * cos + y * sin;
        const ry = -x * sin + y * cos;

        // Find cell center in rotated space
        const cellCx = (Math.floor(rx / cellSize) + 0.5) * cellSize;
        const cellCy = (Math.floor(ry / cellSize) + 0.5) * cellSize;

        // Map cell center back to image space to sample channel value
        const icx = Math.round(cellCx * cos - cellCy * sin);
        const icy = Math.round(cellCx * sin + cellCy * cos);
        const sx = Math.min(width - 1, Math.max(0, icx));
        const sy = Math.min(height - 1, Math.max(0, icy));
        const channelVal = channelData[ch][sy * width + sx];

        // Distance from current pixel to cell center in rotated space
        const dx = rx - cellCx;
        const dy = ry - cellCy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Dot radius proportional to channel value
        const dotRadius = mr * Math.sqrt(channelVal);

        halftone[ch][y * width + x] = dist <= dotRadius ? channelVal : 0;
      }
    }
  }

  // Combine CMYK halftone channels back to RGB
  for (let i = 0; i < width * height; i++) {
    const c = halftone[0][i];
    const m = halftone[1][i];
    const y = halftone[2][i];
    const k = halftone[3][i];

    const idx = i * 4;
    d[idx] = Math.round(255 * (1 - c) * (1 - k));
    d[idx + 1] = Math.round(255 * (1 - m) * (1 - k));
    d[idx + 2] = Math.round(255 * (1 - y) * (1 - k));
    // alpha already set
  }

  return result;
}
