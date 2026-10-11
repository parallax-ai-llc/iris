/**
 * Adjustment, fill and text layers (the creation paths the UI calls: Layers
 * panel adjustment menu, assistant commands, Text options "Add Text") follow
 * the layer-structure rule: one history entry each, one undo removes them,
 * the dirty flag follows the history position.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setupImageEditorTestTab } from '@/test-utils/imageEditorHelpers';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';

const IMG = 'data:image/png;base64,AAAA';
const s = () => useImageEditorStore.getState();
const labels = () => s().history.map((h) => h.label);

function openDoc() {
  useImageEditorStore.setState({ canvasWidth: 480, canvasHeight: 320 });
  const id = s().addLayer(IMG, 'Background', { history: false });
  s().updateLayer(id, { width: 480, height: 320 });
  s().pushHistory('Open', '', false);
  return id;
}

const nextTask = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  setupImageEditorTestTab();
});

describe('layer creation history', () => {
  it('addAdjustmentLayer adds one entry; undo removes the layer and the document is clean again', async () => {
    openDoc();
    const id = s().addAdjustmentLayer('levels');
    await nextTask();
    expect(labels()).toEqual(['Open', 'Adjustment Layer']);
    expect(s().layers.map((l) => l.id)).toContain(id);
    expect(s().isDirty).toBe(true);

    s().undo();
    expect(s().layers.map((l) => l.id)).not.toContain(id);
    expect(s().isDirty).toBe(false);

    s().redo();
    expect(s().layers.find((l) => l.id === id)?.type).toBe('adjustment');
    expect(s().isDirty).toBe(true);
  });

  it('addFillLayer adds one entry (not an untracked dirty flag); undo makes the document clean', async () => {
    openDoc();
    s().addFillLayer('solid', { fillColor: '#ff0000' });
    await nextTask();
    expect(labels()).toEqual(['Open', 'Fill Layer']);
    expect(s().layers[0].type).toBe('fill');
    expect(s().isDirty).toBe(true);

    s().undo();
    expect(s().layers.map((l) => l.name)).toEqual(['Background']);
    expect(s().isDirty).toBe(false);
  });

  it('addTextLayer adds one Text entry with text data; undo removes it', async () => {
    openDoc();
    const id = s().addTextLayer('Hello', 20, 30);
    await nextTask();
    expect(labels()).toEqual(['Open', 'Text']);
    const layer = s().layers.find((l) => l.id === id);
    expect(layer?.text?.content).toBe('Hello');
    expect(layer?.width).toBeGreaterThan(0);
    expect(s().isDirty).toBe(true);

    s().undo();
    expect(s().layers.some((l) => l.id === id)).toBe(false);
    expect(s().isDirty).toBe(false);
  });

  it('each creation is its own step (three adds, three undos)', async () => {
    openDoc();
    s().addAdjustmentLayer('curves');
    await nextTask();
    s().addFillLayer('gradient');
    await nextTask();
    s().addTextLayer('A', 0, 0);
    await nextTask();
    expect(labels()).toEqual(['Open', 'Adjustment Layer', 'Fill Layer', 'Text']);
    s().undo();
    s().undo();
    s().undo();
    expect(s().layers.map((l) => l.name)).toEqual(['Background']);
  });
});

describe('text re-edit history', () => {
  it('updating a text layer then pushing Text restores the previous text on undo', async () => {
    openDoc();
    const id = s().addTextLayer('Hello', 20, 30);
    await nextTask();
    const before = s().layers.find((l) => l.id === id)!;

    // What TextOverlay's commit does for a changed re-edit
    s().updateLayer(id, { text: { content: 'Hello X', settings: before.text!.settings }, imageData: 'data:image/png;base64,NEW' });
    s().pushHistory('Text', 'data:image/png;base64,NEW');
    expect(labels()).toEqual(['Open', 'Text', 'Text']);
    expect(s().layers.filter((l) => l.text)).toHaveLength(1);

    s().undo();
    const restored = s().layers.find((l) => l.id === id)!;
    expect(restored.text?.content).toBe('Hello');
    expect(restored.imageData).toBe(before.imageData);
  });

  it('requestTextEdit selects a text layer, switches to the text tool and records the request', async () => {
    openDoc();
    const id = s().addTextLayer('Hello', 20, 30);
    await nextTask();
    s().setEditMode('none');
    expect(s().requestTextEdit(id)).toBe(true);
    expect(s().editMode).toBe('text');
    expect(s().activeLayerId).toBe(id);
    expect(s().textEditRequest).toBe(id);
    s().clearTextEditRequest();
    expect(s().textEditRequest).toBeNull();
  });

  it('requestTextEdit ignores layers without text data', () => {
    const bg = openDoc();
    expect(s().requestTextEdit(bg)).toBe(false);
    expect(s().textEditRequest).toBeNull();
  });
});
