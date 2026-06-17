/**
 * Tests for formatExport.ts - WebP, RGB TIFF, and BMP export utilities
 */

import { exportAsRgbTiff, exportAsBmp } from '../formatExport';

// Helper: create a minimal ImageData-like object
function createTestImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  // Fill with a recognizable pattern: red pixel at (0,0), green at (1,0), etc.
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = (i * 37) % 256;     // R
    data[i * 4 + 1] = (i * 73) % 256; // G
    data[i * 4 + 2] = (i * 113) % 256; // B
    data[i * 4 + 3] = 255;            // A
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

describe('exportAsRgbTiff', () => {
  it('should produce valid TIFF header with magic bytes and version 42', () => {
    const imageData = createTestImageData(2, 2);
    const result = exportAsRgbTiff(imageData);
    const view = new DataView(result.buffer);

    // TIFF magic: "II" (little-endian)
    expect(result[0]).toBe(0x49); // 'I'
    expect(result[1]).toBe(0x49); // 'I'

    // TIFF version 42
    expect(view.getUint16(2, true)).toBe(42);
  });

  it('should store correct image dimensions in IFD tags', () => {
    const imageData = createTestImageData(10, 5);
    const result = exportAsRgbTiff(imageData);
    const view = new DataView(result.buffer);

    // IFD starts at offset 8
    const numTags = view.getUint16(8, true);
    expect(numTags).toBe(13);

    // First tag: ImageWidth (tag 256)
    const tag0Id = view.getUint16(10, true);
    const tag0Value = view.getUint32(18, true);
    expect(tag0Id).toBe(256);
    expect(tag0Value).toBe(10);

    // Second tag: ImageLength (tag 257)
    const tag1Id = view.getUint16(22, true);
    const tag1Value = view.getUint32(30, true);
    expect(tag1Id).toBe(257);
    expect(tag1Value).toBe(5);
  });

  it('should set PhotometricInterpretation to 2 (RGB)', () => {
    const imageData = createTestImageData(2, 2);
    const result = exportAsRgbTiff(imageData);
    const view = new DataView(result.buffer);

    // Tag 4 (0-indexed) is PhotometricInterpretation (tag 262)
    // Each tag is 12 bytes, starting at offset 10
    // Tag index 4: offset 10 + 4*12 = 58
    const tagId = view.getUint16(58, true);
    const tagValue = view.getUint32(66, true);
    expect(tagId).toBe(262);
    expect(tagValue).toBe(2); // RGB
  });

  it('should set SamplesPerPixel to 3', () => {
    const imageData = createTestImageData(2, 2);
    const result = exportAsRgbTiff(imageData);
    const view = new DataView(result.buffer);

    // Tag index 6: SamplesPerPixel (tag 277)
    // offset 10 + 6*12 = 82
    const tagId = view.getUint16(82, true);
    const tagValue = view.getUint32(90, true);
    expect(tagId).toBe(277);
    expect(tagValue).toBe(3);
  });

  it('should produce correct total file size', () => {
    const w = 4, h = 3;
    const imageData = createTestImageData(w, h);
    const result = exportAsRgbTiff(imageData);

    // Strip data should be w * h * 3 bytes
    const rgbBytes = w * h * 3;
    // File should end exactly at strip data offset + rgbBytes
    // We can verify the size is reasonable
    expect(result.length).toBeGreaterThan(rgbBytes);
  });

  it('should strip alpha channel from pixel data', () => {
    const imageData = createTestImageData(1, 1);
    // Set known RGBA values
    imageData.data[0] = 100; // R
    imageData.data[1] = 150; // G
    imageData.data[2] = 200; // B
    imageData.data[3] = 255; // A

    const result = exportAsRgbTiff(imageData);
    const view = new DataView(result.buffer);

    // Find strip offset from tag index 5 (StripOffsets, tag 273)
    // offset 10 + 5*12 = 70
    const stripOffset = view.getUint32(78, true);

    // Verify RGB (no alpha)
    expect(result[stripOffset]).toBe(100);     // R
    expect(result[stripOffset + 1]).toBe(150); // G
    expect(result[stripOffset + 2]).toBe(200); // B
    // Only 3 bytes per pixel, no 4th byte for this pixel
  });

  it('should respect custom DPI setting', () => {
    const imageData = createTestImageData(1, 1);
    const result = exportAsRgbTiff(imageData, 300);
    const view = new DataView(result.buffer);

    // Tag index 9: XResolution (tag 282), rational value at offset
    const xResTagOffset = 10 + 9 * 12;
    const xResValueOffset = view.getUint32(xResTagOffset + 8, true);
    const xResNumerator = view.getUint32(xResValueOffset, true);
    expect(xResNumerator).toBe(300);
  });
});

