/**
 * Format Export Engine - WebP, RGB TIFF, and BMP export utilities
 *
 * Provides binary-level encoding for formats not natively supported
 * by canvas.toBlob, plus convenience wrappers for WebP export.
 */

// ==================== TIFF Constants ====================

const TIFF_MAGIC_LE = 0x4949; // Little-endian "II"
const TIFF_VERSION = 42;

// TIFF Tag IDs
const TAG_IMAGE_WIDTH = 256;
const TAG_IMAGE_LENGTH = 257;
const TAG_BITS_PER_SAMPLE = 258;
const TAG_COMPRESSION = 259;
const TAG_PHOTOMETRIC = 262;
const TAG_STRIP_OFFSETS = 273;
const TAG_SAMPLES_PER_PIXEL = 277;
const TAG_ROWS_PER_STRIP = 278;
const TAG_STRIP_BYTE_COUNTS = 279;
const TAG_X_RESOLUTION = 282;
const TAG_Y_RESOLUTION = 283;
const TAG_RESOLUTION_UNIT = 296;
const TAG_SOFTWARE = 305;

// TIFF Type IDs
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;
const TYPE_ASCII = 2;

// ==================== WebP Export ====================

/**
 * Export a canvas as WebP blob using native browser support.
 * @param canvas - Source canvas element
 * @param quality - Quality 0-1, default 0.9
 */
export function exportAsWebP(
  canvas: HTMLCanvasElement,
  quality = 0.9
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create WebP blob'));
        }
      },
      'image/webp',
      quality
    );
  });
}

// ==================== RGB TIFF Export ====================

interface TiffTag {
  id: number;
  type: number;
  count: number;
  value: number;
}

/**
 * Export ImageData as an uncompressed RGB TIFF file.
 * Follows the same structural pattern as cmykExport.ts but for RGB color space.
 *
 * @param imageData - Source pixel data (RGBA from canvas)
 * @param dpi - Resolution in dots per inch, default 72
 * @returns Uint8Array containing a valid TIFF file
 */
export function exportAsRgbTiff(imageData: ImageData, dpi = 72): Uint8Array {
  const { width, height, data } = imageData;
  const pixelCount = width * height;
  const rgbByteCount = pixelCount * 3; // 3 bytes per pixel (no alpha)

  // Software tag string
  const softwareStr = 'Iris Desktop Image Editor\0';
  const softwareBytes = new TextEncoder().encode(softwareStr);

  // Layout calculation
  // Header: 8 bytes
  const numTags = 13;
  const ifdOffset = 8;
  const ifdSize = 2 + numTags * 12 + 4; // tag count + tags + next IFD pointer

  // Extra data area (values that don't fit in 4-byte tag value field)
  const extraDataOffset = ifdOffset + ifdSize;
  const bpsOffset = extraDataOffset; // BitsPerSample: 3 shorts = 6 bytes, padded to 8
  const xResOffset = bpsOffset + 6; // rational = 8 bytes
  const yResOffset = xResOffset + 8;
  const softwareOffset = yResOffset + 8;
  const stripDataOffset = softwareOffset + softwareBytes.length;

  const totalSize = stripDataOffset + rgbByteCount;

  // Allocate buffer
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  let offset = 0;

  // ---- TIFF Header ----
  view.setUint16(offset, TIFF_MAGIC_LE, true); offset += 2;
  view.setUint16(offset, TIFF_VERSION, true); offset += 2;
  view.setUint32(offset, ifdOffset, true); offset += 4;

  // ---- IFD ----
  view.setUint16(offset, numTags, true); offset += 2;

  const writeTag = (tag: TiffTag) => {
    view.setUint16(offset, tag.id, true); offset += 2;
    view.setUint16(offset, tag.type, true); offset += 2;
    view.setUint32(offset, tag.count, true); offset += 4;
    view.setUint32(offset, tag.value, true); offset += 4;
  };

  // Tags must be in ascending order by tag ID
  writeTag({ id: TAG_IMAGE_WIDTH, type: TYPE_LONG, count: 1, value: width });
  writeTag({ id: TAG_IMAGE_LENGTH, type: TYPE_LONG, count: 1, value: height });
  writeTag({ id: TAG_BITS_PER_SAMPLE, type: TYPE_SHORT, count: 3, value: bpsOffset });
  writeTag({ id: TAG_COMPRESSION, type: TYPE_SHORT, count: 1, value: 1 }); // No compression
  writeTag({ id: TAG_PHOTOMETRIC, type: TYPE_SHORT, count: 1, value: 2 }); // RGB
  writeTag({ id: TAG_STRIP_OFFSETS, type: TYPE_LONG, count: 1, value: stripDataOffset });
  writeTag({ id: TAG_SAMPLES_PER_PIXEL, type: TYPE_SHORT, count: 1, value: 3 });
  writeTag({ id: TAG_ROWS_PER_STRIP, type: TYPE_LONG, count: 1, value: height });
  writeTag({ id: TAG_STRIP_BYTE_COUNTS, type: TYPE_LONG, count: 1, value: rgbByteCount });
  writeTag({ id: TAG_X_RESOLUTION, type: TYPE_RATIONAL, count: 1, value: xResOffset });
  writeTag({ id: TAG_Y_RESOLUTION, type: TYPE_RATIONAL, count: 1, value: yResOffset });
  writeTag({ id: TAG_RESOLUTION_UNIT, type: TYPE_SHORT, count: 1, value: 2 }); // Inches
  writeTag({ id: TAG_SOFTWARE, type: TYPE_ASCII, count: softwareBytes.length, value: softwareOffset });

  // Next IFD offset = 0 (no more IFDs)
  view.setUint32(offset, 0, true); offset += 4;

  // ---- Extra data ----

  // BitsPerSample: 8, 8, 8
  offset = bpsOffset;
  view.setUint16(offset, 8, true); offset += 2;
  view.setUint16(offset, 8, true); offset += 2;
  view.setUint16(offset, 8, true); offset += 2;

  // X Resolution: dpi / 1
  offset = xResOffset;
  view.setUint32(offset, dpi, true); offset += 4;
  view.setUint32(offset, 1, true); offset += 4;

  // Y Resolution: dpi / 1
  offset = yResOffset;
  view.setUint32(offset, dpi, true); offset += 4;
  view.setUint32(offset, 1, true); offset += 4;

  // Software string
  const arr = new Uint8Array(buffer);
  arr.set(softwareBytes, softwareOffset);

  // ---- Strip data (RGB pixels, skip alpha) ----
  let rgbIdx = stripDataOffset;
  for (let i = 0; i < pixelCount; i++) {
    const srcIdx = i * 4; // RGBA source
    arr[rgbIdx++] = data[srcIdx];     // R
    arr[rgbIdx++] = data[srcIdx + 1]; // G
    arr[rgbIdx++] = data[srcIdx + 2]; // B
    // Skip alpha (data[srcIdx + 3])
  }

  return new Uint8Array(buffer);
}

