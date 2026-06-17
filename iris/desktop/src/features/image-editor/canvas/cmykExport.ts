/**
 * CMYK Export Engine - Generate CMYK TIFF binary for print-ready output
 *
 * Since Canvas API only supports RGB, we:
 * 1. Flatten all layers to a single RGB canvas
 * 2. Convert each pixel RGB→CMYK
 * 3. Encode as uncompressed TIFF with CMYK color space
 *
 * Output: Uint8Array containing a valid TIFF file with CMYK data
 */

import { canvasToCmykData, type ICCProfile } from './colorProfile';

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
const TAG_INK_SET = 332;

// TIFF Type IDs
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;
const TYPE_ASCII = 2;

// ==================== TIFF Encoder ====================

interface TiffTag {
  id: number;
  type: number;
  count: number;
  value: number; // For inline values or offset
}

/**
 * Export canvas ImageData as CMYK TIFF file.
 * Returns a downloadable Uint8Array.
 */
export function exportCmykTiff(
  imageData: ImageData,
  dpi = 300,
  _profile?: ICCProfile
): Uint8Array {
  const { width, height } = imageData;
  const cmykData = canvasToCmykData(imageData);
  const cmykByteCount = cmykData.length; // width * height * 4

  // Software tag
  const softwareStr = 'Iris Desktop Image Editor\0';
  const softwareBytes = new TextEncoder().encode(softwareStr);

  // Calculate layout
  // Header: 8 bytes
  // IFD offset: after header = 8
  // IFD: 2 (tag count) + numTags * 12 + 4 (next IFD offset)
  const numTags = 14;
  const ifdOffset = 8;
  const ifdSize = 2 + numTags * 12 + 4;

  // Extra data area (after IFD): BitsPerSample (4 shorts = 8 bytes), X/Y resolution (2 rationals = 16 bytes), software string
  const extraDataOffset = ifdOffset + ifdSize;
  const bpsOffset = extraDataOffset;
  const xResOffset = bpsOffset + 8; // 4 shorts × 2 bytes
  const yResOffset = xResOffset + 8; // rational = 8 bytes
  const softwareOffset = yResOffset + 8;
  const stripDataOffset = softwareOffset + softwareBytes.length;

  // Total file size
  const totalSize = stripDataOffset + cmykByteCount;

  // Allocate buffer
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  let offset = 0;

  // ---- TIFF Header ----
  view.setUint16(offset, TIFF_MAGIC_LE, true); offset += 2; // Byte order
  view.setUint16(offset, TIFF_VERSION, true); offset += 2;   // Version
  view.setUint32(offset, ifdOffset, true); offset += 4;      // IFD offset

  // ---- IFD ----
  view.setUint16(offset, numTags, true); offset += 2;

  const writeTag = (tag: TiffTag) => {
    view.setUint16(offset, tag.id, true); offset += 2;
    view.setUint16(offset, tag.type, true); offset += 2;
    view.setUint32(offset, tag.count, true); offset += 4;
    view.setUint32(offset, tag.value, true); offset += 4;
  };

  // ImageWidth
  writeTag({ id: TAG_IMAGE_WIDTH, type: TYPE_LONG, count: 1, value: width });
  // ImageLength
  writeTag({ id: TAG_IMAGE_LENGTH, type: TYPE_LONG, count: 1, value: height });
  // BitsPerSample (4 values → offset to extra data)
  writeTag({ id: TAG_BITS_PER_SAMPLE, type: TYPE_SHORT, count: 4, value: bpsOffset });
  // Compression = None (1)
  writeTag({ id: TAG_COMPRESSION, type: TYPE_SHORT, count: 1, value: 1 });
  // PhotometricInterpretation = Separated (CMYK) = 5
  writeTag({ id: TAG_PHOTOMETRIC, type: TYPE_SHORT, count: 1, value: 5 });
  // StripOffsets
  writeTag({ id: TAG_STRIP_OFFSETS, type: TYPE_LONG, count: 1, value: stripDataOffset });
  // SamplesPerPixel = 4
  writeTag({ id: TAG_SAMPLES_PER_PIXEL, type: TYPE_SHORT, count: 1, value: 4 });
  // RowsPerStrip = height (single strip)
  writeTag({ id: TAG_ROWS_PER_STRIP, type: TYPE_LONG, count: 1, value: height });
  // StripByteCounts
  writeTag({ id: TAG_STRIP_BYTE_COUNTS, type: TYPE_LONG, count: 1, value: cmykByteCount });
  // XResolution (offset to rational)
  writeTag({ id: TAG_X_RESOLUTION, type: TYPE_RATIONAL, count: 1, value: xResOffset });
  // YResolution (offset to rational)
  writeTag({ id: TAG_Y_RESOLUTION, type: TYPE_RATIONAL, count: 1, value: yResOffset });
  // ResolutionUnit = inches (2)
  writeTag({ id: TAG_RESOLUTION_UNIT, type: TYPE_SHORT, count: 1, value: 2 });
  // InkSet = CMYK (1)
  writeTag({ id: TAG_INK_SET, type: TYPE_SHORT, count: 1, value: 1 });
  // Software
  writeTag({ id: TAG_SOFTWARE, type: TYPE_ASCII, count: softwareBytes.length, value: softwareOffset });

  // Next IFD offset = 0 (no more IFDs)
  view.setUint32(offset, 0, true); offset += 4;

  // ---- Extra data ----
  // BitsPerSample: 8,8,8,8
  offset = bpsOffset;
  view.setUint16(offset, 8, true); offset += 2;
  view.setUint16(offset, 8, true); offset += 2;
  view.setUint16(offset, 8, true); offset += 2;
  view.setUint16(offset, 8, true); offset += 2;

  // X Resolution: dpi/1
  offset = xResOffset;
  view.setUint32(offset, dpi, true); offset += 4;
  view.setUint32(offset, 1, true); offset += 4;

  // Y Resolution: dpi/1
  offset = yResOffset;
  view.setUint32(offset, dpi, true); offset += 4;
  view.setUint32(offset, 1, true); offset += 4;

  // Software string
  offset = softwareOffset;
  const arr = new Uint8Array(buffer);
  arr.set(softwareBytes, offset);

  // ---- Strip data (CMYK pixels) ----
  // CMYK values are 0-100, but TIFF CMYK expects 0-255 scale
  // Convert percentage to byte value
  const stripStart = stripDataOffset;
  for (let i = 0; i < cmykData.length; i++) {
    arr[stripStart + i] = Math.round((cmykData[i] / 100) * 255);
  }

  return new Uint8Array(buffer);
}

/**
 * Trigger download of CMYK TIFF file.
 */
export function downloadCmykTiff(
  imageData: ImageData,
  filename: string,
  dpi = 300,
  profile?: ICCProfile
): void {
  const tiffBytes = exportCmykTiff(imageData, dpi, profile);
  const blob = new Blob([tiffBytes.buffer as ArrayBuffer], { type: 'image/tiff' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.tif') || filename.endsWith('.tiff') ? filename : `${filename}.tif`;
  a.click();
  URL.revokeObjectURL(url);
}
