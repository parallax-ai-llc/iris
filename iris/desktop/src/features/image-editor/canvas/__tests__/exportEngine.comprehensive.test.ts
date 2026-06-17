/**
 * Comprehensive Export Engine Tests
 *
 * Covers: formatExport.ts (WebP, RGB TIFF, BMP), cmykExport.ts (CMYK TIFF),
 * colorProfile.ts (RGB-CMYK conversion), and download helpers.
 *
 * Note: SVG import/export and PDF export are not implemented in the current
 * codebase (canvas-based editor). Tests focus on the binary export engines
 * that DO exist: TIFF (RGB/CMYK), BMP, WebP, and color space handling.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  exportAsRgbTiff,
  exportAsBmp,
  exportAsWebP,
  downloadBlob,
  downloadBytes,
} from '../formatExport';
import { exportCmykTiff } from '../cmykExport';
import { rgbToCmyk, cmykToRgb, BUILTIN_PROFILES } from '../colorProfile';

// ==================== Helpers ====================

function createTestImageData(w: number, h: number, fill?: { r: number; g: number; b: number; a: number }): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    if (fill) {
      data[i * 4] = fill.r;
      data[i * 4 + 1] = fill.g;
      data[i * 4 + 2] = fill.b;
      data[i * 4 + 3] = fill.a;
    } else {
      data[i * 4] = (i * 37) % 256;
      data[i * 4 + 1] = (i * 73) % 256;
      data[i * 4 + 2] = (i * 113) % 256;
      data[i * 4 + 3] = 255;
    }
  }
  return new ImageData(data, w, h);
}

function readTiffTag(view: DataView, tagIndex: number): { id: number; type: number; count: number; value: number } {
  const offset = 10 + tagIndex * 12;
  return {
    id: view.getUint16(offset, true),
    type: view.getUint16(offset + 2, true),
    count: view.getUint32(offset + 4, true),
    value: view.getUint32(offset + 8, true),
  };
}

// ==================== RGB TIFF Export (Advanced) ====================

describe('exportAsRgbTiff (comprehensive)', () => {
  it('should produce a valid TIFF with II magic and version 42', () => {
    const result = exportAsRgbTiff(createTestImageData(4, 4));
    const view = new DataView(result.buffer);

    expect(result[0]).toBe(0x49);
    expect(result[1]).toBe(0x49);
    expect(view.getUint16(2, true)).toBe(42);
  });

  it('should have IFD at offset 8', () => {
    const result = exportAsRgbTiff(createTestImageData(4, 4));
    const view = new DataView(result.buffer);
    expect(view.getUint32(4, true)).toBe(8);
  });

  it('should store 13 IFD tags', () => {
    const result = exportAsRgbTiff(createTestImageData(4, 4));
    const view = new DataView(result.buffer);
    expect(view.getUint16(8, true)).toBe(13);
  });

  it('should store correct width and height', () => {
    const result = exportAsRgbTiff(createTestImageData(15, 7));
    const view = new DataView(result.buffer);

    const widthTag = readTiffTag(view, 0);
    const heightTag = readTiffTag(view, 1);
    expect(widthTag.id).toBe(256);
    expect(widthTag.value).toBe(15);
    expect(heightTag.id).toBe(257);
    expect(heightTag.value).toBe(7);
  });

  it('should set compression to none (1)', () => {
    const result = exportAsRgbTiff(createTestImageData(4, 4));
    const view = new DataView(result.buffer);

    const tag = readTiffTag(view, 3); // compression tag
    expect(tag.id).toBe(259);
    expect(tag.value).toBe(1);
  });

  it('should set photometric interpretation to RGB (2)', () => {
    const result = exportAsRgbTiff(createTestImageData(4, 4));
    const view = new DataView(result.buffer);

    const tag = readTiffTag(view, 4);
    expect(tag.id).toBe(262);
    expect(tag.value).toBe(2);
  });

  it('should set samples per pixel to 3', () => {
    const result = exportAsRgbTiff(createTestImageData(4, 4));
    const view = new DataView(result.buffer);

    const tag = readTiffTag(view, 6);
    expect(tag.id).toBe(277);
    expect(tag.value).toBe(3);
  });

  it('should set correct strip byte count (w * h * 3)', () => {
    const w = 6, h = 4;
    const result = exportAsRgbTiff(createTestImageData(w, h));
    const view = new DataView(result.buffer);

    const tag = readTiffTag(view, 8); // StripByteCounts
    expect(tag.id).toBe(279);
    expect(tag.value).toBe(w * h * 3);
  });

  it('should store resolution unit as inches (2)', () => {
    const result = exportAsRgbTiff(createTestImageData(4, 4));
    const view = new DataView(result.buffer);

    const tag = readTiffTag(view, 11); // ResolutionUnit
    expect(tag.id).toBe(296);
    expect(tag.value).toBe(2);
  });

  it('should embed DPI in X and Y resolution tags', () => {
    const result = exportAsRgbTiff(createTestImageData(2, 2), 150);
    const view = new DataView(result.buffer);

    const xResTag = readTiffTag(view, 9);
    const yResTag = readTiffTag(view, 10);
    const xDpi = view.getUint32(xResTag.value, true);
    const yDpi = view.getUint32(yResTag.value, true);
    expect(xDpi).toBe(150);
    expect(yDpi).toBe(150);
  });

  it('should embed software tag', () => {
    const result = exportAsRgbTiff(createTestImageData(2, 2));
    const view = new DataView(result.buffer);

    const tag = readTiffTag(view, 12); // Software
    expect(tag.id).toBe(305);
    // Read the string from the offset
    const offset = tag.value;
    const chars: string[] = [];
    for (let i = 0; i < tag.count - 1; i++) { // exclude null terminator
      chars.push(String.fromCharCode(result[offset + i]));
    }
    expect(chars.join('')).toBe('Iris Desktop Image Editor');
  });

  it('should strip alpha channel correctly for known pixel', () => {
    const img = createTestImageData(1, 1, { r: 100, g: 150, b: 200, a: 255 });
    const result = exportAsRgbTiff(img);
    const view = new DataView(result.buffer);

    const stripOffset = readTiffTag(view, 5).value;
    expect(result[stripOffset]).toBe(100);
    expect(result[stripOffset + 1]).toBe(150);
    expect(result[stripOffset + 2]).toBe(200);
  });

  it('should produce correct total file size', () => {
    const w = 3, h = 2;
    const result = exportAsRgbTiff(createTestImageData(w, h));
    const view = new DataView(result.buffer);

    const stripOffset = readTiffTag(view, 5).value;
    expect(result.length).toBe(stripOffset + w * h * 3);
  });

  it('should handle 1x1 image', () => {
    const result = exportAsRgbTiff(createTestImageData(1, 1));
    expect(result.length).toBeGreaterThan(8);
    expect(result[0]).toBe(0x49);
  });

  it('should handle large image dimensions', () => {
    const result = exportAsRgbTiff(createTestImageData(100, 100));
    const view = new DataView(result.buffer);

    expect(readTiffTag(view, 0).value).toBe(100);
    expect(readTiffTag(view, 1).value).toBe(100);
  });

  it('should not mutate input ImageData', () => {
    const img = createTestImageData(4, 4);
    const origData = new Uint8ClampedArray(img.data);

    exportAsRgbTiff(img);

    expect(img.data).toEqual(origData);
  });
});

// ==================== BMP Export (Advanced) ====================

describe('exportAsBmp (comprehensive)', () => {
  it('should produce BM magic bytes', () => {
    const result = exportAsBmp(createTestImageData(2, 2));
    expect(result[0]).toBe(0x42);
    expect(result[1]).toBe(0x4d);
  });

  it('should have correct file size in header', () => {
    const w = 5, h = 3;
    const result = exportAsBmp(createTestImageData(w, h));
    const view = new DataView(result.buffer);
    expect(view.getUint32(2, true)).toBe(result.length);
  });

  it('should set pixel data offset to 54', () => {
    const result = exportAsBmp(createTestImageData(2, 2));
    const view = new DataView(result.buffer);
    expect(view.getUint32(10, true)).toBe(54);
  });

  it('should store correct dimensions', () => {
    const result = exportAsBmp(createTestImageData(13, 7));
    const view = new DataView(result.buffer);
    expect(view.getInt32(18, true)).toBe(13);
    expect(view.getInt32(22, true)).toBe(7);
  });

  it('should set 24 bpp and no compression', () => {
    const result = exportAsBmp(createTestImageData(2, 2));
    const view = new DataView(result.buffer);
    expect(view.getUint16(28, true)).toBe(24);
    expect(view.getUint32(30, true)).toBe(0);
  });

  it('should store BGR pixel order', () => {
    const img = createTestImageData(1, 1, { r: 255, g: 128, b: 64, a: 255 });
    const result = exportAsBmp(img);

    expect(result[54]).toBe(64);  // B
    expect(result[55]).toBe(128); // G
    expect(result[56]).toBe(255); // R
  });

  it('should store rows bottom-to-top', () => {
    const img = createTestImageData(1, 2);
    // Top row: red
    img.data[0] = 255; img.data[1] = 0; img.data[2] = 0; img.data[3] = 255;
    // Bottom row: blue
    img.data[4] = 0; img.data[5] = 0; img.data[6] = 255; img.data[7] = 255;

    const result = exportAsBmp(img);

    // stride for width=1: 3 bytes + 1 pad = 4
    // First file row (offset 54) = bottom image row (blue)
    expect(result[54]).toBe(255); // B
    expect(result[55]).toBe(0);   // G
    expect(result[56]).toBe(0);   // R

    // Second file row (offset 58) = top image row (red)
    expect(result[58]).toBe(0);   // B
    expect(result[59]).toBe(0);   // G
    expect(result[60]).toBe(255); // R
  });

  it('should pad rows to 4-byte boundaries', () => {
    // Width 1: 3 bytes + 1 pad = 4
    const r1 = exportAsBmp(createTestImageData(1, 1));
    expect(new DataView(r1.buffer).getUint32(34, true)).toBe(4);

    // Width 2: 6 bytes + 2 pad = 8
    const r2 = exportAsBmp(createTestImageData(2, 1));
    expect(new DataView(r2.buffer).getUint32(34, true)).toBe(8);

    // Width 3: 9 bytes + 3 pad = 12
    const r3 = exportAsBmp(createTestImageData(3, 1));
    expect(new DataView(r3.buffer).getUint32(34, true)).toBe(12);

    // Width 4: 12 bytes + 0 pad = 12
    const r4 = exportAsBmp(createTestImageData(4, 1));
    expect(new DataView(r4.buffer).getUint32(34, true)).toBe(12);
  });

  it('should not mutate input ImageData', () => {
    const img = createTestImageData(4, 4);
    const origData = new Uint8ClampedArray(img.data);

    exportAsBmp(img);

    expect(img.data).toEqual(origData);
  });

  it('should handle 1x1 image', () => {
    const result = exportAsBmp(createTestImageData(1, 1));
    expect(result.length).toBe(54 + 4); // header + 1 row padded
  });

  it('should set DPI to ~72 (2835 pixels/meter)', () => {
    const result = exportAsBmp(createTestImageData(2, 2));
    const view = new DataView(result.buffer);
    expect(view.getInt32(38, true)).toBe(2835);
    expect(view.getInt32(42, true)).toBe(2835);
  });

  it('should set color planes to 1', () => {
    const result = exportAsBmp(createTestImageData(2, 2));
    const view = new DataView(result.buffer);
    expect(view.getUint16(26, true)).toBe(1);
  });
});

// ==================== CMYK TIFF Export ====================

describe('exportCmykTiff', () => {
  it('should produce valid TIFF header', () => {
    const result = exportCmykTiff(createTestImageData(2, 2));
    expect(result[0]).toBe(0x49);
    expect(result[1]).toBe(0x49);
    const view = new DataView(result.buffer);
    expect(view.getUint16(2, true)).toBe(42);
  });

  it('should have 14 IFD tags', () => {
    const result = exportCmykTiff(createTestImageData(2, 2));
    const view = new DataView(result.buffer);
    expect(view.getUint16(8, true)).toBe(14);
  });

  it('should set photometric to CMYK Separated (5)', () => {
    const result = exportCmykTiff(createTestImageData(2, 2));
    const view = new DataView(result.buffer);

    // Tag 4: PhotometricInterpretation
    const tag = readTiffTag(view, 4);
    expect(tag.id).toBe(262);
    expect(tag.value).toBe(5);
  });

  it('should set samples per pixel to 4', () => {
    const result = exportCmykTiff(createTestImageData(2, 2));
    const view = new DataView(result.buffer);

    const tag = readTiffTag(view, 6);
    expect(tag.id).toBe(277);
    expect(tag.value).toBe(4);
  });

  it('should set InkSet to CMYK (1)', () => {
    const result = exportCmykTiff(createTestImageData(2, 2));
    const view = new DataView(result.buffer);

    // Tag 12: InkSet (tag 332)
    const tag = readTiffTag(view, 12);
    expect(tag.id).toBe(332);
    expect(tag.value).toBe(1);
  });

  it('should store correct dimensions', () => {
    const result = exportCmykTiff(createTestImageData(8, 5));
    const view = new DataView(result.buffer);

    expect(readTiffTag(view, 0).value).toBe(8);
    expect(readTiffTag(view, 1).value).toBe(5);
  });

  it('should respect custom DPI', () => {
    const result = exportCmykTiff(createTestImageData(2, 2), 300);
    const view = new DataView(result.buffer);

    const xResTag = readTiffTag(view, 9);
    expect(view.getUint32(xResTag.value, true)).toBe(300);
  });

  it('should have strip byte count of w * h * 4', () => {
    const w = 5, h = 3;
    const result = exportCmykTiff(createTestImageData(w, h));
    const view = new DataView(result.buffer);

    const tag = readTiffTag(view, 8);
    expect(tag.id).toBe(279);
    expect(tag.value).toBe(w * h * 4);
  });

  it('should not mutate input ImageData', () => {
    const img = createTestImageData(4, 4);
    const origData = new Uint8ClampedArray(img.data);

    exportCmykTiff(img);

    expect(img.data).toEqual(origData);
  });

  it('should produce correct total file size', () => {
    const w = 3, h = 2;
    const result = exportCmykTiff(createTestImageData(w, h));
    const view = new DataView(result.buffer);

    const stripOffset = readTiffTag(view, 5).value;
    expect(result.length).toBe(stripOffset + w * h * 4);
  });
});

// ==================== Color Space Handling ====================

describe('rgbToCmyk', () => {
  it('should convert pure red correctly', () => {
    const cmyk = rgbToCmyk(255, 0, 0);
    expect(cmyk.c).toBe(0);
    expect(cmyk.m).toBe(100);
    expect(cmyk.y).toBe(100);
    expect(cmyk.k).toBe(0);
  });

  it('should convert pure green correctly', () => {
    const cmyk = rgbToCmyk(0, 255, 0);
    expect(cmyk.c).toBe(100);
    expect(cmyk.m).toBe(0);
    expect(cmyk.y).toBe(100);
    expect(cmyk.k).toBe(0);
  });

  it('should convert pure blue correctly', () => {
    const cmyk = rgbToCmyk(0, 0, 255);
    expect(cmyk.c).toBe(100);
    expect(cmyk.m).toBe(100);
    expect(cmyk.y).toBe(0);
    expect(cmyk.k).toBe(0);
  });

  it('should convert white correctly', () => {
    const cmyk = rgbToCmyk(255, 255, 255);
    expect(cmyk.c).toBe(0);
    expect(cmyk.m).toBe(0);
    expect(cmyk.y).toBe(0);
    expect(cmyk.k).toBe(0);
  });

  it('should convert black correctly', () => {
    const cmyk = rgbToCmyk(0, 0, 0);
    expect(cmyk.c).toBe(0);
    expect(cmyk.m).toBe(0);
    expect(cmyk.y).toBe(0);
    expect(cmyk.k).toBe(100);
  });

  it('should handle mid-gray', () => {
    const cmyk = rgbToCmyk(128, 128, 128);
    expect(cmyk.k).toBeGreaterThan(0);
    expect(cmyk.c).toBe(0);
    expect(cmyk.m).toBe(0);
    expect(cmyk.y).toBe(0);
  });

  it('should return values in 0-100 range', () => {
    const cmyk = rgbToCmyk(100, 150, 200);
    expect(cmyk.c).toBeGreaterThanOrEqual(0);
    expect(cmyk.c).toBeLessThanOrEqual(100);
    expect(cmyk.m).toBeGreaterThanOrEqual(0);
    expect(cmyk.m).toBeLessThanOrEqual(100);
    expect(cmyk.y).toBeGreaterThanOrEqual(0);
    expect(cmyk.y).toBeLessThanOrEqual(100);
    expect(cmyk.k).toBeGreaterThanOrEqual(0);
    expect(cmyk.k).toBeLessThanOrEqual(100);
  });
});

describe('cmykToRgb', () => {
  it('should convert CMYK white to RGB white', () => {
    const rgb = cmykToRgb(0, 0, 0, 0);
    expect(rgb.r).toBe(255);
    expect(rgb.g).toBe(255);
    expect(rgb.b).toBe(255);
  });

  it('should convert CMYK black to RGB black', () => {
    const rgb = cmykToRgb(0, 0, 0, 100);
    expect(rgb.r).toBe(0);
    expect(rgb.g).toBe(0);
    expect(rgb.b).toBe(0);
  });

  it('should convert pure cyan to RGB', () => {
    const rgb = cmykToRgb(100, 0, 0, 0);
    expect(rgb.r).toBe(0);
    expect(rgb.g).toBe(255);
    expect(rgb.b).toBe(255);
  });

  it('should convert pure magenta to RGB', () => {
    const rgb = cmykToRgb(0, 100, 0, 0);
    expect(rgb.r).toBe(255);
    expect(rgb.g).toBe(0);
    expect(rgb.b).toBe(255);
  });

  it('should convert pure yellow to RGB', () => {
    const rgb = cmykToRgb(0, 0, 100, 0);
    expect(rgb.r).toBe(255);
    expect(rgb.g).toBe(255);
    expect(rgb.b).toBe(0);
  });

  it('should return values in 0-255 range', () => {
    const rgb = cmykToRgb(30, 50, 70, 20);
    expect(rgb.r).toBeGreaterThanOrEqual(0);
    expect(rgb.r).toBeLessThanOrEqual(255);
    expect(rgb.g).toBeGreaterThanOrEqual(0);
    expect(rgb.g).toBeLessThanOrEqual(255);
    expect(rgb.b).toBeGreaterThanOrEqual(0);
    expect(rgb.b).toBeLessThanOrEqual(255);
  });
});

describe('RGB-CMYK round trip', () => {
  it('should approximately round-trip for primary colors', () => {
    const colors = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
      { r: 255, g: 255, b: 0 },
      { r: 0, g: 255, b: 255 },
      { r: 255, g: 0, b: 255 },
    ];

    for (const { r, g, b } of colors) {
      const cmyk = rgbToCmyk(r, g, b);
      const back = cmykToRgb(cmyk.c, cmyk.m, cmyk.y, cmyk.k);
      expect(Math.abs(back.r - r)).toBeLessThanOrEqual(3);
      expect(Math.abs(back.g - g)).toBeLessThanOrEqual(3);
      expect(Math.abs(back.b - b)).toBeLessThanOrEqual(3);
    }
  });

  it('should round-trip white and black exactly', () => {
    const whiteCmyk = rgbToCmyk(255, 255, 255);
    const whiteBack = cmykToRgb(whiteCmyk.c, whiteCmyk.m, whiteCmyk.y, whiteCmyk.k);
    expect(whiteBack).toEqual({ r: 255, g: 255, b: 255 });

    const blackCmyk = rgbToCmyk(0, 0, 0);
    const blackBack = cmykToRgb(blackCmyk.c, blackCmyk.m, blackCmyk.y, blackCmyk.k);
    expect(blackBack).toEqual({ r: 0, g: 0, b: 0 });
  });
});

// ==================== Built-in Color Profiles ====================

describe('BUILTIN_PROFILES', () => {
  it('should have at least 5 built-in profiles', () => {
    expect(BUILTIN_PROFILES.length).toBeGreaterThanOrEqual(5);
  });

  it('should include sRGB profile', () => {
    const srgb = BUILTIN_PROFILES.find((p) => p.colorSpace === 'sRGB');
    expect(srgb).toBeDefined();
    expect(srgb!.name).toContain('sRGB');
  });

  it('should include AdobeRGB profile', () => {
    const adobeRgb = BUILTIN_PROFILES.find((p) => p.colorSpace === 'AdobeRGB');
    expect(adobeRgb).toBeDefined();
  });

  it('should include CMYK profiles', () => {
    const cmykProfiles = BUILTIN_PROFILES.filter((p) => p.colorSpace === 'CMYK');
    expect(cmykProfiles.length).toBeGreaterThanOrEqual(2);
  });

  it('should have valid rendering intents', () => {
    const validIntents = ['perceptual', 'relative-colorimetric', 'saturation', 'absolute-colorimetric'];
    for (const profile of BUILTIN_PROFILES) {
      expect(validIntents).toContain(profile.renderingIntent);
    }
  });
});

// ==================== WebP Export ====================

describe('exportAsWebP', () => {
  it('should be a function', () => {
    expect(typeof exportAsWebP).toBe('function');
  });

  // In jsdom, canvas.toBlob may succeed with a Blob or fail with null.
  // We verify the function returns a promise in all cases.
  it('should return a promise', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;

    const result = exportAsWebP(canvas);
    expect(result).toBeInstanceOf(Promise);
  });
});

// ==================== Download Helpers ====================

describe('downloadBlob', () => {
  it('should create and click a download link', () => {
    const blob = new Blob(['test'], { type: 'text/plain' });

    // Mock URL methods
    const mockUrl = 'blob:mock-url';
    vi.spyOn(URL, 'createObjectURL').mockReturnValue(mockUrl);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    downloadBlob(blob, 'test.txt');

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockUrl);

    vi.restoreAllMocks();
  });
});

describe('downloadBytes', () => {
  it('should create a blob and trigger download', () => {
    const data = new Uint8Array([1, 2, 3]);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    expect(() => downloadBytes(data, 'test.bin', 'application/octet-stream')).not.toThrow();

    vi.restoreAllMocks();
  });
});
