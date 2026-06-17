import { describe, it, expect } from 'vitest';
import { computeEdgeMap, quickSelect } from '../edgeDetection';

describe('computeEdgeMap', () => {
  it('should return a Float32Array of correct size', () => {
    const imageData = new ImageData(10, 10);
    const result = computeEdgeMap(imageData);
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(100);
  });

  it('should return all zeros for a uniform image', () => {
    const imageData = new ImageData(10, 10);
    // Fill with uniform gray
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = 128;
      imageData.data[i + 1] = 128;
      imageData.data[i + 2] = 128;
      imageData.data[i + 3] = 255;
    }
    const result = computeEdgeMap(imageData);
    // All values should be 0 (no edges in uniform image)
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBe(0);
    }
  });

  it('should detect edges at sharp color transitions', () => {
    const w = 20;
    const h = 20;
    const imageData = new ImageData(w, h);
    // Left half black, right half white
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const val = x < w / 2 ? 0 : 255;
        imageData.data[idx] = val;
        imageData.data[idx + 1] = val;
        imageData.data[idx + 2] = val;
        imageData.data[idx + 3] = 255;
      }
    }
    const result = computeEdgeMap(imageData);

    // Edge values near the boundary (x=9,10) should be higher than far from it
    const edgeIdx = 5 * w + 10; // near boundary
    const farIdx = 5 * w + 2;   // far from boundary
    expect(result[edgeIdx]).toBeGreaterThan(result[farIdx]);
  });

  it('should normalize values to 0-1 range', () => {
    const w = 20;
    const h = 20;
    const imageData = new ImageData(w, h);
    // Create a pattern with edges
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const val = (x + y) % 2 === 0 ? 0 : 255;
        imageData.data[idx] = val;
        imageData.data[idx + 1] = val;
        imageData.data[idx + 2] = val;
        imageData.data[idx + 3] = 255;
      }
    }
    const result = computeEdgeMap(imageData);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(0);
      expect(result[i]).toBeLessThanOrEqual(1);
    }
  });
});

describe('quickSelect', () => {
  it('should return a mask of correct size', () => {
    const w = 20;
    const h = 20;
    const imageData = new ImageData(w, h);
    const edgeMap = new Float32Array(w * h);
    const result = quickSelect(imageData, 10, 10, 5, edgeMap);
    expect(result).toBeInstanceOf(Uint8ClampedArray);
    expect(result.length).toBe(w * h);
  });

  it('should select pixels in uniform area', () => {
    const w = 20;
    const h = 20;
    const imageData = new ImageData(w, h);
    // Fill with uniform color
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = 100;
      imageData.data[i + 1] = 100;
      imageData.data[i + 2] = 100;
      imageData.data[i + 3] = 255;
    }
    const edgeMap = new Float32Array(w * h); // no edges
    const result = quickSelect(imageData, 10, 10, 5, edgeMap, 0.3, 40);

    // Should select some pixels
    let selectedCount = 0;
    for (let i = 0; i < result.length; i++) {
      if (result[i] === 255) selectedCount++;
    }
    expect(selectedCount).toBeGreaterThan(0);
  });

  it('should be blocked by strong edges', () => {
    const w = 20;
    const h = 20;
    const imageData = new ImageData(w, h);
    // Fill with uniform color
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = 100;
      imageData.data[i + 1] = 100;
      imageData.data[i + 2] = 100;
      imageData.data[i + 3] = 255;
    }

    // Create strong edge at x=10 (vertical line)
    const edgeMap = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      edgeMap[y * w + 10] = 1.0; // max edge strength
    }

    // Select from left side (x=5)
    const result = quickSelect(imageData, 5, 10, 3, edgeMap, 0.3, 40);

    // Pixels on the right side of the edge should NOT be selected
    let rightSideSelected = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 12; x < w; x++) {
        if (result[y * w + x] === 255) rightSideSelected++;
      }
    }
    expect(rightSideSelected).toBe(0);
  });

  it('should merge with existing mask when provided', () => {
    const w = 20;
    const h = 20;
    const imageData = new ImageData(w, h);
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = 100;
      imageData.data[i + 1] = 100;
      imageData.data[i + 2] = 100;
      imageData.data[i + 3] = 255;
    }
    const edgeMap = new Float32Array(w * h);

    // Existing mask with some pixels selected
    const existingMask = new Uint8ClampedArray(w * h);
    existingMask[0] = 255;
    existingMask[1] = 255;

    const result = quickSelect(imageData, 10, 10, 3, edgeMap, 0.3, 40, existingMask);

    // Should still have the existing selections
    expect(result[0]).toBe(255);
    expect(result[1]).toBe(255);
  });
});
