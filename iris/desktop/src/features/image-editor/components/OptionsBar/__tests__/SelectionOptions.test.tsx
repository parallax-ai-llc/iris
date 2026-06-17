/**
 * SelectionOptions — component integration tests
 *
 * Tests the full user interaction flow:
 * tool switching → Select Subject → Refine Edge → Invert/Deselect
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectionOptions } from '../options/SelectionOptions';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { useUIStore } from '@/shared/stores/ui.store';
import {
  mockSourceAsset,
  mockSelection,
  setupImageEditorTestTab,
} from '@/test-utils/imageEditorHelpers';

// ==================== Module mocks ====================

vi.mock('@/features/image-editor/stores/imageEditor.store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/image-editor/stores/imageEditor.store')>();
  return {
    ...actual,
    useImageEditorStore: actual.useImageEditorStore,
  };
});

// ==================== Store helpers ====================

function setStore(overrides: Record<string, unknown>) {
  useImageEditorStore.setState({
    editMode: 'selection',
    selectionTool: 'rectangle',
    selection: null,
    sourceAsset: mockSourceAsset,
    isProcessing: false,
    processingMessage: '',
    selectionFeather: 0,
    selectionTolerance: 32,
    ...overrides,
  });
}

// ==================== Tests ====================

beforeEach(() => {
  setupImageEditorTestTab(); // fresh active tab per test (registry shim requires one)
});

describe('SelectionOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStore({});
    // Clear UI notifications
    useUIStore.setState({ notifications: [] });
  });

  // S1: Initial rendering (SelectionOptions renders option controls, not tool buttons)
  describe('S1: initial rendering', () => {
    it('shows Feather slider and AA button', () => {
      render(<SelectionOptions />);
      expect(screen.getByText('Feather')).toBeInTheDocument();
      expect(screen.getByText('AA')).toBeInTheDocument();
    });

    it('shows "Select Subject" button', () => {
      render(<SelectionOptions />);
      expect(screen.getByTitle('Select Subject')).toBeInTheDocument();
    });

    it('hides Refine Edge / Invert / Deselect when no selection', () => {
      render(<SelectionOptions />);
      expect(screen.queryByTitle('Refine Edge')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Invert')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Deselect')).not.toBeInTheDocument();
    });
  });

  // S2: Tool-specific controls
  describe('S2: tool-specific controls', () => {
    it('shows Tolerance slider when Magic Wand is selected', () => {
      setStore({ selectionTool: 'magicWand' });
      render(<SelectionOptions />);

      expect(screen.getByText('Tolerance')).toBeInTheDocument();
    });

    it('hides Tolerance slider for rectangle tool', () => {
      setStore({ selectionTool: 'rectangle' });
      render(<SelectionOptions />);

      expect(screen.queryByText('Tolerance')).not.toBeInTheDocument();
    });

    it('shows Tolerance and Fuzziness sliders for colorRange tool', () => {
      setStore({ selectionTool: 'colorRange' });
      render(<SelectionOptions />);

      expect(screen.getByText('Tolerance')).toBeInTheDocument();
      expect(screen.getByText('Fuzziness')).toBeInTheDocument();
    });
  });

  // S3: Select Subject disabled without sourceAsset
  describe('S3: Select Subject disabled state', () => {
    it('disables Select Subject when sourceAsset is null', () => {
      setStore({ sourceAsset: null });
      render(<SelectionOptions />);

      const btn = screen.getByTitle('Select Subject').closest('button');
      expect(btn).toBeDisabled();
    });

    it('enables Select Subject when sourceAsset is present', () => {
      setStore({ sourceAsset: mockSourceAsset });
      render(<SelectionOptions />);

      const btn = screen.getByTitle('Select Subject').closest('button');
      expect(btn).not.toBeDisabled();
    });

    it('disables Select Subject while processing', () => {
      setStore({ isProcessing: true, processingMessage: 'Selecting subject...' });
      render(<SelectionOptions />);

      const btn = screen.getByTitle('Selecting...').closest('button');
      expect(btn).toBeDisabled();
    });
  });

  // S4: Select Subject click → success
  describe('S4: Select Subject success', () => {
    it('shows "Selecting..." label while processing', async () => {
      // Make selectSubject hang until we resolve it
      let resolveSelect!: () => void;
      const selectPromise = new Promise<void>((res) => { resolveSelect = res; });

      const selectSubjectMock = vi.fn(() => selectPromise);
      useImageEditorStore.setState({ selectSubject: selectSubjectMock } as unknown as Parameters<typeof useImageEditorStore.setState>[0]);

      render(<SelectionOptions />);

      const user = userEvent.setup();
      await user.click(screen.getByTitle('Select Subject'));

      // Immediately after click, processing should start
      act(() => {
        useImageEditorStore.setState({ isProcessing: true, processingMessage: 'Selecting subject...' });
      });

      expect(screen.getByTitle('Selecting...')).toBeInTheDocument();

      // Resolve and clean up
      resolveSelect();
    });

    it('shows selection buttons after selection is created', () => {
      setStore({ selection: mockSelection });
      render(<SelectionOptions />);

      expect(screen.getByTitle('Refine Edge')).toBeInTheDocument();
      expect(screen.getByTitle('Invert')).toBeInTheDocument();
      expect(screen.getByTitle('Deselect')).toBeInTheDocument();
    });
  });

  // S5: Select Subject failure → toast.error
  describe('S5: Select Subject failure', () => {
    it('shows error notification when selectSubject throws', async () => {
      const selectSubjectMock = vi.fn().mockRejectedValue(new Error('API unavailable'));
      useImageEditorStore.setState({ selectSubject: selectSubjectMock } as unknown as Parameters<typeof useImageEditorStore.setState>[0]);

      render(<SelectionOptions />);
      const user = userEvent.setup();

      await user.click(screen.getByTitle('Select Subject'));

      await waitFor(() => {
        const notifications = useUIStore.getState().notifications;
        expect(notifications.length).toBeGreaterThan(0);
        expect(notifications[0].type).toBe('error');
        expect(notifications[0].title).toContain('API unavailable');
      });
    });
  });

  // S6: Refine Edge panel toggle
  describe('S6: Refine Edge panel toggle', () => {
    beforeEach(() => {
      setStore({ selection: mockSelection });
    });

    it('shows dropdown panel when "Refine Edge" is clicked', async () => {
      const user = userEvent.setup();
      render(<SelectionOptions />);

      // Use role selector to uniquely target the button (not the panel header div)
      await user.click(screen.getByRole('button', { name: /Refine Edge/i }));

      // Radius, Smooth, Contrast only exist inside the panel
      expect(screen.getByText('Radius')).toBeInTheDocument();
      expect(screen.getByText('Smooth')).toBeInTheDocument();
      expect(screen.getByText('Contrast')).toBeInTheDocument();
      // Feather appears in both the main bar and the panel — confirm at least 2 instances
      expect(screen.getAllByText('Feather').length).toBeGreaterThanOrEqual(2);
    });

    it('hides dropdown panel on second click', async () => {
      const user = userEvent.setup();
      render(<SelectionOptions />);

      // Open — getByRole targets the <button>, not the panel header <div>
      await user.click(screen.getByRole('button', { name: /Refine Edge/i }));
      expect(screen.getByText('Radius')).toBeInTheDocument();

      // Close — when panel is open there are two "Refine Edge" texts (button + header),
      // getByRole still resolves uniquely to the <button>
      await user.click(screen.getByRole('button', { name: /Refine Edge/i }));
      expect(screen.queryByText('Radius')).not.toBeInTheDocument();
    });
  });

  // S7: Refine Edge Apply
  describe('S7: Refine Edge Apply', () => {
    it('closes panel and calls refineEdge after Apply', async () => {
      const refineEdgeMock = vi.fn().mockResolvedValue(undefined);
      useImageEditorStore.setState({
        selection: mockSelection,
        refineEdge: refineEdgeMock,
      } as unknown as Parameters<typeof useImageEditorStore.setState>[0]);

      const user = userEvent.setup();
      render(<SelectionOptions />);

      // Open panel
      await user.click(screen.getByTitle('Refine Edge'));

      // Click Apply
      await user.click(screen.getByText('Apply'));

      expect(refineEdgeMock).toHaveBeenCalledOnce();
      expect(refineEdgeMock).toHaveBeenCalledWith({
        radius: 3,     // default initial value
        smoothing: 3,  // default initial value
        feather: 0,    // default initial value
        contrast: 0,   // default initial value
      });

      // Panel should close
      expect(screen.queryByText('Radius')).not.toBeInTheDocument();
    });

    it('closes panel without calling refineEdge on Cancel', async () => {
      const refineEdgeMock = vi.fn();
      useImageEditorStore.setState({
        selection: mockSelection,
        refineEdge: refineEdgeMock,
      } as unknown as Parameters<typeof useImageEditorStore.setState>[0]);

      const user = userEvent.setup();
      render(<SelectionOptions />);

      await user.click(screen.getByTitle('Refine Edge'));
      await user.click(screen.getByText('Cancel'));

      expect(refineEdgeMock).not.toHaveBeenCalled();
      expect(screen.queryByText('Radius')).not.toBeInTheDocument();
    });
  });

  // S8: Invert
  describe('S8: Invert selection', () => {
    it('calls invertSelection when Invert is clicked', async () => {
      const invertMock = vi.fn();
      useImageEditorStore.setState({
        selection: mockSelection,
        invertSelection: invertMock,
      } as unknown as Parameters<typeof useImageEditorStore.setState>[0]);

      const user = userEvent.setup();
      render(<SelectionOptions />);

      await user.click(screen.getByTitle('Invert'));

      expect(invertMock).toHaveBeenCalledOnce();
    });
  });

  // S9: Deselect
  describe('S9: Deselect', () => {
    it('calls clearSelection when Deselect is clicked', async () => {
      const clearMock = vi.fn();
      useImageEditorStore.setState({
        selection: mockSelection,
        clearSelection: clearMock,
      } as unknown as Parameters<typeof useImageEditorStore.setState>[0]);

      const user = userEvent.setup();
      render(<SelectionOptions />);

      await user.click(screen.getByTitle('Deselect'));

      expect(clearMock).toHaveBeenCalledOnce();
    });
  });
});
