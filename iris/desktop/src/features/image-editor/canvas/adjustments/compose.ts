/**
 * Multi-image composition (contact sheet, HDR merge, photomerge, straighten, align)
 *
 * Part of the image-editor adjustments library (see ./index.ts barrel),
 * extracted from the former monolithic adjustments.ts.
 */

import { clamp } from '../colorUtils';
import { bilinearResize } from './color-modes';

/**
 * Fit Image — resizes to fit within max bounds preserving aspect ratio
 */
export function fitImage(imageData: ImageData, maxWidth: number, maxHeight: number): ImageData {
  const { width, height } = imageData;
  if (width <= maxWidth && height <= maxHeight) {
    const r = new ImageData(width, height); r.data.set(imageData.data); return r;
  }
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return bilinearResize(imageData, Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
}

/**
 * Contact Sheet — generates thumbnail grid from multiple images
 */
export function contactSheet(
  images: ImageData[],
  columns: number = 4,
  thumbWidth: number = 150,
  thumbHeight: number = 150,
  spacing: number = 10,
  bgColor: [number, number, number] = [255, 255, 255]
): ImageData {
  if (images.length === 0) return new ImageData(1, 1);
  const rows = Math.ceil(images.length / columns);
  const tw = columns * thumbWidth + (columns + 1) * spacing;
  const th = rows * thumbHeight + (rows + 1) * spacing;
  const result = new ImageData(tw, th);
  const rd = result.data;

  for (let i = 0; i < rd.length; i += 4) { rd[i] = bgColor[0]; rd[i+1] = bgColor[1]; rd[i+2] = bgColor[2]; rd[i+3] = 255; }

  for (let idx = 0; idx < images.length; idx++) {
    const col = idx % columns, row = Math.floor(idx / columns);
    const ox = spacing + col * (thumbWidth + spacing);
    const oy = spacing + row * (thumbHeight + spacing);
    const thumb = bilinearResize(images[idx], thumbWidth, thumbHeight);
    for (let y = 0; y < thumbHeight; y++) {
      for (let x = 0; x < thumbWidth; x++) {
        const si = (y * thumbWidth + x) * 4;
        const di = ((oy + y) * tw + (ox + x)) * 4;
        rd[di] = thumb.data[si]; rd[di+1] = thumb.data[si+1]; rd[di+2] = thumb.data[si+2]; rd[di+3] = thumb.data[si+3];
      }
    }
  }
  return result;
}

/**
 * Detect Straighten Angle — finds dominant horizontal/vertical edge angle
 * Returns correction angle in degrees (-15 to 15)
 */
export function detectStraightenAngle(imageData: ImageData): number {
  const { width, height, data } = imageData;
  const bins = new Float32Array(180);

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const lum = (px: number, py: number) => {
        const i = (py * width + px) * 4;
        return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      };
      const gx = -lum(x-1,y-1)+lum(x+1,y-1)-2*lum(x-1,y)+2*lum(x+1,y)-lum(x-1,y+1)+lum(x+1,y+1);
      const gy = -lum(x-1,y-1)-2*lum(x,y-1)-lum(x+1,y-1)+lum(x-1,y+1)+2*lum(x,y+1)+lum(x+1,y+1);
      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag > 20) {
        let angle = Math.atan2(gy, gx) * 180 / Math.PI;
        if (angle < 0) angle += 180;
        bins[Math.min(179, Math.floor(angle))] += mag;
      }
    }
  }

  let bestAngle = 0, bestScore = 0;
  for (let a = -15; a <= 15; a++) {
    const b0 = ((a % 180) + 180) % 180;
    const b90 = ((90 + a) % 180 + 180) % 180;
    const score = bins[b0] + bins[b90];
    if (score > bestScore) { bestScore = score; bestAngle = a; }
  }
  return clamp(bestAngle, -15, 15);
}

/**
 * Crop and Straighten Photos — auto-detect individual photos on a scanner bed
 */
