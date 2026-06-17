/**
 * Layer Effects Library
 * Drop shadow, glow, bevel, and other layer style effects
 */

import type {
  DropShadowSettings,
  GlowSettings,
  BevelSettings,
  StrokeSettings,
  ColorOverlaySettings,
  GradientOverlaySettings,
  PatternOverlaySettings,
  SatinSettings,
  LayerEffect,
} from '@/features/image-editor/stores/imageEditor.store';
import { createOffscreenCanvas } from './canvasEngine';
import { hexToRgb } from './colorUtils';
import { gaussianBlur } from './filters';

// ==================== Drop Shadow ====================

/**
 * Apply drop shadow effect to a layer
 */
export function applyDropShadow(
  sourceCanvas: HTMLCanvasElement,
  settings: DropShadowSettings
): HTMLCanvasElement {
  const { width, height } = sourceCanvas;
  const { color, offsetX, offsetY, blur, spread, opacity } = settings;

  // Create result canvas with extra space for shadow
  const padding = Math.ceil(blur * 2 + spread + Math.max(Math.abs(offsetX), Math.abs(offsetY)));
  const resultWidth = width + padding * 2;
  const resultHeight = height + padding * 2;

  const { canvas: result, ctx } = createOffscreenCanvas(resultWidth, resultHeight);
  const { r, g, b } = hexToRgb(color);

  // Create shadow canvas
  const { canvas: shadowCanvas, ctx: shadowCtx } = createOffscreenCanvas(resultWidth, resultHeight);

  // Draw source at offset position
  shadowCtx.drawImage(sourceCanvas, padding + offsetX, padding + offsetY);

  // Get image data and colorize
  const imageData = shadowCtx.getImageData(0, 0, resultWidth, resultHeight);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const alpha = imageData.data[i + 3];
    if (alpha > 0) {
      imageData.data[i] = r;
      imageData.data[i + 1] = g;
      imageData.data[i + 2] = b;
      // Apply spread (expand shadow)
      if (spread > 0) {
        imageData.data[i + 3] = Math.min(255, alpha + spread * 2);
      }
    }
  }

  // Apply blur to shadow
  let blurredData = imageData;
  if (blur > 0) {
    blurredData = gaussianBlur(imageData, blur);
  }

  // Apply opacity
  for (let i = 0; i < blurredData.data.length; i += 4) {
    blurredData.data[i + 3] = Math.round(blurredData.data[i + 3] * (opacity / 100));
  }

  shadowCtx.putImageData(blurredData, 0, 0);

  // Composite: shadow first, then source
  ctx.drawImage(shadowCanvas, 0, 0);
  ctx.drawImage(sourceCanvas, padding, padding);

  return result;
}

// ==================== Inner Shadow ====================

/**
 * Apply inner shadow effect
 */
