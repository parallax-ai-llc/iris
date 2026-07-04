/**
 * Render filters (procedural: clouds, fibers, flare, flame, tree)
 *
 * Part of the image-editor filter library. See ./index.ts (barrel) and
 * ./registry.ts (Filter Gallery registry). Extracted from the former
 * monolithic filters.ts.
 */

import { seededRandom } from './core';

/** Perlin-style value noise for procedural generation */
function valueNoise2D(x: number, y: number, seed: number): number {
  const rng = (ix: number, iy: number) => {
    // Use Math.imul to force 32-bit integer multiplication. Without it, the
    // intermediate products overflow Number.MAX_SAFE_INTEGER as floats, and
    // the subsequent `& 0x7fffffff` coercion collapses to 0 for every input —
    // which previously made valueNoise2D return a constant 1.0 everywhere and
    // rendered Clouds / Fibers / Flame / etc. as solid white fills.
    let n = (ix | 0) + Math.imul(iy | 0, 57) + Math.imul(seed | 0, 131);
    n = (n << 13) ^ n;
    const h = Math.imul(n, Math.imul(n, Math.imul(n, 15731)) + 789221) + 1376312589;
    return 1.0 - ((h & 0x7fffffff) / 1073741824.0);
  };
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const n00 = rng(ix, iy), n10 = rng(ix + 1, iy);
  const n01 = rng(ix, iy + 1), n11 = rng(ix + 1, iy + 1);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

/** Multi-octave fractal noise (fBM) */
function fractalNoise(x: number, y: number, octaves: number, persistence: number, seed: number): number {
  let val = 0, amp = 1, freq = 1, maxVal = 0;
  for (let i = 0; i < octaves; i++) {
    val += valueNoise2D(x * freq, y * freq, seed + i * 100) * amp;
    maxVal += amp;
    amp *= persistence;
    freq *= 2;
  }
  return val / maxVal;
}

/** Clouds — procedural cloud generation using fractal noise */
export function clouds(imageData: ImageData, seed: number = 42, scale: number = 64): ImageData {
  const { width, height } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = fractalNoise(x / scale, y / scale, 6, 0.5, seed);
      const v = Math.min(255, Math.max(0, Math.round((n + 1) * 0.5 * 255)));
      const i = (y * width + x) * 4;
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
  }
  return result;
}

/** Difference Clouds — blend clouds with the source using difference mode */
export function differenceClouds(imageData: ImageData, seed: number = 42, scale: number = 64): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = fractalNoise(x / scale, y / scale, 6, 0.5, seed);
      const cloud = Math.min(255, Math.max(0, Math.round((n + 1) * 0.5 * 255)));
      const i = (y * width + x) * 4;
      d[i] = Math.abs(data[i] - cloud);
      d[i + 1] = Math.abs(data[i + 1] - cloud);
      d[i + 2] = Math.abs(data[i + 2] - cloud);
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Fibers — procedural fiber texture with directional noise */
export function fibers(imageData: ImageData, variance: number = 16, strength: number = 4, seed: number = 42): ImageData {
  const { width, height } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const rng = seededRandom(seed);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Combine vertical noise with horizontal variance
      const n1 = fractalNoise(x * 0.02, y * 0.3, 4, 0.5, seed);
      const n2 = fractalNoise(x * 0.1 + 100, y * 0.05, 3, 0.6, seed + 50);
      const fiberVal = n1 * strength + n2 * variance * 0.1 + (rng() - 0.5) * variance * 0.3;
      const v = Math.min(255, Math.max(0, Math.round((fiberVal + 1) * 0.5 * 255)));
      const i = (y * width + x) * 4;
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
  }
  return result;
}

/** Lens Flare — simulates camera lens flare at a specified position */
export function lensFlare(imageData: ImageData, centerX: number = -1, centerY: number = -1, brightness: number = 100, lensType: '50-300mm' | '35mm' | '105mm' = '50-300mm'): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  const d = result.data;
  const cx = centerX < 0 ? width * 0.4 : centerX;
  const cy = centerY < 0 ? height * 0.4 : centerY;
  const bri = brightness / 100;
  const maxDist = Math.sqrt(width * width + height * height);

  // Flare halo count based on lens type
  const haloCount = lensType === '35mm' ? 3 : lensType === '105mm' ? 5 : 4;
  const haloPositions: Array<{ x: number; y: number; r: number; intensity: number }> = [];
  for (let h = 0; h < haloCount; h++) {
    const t = (h + 1) / (haloCount + 1);
    haloPositions.push({
      x: cx + (width / 2 - cx) * t * 2,
      y: cy + (height / 2 - cy) * t * 2,
      r: 10 + h * 15,
      intensity: 0.3 - h * 0.05,
    });
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Main glow
      const glow = Math.max(0, 1 - dist / (maxDist * 0.3)) * bri;
      const mainFlare = glow * glow * 200;

      // Rays
      const angle = Math.atan2(dy, dx);
      const rayIntensity = Math.max(0, Math.cos(angle * 8) * 0.5 + 0.5) * glow * 80;

      // Halos
      let haloIntensity = 0;
      for (const halo of haloPositions) {
        const hd = Math.sqrt((x - halo.x) ** 2 + (y - halo.y) ** 2);
        const ring = Math.abs(hd - halo.r);
        if (ring < 5) {
          haloIntensity += halo.intensity * (1 - ring / 5) * 100 * bri;
        }
      }

      const add = mainFlare + rayIntensity + haloIntensity;
      d[i] = Math.min(255, d[i] + add);
      d[i + 1] = Math.min(255, d[i + 1] + add * 0.9);
      d[i + 2] = Math.min(255, d[i + 2] + add * 0.7);
    }
  }
  return result;
}

