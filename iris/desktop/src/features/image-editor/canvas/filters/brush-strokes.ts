/**
 * Brush stroke filters (Filter Gallery)
 *
 * Part of the image-editor filter library. See ./index.ts (barrel) and
 * ./registry.ts (Filter Gallery registry). Extracted from the former
 * monolithic filters.ts.
 */

import { gaussianBlur, motionBlur } from './blur';
import { sharpen } from './sharpen';
import { edgeDetect } from './stylize';
import { spatter, sprayedStrokes } from './brush-strokes-spray';
import type { GalleryFilter } from './types';

// Split into ./brush-strokes-spray.ts for the 500-line module limit;
// re-exported so the public filter API is unchanged.
export { spatter, sprayedStrokes };

/**
 * Accented Edges — Detect edges using Sobel operator with configurable width,
 * accent bright edges toward white and dark edges toward black based on
 * brightness parameter, then apply Gaussian smoothing.
 * @param imageData Source image data
 * @param edgeWidth Width of edge detection influence (1-14)
 * @param edgeBrightness Brightness threshold for edge accenting (0-50)
 * @param smoothness Amount of post-smoothing via Gaussian blur (1-15)
 */
export function accentedEdges(
  imageData: ImageData,
  edgeWidth: number = 2,
  edgeBrightness: number = 38,
  smoothness: number = 5
): ImageData {
  const { width, height, data } = imageData;

  // Compute per-pixel luminance
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    lum[i] = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
  }

  // Sobel edge detection with configurable radius
  const edgeMag = new Float32Array(width * height);
  const radius = Math.max(1, Math.round(edgeWidth));
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const sy = Math.min(height - 1, Math.max(0, y + ky * radius));
          const sx = Math.min(width - 1, Math.max(0, x + kx * radius));
          const val = lum[sy * width + sx];
          const wx = kx === 0 ? 0 : (ky === 0 ? 2 * kx : kx);
          const wy = ky === 0 ? 0 : (kx === 0 ? 2 * ky : ky);
          gx += val * wx;
          gy += val * wy;
        }
      }
      edgeMag[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  // Normalize edge magnitudes to 0-1
  let maxEdge = 0;
  for (let i = 0; i < edgeMag.length; i++) {
    if (edgeMag[i] > maxEdge) maxEdge = edgeMag[i];
  }
  if (maxEdge > 0) {
    for (let i = 0; i < edgeMag.length; i++) {
      edgeMag[i] /= maxEdge;
    }
  }

  // Accent edges based on brightness threshold
  const brightnessThreshold = edgeBrightness / 50;
  const result = new ImageData(width, height);
  const d = result.data;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const edge = edgeMag[i];
    const lumVal = lum[i] / 255;

    if (edge > 0.1) {
      const factor = Math.min(1, edge * 2);
      if (lumVal > brightnessThreshold) {
        // Bright edge: push toward white
        d[idx] = Math.min(255, Math.round(data[idx] + (255 - data[idx]) * factor));
        d[idx + 1] = Math.min(255, Math.round(data[idx + 1] + (255 - data[idx + 1]) * factor));
        d[idx + 2] = Math.min(255, Math.round(data[idx + 2] + (255 - data[idx + 2]) * factor));
      } else {
        // Dark edge: push toward black
        d[idx] = Math.max(0, Math.round(data[idx] * (1 - factor)));
        d[idx + 1] = Math.max(0, Math.round(data[idx + 1] * (1 - factor)));
        d[idx + 2] = Math.max(0, Math.round(data[idx + 2] * (1 - factor)));
      }
    } else {
      d[idx] = data[idx];
      d[idx + 1] = data[idx + 1];
      d[idx + 2] = data[idx + 2];
    }
    d[idx + 3] = data[idx + 3];
  }

  // Apply Gaussian smoothing
  if (smoothness > 0) {
    return gaussianBlur(result, smoothness);
  }

  return result;
}

/**
 * Angled Strokes — Apply directional motion blur at different angles for light
 * vs dark areas. Light areas blur at one angle derived from directionBalance,
 * dark areas blur at the complementary angle (offset by 90 degrees).
 * Post-sharpening restores detail.
 * @param imageData Source image data
 * @param directionBalance Balance between light/dark angle (0-100), maps to base angle 0-180
 * @param strokeLength Length of the directional blur strokes
 * @param sharpness Post-sharpening amount applied via sharpen()
 */