export function applyInnerShadow(
  sourceCanvas: HTMLCanvasElement,
  settings: DropShadowSettings
): HTMLCanvasElement {
  const { width, height } = sourceCanvas;
  const { color, offsetX, offsetY, blur, opacity } = settings;

  const { canvas: result, ctx } = createOffscreenCanvas(width, height);
  hexToRgb(color); // Validate color format

  // Draw original
  ctx.drawImage(sourceCanvas, 0, 0);

  // Create inverted mask
  const { canvas: shadowCanvas, ctx: shadowCtx } = createOffscreenCanvas(width, height);

  // Fill with color
  shadowCtx.fillStyle = color;
  shadowCtx.fillRect(0, 0, width, height);

  // Cut out the shape (inverted)
  shadowCtx.globalCompositeOperation = 'destination-out';
  shadowCtx.drawImage(sourceCanvas, -offsetX, -offsetY);

  // Blur the shadow
  if (blur > 0) {
    const imageData = shadowCtx.getImageData(0, 0, width, height);
    const blurred = gaussianBlur(imageData, blur);
    shadowCtx.putImageData(blurred, 0, 0);
  }

  // Apply shadow only inside original shape
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = opacity / 100;
  ctx.drawImage(shadowCanvas, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  return result;
}

// ==================== Outer Glow ====================

/**
 * Apply outer glow effect
 */
export function applyOuterGlow(
  sourceCanvas: HTMLCanvasElement,
  settings: GlowSettings
): HTMLCanvasElement {
  const { width, height } = sourceCanvas;
  const { color, size, opacity } = settings;

  // Create result canvas with extra space for glow
  const padding = Math.ceil(size * 2);
  const resultWidth = width + padding * 2;
  const resultHeight = height + padding * 2;

  const { canvas: result, ctx } = createOffscreenCanvas(resultWidth, resultHeight);
  const { r, g, b } = hexToRgb(color);

  // Create glow canvas
  const { canvas: glowCanvas, ctx: glowCtx } = createOffscreenCanvas(resultWidth, resultHeight);

  // Draw source at center
  glowCtx.drawImage(sourceCanvas, padding, padding);

  // Get image data and colorize
  const imageData = glowCtx.getImageData(0, 0, resultWidth, resultHeight);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const alpha = imageData.data[i + 3];
    if (alpha > 0) {
      imageData.data[i] = r;
      imageData.data[i + 1] = g;
      imageData.data[i + 2] = b;
    }
  }

  // Apply blur for glow
  const blurred = gaussianBlur(imageData, size);

  // Apply opacity
  for (let i = 0; i < blurred.data.length; i += 4) {
    blurred.data[i + 3] = Math.round(blurred.data[i + 3] * (opacity / 100));
  }

  glowCtx.putImageData(blurred, 0, 0);

  // Composite: glow first, then source
  ctx.drawImage(glowCanvas, 0, 0);
  ctx.drawImage(sourceCanvas, padding, padding);

  return result;
}

// ==================== Inner Glow ====================

/**
 * Apply inner glow effect
 */
export function applyInnerGlow(
  sourceCanvas: HTMLCanvasElement,
  settings: GlowSettings
): HTMLCanvasElement {
  const { width, height } = sourceCanvas;
  const { color, size, opacity } = settings;

  const { canvas: result, ctx } = createOffscreenCanvas(width, height);

  // Draw original
  ctx.drawImage(sourceCanvas, 0, 0);

  // Create edge glow
  const { canvas: glowCanvas, ctx: glowCtx } = createOffscreenCanvas(width, height);

  // Draw white shape
  glowCtx.drawImage(sourceCanvas, 0, 0);

  // Shrink the shape to create inner edge
  const imageData = glowCtx.getImageData(0, 0, width, height);
  const edgeData = new ImageData(width, height);
  const { r, g, b } = hexToRgb(color);

  // Detect edges (pixels that are near transparent pixels)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = imageData.data[idx + 3];

      if (alpha > 0) {
        // Check if near edge
        let isEdge = false;
        for (let dy = -1; dy <= 1 && !isEdge; dy++) {
          for (let dx = -1; dx <= 1 && !isEdge; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = (ny * width + nx) * 4;
              if (imageData.data[nIdx + 3] === 0) {
                isEdge = true;
              }
            }
          }
        }

        if (isEdge) {
          edgeData.data[idx] = r;
          edgeData.data[idx + 1] = g;
          edgeData.data[idx + 2] = b;
          edgeData.data[idx + 3] = 255;
        }
      }
    }
  }

  // Blur the edge
  const blurred = gaussianBlur(edgeData, size);

  // Apply opacity
  for (let i = 0; i < blurred.data.length; i += 4) {
    blurred.data[i + 3] = Math.round(blurred.data[i + 3] * (opacity / 100));
  }

  glowCtx.putImageData(blurred, 0, 0);

  // Apply glow inside original shape
  ctx.globalCompositeOperation = 'source-atop';
  ctx.drawImage(glowCanvas, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  return result;
}

// ==================== Bevel and Emboss ====================

/**
 * Apply bevel effect
 */
