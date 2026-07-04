/**
 * Geometric distortion filters
 *
 * Part of the image-editor filter library. See ./index.ts (barrel) and
 * ./registry.ts (Filter Gallery registry). Extracted from the former
 * monolithic filters.ts.
 */

/**
 * Twirl distortion — rotates pixels around center with decreasing strength.
 */
export function twirl(
  imageData: ImageData,
  angle: number,
  centerX: number = 0.5,
  centerY: number = 0.5
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const cx = width * centerX, cy = height * centerY;
  const maxRadius = Math.min(width, height) / 2;
  const rad = (angle * Math.PI) / 180;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dstIdx = (y * width + x) * 4;

      if (dist < maxRadius) {
        const twirlAmount = rad * (1 - dist / maxRadius);
        const cos = Math.cos(twirlAmount), sin = Math.sin(twirlAmount);
        const sx = Math.round(cx + dx * cos - dy * sin);
        const sy = Math.round(cy + dx * sin + dy * cos);
        const srcIdx = (Math.min(height - 1, Math.max(0, sy)) * width + Math.min(width - 1, Math.max(0, sx))) * 4;
        resultData[dstIdx] = data[srcIdx];
        resultData[dstIdx + 1] = data[srcIdx + 1];
        resultData[dstIdx + 2] = data[srcIdx + 2];
        resultData[dstIdx + 3] = data[srcIdx + 3];
      } else {
        resultData[dstIdx] = data[dstIdx];
        resultData[dstIdx + 1] = data[dstIdx + 1];
        resultData[dstIdx + 2] = data[dstIdx + 2];
        resultData[dstIdx + 3] = data[dstIdx + 3];
      }
    }
  }
  return result;
}

/**
 * Spherize distortion — wraps image around a sphere.
 */
export function spherize(
  imageData: ImageData,
  amount: number,
  mode: 'normal' | 'horizontal' | 'vertical' = 'normal'
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const cx = width / 2, cy = height / 2;
  const factor = amount / 100;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let nx = (x - cx) / cx; // -1 to 1
      let ny = (y - cy) / cy;

      const r2 = nx * nx + ny * ny;
      if (r2 < 1) {
        const r = Math.sqrt(r2);
        const theta = Math.atan2(ny, nx);
        const newR = r + (1 - r) * r * factor * 0.5;

        if (mode === 'horizontal') {
          nx = Math.cos(theta) * newR;
        } else if (mode === 'vertical') {
          ny = Math.sin(theta) * newR;
        } else {
          nx = Math.cos(theta) * newR;
          ny = Math.sin(theta) * newR;
        }
      }

      const sx = Math.round(nx * cx + cx);
      const sy = Math.round(ny * cy + cy);
      const srcIdx = (Math.min(height - 1, Math.max(0, sy)) * width + Math.min(width - 1, Math.max(0, sx))) * 4;
      const dstIdx = (y * width + x) * 4;
      resultData[dstIdx] = data[srcIdx];
      resultData[dstIdx + 1] = data[srcIdx + 1];
      resultData[dstIdx + 2] = data[srcIdx + 2];
      resultData[dstIdx + 3] = data[srcIdx + 3];
    }
  }
  return result;
}

/**
 * Pinch distortion — pinches or expands from center.
 */
export function pinch(
  imageData: ImageData,
  amount: number
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const cx = width / 2, cy = height / 2;
  const maxR = Math.min(cx, cy);
  const factor = amount / 100;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dstIdx = (y * width + x) * 4;

      if (dist < maxR && dist > 0) {
        const normalizedDist = dist / maxR;
        const newDist = Math.pow(normalizedDist, 1 + factor) * maxR;
        const sx = Math.round(cx + (dx / dist) * newDist);
        const sy = Math.round(cy + (dy / dist) * newDist);
        const srcIdx = (Math.min(height - 1, Math.max(0, sy)) * width + Math.min(width - 1, Math.max(0, sx))) * 4;
        resultData[dstIdx] = data[srcIdx];
        resultData[dstIdx + 1] = data[srcIdx + 1];
        resultData[dstIdx + 2] = data[srcIdx + 2];
        resultData[dstIdx + 3] = data[srcIdx + 3];
      } else {
        resultData[dstIdx] = data[dstIdx];
        resultData[dstIdx + 1] = data[dstIdx + 1];
        resultData[dstIdx + 2] = data[dstIdx + 2];
        resultData[dstIdx + 3] = data[dstIdx + 3];
      }
    }
  }
  return result;
}

