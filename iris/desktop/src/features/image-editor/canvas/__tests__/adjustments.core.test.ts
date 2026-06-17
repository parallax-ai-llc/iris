/**
 * Core Adjustments Test — buildCurveLut 테스트 커버리지
 * (applyAdjustmentsToCanvas는 HTMLCanvasElement 의존으로 jsdom 환경 한계 — 별도 통합 테스트 필요)
 */
import { describe, it, expect } from 'vitest';
import { buildCurveLut } from '../adjustments';

describe('buildCurveLut', () => {
  it('returns 256-element Uint8ClampedArray', () => {
    const lut = buildCurveLut([{ x: 0, y: 0 }, { x: 255, y: 255 }]);
    expect(lut).toBeInstanceOf(Uint8ClampedArray);
    expect(lut.length).toBe(256);
  });

  it('identity curve maps i → i', () => {
    const lut = buildCurveLut([{ x: 0, y: 0 }, { x: 255, y: 255 }]);
    for (let i = 0; i < 256; i++) {
      expect(lut[i]).toBe(i);
    }
  });

  it('inversion curve maps i → 255-i', () => {
    const lut = buildCurveLut([{ x: 0, y: 255 }, { x: 255, y: 0 }]);
    for (let i = 0; i < 256; i++) {
      expect(lut[i]).toBe(255 - i);
    }
  });

  it('constant curve maps everything to same value', () => {
    const lut = buildCurveLut([{ x: 0, y: 128 }, { x: 255, y: 128 }]);
    for (let i = 0; i < 256; i++) {
      expect(lut[i]).toBe(128);
    }
  });

  it('empty input produces identity', () => {
    const lut = buildCurveLut([]);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
  });

  it('single point interpolates endpoints', () => {
    const lut = buildCurveLut([{ x: 128, y: 128 }]);
    expect(lut[0]).toBe(0);
    expect(lut[128]).toBe(128);
    expect(lut[255]).toBe(255);
  });

  it('multi-point S-curve stays in bounds', () => {
    const lut = buildCurveLut([
      { x: 0, y: 0 },
      { x: 64, y: 20 },
      { x: 128, y: 128 },
      { x: 192, y: 235 },
      { x: 255, y: 255 },
    ]);
    for (let i = 0; i < 256; i++) {
      expect(lut[i]).toBeGreaterThanOrEqual(0);
      expect(lut[i]).toBeLessThanOrEqual(255);
    }
    // S-curve: darks get darker, lights get lighter
    expect(lut[64]).toBeLessThanOrEqual(64);
    expect(lut[192]).toBeGreaterThanOrEqual(192);
  });

  it('values are monotonic for monotonic input', () => {
    const lut = buildCurveLut([
      { x: 0, y: 0 },
      { x: 85, y: 85 },
      { x: 170, y: 170 },
      { x: 255, y: 255 },
    ]);
    for (let i = 1; i < 256; i++) {
      expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1]);
    }
  });

  it('handles unsorted input points', () => {
    const lut = buildCurveLut([
      { x: 255, y: 255 },
      { x: 0, y: 0 },
      { x: 128, y: 128 },
    ]);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
    expect(lut[128]).toBe(128);
  });
});