export function applyBevel(
  sourceCanvas: HTMLCanvasElement,
  settings: BevelSettings
): HTMLCanvasElement {
  const { width, height } = sourceCanvas;
  const { style, depth, softness, angle, highlightColor, shadowColor } = settings;

  const { canvas: result, ctx } = createOffscreenCanvas(width, height);

  // Draw original
  ctx.drawImage(sourceCanvas, 0, 0);

  // Calculate light direction
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  // Create highlight and shadow layers
  const { canvas: highlightCanvas, ctx: highlightCtx } = createOffscreenCanvas(width, height);
  const { canvas: shadowCanvas, ctx: shadowCtx } = createOffscreenCanvas(width, height);

  const hRgb = hexToRgb(highlightColor);
  const sRgb = hexToRgb(shadowColor);

  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceCtx) return result;

  const sourceData = sourceCtx.getImageData(0, 0, width, height);
  const highlightData = new ImageData(width, height);
  const shadowData = new ImageData(width, height);

  // Generate bevel based on edge detection
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = sourceData.data[idx + 3];

      if (alpha > 0) {
        // Calculate gradient in light direction
        let gradient = 0;
        const checkDist = Math.ceil(depth);

        for (let d = 1; d <= checkDist; d++) {
          const hx = Math.round(x + dx * d);
          const hy = Math.round(y + dy * d);
          const sx = Math.round(x - dx * d);
          const sy = Math.round(y - dy * d);

          let hAlpha = 0, sAlpha = 0;

          if (hx >= 0 && hx < width && hy >= 0 && hy < height) {
            hAlpha = sourceData.data[(hy * width + hx) * 4 + 3];
          }
          if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
            sAlpha = sourceData.data[(sy * width + sx) * 4 + 3];
          }

          if (style === 'outer' || style === 'emboss') {
            if (hAlpha === 0) gradient += depth / checkDist;
            if (sAlpha === 0) gradient -= depth / checkDist;
          } else {
            // Inner bevel
            if (hAlpha > 0 && alpha > 0) gradient += depth / checkDist;
            if (sAlpha > 0 && alpha > 0) gradient -= depth / checkDist;
          }
        }

        // Apply highlight or shadow based on gradient
        if (gradient > 0) {
          const intensity = Math.min(1, gradient / depth);
          highlightData.data[idx] = hRgb.r;
          highlightData.data[idx + 1] = hRgb.g;
          highlightData.data[idx + 2] = hRgb.b;
          highlightData.data[idx + 3] = Math.round(intensity * 255);
        } else if (gradient < 0) {
          const intensity = Math.min(1, -gradient / depth);
          shadowData.data[idx] = sRgb.r;
          shadowData.data[idx + 1] = sRgb.g;
          shadowData.data[idx + 2] = sRgb.b;
          shadowData.data[idx + 3] = Math.round(intensity * 255);
        }
      }
    }
  }

  // Apply softness (blur)
  let finalHighlight = highlightData;
  let finalShadow = shadowData;
  if (softness > 0) {
    finalHighlight = gaussianBlur(highlightData, softness);
    finalShadow = gaussianBlur(shadowData, softness);
  }

  highlightCtx.putImageData(finalHighlight, 0, 0);
  shadowCtx.putImageData(finalShadow, 0, 0);

  // Composite bevel effect
  if (style === 'outer') {
    ctx.globalCompositeOperation = 'source-over';
  } else {
    ctx.globalCompositeOperation = 'source-atop';
  }

  ctx.drawImage(shadowCanvas, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(highlightCanvas, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  return result;
}

// ==================== Stroke ====================

/**
 * Apply stroke (outline) effect to a layer.
 *
 * Performance: Uses alpha-channel dilation via a pre-computed circular kernel
 * instead of O(size²) drawImage calls. For a stroke size of 20, this reduces
 * from ~1257 drawImage calls to a single-pass pixel operation.
 */
export function applyStroke(
  sourceCanvas: HTMLCanvasElement,
  settings: StrokeSettings
): HTMLCanvasElement {
  const { width, height } = sourceCanvas;
  const { color, size, position, opacity } = settings;
  const padding = position === 'outside' ? size : 0;
  const resultWidth = width + padding * 2;
  const resultHeight = height + padding * 2;

  const { canvas: result, ctx } = createOffscreenCanvas(resultWidth, resultHeight);

  // Extract source alpha into a padded buffer
  const { ctx: srcCtx } = createOffscreenCanvas(resultWidth, resultHeight, true);
  srcCtx.drawImage(sourceCanvas, padding, padding);
  const srcData = srcCtx.getImageData(0, 0, resultWidth, resultHeight);

  // Build circular kernel offsets
  const kernel: Array<{ dx: number; dy: number }> = [];
  for (let dy = -size; dy <= size; dy++) {
    for (let dx = -size; dx <= size; dx++) {
      if (dx * dx + dy * dy <= size * size) {
        kernel.push({ dx, dy });
      }
    }
  }

  // Dilate alpha channel: for each pixel, max alpha in the kernel neighborhood
  const dilated = new Uint8ClampedArray(resultWidth * resultHeight);
  for (let y = 0; y < resultHeight; y++) {
    for (let x = 0; x < resultWidth; x++) {
      let maxAlpha = 0;
      for (const { dx, dy } of kernel) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < resultWidth && ny >= 0 && ny < resultHeight) {
          const a = srcData.data[((ny * resultWidth + nx) * 4) + 3];
          if (a > maxAlpha) {
            maxAlpha = a;
            if (maxAlpha === 255) break; // early exit
          }
        }
      }
      dilated[y * resultWidth + x] = maxAlpha;
    }
  }

  // Build stroke canvas from dilated alpha
  const { canvas: strokeCanvas, ctx: strokeCtx } = createOffscreenCanvas(resultWidth, resultHeight);
  const strokeData = strokeCtx.createImageData(resultWidth, resultHeight);
  const { r, g, b } = hexToRgb(color);
  const alphaMultiplier = opacity / 100;

  for (let i = 0; i < dilated.length; i++) {
    if (dilated[i] > 0) {
      const pi = i * 4;
      strokeData.data[pi] = r;
      strokeData.data[pi + 1] = g;
      strokeData.data[pi + 2] = b;
      strokeData.data[pi + 3] = Math.round(dilated[i] * alphaMultiplier);
    }
  }
  strokeCtx.putImageData(strokeData, 0, 0);

  // Composite stroke and source
  if (position === 'outside') {
    ctx.drawImage(strokeCanvas, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(sourceCanvas, padding, padding);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(sourceCanvas, padding, padding);
  } else if (position === 'inside') {
    ctx.drawImage(sourceCanvas, padding, padding);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.drawImage(strokeCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  } else {
    // center
    ctx.drawImage(strokeCanvas, 0, 0);
    ctx.drawImage(sourceCanvas, padding, padding);
  }

  return result;
}

// ==================== Color Overlay ====================

/**
 * Apply color overlay effect to a layer
 */
export function applyColorOverlay(
  sourceCanvas: HTMLCanvasElement,
  settings: ColorOverlaySettings
): HTMLCanvasElement {
  const { width, height } = sourceCanvas;
  const { color, opacity } = settings;
  const { canvas: result, ctx } = createOffscreenCanvas(width, height);

  // Draw source
  ctx.drawImage(sourceCanvas, 0, 0);

  // Apply color overlay only where source has pixels
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = opacity / 100;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  return result;
}

// ==================== Gradient Overlay ====================

/**
 * Apply gradient overlay effect to a layer
 */
export function applyGradientOverlay(
  sourceCanvas: HTMLCanvasElement,
  settings: GradientOverlaySettings
): HTMLCanvasElement {
  const { width, height } = sourceCanvas;
  const { colors, angle, opacity, style } = settings;
  const { canvas: result, ctx } = createOffscreenCanvas(width, height);

  // Draw source
  ctx.drawImage(sourceCanvas, 0, 0);

  // Create gradient
  let gradient: CanvasGradient;
  if (style === 'radial') {
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.max(width, height) / 2;
    gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  } else {
    // Linear gradient at specified angle
    const rad = (angle * Math.PI) / 180;
    const len = Math.max(width, height);
    const cx = width / 2;
    const cy = height / 2;
    gradient = ctx.createLinearGradient(
      cx - Math.cos(rad) * len / 2,
      cy - Math.sin(rad) * len / 2,
      cx + Math.cos(rad) * len / 2,
      cy + Math.sin(rad) * len / 2
    );
  }

  colors.forEach((c, i) => {
    gradient.addColorStop(i / Math.max(colors.length - 1, 1), c);
  });

  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = opacity / 100;
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  return result;
}

// ==================== Pattern Overlay ====================

/**
 * Apply pattern overlay effect to a layer (sync version using pre-loaded pattern)
 */
export function applyPatternOverlay(
  sourceCanvas: HTMLCanvasElement,
  patternCanvas: HTMLCanvasElement | null,
  settings: PatternOverlaySettings
): HTMLCanvasElement {
  const { width, height } = sourceCanvas;
  const { opacity, scale } = settings;
  const { canvas: result, ctx } = createOffscreenCanvas(width, height);

  ctx.drawImage(sourceCanvas, 0, 0);

  if (patternCanvas) {
    const patternW = patternCanvas.width * (scale / 100);
    const patternH = patternCanvas.height * (scale / 100);

    // Tile pattern
    const { canvas: tileCanvas, ctx: tileCtx } = createOffscreenCanvas(width, height);
    for (let x = 0; x < width; x += patternW) {
      for (let y = 0; y < height; y += patternH) {
        tileCtx.drawImage(patternCanvas, x, y, patternW, patternH);
      }
    }

    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = opacity / 100;
    ctx.drawImage(tileCanvas, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  return result;
}

// ==================== Satin ====================

/**
 * Apply satin effect to a layer (internal contour-based shading)
 */
export function applySatin(
  sourceCanvas: HTMLCanvasElement,
  settings: SatinSettings
): HTMLCanvasElement {
  const { width, height } = sourceCanvas;
  const { color, opacity, angle, distance, size } = settings;
  const { canvas: result, ctx } = createOffscreenCanvas(width, height);
  const { r, g, b } = hexToRgb(color);

  // Draw source
  ctx.drawImage(sourceCanvas, 0, 0);

  // Create two offset copies of the alpha channel
  const rad = (angle * Math.PI) / 180;
  const dx = Math.round(Math.cos(rad) * distance);
  const dy = Math.round(Math.sin(rad) * distance);

  const { canvas: offset1, ctx: ctx1 } = createOffscreenCanvas(width, height);
  ctx1.drawImage(sourceCanvas, dx, dy);

  const { ctx: ctx2 } = createOffscreenCanvas(width, height);
  ctx2.drawImage(sourceCanvas, -dx, -dy);

  // XOR the two offset copies to get satin contour
  const data1 = ctx1.getImageData(0, 0, width, height);
  const data2 = ctx2.getImageData(0, 0, width, height);
  const alphaMultiplier = opacity / 100;

  for (let i = 0; i < data1.data.length; i += 4) {
    // XOR of alphas gives the satin contour
    const xorAlpha = Math.abs(data1.data[i + 3] - data2.data[i + 3]);
    data1.data[i] = r;
    data1.data[i + 1] = g;
    data1.data[i + 2] = b;
    data1.data[i + 3] = Math.round(xorAlpha * alphaMultiplier);
  }
  ctx1.putImageData(data1, 0, 0);

  // Blur the satin
  if (size > 0) {
    const satinData = ctx1.getImageData(0, 0, width, height);
    const blurred = gaussianBlur(satinData, size);
    const { canvas: blurredCanvas, ctx: blurredCtx } = createOffscreenCanvas(width, height);
    blurredCtx.putImageData(blurred, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.drawImage(blurredCanvas, 0, 0);
  } else {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.drawImage(offset1, 0, 0);
  }
  ctx.globalCompositeOperation = 'source-over';

  return result;
}

// ==================== Apply All Effects ====================

/** Rendering order for layer effects (Photoshop standard) */
const EFFECT_ORDER: readonly LayerEffect['type'][] = [
  'dropShadow', 'outerGlow', 'innerShadow', 'innerGlow', 'bevel',
  'satin', 'colorOverlay', 'gradientOverlay', 'patternOverlay', 'stroke',
] as const;

/** Effect dispatch map — runtime contract: settings shape matches the effect type key */
type EffectApplicator = (canvas: HTMLCanvasElement, settings: unknown) => HTMLCanvasElement;
const EFFECT_APPLICATORS: Record<LayerEffect['type'], EffectApplicator> = {
  dropShadow:      (c, s) => applyDropShadow(c, s as DropShadowSettings),
  innerShadow:     (c, s) => applyInnerShadow(c, s as DropShadowSettings),
  outerGlow:       (c, s) => applyOuterGlow(c, s as GlowSettings),
  innerGlow:       (c, s) => applyInnerGlow(c, s as GlowSettings),
  bevel:           (c, s) => applyBevel(c, s as BevelSettings),
  stroke:          (c, s) => applyStroke(c, s as StrokeSettings),
  colorOverlay:    (c, s) => applyColorOverlay(c, s as ColorOverlaySettings),
  gradientOverlay: (c, s) => applyGradientOverlay(c, s as GradientOverlaySettings),
  patternOverlay:  (c, s) => applyPatternOverlay(c, null, s as PatternOverlaySettings),
  satin:           (c, s) => applySatin(c, s as SatinSettings),
};

/**
 * Apply all layer effects to a canvas
 */
export function applyLayerEffects(
  sourceCanvas: HTMLCanvasElement,
  effects: LayerEffect[]
): HTMLCanvasElement {
  let result = sourceCanvas;

  // Sort effects by type for correct rendering order
  const sortedEffects = [...effects].sort(
    (a, b) => EFFECT_ORDER.indexOf(a.type) - EFFECT_ORDER.indexOf(b.type)
  );

  for (const effect of sortedEffects) {
    if (!effect.enabled) continue;
    const applicator = EFFECT_APPLICATORS[effect.type];
    if (applicator) {
      result = applicator(result, effect.settings);
    }
  }

  return result;
}

// ==================== Layer Mask Application ====================

/**
 * Apply a mask to a layer (mask is grayscale, white = visible, black = hidden)
 */
export function applyLayerMask(
  sourceCanvas: HTMLCanvasElement,
  maskDataUrl: string
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const maskImg = new Image();
    maskImg.onload = () => {
      const { width, height } = sourceCanvas;
      const { canvas: result, ctx } = createOffscreenCanvas(width, height);

      // Draw source
      ctx.drawImage(sourceCanvas, 0, 0);

      // Create mask canvas
      const { ctx: maskCtx } = createOffscreenCanvas(width, height);
      maskCtx.drawImage(maskImg, 0, 0, width, height);

      // Get data
      const sourceData = ctx.getImageData(0, 0, width, height);
      const maskData = maskCtx.getImageData(0, 0, width, height);

      // Apply mask to alpha
      for (let i = 0; i < sourceData.data.length; i += 4) {
        const maskValue = maskData.data[i]; // Use red channel
        sourceData.data[i + 3] = Math.round((sourceData.data[i + 3] * maskValue) / 255);
      }

      ctx.putImageData(sourceData, 0, 0);
      resolve(result);
    };
    maskImg.onerror = () => reject(new Error('Failed to load mask'));
    maskImg.src = maskDataUrl;
  });
}

/**
 * Apply clipping mask (clip to layer below)
 */
export function applyClippingMask(
  layerCanvas: HTMLCanvasElement,
  clipCanvas: HTMLCanvasElement
): HTMLCanvasElement {
  const { width, height } = layerCanvas;
  const { canvas: result, ctx } = createOffscreenCanvas(width, height);

  // Draw clipping layer first
  ctx.drawImage(clipCanvas, 0, 0);

  // Use source-atop to clip
  ctx.globalCompositeOperation = 'source-atop';
  ctx.drawImage(layerCanvas, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  return result;
}