/**
 * Wave distortion — applies sine wave displacement.
 */
export function wave(
  imageData: ImageData,
  amplitude: number,
  wavelength: number,
  type: 'sine' | 'triangle' | 'square' = 'sine'
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let offsetX = 0, offsetY = 0;
      const phase = (2 * Math.PI * x) / Math.max(1, wavelength);

      switch (type) {
        case 'sine':
          offsetY = Math.sin(phase) * amplitude;
          offsetX = Math.sin((2 * Math.PI * y) / Math.max(1, wavelength)) * amplitude;
          break;
        case 'triangle':
          offsetY = (2 * Math.abs(2 * ((x / Math.max(1, wavelength)) % 1) - 1) - 1) * amplitude;
          break;
        case 'square':
          offsetY = (Math.sin(phase) >= 0 ? 1 : -1) * amplitude;
          break;
      }

      const sx = Math.min(width - 1, Math.max(0, Math.round(x + offsetX)));
      const sy = Math.min(height - 1, Math.max(0, Math.round(y + offsetY)));
      const srcIdx = (sy * width + sx) * 4;
      const dstIdx = (y * width + x) * 4;
      resultData[dstIdx] = data[srcIdx];
      resultData[dstIdx + 1] = data[srcIdx + 1];
      resultData[dstIdx + 2] = data[srcIdx + 2];
      resultData[dstIdx + 3] = data[srcIdx + 3];
    }
  }
  return result;
}

/**
 * Ripple distortion — concentric ripple effect from center.
 */
export function ripple(
  imageData: ImageData,
  amplitude: number,
  frequency: number
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const cx = width / 2, cy = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const offset = Math.sin(dist * frequency * 0.1) * amplitude;

      const angle = Math.atan2(dy, dx);
      const sx = Math.round(x + Math.cos(angle) * offset);
      const sy = Math.round(y + Math.sin(angle) * offset);

      const srcIdx = (Math.min(height - 1, Math.max(0, sy)) * width + Math.min(width - 1, Math.max(0, sx))) * 4;
      const dstIdx = (y * width + x) * 4;
      resultData[dstIdx] = data[srcIdx];
      resultData[dstIdx + 1] = data[srcIdx + 1];
      resultData[dstIdx + 2] = data[srcIdx + 2];
      resultData[dstIdx + 3] = data[srcIdx + 3];
    }
  }
  return result;
}

/**
 * Polar Coordinates — converts between rectangular and polar coordinates.
 */
export function polarCoordinates(
  imageData: ImageData,
  mode: 'rectangular-to-polar' | 'polar-to-rectangular'
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const cx = width / 2, cy = height / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sx: number, sy: number;

      if (mode === 'rectangular-to-polar') {
        const angle = (x / width) * 2 * Math.PI;
        const radius = (y / height) * maxR;
        sx = Math.round(cx + radius * Math.cos(angle));
        sy = Math.round(cy + radius * Math.sin(angle));
      } else {
        const dx = x - cx, dy = y - cy;
        const radius = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        sx = Math.round((angle / (2 * Math.PI) + 0.5) * width) % width;
        sy = Math.round((radius / maxR) * height);
      }

      sx = Math.min(width - 1, Math.max(0, sx));
      sy = Math.min(height - 1, Math.max(0, sy));
      const srcIdx = (sy * width + sx) * 4;
      const dstIdx = (y * width + x) * 4;
      resultData[dstIdx] = data[srcIdx];
      resultData[dstIdx + 1] = data[srcIdx + 1];
      resultData[dstIdx + 2] = data[srcIdx + 2];
      resultData[dstIdx + 3] = data[srcIdx + 3];
    }
  }
  return result;
}

/**
 * ZigZag distortion — pond ripple effect.
 */
