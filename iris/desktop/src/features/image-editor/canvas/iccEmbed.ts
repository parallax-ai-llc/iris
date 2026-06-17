/**
 * ICC Profile Embedding - Embed ICC profile metadata into PNG files
 *
 * PNG supports ICC profiles via the iCCP chunk.
 * We generate a minimal sRGB ICC profile and embed it into the PNG binary.
 */

// ==================== Minimal sRGB ICC Profile ====================

/**
 * Generate a minimal sRGB ICC profile binary.
 * This is a simplified v2 profile with just the header and required tags.
 */
function generateMinimalSrgbProfile(): Uint8Array {
  // A minimal sRGB ICC profile (v2.1)
  // Profile header: 128 bytes
  // Tag table + data

  const profileSize = 360; // minimal profile
  const buf = new ArrayBuffer(profileSize);
  const view = new DataView(buf);
  const arr = new Uint8Array(buf);

  let offset = 0;

  // Profile header (128 bytes)
  view.setUint32(offset, profileSize); offset += 4;    // Profile size
  // CMM type: 'none'
  offset += 4;
  // Version: 2.1.0
  view.setUint8(offset, 2); view.setUint8(offset + 1, 0x10); offset += 4;
  // Device class: 'mntr' (monitor)
  arr.set([0x6D, 0x6E, 0x74, 0x72], offset); offset += 4;
  // Color space: 'RGB '
  arr.set([0x52, 0x47, 0x42, 0x20], offset); offset += 4;
  // PCS: 'XYZ '
  arr.set([0x58, 0x59, 0x5A, 0x20], offset); offset += 4;
  // Date/time (12 bytes) - 2024-01-01
  view.setUint16(offset, 2024); offset += 2;
  view.setUint16(offset, 1); offset += 2;
  view.setUint16(offset, 1); offset += 2;
  view.setUint16(offset, 0); offset += 2;
  view.setUint16(offset, 0); offset += 2;
  view.setUint16(offset, 0); offset += 2;
  // Signature: 'acsp'
  arr.set([0x61, 0x63, 0x73, 0x70], offset); offset += 4;
  // Primary platform: 'MSFT'
  arr.set([0x4D, 0x53, 0x46, 0x54], offset); offset += 4;
  // Flags, device manufacturer, device model (12 bytes zeros)
  offset += 12;
  // Rendering intent: perceptual (0)
  view.setUint32(offset, 0); offset += 4;
  // PCS illuminant (D50): X=0.9642, Y=1.0000, Z=0.8249 as s15Fixed16
  view.setInt32(offset, 0x0000F6D6); offset += 4; // X
  view.setInt32(offset, 0x00010000); offset += 4; // Y
  view.setInt32(offset, 0x0000D32D); offset += 4; // Z
  // Creator signature
  offset += 4;
  // Profile ID (16 bytes MD5 - zeros for simplicity)
  offset += 16;
  // Reserved (28 bytes)
  offset = 128; // jump to end of header

  // Tag table: 3 tags (desc, wtpt, cprt)
  const tagCount = 3;
  view.setUint32(offset, tagCount); offset += 4;

  // Tag 1: 'desc' at offset 164, size 64
  const descOffset = 164 + tagCount * 12;
  arr.set([0x64, 0x65, 0x73, 0x63], offset); offset += 4;
  view.setUint32(offset, descOffset); offset += 4;
  view.setUint32(offset, 64); offset += 4;

  // Tag 2: 'wtpt' (white point)
  const wtptOffset = descOffset + 64;
  arr.set([0x77, 0x74, 0x70, 0x74], offset); offset += 4;
  view.setUint32(offset, wtptOffset); offset += 4;
  view.setUint32(offset, 20); offset += 4;

  // Tag 3: 'cprt' (copyright)
  const cprtOffset = wtptOffset + 20;
  arr.set([0x63, 0x70, 0x72, 0x74], offset); offset += 4;
  view.setUint32(offset, cprtOffset); offset += 4;
  view.setUint32(offset, 32); offset += 4;

  // Tag data: 'desc' - textDescriptionType
  offset = descOffset;
  arr.set([0x64, 0x65, 0x73, 0x63], offset); offset += 4; // type sig 'desc'
  offset += 4; // reserved
  const descStr = 'sRGB IEC61966-2.1';
  view.setUint32(offset, descStr.length + 1); offset += 4;
  for (let i = 0; i < descStr.length; i++) {
    arr[offset++] = descStr.charCodeAt(i);
  }
  arr[offset++] = 0; // null terminator

  // Tag data: 'wtpt' - XYZType (D50 white point)
  offset = wtptOffset;
  arr.set([0x58, 0x59, 0x5A, 0x20], offset); offset += 4; // type sig 'XYZ '
  offset += 4; // reserved
  view.setInt32(offset, 0x0000F6D6); offset += 4; // X
  view.setInt32(offset, 0x00010000); offset += 4; // Y
  view.setInt32(offset, 0x0000D32D); offset += 4; // Z

  // Tag data: 'cprt' - textType
  offset = cprtOffset;
  arr.set([0x74, 0x65, 0x78, 0x74], offset); offset += 4; // type sig 'text'
  offset += 4; // reserved
  const cprtStr = 'Iris Desktop Editor';
  for (let i = 0; i < cprtStr.length; i++) {
    arr[offset++] = cprtStr.charCodeAt(i);
  }
  arr[offset++] = 0;

  return new Uint8Array(buf, 0, profileSize);
}

