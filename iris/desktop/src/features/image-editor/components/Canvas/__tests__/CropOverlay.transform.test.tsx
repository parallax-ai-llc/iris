/**
 * #14 The crop overlay maps the pointer like the other overlays: rotation and
 * flip of the view are taken into account.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { CropOverlay } from '../CropOverlay';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { setupImageEditorTestTab } from '@/test-utils/imageEditorHelpers';

// 400x400 container, 200x100 image at zoom 100 -> image spans x 100..300, y 150..250 on screen.
function renderOverlay() {
  const container = document.createElement('div');
  container.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
  const containerRef = { current: container };
  const view = render(
    <CropOverlay containerRef={containerRef} imageDimensions={{ width: 200, height: 100 }} zoom={100} panOffset={{ x: 0, y: 0 }} />,
  );
  return view.container.firstChild as HTMLElement;
}

beforeEach(() => {
  setupImageEditorTestTab();
  useImageEditorStore.setState({ editMode: 'crop', cropData: null });
});

describe('CropOverlay pointer mapping', () => {
  it('without rotation the pointer maps straight to image pixels', () => {
    const root = renderOverlay();
    fireEvent.mouseDown(root, { button: 0, clientX: 110, clientY: 160 });
    const crop = useImageEditorStore.getState().cropData!;
    expect([Math.round(crop.x), Math.round(crop.y)]).toEqual([10, 10]);
  });

  it('rotated 180 degrees: the top-left of the screen image is the bottom-right of the image', () => {
    useImageEditorStore.setState({ rotation: 180 });
    const root = renderOverlay();
    fireEvent.mouseDown(root, { button: 0, clientX: 110, clientY: 160 });
    const crop = useImageEditorStore.getState().cropData!;
    expect([Math.round(crop.x), Math.round(crop.y)]).toEqual([190, 90]);
  });

  it('flipped horizontally: x is mirrored', () => {
    useImageEditorStore.setState({ flipHorizontal: true });
    const root = renderOverlay();
    fireEvent.mouseDown(root, { button: 0, clientX: 110, clientY: 160 });
    const crop = useImageEditorStore.getState().cropData!;
    expect([Math.round(crop.x), Math.round(crop.y)]).toEqual([190, 10]);
  });

  it('moving an existing box under a horizontal flip follows the pointer in image space', () => {
    useImageEditorStore.setState({ flipHorizontal: true, cropData: { x: 50, y: 20, width: 60, height: 40 } });
    const root = renderOverlay();
    // Screen x of image x=80 under flip: 100 + (200 - 80) = 220; image y 40 -> screen 190
    fireEvent.mouseDown(root, { button: 0, clientX: 220, clientY: 190 });
    fireEvent.mouseMove(window, { clientX: 210, clientY: 190 });
    const crop = useImageEditorStore.getState().cropData!;
    // Screen left by 10 = image right by 10
    expect([Math.round(crop.x), Math.round(crop.y)]).toEqual([60, 20]);
  });
});