export function zigZag(
  imageData: ImageData,
  amount: number,
  ridges: number,
  style: 'around-center' | 'out-from-center' | 'pond-ripples' = 'pond-ripples'
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const cx = width / 2, cy = height / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const normalizedDist = dist / maxR;
      const displacement = Math.sin(normalizedDist * ridges * Math.PI * 2) * amount;

      let sx: number, sy: number;
      if (style === 'around-center') {
        const newAngle = angle + (displacement / maxR);
        sx = Math.round(cx + dist * Math.cos(newAngle));
        sy = Math.round(cy + dist * Math.sin(newAngle));
      } else {
        sx = Math.round(x + Math.cos(angle) * displacement);
        sy = Math.round(y + Math.sin(angle) * displacement);
      }

      sx = Math.min(width - 1, Math.max(0, sx));
      sy = Math.min(height - 1, Math.max(0, sy));
      const srcIdx = (sy * width + sx) * 4;
      const dstIdx = (y * width + x) * 4;
      resultData[dstIdx] = data[srcIdx];
      resultData[dstIdx + 1] = data[srcIdx + 1];
      resultData[dstIdx + 2] = data[srcIdx + 2];
      resultData[dstIdx + 3] = data[srcIdx + 3];
    }
  }
  return result;
}

/** Perspective Warp — 4-corner perspective distortion */
export function perspectiveWarp(
  imageData: ImageData,
  corners: { tl: { x: number; y: number }; tr: { x: number; y: number }; bl: { x: number; y: number }; br: { x: number; y: number } }
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width, v = y / height;
      // Bilinear interpolation of corner positions
      const srcX =
        (1 - u) * (1 - v) * corners.tl.x +
        u * (1 - v) * corners.tr.x +
        (1 - u) * v * corners.bl.x +
        u * v * corners.br.x;
      const srcY =
        (1 - u) * (1 - v) * corners.tl.y +
        u * (1 - v) * corners.tr.y +
        (1 - u) * v * corners.bl.y +
        u * v * corners.br.y;

      const sx = Math.min(width - 1, Math.max(0, Math.round(srcX)));
      const sy = Math.min(height - 1, Math.max(0, Math.round(srcY)));
      const si = (sy * width + sx) * 4;
      const di = (y * width + x) * 4;
      d[di] = data[si]; d[di + 1] = data[si + 1]; d[di + 2] = data[si + 2]; d[di + 3] = data[si + 3];
    }
  }
  return result;
}