// ==================== BMP Export ====================

/**
 * Export ImageData as a 24-bit uncompressed BMP file.
 *
 * BMP specifics:
 * - Pixel order: BGR (not RGB)
 * - Row order: bottom-to-top
 * - Each row padded to 4-byte boundary
 *
 * @param imageData - Source pixel data (RGBA from canvas)
 * @returns Uint8Array containing a valid BMP file
 */
export function exportAsBmp(imageData: ImageData): Uint8Array {
  const { width, height, data } = imageData;

  // Calculate row stride with padding
  const bytesPerPixelRow = width * 3; // 24-bit = 3 bytes per pixel
  const rowPadding = (4 - (bytesPerPixelRow % 4)) % 4;
  const stride = bytesPerPixelRow + rowPadding;
  const pixelDataSize = stride * height;

  // Headers
  const BMP_HEADER_SIZE = 14;
  const DIB_HEADER_SIZE = 40; // BITMAPINFOHEADER
  const pixelDataOffset = BMP_HEADER_SIZE + DIB_HEADER_SIZE;
  const fileSize = pixelDataOffset + pixelDataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  const arr = new Uint8Array(buffer);

  // ---- BMP File Header (14 bytes) ----
  arr[0] = 0x42; // 'B'
  arr[1] = 0x4d; // 'M'
  view.setUint32(2, fileSize, true);       // File size
  view.setUint16(6, 0, true);             // Reserved1
  view.setUint16(8, 0, true);             // Reserved2
  view.setUint32(10, pixelDataOffset, true); // Pixel data offset

  // ---- DIB Header (BITMAPINFOHEADER, 40 bytes) ----
  view.setUint32(14, DIB_HEADER_SIZE, true); // Header size
  view.setInt32(18, width, true);            // Width
  view.setInt32(22, height, true);           // Height (positive = bottom-up)
  view.setUint16(26, 1, true);              // Color planes
  view.setUint16(28, 24, true);             // Bits per pixel
  view.setUint32(30, 0, true);              // Compression (0 = BI_RGB, none)
  view.setUint32(34, pixelDataSize, true);  // Image size
  view.setInt32(38, 2835, true);            // X pixels per meter (~72 DPI)
  view.setInt32(42, 2835, true);            // Y pixels per meter (~72 DPI)
  view.setUint32(46, 0, true);             // Colors in palette
  view.setUint32(50, 0, true);             // Important colors

  // ---- Pixel data (BGR, bottom-to-top) ----
  for (let y = 0; y < height; y++) {
    // BMP stores rows bottom-to-top
    const srcRow = height - 1 - y;
    const destRowStart = pixelDataOffset + y * stride;

    for (let x = 0; x < width; x++) {
      const srcIdx = (srcRow * width + x) * 4; // RGBA source index
      const destIdx = destRowStart + x * 3;

      arr[destIdx] = data[srcIdx + 2];     // B
      arr[destIdx + 1] = data[srcIdx + 1]; // G
      arr[destIdx + 2] = data[srcIdx];     // R
    }
    // Padding bytes are already 0 (ArrayBuffer is zero-initialized)
  }

  return new Uint8Array(buffer);
}

// ==================== Download Helpers ====================

/**
 * Trigger a browser download from a Blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Trigger a browser download from raw bytes.
 */
export function downloadBytes(
  data: Uint8Array,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([data.buffer as ArrayBuffer], { type: mimeType });
  downloadBlob(blob, filename);
}