export function angledStrokes(
  imageData: ImageData,
  directionBalance: number = 50,
  strokeLength: number = 15,
  sharpness: number = 3
): ImageData {
  const { width, height, data } = imageData;

  // Derive two complementary angles from direction balance
  const baseAngle = (directionBalance / 100) * 180;
  const lightAngle = baseAngle;
  const darkAngle = baseAngle + 90;

  const lightBlurred = motionBlur(imageData, lightAngle, strokeLength);
  const darkBlurred = motionBlur(imageData, darkAngle, strokeLength);

  // Blend based on per-pixel luminance
  const result = new ImageData(width, height);
  const d = result.data;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const lumVal = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;

    for (let c = 0; c < 3; c++) {
      d[idx + c] = Math.round(
        lightBlurred.data[idx + c] * lumVal + darkBlurred.data[idx + c] * (1 - lumVal)
      );
    }
    d[idx + 3] = data[idx + 3];
  }

  // Post-sharpen to restore detail
  if (sharpness > 0) {
    return sharpen(result, sharpness);
  }

  return result;
}

/**
 * Crosshatch — Layer multiple directional motion blurs at 45, 135, and 0 degrees
 * to simulate crosshatching. Edge detection weights the blend so strokes appear
 * more prominently at edges. Post-sharpening restores crispness.
 * @param imageData Source image data
 * @param strokeLength Length of each directional stroke
 * @param sharpness Post-sharpening amount applied via sharpen()
 * @param strength Crosshatch intensity multiplier (0-3)
 */
export function crosshatch(
  imageData: ImageData,
  strokeLength: number = 9,
  sharpness: number = 6,
  strength: number = 1
): ImageData {
  const { width, height, data } = imageData;

  // Edge detection for weighting
  const edges = edgeDetect(imageData);

  // Three directional motion blurs
  const blur45 = motionBlur(imageData, 45, strokeLength);
  const blur135 = motionBlur(imageData, 135, strokeLength);
  const blur0 = motionBlur(imageData, 0, strokeLength);

  // Combine: blend original with averaged directional blurs weighted by edge
  const result = new ImageData(width, height);
  const d = result.data;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const edgeVal = (edges.data[idx] / 255) * strength;
    const blendFactor = Math.min(1, edgeVal);

    for (let c = 0; c < 3; c++) {
      const avgBlur = (blur45.data[idx + c] + blur135.data[idx + c] + blur0.data[idx + c]) / 3;
      d[idx + c] = Math.round(data[idx + c] * (1 - blendFactor) + avgBlur * blendFactor);
    }
    d[idx + 3] = data[idx + 3];
  }

  // Post-sharpen
  if (sharpness > 0) {
    return sharpen(result, sharpness);
  }

  return result;
}

/**
 * Dark Strokes — Enhance dark areas using multiply-like blending and light areas
 * using screen-like blending, controlled by balance parameter. Creates dramatic
 * contrast between dark and light regions.
 * @param imageData Source image data
 * @param balance Balance between dark and light treatment (0-10)
 * @param blackIntensity Intensity of darkening via power curve (1-10)
 * @param whiteIntensity Intensity of lightening via inverse power curve (1-10)
 */
export function darkStrokes(
  imageData: ImageData,
  balance: number = 5,
  blackIntensity: number = 3,
  whiteIntensity: number = 1
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const d = result.data;

  const balanceNorm = balance / 10;

  for (let i = 0; i < data.length; i += 4) {
    const lumVal = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;

    for (let c = 0; c < 3; c++) {
      const v = data[i + c] / 255;

      // Multiply-like: raise to power > 1 to darken
      const darkened = Math.pow(v, 1 + blackIntensity * 0.3);
      // Screen-like: invert, raise to power, invert back to lighten
      const lightened = 1 - Math.pow(1 - v, 1 + whiteIntensity * 0.3);

      // Weight by luminance and balance
      const darkWeight = (1 - lumVal) * balanceNorm;
      const lightWeight = lumVal * (1 - balanceNorm);
      const totalWeight = darkWeight + lightWeight;

      let blended: number;
      if (totalWeight > 0) {
        blended = (darkened * darkWeight + lightened * lightWeight) / totalWeight;
      } else {
        blended = v;
      }

      d[i + c] = Math.min(255, Math.max(0, Math.round(blended * 255)));
    }
    d[i + 3] = data[i + 3];
  }

  return result;
}

/**
 * Ink Outlines — Draw ink-like outlines on edges using Sobel edge detection,
 * with optional directional emphasis via motion blur. Outlines are overlaid
 * on a lightened version of the original image.
 * @param imageData Source image data
 * @param strokeLength Stroke length for directional edge emphasis via motion blur
 * @param darkIntensity Intensity of dark outline strokes (1-50)
 * @param lightIntensity Lightening amount for the base image (1-50)
 */
