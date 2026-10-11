/**
 * "Save and Close": the tab may only close after a save that actually wrote
 * the file. A cancelled dialog, a cancelled overwrite or a failed upload must
 * keep the tab (and drop the pending close so a later save does not close it).
 */

import { describe, expect, it, vi } from 'vitest';
import { createAfterSaveSlot } from '../afterSave';

describe('createAfterSaveSlot', () => {
  it('runs the callback once after a successful save', () => {
    const slot = createAfterSaveSlot();
    const close = vi.fn();
    slot.set(close);
    slot.settle(true);
    slot.settle(true);
    expect(close).toHaveBeenCalledTimes(1);
    expect(slot.pending).toBe(false);
  });

  it('drops the callback when the save failed or was cancelled', () => {
    const slot = createAfterSaveSlot();
    const close = vi.fn();
    slot.set(close);
    slot.settle(false);
    expect(close).not.toHaveBeenCalled();
    expect(slot.pending).toBe(false);

    // a later, unrelated save must not close the tab
    slot.settle(true);
    expect(close).not.toHaveBeenCalled();
  });

  it('clear() forgets a pending close (dialog dismissed)', () => {
    const slot = createAfterSaveSlot();
    const close = vi.fn();
    slot.set(close);
    expect(slot.pending).toBe(true);
    slot.clear();
    slot.settle(true);
    expect(close).not.toHaveBeenCalled();
  });
});