// Cache the generated profile
let cachedSrgbProfile: Uint8Array | null = null;

/**
 * Get the sRGB ICC profile binary.
 */
export function getSrgbProfile(): Uint8Array {
  if (!cachedSrgbProfile) {
    cachedSrgbProfile = generateMinimalSrgbProfile();
  }
  return cachedSrgbProfile;
}

// ==================== PNG iCCP Chunk Embedding ====================

/**
 * CRC32 lookup table for PNG chunk checksum.
 */
const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
})();

function crc32(data: Uint8Array, start: number, length: number): number {
  let crc = 0xFFFFFFFF;
  for (let i = start; i < start + length; i++) {
    crc = crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Embed an ICC profile into a PNG file as an iCCP chunk.
 * Inserts the iCCP chunk right after the IHDR chunk.
 *
 * @param pngData - Original PNG file bytes
 * @param profileName - Name for the ICC profile (default: 'sRGB')
 * @param profileData - ICC profile binary (default: minimal sRGB profile)
 * @returns New PNG file bytes with embedded ICC profile
 */
export function embedIccProfile(
  pngData: Uint8Array,
  profileName = 'sRGB',
  profileData?: Uint8Array
): Uint8Array {
  const profile = profileData || getSrgbProfile();

  // PNG signature is 8 bytes, then IHDR chunk
  // Find the end of IHDR chunk to insert iCCP after it
  if (pngData.length < 8) return pngData;

  // Verify PNG signature
  const pngSig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < 8; i++) {
    if (pngData[i] !== pngSig[i]) return pngData; // Not a valid PNG
  }

  // Read IHDR chunk length (at offset 8)
  const ihdrLen = (pngData[8] << 24) | (pngData[9] << 16) | (pngData[10] << 8) | pngData[11];
  const ihdrEnd = 8 + 4 + 4 + ihdrLen + 4; // length(4) + type(4) + data + crc(4)

  // Build iCCP chunk data:
  // Profile name (null-terminated) + compression method (1 byte, 0=deflate) + compressed profile
  // For simplicity, we store uncompressed (compression method 0 means deflate is required by spec,
  // but many readers accept raw data). Use deflate via pako-like manual approach.
  // Actually PNG iCCP requires deflate compression. We'll use a simple ZLIB wrapper.

  const nameBytes = new TextEncoder().encode(profileName);

  // Create ZLIB deflate stored block (no compression)
  // ZLIB header: CMF=0x78 (deflate, window=32K), FLG=0x01 (check bits for CMF)
  const zlibData = createZlibStored(profile);

  const actualChunkDataLength = nameBytes.length + 1 + 1 + zlibData.length;

  // Build the chunk: [length(4)][iCCP(4)][data][crc(4)]
  const chunkSize = 4 + 4 + actualChunkDataLength + 4;
  const chunk = new Uint8Array(chunkSize);
  const chunkView = new DataView(chunk.buffer);

  let off = 0;
  // Length
  chunkView.setUint32(off, actualChunkDataLength); off += 4;
  // Type: 'iCCP'
  chunk[off++] = 0x69; // i
  chunk[off++] = 0x43; // C
  chunk[off++] = 0x43; // C
  chunk[off++] = 0x50; // P
  const crcStart = off - 4; // CRC covers type + data

  // Profile name
  chunk.set(nameBytes, off); off += nameBytes.length;
  chunk[off++] = 0; // null terminator
  // Compression method: 0 (deflate)
  chunk[off++] = 0;
  // Compressed profile data
  chunk.set(zlibData, off); off += zlibData.length;

  // CRC
  const crcVal = crc32(chunk, crcStart, 4 + actualChunkDataLength);
  chunkView.setUint32(off, crcVal); off += 4;

  // Assemble: PNG header + IHDR + iCCP chunk + rest of file
  const result = new Uint8Array(pngData.length + chunkSize);
  result.set(pngData.subarray(0, ihdrEnd), 0);
  result.set(chunk, ihdrEnd);
  result.set(pngData.subarray(ihdrEnd), ihdrEnd + chunkSize);

  return result;
}

/**
 * Create a ZLIB stored (no compression) wrapper around data.
 * Format: CMF(1) + FLG(1) + stored deflate blocks + Adler32(4)
 */
function createZlibStored(data: Uint8Array): Uint8Array {
  // Calculate Adler-32
  let a = 1, b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  const adler32 = ((b << 16) | a) >>> 0;

  // Deflate stored block: BFINAL=1, BTYPE=00 (stored)
  // Header byte: 0x01 (final block, stored)
  // LEN (2 bytes LE), NLEN (2 bytes LE), then data
  const len = data.length;
  const deflateSize = 1 + 2 + 2 + len; // header + len + nlen + data
  const totalSize = 2 + deflateSize + 4; // zlib header + deflate + adler32

  const result = new Uint8Array(totalSize);
  const rv = new DataView(result.buffer);
  let off = 0;

  // ZLIB header
  result[off++] = 0x78; // CMF: deflate, window size 32K
  result[off++] = 0x01; // FLG: check value

  // Deflate stored block
  result[off++] = 0x01; // BFINAL=1, BTYPE=00
  rv.setUint16(off, len, true); off += 2; // LEN
  rv.setUint16(off, len ^ 0xFFFF, true); off += 2; // NLEN (one's complement)
  result.set(data, off); off += len;

  // Adler-32
  rv.setUint32(off, adler32, false); // big-endian

  return result;
}
