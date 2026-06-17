/**
 * Edge Detection Engine
 * Sobel-based edge detection for Quick Selection Tool
 */

/**
 * Compute edge magnitude map using Sobel operator.
 * Returns a Float32Array where each value is the edge magnitude (0-1) at that pixel.
 */
export function computeEdgeMap(imageData: ImageData): Float32Array {
  const { width, height, data } = imageData;
  const edgeMap = new Float32Array(width * height);

  // Convert to grayscale luminance first
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }

  // Sobel kernels
  // Gx = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]
  // Gy = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]

  let maxMag = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;

      // Sobel X gradient
      const gx =
        -gray[(y - 1) * width + (x - 1)] + gray[(y - 1) * width + (x + 1)] +
        -2 * gray[y * width + (x - 1)] + 2 * gray[y * width + (x + 1)] +
        -gray[(y + 1) * width + (x - 1)] + gray[(y + 1) * width + (x + 1)];

      // Sobel Y gradient
      const gy =
        -gray[(y - 1) * width + (x - 1)] - 2 * gray[(y - 1) * width + x] - gray[(y - 1) * width + (x + 1)] +
        gray[(y + 1) * width + (x - 1)] + 2 * gray[(y + 1) * width + x] + gray[(y + 1) * width + (x + 1)];

      const mag = Math.sqrt(gx * gx + gy * gy);
      edgeMap[idx] = mag;
      if (mag > maxMag) maxMag = mag;
    }
  }

  // Normalize to 0-1
  if (maxMag > 0) {
    for (let i = 0; i < edgeMap.length; i++) {
      edgeMap[i] /= maxMag;
    }
  }

  return edgeMap;
}

/**
 * Quick selection: flood-fill based selection that respects edges.
 * Expands from seed point(s) within a brush radius, stopping at strong edges.
 *
 * @param imageData - Source image data
 * @param seedX - Seed point X
 * @param seedY - Seed point Y
 * @param brushRadius - Radius of the brush
 * @param edgeMap - Pre-computed edge map (0-1 normalized)
 * @param edgeThreshold - Edge strength that blocks expansion (0-1, default 0.3)
 * @param colorThreshold - Max color distance for expansion (0-255, default 40)
 * @param existingMask - Optional existing selection mask to add to
 */
export function quickSelect(
  imageData: ImageData,
  seedX: number,
  seedY: number,
  brushRadius: number,
  edgeMap: Float32Array,
  edgeThreshold: number = 0.3,
  colorThreshold: number = 40,
  existingMask?: Uint8ClampedArray
): Uint8ClampedArray {
  const { width, height, data } = imageData;
  const mask = existingMask
    ? new Uint8ClampedArray(existingMask)
    : new Uint8ClampedArray(width * height);

  // Get seed color (average within small area around seed)
  const sx = Math.max(0, Math.min(width - 1, Math.round(seedX)));
  const sy = Math.max(0, Math.min(height - 1, Math.round(seedY)));
  const seedIdx = (sy * width + sx) * 4;
  const seedR = data[seedIdx];
  const seedG = data[seedIdx + 1];
  const seedB = data[seedIdx + 2];

  // BFS flood fill from seed, constrained by brush radius and edges
  const visited = new Uint8Array(width * height);
  const queue: [number, number][] = [];

  // Initialize with all pixels within brush radius of seed
  const r2 = brushRadius * brushRadius;
  const minX = Math.max(0, Math.floor(sx - brushRadius));
  const maxX = Math.min(width - 1, Math.ceil(sx + brushRadius));
  const minY = Math.max(0, Math.floor(sy - brushRadius));
  const maxY = Math.min(height - 1, Math.ceil(sy + brushRadius));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - sx;
      const dy = y - sy;
      if (dx * dx + dy * dy <= r2) {
        const idx = y * width + x;
        if (!visited[idx]) {
          visited[idx] = 1;
          queue.push([x, y]);
        }
      }
    }
  }

  // BFS expansion
  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    const cIdx = cy * width + cx;

    // Check edge strength - skip if too strong
    if (edgeMap[cIdx] > edgeThreshold) continue;

    // Check color distance from seed
    const pIdx = cIdx * 4;
    const dr = data[pIdx] - seedR;
    const dg = data[pIdx + 1] - seedG;
    const db = data[pIdx + 2] - seedB;
    const colorDist = Math.sqrt(dr * dr + dg * dg + db * db);

    if (colorDist > colorThreshold) continue;

    // Mark as selected
    mask[cIdx] = 255;

    // Expand to 4-connected neighbors (within a reasonable distance from seed)
    const neighbors: [number, number][] = [
      [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (visited[nIdx]) continue;

      // Limit expansion distance from seed (3x brush radius)
      const distX = nx - sx;
      const distY = ny - sy;
      if (distX * distX + distY * distY > r2 * 9) continue;

      visited[nIdx] = 1;
      queue.push([nx, ny]);
    }
  }

  return mask;
}
