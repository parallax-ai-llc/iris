/**
 * Color Profile Utilities - RGB↔CMYK conversion and gamut simulation
 *
 * Canvas API only supports RGB, so CMYK is simulated:
 * - Preview mode: RGB→CMYK→RGB round-trip to show gamut loss
 * - Gamut warning: highlights out-of-gamut pixels with overlay
 * - Export: actual CMYK conversion for print-ready output
 */

// ==================== ICC Profile Types ====================

export interface ICCProfile {
  name: string;
  colorSpace: 'sRGB' | 'AdobeRGB' | 'CMYK';
  description: string;
  /** Rendering intent for color space conversion */
  renderingIntent: 'perceptual' | 'relative-colorimetric' | 'saturation' | 'absolute-colorimetric';
}

export interface CMYKColor {
  c: number; // 0-100
  m: number; // 0-100
  y: number; // 0-100
  k: number; // 0-100
}

export interface RGBColor {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

// ==================== Built-in Profiles ====================

export const BUILTIN_PROFILES: ICCProfile[] = [
  { name: 'sRGB IEC61966-2.1', colorSpace: 'sRGB', description: 'Standard RGB (Web)', renderingIntent: 'perceptual' },
  { name: 'Adobe RGB (1998)', colorSpace: 'AdobeRGB', description: 'Adobe RGB (Photography)', renderingIntent: 'relative-colorimetric' },
  { name: 'U.S. Web Coated (SWOP) v2', colorSpace: 'CMYK', description: 'CMYK for US web press', renderingIntent: 'relative-colorimetric' },
  { name: 'Coated FOGRA39', colorSpace: 'CMYK', description: 'CMYK for European press (ISO 12647-2)', renderingIntent: 'relative-colorimetric' },
  { name: 'Japan Color 2001 Coated', colorSpace: 'CMYK', description: 'CMYK for Japanese press', renderingIntent: 'relative-colorimetric' },
];

// ==================== RGB ↔ CMYK Conversion ====================

/**
 * Convert RGB to CMYK using standard formula.
 * This is a simplified conversion (no ICC profile transform).
 */
export function rgbToCmyk(r: number, g: number, b: number): CMYKColor {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const k = 1 - Math.max(rNorm, gNorm, bNorm);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };

  const c = (1 - rNorm - k) / (1 - k);
  const m = (1 - gNorm - k) / (1 - k);
  const y = (1 - bNorm - k) / (1 - k);

  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100),
  };
}

/**
 * Convert CMYK to RGB.
 */
export function cmykToRgb(c: number, m: number, y: number, k: number): RGBColor {
  const cNorm = c / 100;
  const mNorm = m / 100;
  const yNorm = y / 100;
  const kNorm = k / 100;

  return {
    r: Math.round(255 * (1 - cNorm) * (1 - kNorm)),
    g: Math.round(255 * (1 - mNorm) * (1 - kNorm)),
    b: Math.round(255 * (1 - yNorm) * (1 - kNorm)),
  };
}

// ==================== Gamut Simulation ====================

/**
 * Simulate CMYK gamut loss by round-tripping RGB→CMYK→RGB.
 * The resulting image shows how colors would look after CMYK conversion.
 * This modifies the ImageData in place for performance.
 */
export function applyCmykPreview(imageData: ImageData): void {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const cmyk = rgbToCmyk(data[i], data[i + 1], data[i + 2]);
    const rgb = cmykToRgb(cmyk.c, cmyk.m, cmyk.y, cmyk.k);
    data[i] = rgb.r;
    data[i + 1] = rgb.g;
    data[i + 2] = rgb.b;
    // alpha unchanged
  }
}

/**
 * Check if an RGB color is within CMYK gamut.
 * Out-of-gamut = the round-trip color differs significantly from original.
 */
export function isOutOfGamut(r: number, g: number, b: number, threshold = 3): boolean {
  const cmyk = rgbToCmyk(r, g, b);
  const roundTrip = cmykToRgb(cmyk.c, cmyk.m, cmyk.y, cmyk.k);
  const dr = Math.abs(r - roundTrip.r);
  const dg = Math.abs(g - roundTrip.g);
  const db = Math.abs(b - roundTrip.b);
  return dr > threshold || dg > threshold || db > threshold;
}

/**
 * Generate a gamut warning overlay.
 * Out-of-gamut pixels are highlighted with the warning color (default: bright gray).
 * In-gamut pixels become transparent.
 */
export function generateGamutWarningOverlay(
  imageData: ImageData,
  warningColor: RGBColor = { r: 128, g: 128, b: 128 },
  threshold = 3
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data.length),
    imageData.width,
    imageData.height
  );

  const src = imageData.data;
  const dst = result.data;

  for (let i = 0; i < src.length; i += 4) {
    if (isOutOfGamut(src[i], src[i + 1], src[i + 2], threshold)) {
      dst[i] = warningColor.r;
      dst[i + 1] = warningColor.g;
      dst[i + 2] = warningColor.b;
      dst[i + 3] = 180; // semi-transparent overlay
    }
    // else remains transparent (0,0,0,0)
  }

  return result;
}

// ==================== Batch Export Conversion ====================

/**
 * Convert an entire canvas to CMYK pixel data (4 channels, 0-100 range).
 * Returns a flat Uint8Array [C,M,Y,K, C,M,Y,K, ...] for each pixel.
 * Used for CMYK export (TIFF/PDF).
 */
export function canvasToCmykData(imageData: ImageData): Uint8Array {
  const pixelCount = imageData.width * imageData.height;
  const cmykData = new Uint8Array(pixelCount * 4);
  const src = imageData.data;

  for (let i = 0; i < pixelCount; i++) {
    const si = i * 4;
    const cmyk = rgbToCmyk(src[si], src[si + 1], src[si + 2]);
    const di = i * 4;
    cmykData[di] = cmyk.c;
    cmykData[di + 1] = cmyk.m;
    cmykData[di + 2] = cmyk.y;
    cmykData[di + 3] = cmyk.k;
  }

  return cmykData;
}

/**
 * Get CMYK info text for a single pixel (for Info panel display).
 */
export function getCmykInfo(r: number, g: number, b: number): string {
  const cmyk = rgbToCmyk(r, g, b);
  return `C:${cmyk.c}% M:${cmyk.m}% Y:${cmyk.y}% K:${cmyk.k}%`;
}