/** Content-Aware Scale — seam carving for content-aware resizing */
export function contentAwareScale(
  imageData: ImageData,
  newWidth: number,
  newHeight: number
): ImageData {
  const { width, height, data } = imageData;

  // Simplified energy-based scaling (horizontal seam removal)
  let currentData = new Uint8ClampedArray(data);
  let currentW = width;
  const currentH = height;

  // Calculate energy map
  const computeEnergy = (d: Uint8ClampedArray, w: number, h: number): Float32Array => {
    const energy = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const left = x > 0 ? (y * w + x - 1) * 4 : i;
        const right = x < w - 1 ? (y * w + x + 1) * 4 : i;
        const top = y > 0 ? ((y - 1) * w + x) * 4 : i;
        const bottom = y < h - 1 ? ((y + 1) * w + x) * 4 : i;
        const dx = Math.abs(d[left] - d[right]) + Math.abs(d[left + 1] - d[right + 1]) + Math.abs(d[left + 2] - d[right + 2]);
        const dy = Math.abs(d[top] - d[bottom]) + Math.abs(d[top + 1] - d[bottom + 1]) + Math.abs(d[top + 2] - d[bottom + 2]);
        energy[y * w + x] = dx + dy;
      }
    }
    return energy;
  };

  // Remove vertical seams to reduce width
  while (currentW > newWidth && currentW > 1) {
    const energy = computeEnergy(currentData, currentW, currentH);
    // Find minimum energy seam using DP
    const dp = new Float32Array(energy);
    for (let y = 1; y < currentH; y++) {
      for (let x = 0; x < currentW; x++) {
        const above = dp[(y - 1) * currentW + x];
        const aboveL = x > 0 ? dp[(y - 1) * currentW + x - 1] : Infinity;
        const aboveR = x < currentW - 1 ? dp[(y - 1) * currentW + x + 1] : Infinity;
        dp[y * currentW + x] += Math.min(above, aboveL, aboveR);
      }
    }
    // Find seam end
    let minIdx = 0;
    for (let x = 1; x < currentW; x++) {
      if (dp[(currentH - 1) * currentW + x] < dp[(currentH - 1) * currentW + minIdx]) minIdx = x;
    }
    // Trace seam and remove pixels
    const seam = new Int32Array(currentH);
    seam[currentH - 1] = minIdx;
    for (let y = currentH - 2; y >= 0; y--) {
      const x = seam[y + 1];
      let best = x;
      if (x > 0 && dp[y * currentW + x - 1] < dp[y * currentW + best]) best = x - 1;
      if (x < currentW - 1 && dp[y * currentW + x + 1] < dp[y * currentW + best]) best = x + 1;
      seam[y] = best;
    }
    // Remove seam
    const newData = new Uint8ClampedArray((currentW - 1) * currentH * 4);
    for (let y = 0; y < currentH; y++) {
      let nx = 0;
      for (let x = 0; x < currentW; x++) {
        if (x === seam[y]) continue;
        const si = (y * currentW + x) * 4;
        const di = (y * (currentW - 1) + nx) * 4;
        newData[di] = currentData[si]; newData[di + 1] = currentData[si + 1];
        newData[di + 2] = currentData[si + 2]; newData[di + 3] = currentData[si + 3];
        nx++;
      }
    }
    currentData = newData;
    currentW--;
  }

  // Simple bilinear scale for height changes
  const result = new ImageData(newWidth, newHeight);
  const d = result.data;
  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcX = Math.min(currentW - 1, Math.round(x * currentW / newWidth));
      const srcY = Math.min(currentH - 1, Math.round(y * currentH / newHeight));
      const si = (srcY * currentW + srcX) * 4;
      const di = (y * newWidth + x) * 4;
      d[di] = currentData[si]; d[di + 1] = currentData[si + 1];
      d[di + 2] = currentData[si + 2]; d[di + 3] = currentData[si + 3];
    }
  }
  return result;
}

/**
 * Shear filter — distorts image along the vertical axis with a curve
 * Points define a piecewise-linear curve mapping Y position to X offset
 */
export function shear(
  imageData: ImageData,
  points: Array<{ y: number; x: number }> = [{ y: 0, x: 0 }, { y: 1, x: 0.5 }],
  wrapAround: boolean = true
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  // Sort points by y
  const sorted = [...points].sort((a, b) => a.y - b.y);

  // Interpolate X offset for a given normalized Y
  function getOffset(normalizedY: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0].x * width;
    if (normalizedY <= sorted[0].y) return sorted[0].x * width;
    if (normalizedY >= sorted[sorted.length - 1].y) return sorted[sorted.length - 1].x * width;

    for (let i = 0; i < sorted.length - 1; i++) {
      if (normalizedY >= sorted[i].y && normalizedY <= sorted[i + 1].y) {
        const t = (normalizedY - sorted[i].y) / (sorted[i + 1].y - sorted[i].y);
        return (sorted[i].x + t * (sorted[i + 1].x - sorted[i].x)) * width;
      }
    }
    return 0;
  }

  for (let y = 0; y < height; y++) {
    const normalizedY = y / (height - 1);
    const xOffset = Math.round(getOffset(normalizedY));

    for (let x = 0; x < width; x++) {
      let sx = x - xOffset;

      if (wrapAround) {
        sx = ((sx % width) + width) % width;
      } else {
        if (sx < 0 || sx >= width) {
          const dstIdx = (y * width + x) * 4;
          resultData[dstIdx + 3] = 0; // transparent
          continue;
        }
      }

      const dstIdx = (y * width + x) * 4;
      const srcIdx = (y * width + sx) * 4;
      resultData[dstIdx] = data[srcIdx];
      resultData[dstIdx + 1] = data[srcIdx + 1];
      resultData[dstIdx + 2] = data[srcIdx + 2];
      resultData[dstIdx + 3] = data[srcIdx + 3];
    }
  }

  return result;
}
