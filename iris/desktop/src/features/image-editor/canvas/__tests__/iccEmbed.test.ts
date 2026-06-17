/**
 * Tests for iccEmbed.ts - ICC profile embedding into PNG
 */

import { describe, it, expect } from 'vitest';
import { getSrgbProfile, embedIccProfile } from '../iccEmbed';

// Minimal valid PNG (1x1 white pixel)
function createMinimalPng(): Uint8Array {
  // PNG signature + IHDR + IDAT + IEND
  const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

  // IHDR chunk: width=1, height=1, bit-depth=8, color-type=2 (RGB)
  const ihdr = buildChunk('IHDR', [
    0, 0, 0, 1, // width
    0, 0, 0, 1, // height
    8,           // bit depth
    2,           // color type (RGB)
    0,           // compression
    0,           // filter
    0,           // interlace
  ]);

  // IDAT chunk: minimal deflate data for 1 white RGB pixel
  // Filter byte (0) + R,G,B = [0, 255, 255, 255]
  // Wrap in zlib stored block
  const rawData = [0, 255, 255, 255]; // filter=none, white pixel
  const deflateBlock = [
    0x78, 0x01,       // zlib header
    0x01,             // BFINAL=1, BTYPE=00 (stored)
    rawData.length & 0xFF, (rawData.length >> 8) & 0xFF,  // LEN
    ~rawData.length & 0xFF, (~rawData.length >> 8) & 0xFF, // NLEN
    ...rawData,
  ];
  // Calculate Adler-32
  let a = 1, b = 0;
  for (const byte of rawData) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  const adler32 = ((b << 16) | a) >>> 0;
  deflateBlock.push((adler32 >> 24) & 0xFF, (adler32 >> 16) & 0xFF, (adler32 >> 8) & 0xFF, adler32 & 0xFF);
  const idat = buildChunk('IDAT', deflateBlock);

  // IEND chunk
  const iend = buildChunk('IEND', []);

  // Combine
  const total = new Uint8Array(sig.length + ihdr.length + idat.length + iend.length);
  let off = 0;
  total.set(sig, off); off += sig.length;
  total.set(ihdr, off); off += ihdr.length;
  total.set(idat, off); off += idat.length;
  total.set(iend, off);
  return total;
}

function buildChunk(type: string, data: number[]): Uint8Array {
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const view = new DataView(chunk.buffer);

  // Length
  view.setUint32(0, data.length);

  // Type
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);

  // Data
  for (let i = 0; i < data.length; i++) chunk[8 + i] = data[i];

  // CRC (simplified - just write zeros since we're testing embedding, not PNG validity)
  const crc = crc32Calc(chunk, 4, 4 + data.length);
  view.setUint32(8 + data.length, crc);

  return chunk;
}

// Simple CRC32 for test helper
function crc32Calc(data: Uint8Array, start: number, length: number): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = start; i < start + length; i++) crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

describe('getSrgbProfile', () => {
  it('returns a Uint8Array', () => {
    const profile = getSrgbProfile();
    expect(profile).toBeInstanceOf(Uint8Array);
  });

  it('has correct profile size in header', () => {
    const profile = getSrgbProfile();
    const view = new DataView(profile.buffer, profile.byteOffset, profile.byteLength);
    const size = view.getUint32(0);
    expect(size).toBe(profile.length);
  });

  it('has mntr device class', () => {
    const profile = getSrgbProfile();
    const deviceClass = String.fromCharCode(profile[12], profile[13], profile[14], profile[15]);
    expect(deviceClass).toBe('mntr');
  });

  it('has RGB color space', () => {
    const profile = getSrgbProfile();
    const colorSpace = String.fromCharCode(profile[16], profile[17], profile[18], profile[19]);
    expect(colorSpace).toBe('RGB ');
  });

  it('has acsp signature', () => {
    const profile = getSrgbProfile();
    const sig = String.fromCharCode(profile[36], profile[37], profile[38], profile[39]);
    expect(sig).toBe('acsp');
  });

  it('returns same instance on repeated calls (cached)', () => {
    const p1 = getSrgbProfile();
    const p2 = getSrgbProfile();
    expect(p1).toBe(p2);
  });
});

describe('embedIccProfile', () => {
  it('returns larger array than input', () => {
    const png = createMinimalPng();
    const result = embedIccProfile(png);
    expect(result.length).toBeGreaterThan(png.length);
  });

  it('preserves PNG signature', () => {
    const png = createMinimalPng();
    const result = embedIccProfile(png);
    const pngSig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    for (let i = 0; i < 8; i++) {
      expect(result[i]).toBe(pngSig[i]);
    }
  });

  it('inserts iCCP chunk after IHDR', () => {
    const png = createMinimalPng();
    const result = embedIccProfile(png);
    // IHDR chunk ends at offset 8 + 4 + 4 + 13 + 4 = 33
    const ihdrEnd = 8 + 4 + 4 + 13 + 4;
    // Next chunk should be iCCP
    // Skip 4 bytes for length, then read type
    const type = String.fromCharCode(
      result[ihdrEnd + 4],
      result[ihdrEnd + 5],
      result[ihdrEnd + 6],
      result[ihdrEnd + 7],
    );
    expect(type).toBe('iCCP');
  });

  it('returns original data for non-PNG input', () => {
    const notPng = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const result = embedIccProfile(notPng);
    expect(result).toBe(notPng); // same reference
  });

  it('returns original data for too-short input', () => {
    const tiny = new Uint8Array([1, 2, 3]);
    const result = embedIccProfile(tiny);
    expect(result).toBe(tiny);
  });

  it('accepts custom profile name', () => {
    const png = createMinimalPng();
    const result = embedIccProfile(png, 'AdobeRGB');
    const ihdrEnd = 8 + 4 + 4 + 13 + 4;
    // After length(4) + type(4), profile name starts
    const nameStart = ihdrEnd + 8;
    const nameBytes = [];
    for (let i = nameStart; i < result.length && result[i] !== 0; i++) {
      nameBytes.push(result[i]);
    }
    const name = String.fromCharCode(...nameBytes);
    expect(name).toBe('AdobeRGB');
  });
});
