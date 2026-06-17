/**
 * Tests for cmykExport.ts - CMYK TIFF export engine
 */

import { describe, it, expect } from 'vitest';
import { exportCmykTiff } from '../cmykExport';

function createImageData(pixels: number[][], width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i++) {
    data[i * 4] = pixels[i][0];
    data[i * 4 + 1] = pixels[i][1];
    data[i * 4 + 2] = pixels[i][2];
    data[i * 4 + 3] = pixels[i][3];
  }
  return { data, width, height } as ImageData;
}

describe('exportCmykTiff', () => {
  it('returns a Uint8Array', () => {
    const imgData = createImageData([[255, 0, 0, 255]], 1, 1);
    const result = exportCmykTiff(imgData);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('has valid TIFF header (little-endian, version 42)', () => {
    const imgData = createImageData([[0, 0, 0, 255]], 1, 1);
    const result = exportCmykTiff(imgData);
    // "II" = 0x49, 0x49
    expect(result[0]).toBe(0x49);
    expect(result[1]).toBe(0x49);
    // Version 42 (little-endian)
    expect(result[2]).toBe(42);
    expect(result[3]).toBe(0);
  });

  it('has IFD offset at byte 4 pointing to byte 8', () => {
    const imgData = createImageData([[128, 128, 128, 255]], 1, 1);
    const result = exportCmykTiff(imgData);
    const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
    const ifdOffset = view.getUint32(4, true);
    expect(ifdOffset).toBe(8);
  });

  it('encodes correct number of IFD tags', () => {
    const imgData = createImageData([[255, 255, 255, 255]], 1, 1);
    const result = exportCmykTiff(imgData);
    const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
    const numTags = view.getUint16(8, true);
    expect(numTags).toBe(14);
  });

  it('file size is reasonable for a 2x2 image', () => {
    const imgData = createImageData([
      [255, 0, 0, 255], [0, 255, 0, 255],
      [0, 0, 255, 255], [255, 255, 255, 255],
    ], 2, 2);
    const result = exportCmykTiff(imgData);
    // Header(8) + IFD(2 + 14*12 + 4) + extra data + 16 bytes CMYK data
    expect(result.length).toBeGreaterThan(200);
    // Should not be excessively large for 4 pixels
    expect(result.length).toBeLessThan(500);
  });

  it('contains CMYK pixel data in the strip', () => {
    // Pure red: RGB(255,0,0) → CMYK(0,100,100,0) → bytes(0,255,255,0)
    const imgData = createImageData([[255, 0, 0, 255]], 1, 1);
    const result = exportCmykTiff(imgData);
    // Last 4 bytes should be the CMYK data
    const len = result.length;
    expect(result[len - 4]).toBe(0);   // C = 0/100 * 255 = 0
    expect(result[len - 3]).toBe(255); // M = 100/100 * 255 = 255
    expect(result[len - 2]).toBe(255); // Y = 100/100 * 255 = 255
    expect(result[len - 1]).toBe(0);   // K = 0/100 * 255 = 0
  });

  it('respects custom DPI setting', () => {
    const imgData = createImageData([[0, 0, 0, 255]], 1, 1);
    const result72 = exportCmykTiff(imgData, 72);
    const result300 = exportCmykTiff(imgData, 300);
    // Same size (DPI doesn't change data amount)
    expect(result72.length).toBe(result300.length);
    // But DPI values differ in the resolution rational fields
    expect(result72).not.toEqual(result300);
  });
});
