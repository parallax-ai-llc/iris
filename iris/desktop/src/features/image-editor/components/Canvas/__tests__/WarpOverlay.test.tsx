/**
 * WarpOverlay — component integration tests
 *
 * Tests the 3×3 mesh warp overlay:
 * - Conditional rendering (isWarpMode)
 * - 9 draggable handles + mesh lines
 * - Reset / Cancel / Apply Warp buttons
 * - Pointer drag → updateWarpPoint calls
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WarpOverlay } from '../WarpOverlay';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { createDefaultWarpGrid, setupImageEditorTestTab } from '@/test-utils/imageEditorHelpers';

// ==================== Default props ====================

const defaultProps = {
  imageWidth: 800,
  imageHeight: 600,
  containerWidth: 1000,
  containerHeight: 800,
  zoom: 100,
  panOffsetX: 0,
  panOffsetY: 0,
};

const defaultGrid = createDefaultWarpGrid(800, 600);

// ==================== Helpers ====================

function setupWarpMode(overrides: Record<string, unknown> = {}) {
  const resetWarpGrid = vi.fn();
  const exitWarpMode = vi.fn();
  const applyWarp = vi.fn().mockResolvedValue(undefined);
  const updateWarpPoint = vi.fn();

  useImageEditorStore.setState({
    isWarpMode: true,
    warpGrid: defaultGrid,
    resetWarpGrid,
    exitWarpMode,
    applyWarp,
    updateWarpPoint,
    ...overrides,
  } as unknown as Parameters<typeof useImageEditorStore.setState>[0]);

  return { resetWarpGrid, exitWarpMode, applyWarp, updateWarpPoint };
}

// ==================== Tests ====================

beforeEach(() => {
  setupImageEditorTestTab(); // fresh active tab per test (registry shim requires one)
});

describe('WarpOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock SVGElement.setPointerCapture (not in jsdom by default)
    if (!SVGElement.prototype.setPointerCapture) {
      Object.defineProperty(SVGElement.prototype, 'setPointerCapture', {
        value: vi.fn(),
        configurable: true,
        writable: true,
      });
    } else {
      vi.spyOn(SVGElement.prototype, 'setPointerCapture').mockImplementation(vi.fn());
    }

    // Mock getBoundingClientRect for SVG
    vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 1000,
      bottom: 800,
      width: 1000,
      height: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });

  // S1: isWarpMode=false → renders nothing
  describe('S1: hidden when warp mode is off', () => {
    it('returns null when isWarpMode is false', () => {
      useImageEditorStore.setState({
        isWarpMode: false,
        warpGrid: null,
      } as unknown as Parameters<typeof useImageEditorStore.setState>[0]);

      const { container } = render(<WarpOverlay {...defaultProps} />);
      expect(container.firstChild).toBeNull();
    });

    it('returns null when warpGrid is null even if isWarpMode=true', () => {
      useImageEditorStore.setState({
        isWarpMode: true,
        warpGrid: null,
      } as unknown as Parameters<typeof useImageEditorStore.setState>[0]);

      const { container } = render(<WarpOverlay {...defaultProps} />);
      expect(container.firstChild).toBeNull();
    });
  });

  // S2: isWarpMode=true → renders SVG with 9 handles + 12 lines + buttons
  describe('S2: visible when warp mode is on', () => {
    it('renders 9 draggable circle handles', () => {
      setupWarpMode();
      const { container } = render(<WarpOverlay {...defaultProps} />);

      const circles = container.querySelectorAll('circle');
      expect(circles).toHaveLength(9);
    });

    it('renders 12 mesh lines (6 horizontal + 6 vertical)', () => {
      setupWarpMode();
      const { container } = render(<WarpOverlay {...defaultProps} />);

      const lines = container.querySelectorAll('line');
      expect(lines).toHaveLength(12);
    });

    it('renders Reset, Cancel, and Apply Warp buttons', () => {
      setupWarpMode();
      render(<WarpOverlay {...defaultProps} />);

      expect(screen.getByText('Reset')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Apply Warp')).toBeInTheDocument();
    });
  });

  // S3: Reset button
  describe('S3: Reset button', () => {
    it('calls resetWarpGrid when Reset is clicked', async () => {
      const { resetWarpGrid } = setupWarpMode();
      const user = userEvent.setup();
      render(<WarpOverlay {...defaultProps} />);

      await user.click(screen.getByText('Reset'));

      expect(resetWarpGrid).toHaveBeenCalledOnce();
    });
  });

  // S4: Cancel button
  describe('S4: Cancel button', () => {
    it('calls exitWarpMode when Cancel is clicked', async () => {
      const { exitWarpMode } = setupWarpMode();
      const user = userEvent.setup();
      render(<WarpOverlay {...defaultProps} />);

      await user.click(screen.getByText('Cancel'));

      expect(exitWarpMode).toHaveBeenCalledOnce();
    });
  });

  // S5: Apply Warp button
  describe('S5: Apply Warp button', () => {
    it('calls applyWarp when Apply Warp is clicked', async () => {
      const { applyWarp } = setupWarpMode();
      const user = userEvent.setup();
      render(<WarpOverlay {...defaultProps} />);

      await user.click(screen.getByText('Apply Warp'));

      expect(applyWarp).toHaveBeenCalledOnce();
    });
  });

  // S6: Handle drag
  describe('S6: handle pointer drag', () => {
    it('calls updateWarpPoint when handle is dragged', () => {
      const { updateWarpPoint } = setupWarpMode();
      const { container } = render(<WarpOverlay {...defaultProps} />);

      const circles = container.querySelectorAll('circle');
      // Pick the first handle (row=0, col=0)
      const handle = circles[0];

      // Pointer down on handle
      fireEvent.pointerDown(handle, {
        clientX: 100,
        clientY: 100,
        pointerId: 1,
      });

      // Pointer move on SVG
      const svg = container.querySelector('svg')!;
      fireEvent.pointerMove(svg, {
        clientX: 150,
        clientY: 120,
        pointerId: 1,
      });

      expect(updateWarpPoint).toHaveBeenCalledOnce();
      const [row, col, x, y] = (updateWarpPoint as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(row).toBe(0);
      expect(col).toBe(0);
      // x = (clientX - rect.left - originX) / scale
      // originX = (containerWidth - imageWidth * scale) / 2 + panOffsetX
      //         = (1000 - 800 * 1) / 2 + 0 = 100
      // scale = zoom / 100 = 1
      // x = (150 - 0 - 100) / 1 = 50
      expect(x).toBeCloseTo(50);
      expect(y).toBeCloseTo(20);
    });

    it('does NOT call updateWarpPoint if no handle was grabbed first', () => {
      const { updateWarpPoint } = setupWarpMode();
      const { container } = render(<WarpOverlay {...defaultProps} />);

      const svg = container.querySelector('svg')!;

      // Move without prior pointerDown on a handle
      fireEvent.pointerMove(svg, { clientX: 200, clientY: 200 });

      expect(updateWarpPoint).not.toHaveBeenCalled();
    });

    it('stops updating after pointerUp', () => {
      const { updateWarpPoint } = setupWarpMode();
      const { container } = render(<WarpOverlay {...defaultProps} />);

      const circles = container.querySelectorAll('circle');
      const handle = circles[4]; // center handle
      const svg = container.querySelector('svg')!;

      // Start drag
      fireEvent.pointerDown(handle, { clientX: 500, clientY: 400, pointerId: 1 });
      fireEvent.pointerMove(svg, { clientX: 510, clientY: 410, pointerId: 1 });
      expect(updateWarpPoint).toHaveBeenCalledOnce();

      // End drag
      fireEvent.pointerUp(svg, { pointerId: 1 });

      // Move again — should not call updateWarpPoint
      fireEvent.pointerMove(svg, { clientX: 520, clientY: 420, pointerId: 1 });
      expect(updateWarpPoint).toHaveBeenCalledOnce(); // still only 1 call
    });
  });

  // Zoom / pan coordinate transform
  describe('coordinate transform with zoom', () => {
    it('applies zoom scale when converting pointer coords to image coords', () => {
      const { updateWarpPoint } = setupWarpMode();
      const { container } = render(
        <WarpOverlay {...defaultProps} zoom={200} panOffsetX={0} panOffsetY={0} />
      );

      const circles = container.querySelectorAll('circle');
      const svg = container.querySelector('svg')!;

      // With zoom=200: scale=2
      // originX = (1000 - 800*2)/2 + 0 = -300
      // origin Y = (800 - 600*2)/2 + 0 = -200
      // pointer at (100, 100):
      // x = (100 - (-300)) / 2 = 200
      // y = (100 - (-200)) / 2 = 150

      fireEvent.pointerDown(circles[0], { clientX: 0, clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(svg, { clientX: 100, clientY: 100, pointerId: 1 });

      const [, , x, y] = (updateWarpPoint as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(x).toBeCloseTo(200);
      expect(y).toBeCloseTo(150);
    });
  });
});