export function cropAndStraightenPhotos(
  imageData: ImageData,
  bgThreshold: number = 240
): Array<{ x: number; y: number; width: number; height: number; angle: number }> {
  const { width, height, data } = imageData;
  const fg = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    fg[i / 4] = lum < bgThreshold ? 1 : 0;
  }

  // Connected component labeling (4-connectivity)
  const labelArr = new Int32Array(width * height);
  let nextLabel = 1;
  const par: number[] = [0];

  function find(a: number): number {
    while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; }
    return a;
  }
  function unite(a: number, b: number) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) par[Math.max(ra, rb)] = Math.min(ra, rb);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!fg[idx]) continue;
      const left = x > 0 ? labelArr[idx - 1] : 0;
      const top = y > 0 ? labelArr[idx - width] : 0;
      if (left && top) { labelArr[idx] = Math.min(left, top); unite(left, top); }
      else if (left) labelArr[idx] = left;
      else if (top) labelArr[idx] = top;
      else { labelArr[idx] = nextLabel; par.push(nextLabel); nextLabel++; }
    }
  }

  const bounds = new Map<number, { minX: number; minY: number; maxX: number; maxY: number; count: number }>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!labelArr[idx]) continue;
      const root = find(labelArr[idx]);
      labelArr[idx] = root;
      let b = bounds.get(root);
      if (!b) { b = { minX: x, minY: y, maxX: x, maxY: y, count: 0 }; bounds.set(root, b); }
      b.minX = Math.min(b.minX, x); b.minY = Math.min(b.minY, y);
      b.maxX = Math.max(b.maxX, x); b.maxY = Math.max(b.maxY, y);
      b.count++;
    }
  }

  const minArea = width * height * 0.01;
  const results: Array<{ x: number; y: number; width: number; height: number; angle: number }> = [];
  for (const b of bounds.values()) {
    const bw = b.maxX - b.minX + 1, bh = b.maxY - b.minY + 1;
    if (b.count < minArea || bw < 10 || bh < 10) continue;
    const sub = new ImageData(bw, bh);
    for (let sy = 0; sy < bh; sy++) {
      for (let sx = 0; sx < bw; sx++) {
        const si = ((b.minY + sy) * width + (b.minX + sx)) * 4;
        const di = (sy * bw + sx) * 4;
        sub.data[di] = data[si]; sub.data[di+1] = data[si+1];
        sub.data[di+2] = data[si+2]; sub.data[di+3] = data[si+3];
      }
    }
    results.push({ x: b.minX, y: b.minY, width: bw, height: bh, angle: detectStraightenAngle(sub) });
  }
  return results;
}

/**
 * Merge multiple exposures using Mertens exposure fusion.
 * Weights each pixel by contrast, saturation, and well-exposedness.
 * Returns a fused ImageData combining the best parts of each exposure.
 */
export function hdrMerge(images: ImageData[]): ImageData {
  if (images.length === 0) throw new Error('At least one image required');
  if (images.length === 1) {
    const out = new ImageData(new Uint8ClampedArray(images[0].data), images[0].width, images[0].height);
    return out;
  }
  const { width, height } = images[0];
  const n = images.length;
  const pixelCount = width * height;

  // Compute weight maps
  const weights: Float32Array[] = [];
  for (let k = 0; k < n; k++) {
    const d = images[k].data;
    const w = new Float32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      const r = d[idx] / 255, g = d[idx + 1] / 255, b = d[idx + 2] / 255;

      // Contrast weight: Laplacian magnitude (simplified: deviation from neighbors)
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const x = i % width, y = (i - x) / width;
      let lap = 0;
      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const getL = (ox: number, oy: number) => {
          const j = ((y + oy) * width + (x + ox)) * 4;
          return 0.2126 * d[j] / 255 + 0.7152 * d[j + 1] / 255 + 0.0722 * d[j + 2] / 255;
        };
        lap = Math.abs(4 * lum - getL(-1, 0) - getL(1, 0) - getL(0, -1) - getL(0, 1));
      }

      // Saturation weight: standard deviation of RGB
      const mean = (r + g + b) / 3;
      const sat = Math.sqrt(((r - mean) ** 2 + (g - mean) ** 2 + (b - mean) ** 2) / 3);

      // Well-exposedness weight: Gaussian centered at 0.5
      const wExp = Math.exp(-0.5 * ((r - 0.5) ** 2 + (g - 0.5) ** 2 + (b - 0.5) ** 2) / 0.04);

      w[i] = (lap + 0.001) * (sat + 0.001) * (wExp + 0.001);
    }
    weights.push(w);
  }

  // Normalize weights across images per pixel
  for (let i = 0; i < pixelCount; i++) {
    let sum = 0;
    for (let k = 0; k < n; k++) sum += weights[k][i];
    if (sum > 0) {
      for (let k = 0; k < n; k++) weights[k][i] /= sum;
    } else {
      for (let k = 0; k < n; k++) weights[k][i] = 1 / n;
    }
  }

  // Blend
  const out = new ImageData(width, height);
  const od = out.data;
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    let rr = 0, gg = 0, bb = 0;
    for (let k = 0; k < n; k++) {
      const d = images[k].data;
      const w = weights[k][i];
      rr += d[idx] * w;
      gg += d[idx + 1] * w;
      bb += d[idx + 2] * w;
    }
    od[idx] = Math.round(clamp(rr, 0, 255));
    od[idx + 1] = Math.round(clamp(gg, 0, 255));
    od[idx + 2] = Math.round(clamp(bb, 0, 255));
    od[idx + 3] = 255;
  }
  return out;
}

/**
 * Stitch multiple images horizontally or vertically with linear blending in overlap.
 * @param images Array of ImageData to stitch
 * @param direction 'horizontal' or 'vertical'
 * @param overlap Number of pixels of overlap between adjacent images
 */