/** Lighting Effects — simulates directional, point, or spot lighting */
export function lightingEffects(
  imageData: ImageData,
  lightType: 'directional' | 'point' | 'spot' = 'directional',
  lightX: number = -1,
  lightY: number = -1,
  intensity: number = 50,
  ambience: number = 30
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const lx = lightX < 0 ? width / 2 : lightX;
  const ly = lightY < 0 ? height / 3 : lightY;
  const intFactor = intensity / 100;
  const ambFactor = ambience / 100;
  const maxDist = Math.sqrt(width * width + height * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let lightFactor: number;

      if (lightType === 'directional') {
        // Light comes from top-left to bottom-right
        lightFactor = ((x + y) / (width + height)) * intFactor + ambFactor;
      } else if (lightType === 'point') {
        const dist = Math.sqrt((x - lx) ** 2 + (y - ly) ** 2);
        lightFactor = Math.max(ambFactor, (1 - dist / (maxDist * 0.5)) * intFactor + ambFactor);
      } else {
        // Spot light with falloff
        const dist = Math.sqrt((x - lx) ** 2 + (y - ly) ** 2);
        const spotRadius = maxDist * 0.3;
        lightFactor = dist < spotRadius
          ? (1 - (dist / spotRadius) ** 2) * intFactor + ambFactor
          : ambFactor;
      }

      d[i] = Math.min(255, data[i] * lightFactor);
      d[i + 1] = Math.min(255, data[i + 1] * lightFactor);
      d[i + 2] = Math.min(255, data[i + 2] * lightFactor);
      d[i + 3] = data[i + 3];
    }
  }
  return result;
}

/** Flame — procedural flame rendering */
export function flame(imageData: ImageData, flameHeight: number = 100, seed: number = 42): ImageData {
  const { width, height } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  const baseY = height * 0.75;
  const hScale = Math.max(1, flameHeight);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const relY = (baseY - y) / hScale;

      if (relY <= 0) {
        d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255;
        continue;
      }

      const n = fractalNoise(x * 0.03, y * 0.05 + seed * 0.1, 4, 0.5, seed);
      const flameIntensity = Math.max(0, relY * (1 + n * 0.5));

      if (flameIntensity > 0) {
        const t = Math.min(1, flameIntensity);
        // Orange-red gradient: bottom=white/yellow, middle=orange, top=red/transparent
        const r = Math.min(255, 255 * Math.min(1, t * 3));
        const g = Math.min(255, 255 * Math.max(0, Math.min(1, t * 2 - 0.3)));
        const b = Math.min(255, 100 * Math.max(0, Math.min(1, t * 1.5 - 0.7)));
        const a = Math.min(255, 255 * Math.min(1, flameIntensity * 2));
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
      } else {
        d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255;
      }
    }
  }
  return result;
}

/** Tree — procedural fractal tree rendering */
export function tree(imageData: ImageData, branchAngle: number = 25, depth: number = 8, seed: number = 42): ImageData {
  const { width, height } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;
  // Fill background transparent
  for (let i = 3; i < d.length; i += 4) d[i] = 255;

  const rng = seededRandom(seed);

  function drawLine(x1: number, y1: number, x2: number, y2: number, thickness: number, r: number, g: number, b: number) {
    const steps = Math.max(1, Math.ceil(Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = Math.round(x1 + (x2 - x1) * t);
      const py = Math.round(y1 + (y2 - y1) * t);
      const th = Math.ceil(thickness / 2);
      for (let dy = -th; dy <= th; dy++) {
        for (let dx = -th; dx <= th; dx++) {
          const fx = px + dx, fy = py + dy;
          if (fx >= 0 && fx < width && fy >= 0 && fy < height) {
            const i = (fy * width + fx) * 4;
            d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
          }
        }
      }
    }
  }

  function branch(x: number, y: number, angle: number, len: number, thick: number, level: number) {
    if (level <= 0 || len < 2) return;
    const rad = angle * Math.PI / 180;
    const x2 = x + Math.cos(rad) * len;
    const y2 = y - Math.sin(rad) * len;

    // Color: brown for trunk, green for leaves
    const isLeaf = level <= 2;
    const r = isLeaf ? 34 + Math.floor(rng() * 30) : 101;
    const g = isLeaf ? 120 + Math.floor(rng() * 60) : 67;
    const bCol = isLeaf ? 34 : 33;

    drawLine(x, y, x2, y2, thick, r, g, bCol);

    const jitter = (rng() - 0.5) * 10;
    branch(x2, y2, angle + branchAngle + jitter, len * (0.65 + rng() * 0.1), thick * 0.7, level - 1);
    branch(x2, y2, angle - branchAngle + jitter, len * (0.65 + rng() * 0.1), thick * 0.7, level - 1);
    if (rng() > 0.6) {
      branch(x2, y2, angle + jitter * 2, len * 0.5, thick * 0.5, level - 2);
    }
  }

  const trunkLen = height * 0.2;
  branch(width / 2, height * 0.85, 90, trunkLen, Math.max(1, depth * 0.5), depth);
  return result;
}
