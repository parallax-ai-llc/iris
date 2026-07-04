/**
 * Optical / lens distortion filters
 *
 * Part of the image-editor filter library. See ./index.ts (barrel) and
 * ./registry.ts (Filter Gallery registry). Extracted from the former
 * monolithic filters.ts.
 */


/**
 * Lens Correction — correct barrel/pincushion distortion, chromatic aberration, and vignette
 */
export function lensCorrection(
  imageData: ImageData,
  barrelDistortion: number = 0,       // -100 to 100
  chromaticAberration: number = 0,     // 0 to 100
  vignette: number = 0,               // -100 to 100
  verticalPerspective: number = 0,     // -100 to 100
  horizontalPerspective: number = 0    // -100 to 100
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const cx = width / 2;
  const cy = height / 2;
  const k = barrelDistortion / 5000;  // normalize
  const ca = chromaticAberration / 1000;
  const vp = verticalPerspective / 500;
  const hp = horizontalPerspective / 500;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Normalize coordinates to [-1, 1]
      let nx = (x - cx) / cx;
      let ny = (y - cy) / cy;

      // Perspective correction
      const perspDenom = 1 + hp * nx + vp * ny;
      nx /= perspDenom;
      ny /= perspDenom;

      // Barrel/pincushion distortion
      const r2 = nx * nx + ny * ny;
      const distortionFactor = 1 + k * r2;

      // Sample each color channel with slight offset for chromatic aberration
      const outIdx = (y * width + x) * 4;

      for (let c = 0; c < 3; c++) {
        const channelOffset = c === 0 ? -ca : c === 2 ? ca : 0;
        const factor = distortionFactor + channelOffset * r2;

        const srcNx = nx * factor;
        const srcNy = ny * factor;
        const srcX = srcNx * cx + cx;
        const srcY = srcNy * cy + cy;

        if (srcX >= 0 && srcX < width - 1 && srcY >= 0 && srcY < height - 1) {
          // Bilinear interpolation
          const x0 = Math.floor(srcX);
          const y0 = Math.floor(srcY);
          const fx = srcX - x0;
          const fy = srcY - y0;
          const i00 = (y0 * width + x0) * 4 + c;
          const i10 = (y0 * width + x0 + 1) * 4 + c;
          const i01 = ((y0 + 1) * width + x0) * 4 + c;
          const i11 = ((y0 + 1) * width + x0 + 1) * 4 + c;
          resultData[outIdx + c] = Math.round(
            data[i00] * (1 - fx) * (1 - fy) +
            data[i10] * fx * (1 - fy) +
            data[i01] * (1 - fx) * fy +
            data[i11] * fx * fy
          );
        } else {
          resultData[outIdx + c] = 0;
        }
      }

      // Alpha channel (no CA)
      const srcX = nx * distortionFactor * cx + cx;
      const srcY = ny * distortionFactor * cy + cy;
      if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        const si = (Math.floor(srcY) * width + Math.floor(srcX)) * 4;
        resultData[outIdx + 3] = data[si + 3];
      } else {
        resultData[outIdx + 3] = 0;
      }

      // Vignette
      if (vignette !== 0) {
        const r = Math.sqrt(r2) / Math.SQRT2;
        const vigFactor = 1 + (vignette / 100) * r * r;
        for (let c = 0; c < 3; c++) {
          resultData[outIdx + c] = Math.max(0, Math.min(255, resultData[outIdx + c] * vigFactor));
        }
      }
    }
  }

  return result;
}

/** Diffuse Glow — bright area diffusion with noise grain */
export function diffuseGlow(imageData: ImageData, graininess: number = 6, glowAmount: number = 10, clearAmount: number = 15): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const grain = graininess / 10;
  const glow = glowAmount / 20;
  const clear = clearAmount / 20;

  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const glowFactor = Math.max(0, (lum - 128 * clear) / 128) * glow;
    const noise = (Math.random() - 0.5) * grain * 50;
    d[i] = Math.min(255, Math.max(0, data[i] + (255 - data[i]) * glowFactor + noise));
    d[i + 1] = Math.min(255, Math.max(0, data[i + 1] + (255 - data[i + 1]) * glowFactor + noise));
    d[i + 2] = Math.min(255, Math.max(0, data[i + 2] + (255 - data[i + 2]) * glowFactor + noise));
    d[i + 3] = data[i + 3];
  }
  return result;
}