export function photomerge(
  images: ImageData[],
  direction: 'horizontal' | 'vertical' = 'horizontal',
  overlap = 20
): ImageData {
  if (images.length === 0) throw new Error('At least one image required');
  if (images.length === 1) {
    return new ImageData(new Uint8ClampedArray(images[0].data), images[0].width, images[0].height);
  }

  const ov = Math.max(0, overlap);

  if (direction === 'horizontal') {
    const h = images[0].height;
    let totalW = images[0].width;
    for (let i = 1; i < images.length; i++) totalW += images[i].width - ov;

    const out = new ImageData(totalW, h);
    const od = out.data;
    let offsetX = 0;

    for (let k = 0; k < images.length; k++) {
      const { data: sd, width: sw, height: sh } = images[k];
      for (let y = 0; y < Math.min(h, sh); y++) {
        for (let x = 0; x < sw; x++) {
          const outX = offsetX + x;
          if (outX < 0 || outX >= totalW) continue;
          const si = (y * sw + x) * 4;
          const di = (y * totalW + outX) * 4;

          // Blend in overlap region
          if (k > 0 && x < ov) {
            const t = (x + 1) / (ov + 1); // 0→1 across overlap
            od[di] = Math.round(od[di] * (1 - t) + sd[si] * t);
            od[di + 1] = Math.round(od[di + 1] * (1 - t) + sd[si + 1] * t);
            od[di + 2] = Math.round(od[di + 2] * (1 - t) + sd[si + 2] * t);
            od[di + 3] = 255;
          } else {
            od[di] = sd[si]; od[di + 1] = sd[si + 1];
            od[di + 2] = sd[si + 2]; od[di + 3] = sd[si + 3];
          }
        }
      }
      offsetX += sw - ov;
    }
    return out;
  } else {
    // Vertical stitch
    const w = images[0].width;
    let totalH = images[0].height;
    for (let i = 1; i < images.length; i++) totalH += images[i].height - ov;

    const out = new ImageData(w, totalH);
    const od = out.data;
    let offsetY = 0;

    for (let k = 0; k < images.length; k++) {
      const { data: sd, width: sw, height: sh } = images[k];
      for (let y = 0; y < sh; y++) {
        const outY = offsetY + y;
        if (outY < 0 || outY >= totalH) continue;
        for (let x = 0; x < Math.min(w, sw); x++) {
          const si = (y * sw + x) * 4;
          const di = (outY * w + x) * 4;
          if (k > 0 && y < ov) {
            const t = (y + 1) / (ov + 1);
            od[di] = Math.round(od[di] * (1 - t) + sd[si] * t);
            od[di + 1] = Math.round(od[di + 1] * (1 - t) + sd[si + 1] * t);
            od[di + 2] = Math.round(od[di + 2] * (1 - t) + sd[si + 2] * t);
            od[di + 3] = 255;
          } else {
            od[di] = sd[si]; od[di + 1] = sd[si + 1];
            od[di + 2] = sd[si + 2]; od[di + 3] = sd[si + 3];
          }
        }
      }
      offsetY += sh - ov;
    }
    return out;
  }
}

/**
 * Estimate translation offset between two images for alignment.
 * Uses cross-correlation on downsampled luminance.
 * Returns dx, dy offset to align img2 to img1.
 */
export function autoAlignOffset(
  img1: ImageData,
  img2: ImageData,
  searchRange = 20
): { dx: number; dy: number } {
  const w = Math.min(img1.width, img2.width);
  const h = Math.min(img1.height, img2.height);

  // Compute luminance arrays
  const lum1 = new Float32Array(w * h);
  const lum2 = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i1 = (y * img1.width + x) * 4;
      const i2 = (y * img2.width + x) * 4;
      lum1[y * w + x] = img1.data[i1] * 0.299 + img1.data[i1 + 1] * 0.587 + img1.data[i1 + 2] * 0.114;
      lum2[y * w + x] = img2.data[i2] * 0.299 + img2.data[i2 + 1] * 0.587 + img2.data[i2 + 2] * 0.114;
    }
  }

  let bestDx = 0, bestDy = 0, bestCorr = -Infinity;
  const range = Math.min(searchRange, Math.min(w, h) / 4);

  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      let corr = 0;
      let count = 0;
      for (let y = Math.max(0, -dy); y < Math.min(h, h - dy); y += 2) { // stride 2 for speed
        for (let x = Math.max(0, -dx); x < Math.min(w, w - dx); x += 2) {
          corr += lum1[y * w + x] * lum2[(y + dy) * w + (x + dx)];
          count++;
        }
      }
      if (count > 0) corr /= count;
      if (corr > bestCorr) { bestCorr = corr; bestDx = dx; bestDy = dy; }
    }
  }
  return { dx: bestDx, dy: bestDy };
}
