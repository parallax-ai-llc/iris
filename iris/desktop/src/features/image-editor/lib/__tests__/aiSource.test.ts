/**
 * Which image an AI tool sends: the original asset only while the document is
 * still exactly that asset; otherwise the current document, composited from
 * the layers and uploaded (so crops, strokes and filters are not lost and the
 * inpaint mask lines up with what the user sees).
 */

import { describe, expect, it, vi } from 'vitest';
import type { Layer } from '@/features/image-editor/stores/imageEditor.store';
import { mockSourceAsset } from '@/test-utils/imageEditorHelpers';
import { documentMatchesSource, resolveAIInputAssetId, type AISourceState } from '../aiSource';

const BG: Layer = {
  id: 'bg',
  name: 'Background',
  visible: true,
  locked: false,
  opacity: 100,
  blendMode: 'normal',
  imageData: 'data:bg',
  x: 0,
  y: 0,
  width: 640,
  height: 480,
};

function state(patch: Partial<AISourceState> = {}): AISourceState {
  return {
    sourceAsset: mockSourceAsset,
    layers: [BG],
    history: [{ label: 'Open' }],
    historyIndex: 0,
    hasUntrackedChanges: false,
    canvasWidth: 640,
    canvasHeight: 480,
    ...patch,
  };
}

function deps() {
  return {
    flattenLayersToBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
    uploadImage: vi.fn(async () => ({ ...mockSourceAsset, id: 'uploaded-1' })),
  };
}

describe('documentMatchesSource', () => {
  it('is true right after opening (only the Open baseline, one plain layer)', () => {
    expect(documentMatchesSource(state())).toBe(true);
    expect(documentMatchesSource(state({ history: [], historyIndex: -1 }))).toBe(true);
  });

  it('is false after any edit in history (stroke, crop, filter ...)', () => {
    expect(
      documentMatchesSource(state({ history: [{ label: 'Open' }, { label: 'Crop' }], historyIndex: 1 })),
    ).toBe(false);
  });

  it('is true again after undoing back to Open', () => {
    expect(
      documentMatchesSource(state({ history: [{ label: 'Open' }, { label: 'Brush' }], historyIndex: 0 })),
    ).toBe(true);
  });

  it('is false with untracked changes, a modified single layer, or a local document', () => {
    expect(documentMatchesSource(state({ hasUntrackedChanges: true }))).toBe(false);
    expect(documentMatchesSource(state({ layers: [{ ...BG, opacity: 50 }] }))).toBe(false);
    expect(documentMatchesSource(state({ layers: [{ ...BG, visible: false }] }))).toBe(false);
    expect(documentMatchesSource(state({ layers: [{ ...BG, mask: { data: 'data:m', enabled: true, linked: true } }] }))).toBe(false);
    expect(documentMatchesSource(state({ layers: [{ ...BG, x: 10 }] }))).toBe(false);
    expect(documentMatchesSource(state({ sourceAsset: { ...mockSourceAsset, id: 'local-123' } }))).toBe(false);
    expect(documentMatchesSource(state({ sourceAsset: { ...mockSourceAsset, mimeType: 'image/vnd.adobe.photoshop' } }))).toBe(false);
  });
});

describe('resolveAIInputAssetId', () => {
  it('sends the original asset when the document is unchanged (no upload)', async () => {
    const d = deps();
    expect(await resolveAIInputAssetId(state(), d)).toBe(mockSourceAsset.id);
    expect(d.uploadImage).not.toHaveBeenCalled();
  });

  it('single-layer document edited after opening: uploads the current composite and sends that', async () => {
    const d = deps();
    const cropped = state({
      layers: [{ ...BG, width: 300, height: 200 }],
      canvasWidth: 300,
      canvasHeight: 200,
      history: [{ label: 'Open' }, { label: 'Crop' }],
      historyIndex: 1,
    });

    const id = await resolveAIInputAssetId(cropped, d);

    expect(id).toBe('uploaded-1');
    // composited at the CURRENT document size (crop), so mask coordinates match
    expect(d.flattenLayersToBlob).toHaveBeenCalledWith(cropped.layers, 300, 200);
    expect(d.uploadImage).toHaveBeenCalledTimes(1);
  });

  it('returns null when there is no source asset or the upload fails', async () => {
    expect(await resolveAIInputAssetId(state({ sourceAsset: null }), deps())).toBeNull();
    const d = deps();
    d.uploadImage.mockResolvedValueOnce(null as never);
    await expect(resolveAIInputAssetId(state({ hasUntrackedChanges: true }), d)).rejects.toThrow();
  });
});