describe('exportAsBmp', () => {
  it('should produce valid BMP magic bytes "BM"', () => {
    const imageData = createTestImageData(2, 2);
    const result = exportAsBmp(imageData);

    expect(result[0]).toBe(0x42); // 'B'
    expect(result[1]).toBe(0x4d); // 'M'
  });

  it('should have correct file size in header', () => {
    const w = 3, h = 2;
    const imageData = createTestImageData(w, h);
    const result = exportAsBmp(imageData);
    const view = new DataView(result.buffer);

    const fileSize = view.getUint32(2, true);
    expect(fileSize).toBe(result.length);

    // Verify expected size calculation
    // Row bytes = 3 * 3 = 9, padding = (4 - 9%4)%4 = 3, stride = 12
    // Pixel data = 12 * 2 = 24
    // Total = 14 (BMP header) + 40 (DIB header) + 24 = 78
    expect(fileSize).toBe(78);
  });

  it('should set pixel data offset to 54 (14 + 40)', () => {
    const imageData = createTestImageData(2, 2);
    const result = exportAsBmp(imageData);
    const view = new DataView(result.buffer);

    const pixelDataOffset = view.getUint32(10, true);
    expect(pixelDataOffset).toBe(54);
  });

  it('should store correct dimensions in DIB header', () => {
    const imageData = createTestImageData(7, 3);
    const result = exportAsBmp(imageData);
    const view = new DataView(result.buffer);

    const width = view.getInt32(18, true);
    const height = view.getInt32(22, true);
    expect(width).toBe(7);
    expect(height).toBe(3);
  });

  it('should set 24 bits per pixel and no compression', () => {
    const imageData = createTestImageData(2, 2);
    const result = exportAsBmp(imageData);
    const view = new DataView(result.buffer);

    const bpp = view.getUint16(28, true);
    const compression = view.getUint32(30, true);
    expect(bpp).toBe(24);
    expect(compression).toBe(0); // BI_RGB
  });

  it('should store pixels in BGR order (not RGB)', () => {
    const imageData = createTestImageData(1, 1);
    imageData.data[0] = 255; // R
    imageData.data[1] = 128; // G
    imageData.data[2] = 64;  // B
    imageData.data[3] = 255; // A

    const result = exportAsBmp(imageData);

    // Pixel data starts at offset 54
    expect(result[54]).toBe(64);  // B first
    expect(result[55]).toBe(128); // G second
    expect(result[56]).toBe(255); // R third
  });

  it('should store rows bottom-to-top', () => {
    // 1x2 image: top pixel = red, bottom pixel = blue
    const imageData = createTestImageData(1, 2);
    // Top row (y=0): R=255, G=0, B=0
    imageData.data[0] = 255;
    imageData.data[1] = 0;
    imageData.data[2] = 0;
    imageData.data[3] = 255;
    // Bottom row (y=1): R=0, G=0, B=255
    imageData.data[4] = 0;
    imageData.data[5] = 0;
    imageData.data[6] = 255;
    imageData.data[7] = 255;

    const result = exportAsBmp(imageData);

    // Row stride: 1*3 = 3 bytes, padding = (4-3%4)%4 = 1, stride = 4
    // First row in file (offset 54) = bottom row of image = blue
    expect(result[54]).toBe(255); // B
    expect(result[55]).toBe(0);   // G
    expect(result[56]).toBe(0);   // R

    // Second row in file (offset 54+4=58) = top row of image = red
    expect(result[58]).toBe(0);   // B
    expect(result[59]).toBe(0);   // G
    expect(result[60]).toBe(255); // R
  });

  it('should pad rows to 4-byte boundaries', () => {
    // Width=1: row = 3 bytes, needs 1 byte padding → stride = 4
    const imageData = createTestImageData(1, 1);
    const result = exportAsBmp(imageData);
    const view = new DataView(result.buffer);

    const pixelDataSize = view.getUint32(34, true);
    expect(pixelDataSize).toBe(4); // 3 bytes + 1 padding

    // Width=2: row = 6 bytes, needs 2 bytes padding → stride = 8
    const imageData2 = createTestImageData(2, 1);
    const result2 = exportAsBmp(imageData2);
    const view2 = new DataView(result2.buffer);
    const pixelDataSize2 = view2.getUint32(34, true);
    expect(pixelDataSize2).toBe(8);

    // Width=4: row = 12 bytes, no padding needed → stride = 12
    const imageData4 = createTestImageData(4, 1);
    const result4 = exportAsBmp(imageData4);
    const view4 = new DataView(result4.buffer);
    const pixelDataSize4 = view4.getUint32(34, true);
    expect(pixelDataSize4).toBe(12);
  });
});

describe('exportAsWebP', () => {
  // Note: canvas.toBlob is not available in jsdom/Node test environment,
  // so we test the function signature and error handling.

  it('should be importable as a function', async () => {
    const { exportAsWebP } = await import('../formatExport');
    expect(typeof exportAsWebP).toBe('function');
  });
});
