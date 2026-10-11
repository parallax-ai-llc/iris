import { describe, it, expect } from 'vitest';
import { moveDragHistoryLabel } from '../moveLayerHistory';

describe('moveDragHistoryLabel', () => {
  it('a click without movement records nothing', () => {
    expect(moveDragHistoryLabel({ x: 5, y: 5, duplicated: false }, { x: 5, y: 5 })).toBeNull();
  });
  it('a real move records Move Layer', () => {
    expect(moveDragHistoryLabel({ x: 5, y: 5, duplicated: false }, { x: 6, y: 5 })).toBe('Move Layer');
    expect(moveDragHistoryLabel({ x: 5, y: 5, duplicated: true }, { x: 5, y: 9 })).toBe('Move Layer');
  });
  it('an Alt+click duplicate without movement records the duplicate', () => {
    expect(moveDragHistoryLabel({ x: 5, y: 5, duplicated: true }, { x: 5, y: 5 })).toBe('Layer Duplicated');
  });
  it('a layer that disappeared records nothing unless duplicated', () => {
    expect(moveDragHistoryLabel({ x: 0, y: 0, duplicated: false }, undefined)).toBeNull();
  });
});