/** Glass — glass texture distortion */
export function glass(imageData: ImageData, distortion: number = 5, smoothness: number = 3, texture: 'blocks' | 'frosted' | 'tinyLens' = 'frosted'): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const dist = distortion * Math.max(1, smoothness) / smoothness;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let ox = 0, oy = 0;
      if (texture === 'blocks') {
        const bx = Math.floor(x / 8) * 8;
        const by = Math.floor(y / 8) * 8;
        ox = ((bx * 17 + by * 31) % 100 - 50) / 50 * dist;
        oy = ((bx * 23 + by * 13) % 100 - 50) / 50 * dist;
      } else if (texture === 'frosted') {
        ox = (Math.random() - 0.5) * dist * 2;
        oy = (Math.random() - 0.5) * dist * 2;
      } else { // tinyLens
        const cx = (x % 6) - 3;
        const cy = (y % 6) - 3;
        const d2 = cx * cx + cy * cy;
        const factor = d2 < 9 ? d2 / 9 : 1;
        ox = cx * factor * dist * 0.3;
        oy = cy * factor * dist * 0.3;
      }
      const sx = Math.min(width - 1, Math.max(0, Math.round(x + ox)));
      const sy = Math.min(height - 1, Math.max(0, Math.round(y + oy)));
      const si = (sy * width + sx) * 4;
      const di = (y * width + x) * 4;
      d[di] = data[si]; d[di + 1] = data[si + 1]; d[di + 2] = data[si + 2]; d[di + 3] = data[si + 3];
    }
  }
  return result;
}

/** Ocean Ripple — sine wave distortion simulating water surface */
export function oceanRipple(imageData: ImageData, rippleSize: number = 9, rippleMagnitude: number = 6): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const freq = (2 * Math.PI) / Math.max(1, rippleSize * 3);
  const mag = rippleMagnitude;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ox = Math.sin(y * freq) * mag;
      const oy = Math.sin(x * freq * 0.7) * mag;
      const sx = Math.min(width - 1, Math.max(0, Math.round(x + ox)));
      const sy = Math.min(height - 1, Math.max(0, Math.round(y + oy)));
      const si = (sy * width + sx) * 4;
      const di = (y * width + x) * 4;
      d[di] = data[si]; d[di + 1] = data[si + 1]; d[di + 2] = data[si + 2]; d[di + 3] = data[si + 3];
    }
  }
  return result;
}

/** Displace — displacement map based distortion */
export function displace(imageData: ImageData, horizontalScale: number = 10, verticalScale: number = 10, _displaceMap?: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  // If no displacement map provided, use self-luminance as displacement
  const mapData = _displaceMap ? _displaceMap.data : data;
  const mapW = _displaceMap ? _displaceMap.width : width;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const mi = (y * mapW + x) * 4;
      const hDisp = ((mapData[mi] || 128) - 128) / 128 * horizontalScale;
      const vDisp = ((mapData[mi + 1] || 128) - 128) / 128 * verticalScale;
      const sx = Math.min(width - 1, Math.max(0, Math.round(x + hDisp)));
      const sy = Math.min(height - 1, Math.max(0, Math.round(y + vDisp)));
      const si = (sy * width + sx) * 4;
      const di = (y * width + x) * 4;
      d[di] = data[si]; d[di + 1] = data[si + 1]; d[di + 2] = data[si + 2]; d[di + 3] = data[si + 3];
    }
  }
  return result;
}

/**
 * Adaptive Wide Angle — barrel/pincushion distortion correction
 * Uses Brown-Conrady model: r_corrected = r * (1 + k1*r² + k2*r⁴)
 */
export function adaptiveWideAngle(
  imageData: ImageData,
  k1: number = -0.3,
  k2: number = 0.1,
  centerX: number = 0.5,
  centerY: number = 0.5
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const rd = result.data;
  const cx = width * centerX;
  const cy = height * centerY;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx, dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy) / maxR;
      const r2 = r * r, r4 = r2 * r2;
      const scale = 1 + k1 * r2 + k2 * r4;
      const sx = cx + dx * scale;
      const sy = cy + dy * scale;

      // Bilinear interpolation
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
      if (x0 < 0 || x0 >= width || y0 < 0 || y0 >= height) {
        const di = (y * width + x) * 4;
        rd[di] = rd[di + 1] = rd[di + 2] = 0; rd[di + 3] = 255;
        continue;
      }
      const fx = sx - x0, fy = sy - y0;
      const di = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        rd[di + c] = Math.round(
          data[(y0 * width + x0) * 4 + c] * (1 - fx) * (1 - fy) +
          data[(y0 * width + x1) * 4 + c] * fx * (1 - fy) +
          data[(y1 * width + x0) * 4 + c] * (1 - fx) * fy +
          data[(y1 * width + x1) * 4 + c] * fx * fy
        );
      }
    }
  }
  return result;
}