export function inkOutlines(
  imageData: ImageData,
  strokeLength: number = 4,
  darkIntensity: number = 20,
  lightIntensity: number = 10
): ImageData {
  const { width, height, data } = imageData;

  // Sobel edge detection
  const edges = edgeDetect(imageData);

  // Optional directional emphasis
  const dirEdges = strokeLength > 1 ? motionBlur(edges, 45, strokeLength) : edges;

  // Create lightened base with ink overlay
  const lightFactor = 1 + (lightIntensity / 50);
  const result = new ImageData(width, height);
  const d = result.data;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;

    // Lightened base color
    const baseR = Math.min(255, Math.round(data[idx] * lightFactor));
    const baseG = Math.min(255, Math.round(data[idx + 1] * lightFactor));
    const baseB = Math.min(255, Math.round(data[idx + 2] * lightFactor));

    // Edge intensity normalized and amplified by darkIntensity
    const edgeVal = Math.min(255, dirEdges.data[idx] * (darkIntensity / 10));
    const inkFactor = edgeVal / 255;

    // Multiply dark ink outlines onto lightened base
    d[idx] = Math.max(0, Math.round(baseR * (1 - inkFactor)));
    d[idx + 1] = Math.max(0, Math.round(baseG * (1 - inkFactor)));
    d[idx + 2] = Math.max(0, Math.round(baseB * (1 - inkFactor)));
    d[idx + 3] = data[idx + 3];
  }

  return result;
}

/**
 * Sumi-e (ink wash painting) — Convert to grayscale, apply strong Sobel edge
 * detection with pressure-based amplification, compose ink strokes onto a white
 * paper background with subtle grayscale wash, blur for ink spread, and boost
 * contrast for a traditional Japanese ink-wash appearance.
 * @param imageData Source image data
 * @param strokeWidth Width of ink strokes via blur radius (1-10)
 * @param strokePressure Pressure/intensity multiplier for edge strokes (1-10)
 * @param contrast Contrast boost amount (0-40)
 */
export function sumie(
  imageData: ImageData,
  strokeWidth: number = 3,
  strokePressure: number = 2,
  contrast: number = 16
): ImageData {
  const { width, height, data } = imageData;

  // Convert to grayscale
  const gray = new ImageData(width, height);
  const gd = gray.data;

  for (let i = 0; i < data.length; i += 4) {
    const g = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    gd[i] = g;
    gd[i + 1] = g;
    gd[i + 2] = g;
    gd[i + 3] = data[i + 3];
  }

  // Sobel edge detection with pressure amplification
  const edges = edgeDetect(gray);
  const pressureScale = strokePressure * 1.5;

  // Compose ink strokes on white paper
  const combined = new ImageData(width, height);
  const cd = combined.data;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const edgeVal = Math.min(255, edges.data[idx] * pressureScale);
    const inkAmount = edgeVal / 255;
    const grayVal = gd[idx];

    // White paper darkened by ink strokes with subtle grayscale wash
    const inkVal = Math.max(0, grayVal * 0.3);
    const val = Math.round(255 * (1 - inkAmount) + inkVal * inkAmount);

    cd[idx] = val;
    cd[idx + 1] = val;
    cd[idx + 2] = val;
    cd[idx + 3] = data[idx + 3];
  }

  // Blur for ink spread effect
  const blurred = strokeWidth > 0 ? gaussianBlur(combined, strokeWidth * 0.5) : combined;

  // Boost contrast for ink-like appearance
  if (contrast > 0) {
    const bd = blurred.data;
    const contrastFactor = (259 * (contrast * 2.55 + 255)) / (255 * (259 - contrast * 2.55));

    const contrastResult = new ImageData(width, height);
    const rd = contrastResult.data;

    for (let i = 0; i < bd.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        rd[i + c] = Math.min(255, Math.max(0, Math.round(contrastFactor * (bd[i + c] - 128) + 128)));
      }
      rd[i + 3] = bd[i + 3];
    }

    return contrastResult;
  }

  return blurred;
}

/**
 * Filter Gallery registrations for this category module.
 * Add new gallery filters here, next to their implementation.
 */
export const brushStrokeGalleryFilters: GalleryFilter[] = [
  { id: 'accentedEdges', label: "Accented Edges", category: 'brush', apply: (d) => accentedEdges(d) },
  { id: 'angledStrokes', label: "Angled Strokes", category: 'brush', apply: (d) => angledStrokes(d) },
  { id: 'crosshatch', label: "Crosshatch", category: 'brush', apply: (d) => crosshatch(d) },
  { id: 'darkStrokes', label: "Dark Strokes", category: 'brush', apply: (d) => darkStrokes(d) },
  { id: 'inkOutlines', label: "Ink Outlines", category: 'brush', apply: (d) => inkOutlines(d) },
  { id: 'spatter', label: "Spatter", category: 'brush', apply: (d) => spatter(d) },
  { id: 'sprayedStrokes', label: "Sprayed Strokes", category: 'brush', apply: (d) => sprayedStrokes(d) },
  { id: 'sumie', label: "Sumi-e", category: 'brush', apply: (d) => sumie(d) },
];
