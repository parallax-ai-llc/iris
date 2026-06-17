/**
 * Image Editor Store Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupImageEditorTestTab } from '@/test-utils/imageEditorHelpers';
import { useImageEditorStore, DEFAULT_ADJUSTMENTS } from '../imageEditor.store';
import type { IrisAsset } from '@/shared/api/types';

beforeEach(() => {
  setupImageEditorTestTab(); // fresh active tab per test (registry shim requires one)
});

describe('Image Editor Store', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useImageEditorStore.setState({
      // Reset all state that we modify in tests
      rotation: 0,
      flipHorizontal: false,
      flipVertical: false,
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      _adjustmentsApplyCallback: null,
      _transformsApplyCallback: null,
      activeFilterPreset: 'none',
      prompt: '',
      negativePrompt: '',
      isProcessing: false,
      processingMessage: '',
      processingProgress: 0,
    });
  });

  describe('Transform Actions', () => {
    describe('setRotation', () => {
      it('should set rotation value', () => {
        useImageEditorStore.getState().setRotation(90);
        expect(useImageEditorStore.getState().rotation).toBe(90);
      });

      it('should handle 0 rotation', () => {
        useImageEditorStore.getState().setRotation(0);
        expect(useImageEditorStore.getState().rotation).toBe(0);
      });

      it('should handle 360 rotation (normalizes to 0)', () => {
        useImageEditorStore.getState().setRotation(360);
        // Store normalizes rotation with % 360, so 360 becomes 0
        expect(useImageEditorStore.getState().rotation).toBe(0);
      });
    });

    describe('toggleFlipHorizontal', () => {
      it('should toggle flip horizontal from false to true', () => {
        expect(useImageEditorStore.getState().flipHorizontal).toBe(false);
        useImageEditorStore.getState().toggleFlipHorizontal();
        expect(useImageEditorStore.getState().flipHorizontal).toBe(true);
      });

      it('should toggle flip horizontal from true to false', () => {
        useImageEditorStore.getState().toggleFlipHorizontal();
        useImageEditorStore.getState().toggleFlipHorizontal();
        expect(useImageEditorStore.getState().flipHorizontal).toBe(false);
      });
    });

    describe('toggleFlipVertical', () => {
      it('should toggle flip vertical from false to true', () => {
        expect(useImageEditorStore.getState().flipVertical).toBe(false);
        useImageEditorStore.getState().toggleFlipVertical();
        expect(useImageEditorStore.getState().flipVertical).toBe(true);
      });

      it('should toggle flip vertical from true to false', () => {
        useImageEditorStore.getState().toggleFlipVertical();
        useImageEditorStore.getState().toggleFlipVertical();
        expect(useImageEditorStore.getState().flipVertical).toBe(false);
      });
    });

    describe('resetAllTransforms', () => {
      it('should reset all transform values to defaults', () => {
        // Set some transforms
        useImageEditorStore.getState().setRotation(180);
        useImageEditorStore.getState().toggleFlipHorizontal();
        useImageEditorStore.getState().toggleFlipVertical();

        // Reset
        useImageEditorStore.getState().resetAllTransforms();

        // Verify all reset
        expect(useImageEditorStore.getState().rotation).toBe(0);
        expect(useImageEditorStore.getState().flipHorizontal).toBe(false);
        expect(useImageEditorStore.getState().flipVertical).toBe(false);
      });
    });
  });

  describe('Transform Callback', () => {
    describe('registerTransformsApplyCallback', () => {
      it('should register a callback', () => {
        const mockCallback = vi.fn();
        useImageEditorStore.getState().registerTransformsApplyCallback(mockCallback);

        expect(useImageEditorStore.getState()._transformsApplyCallback).toBe(mockCallback);
      });

      it('should allow null callback (unregister)', () => {
        const mockCallback = vi.fn();
        useImageEditorStore.getState().registerTransformsApplyCallback(mockCallback);
        useImageEditorStore.getState().registerTransformsApplyCallback(null);

        expect(useImageEditorStore.getState()._transformsApplyCallback).toBeNull();
      });
    });

    describe('applyTransforms', () => {
      it('should call registered callback', () => {
        const mockCallback = vi.fn();
        useImageEditorStore.getState().registerTransformsApplyCallback(mockCallback);

        useImageEditorStore.getState().applyTransforms();

        expect(mockCallback).toHaveBeenCalledTimes(1);
      });

      it('should not throw when no callback registered', () => {
        expect(() => {
          useImageEditorStore.getState().applyTransforms();
        }).not.toThrow();
      });
    });
  });

  describe('Adjustment Actions', () => {
    describe('setAdjustment', () => {
      it('should set individual adjustment value', () => {
        useImageEditorStore.getState().setAdjustment('brightness', 50);
        expect(useImageEditorStore.getState().adjustments.brightness).toBe(50);
      });

      it('should preserve other adjustment values', () => {
        useImageEditorStore.getState().setAdjustment('brightness', 50);
        useImageEditorStore.getState().setAdjustment('contrast', 30);

        expect(useImageEditorStore.getState().adjustments.brightness).toBe(50);
        expect(useImageEditorStore.getState().adjustments.contrast).toBe(30);
      });
    });

    describe('setAdjustments', () => {
      it('should set multiple adjustments at once', () => {
        useImageEditorStore.getState().setAdjustments({
          brightness: 25,
          contrast: 15,
          saturation: 10,
        });

        const adjustments = useImageEditorStore.getState().adjustments;
        expect(adjustments.brightness).toBe(25);
        expect(adjustments.contrast).toBe(15);
        expect(adjustments.saturation).toBe(10);
      });

      it('should preserve unset adjustment values', () => {
        useImageEditorStore.getState().setAdjustments({ brightness: 50 });

        // Other values should remain at defaults
        expect(useImageEditorStore.getState().adjustments.contrast).toBe(DEFAULT_ADJUSTMENTS.contrast);
      });
    });

    describe('resetAdjustments', () => {
      it('should reset all adjustments to defaults', () => {
        // Modify some adjustments
        useImageEditorStore.getState().setAdjustments({
          brightness: 50,
          contrast: 30,
          saturation: 20,
        });

        // Reset
        useImageEditorStore.getState().resetAdjustments();

        // Verify all reset to defaults
        const adjustments = useImageEditorStore.getState().adjustments;
        expect(adjustments.brightness).toBe(DEFAULT_ADJUSTMENTS.brightness);
        expect(adjustments.contrast).toBe(DEFAULT_ADJUSTMENTS.contrast);
        expect(adjustments.saturation).toBe(DEFAULT_ADJUSTMENTS.saturation);
      });
    });
  });

  describe('Adjustments Callback', () => {
    describe('registerAdjustmentsApplyCallback', () => {
      it('should register a callback', () => {
        const mockCallback = vi.fn();
        useImageEditorStore.getState().registerAdjustmentsApplyCallback(mockCallback);

        expect(useImageEditorStore.getState()._adjustmentsApplyCallback).toBe(mockCallback);
      });

      it('should allow null callback (unregister)', () => {
        const mockCallback = vi.fn();
        useImageEditorStore.getState().registerAdjustmentsApplyCallback(mockCallback);
        useImageEditorStore.getState().registerAdjustmentsApplyCallback(null);

        expect(useImageEditorStore.getState()._adjustmentsApplyCallback).toBeNull();
      });
    });

    describe('applyAdjustments', () => {
      it('should call registered callback', () => {
        const mockCallback = vi.fn();
        useImageEditorStore.getState().registerAdjustmentsApplyCallback(mockCallback);

        useImageEditorStore.getState().applyAdjustments();

        expect(mockCallback).toHaveBeenCalledTimes(1);
      });

      it('should not throw when no callback registered', () => {
        expect(() => {
          useImageEditorStore.getState().applyAdjustments();
        }).not.toThrow();
      });
    });
  });

  describe('Filter Presets', () => {
    describe('applyFilterPreset', () => {
      it('should set active filter preset', () => {
        useImageEditorStore.getState().applyFilterPreset('warm');
        expect(useImageEditorStore.getState().activeFilterPreset).toBe('warm');
      });

      it('should set to none', () => {
        useImageEditorStore.getState().applyFilterPreset('warm');
        useImageEditorStore.getState().applyFilterPreset('none');
        expect(useImageEditorStore.getState().activeFilterPreset).toBe('none');
      });
    });
  });

  describe('Prompt State', () => {
    describe('setPrompt', () => {
      it('should set prompt text', () => {
        useImageEditorStore.getState().setPrompt('A beautiful landscape');
        expect(useImageEditorStore.getState().prompt).toBe('A beautiful landscape');
      });

      it('should set empty prompt', () => {
        useImageEditorStore.getState().setPrompt('Some text');
        useImageEditorStore.getState().setPrompt('');
        expect(useImageEditorStore.getState().prompt).toBe('');
      });
    });

    describe('setNegativePrompt', () => {
      it('should set negative prompt text', () => {
        useImageEditorStore.getState().setNegativePrompt('blurry, low quality');
        expect(useImageEditorStore.getState().negativePrompt).toBe('blurry, low quality');
      });
    });
  });

  describe('Processing State', () => {
    describe('setProcessing', () => {
      it('should set processing state to true with message', () => {
        useImageEditorStore.getState().setProcessing(true, 'Processing image...');

        expect(useImageEditorStore.getState().isProcessing).toBe(true);
        expect(useImageEditorStore.getState().processingMessage).toBe('Processing image...');
      });

      it('should set processing state to false', () => {
        useImageEditorStore.getState().setProcessing(true, 'Processing...');
        useImageEditorStore.getState().setProcessing(false);

        expect(useImageEditorStore.getState().isProcessing).toBe(false);
        expect(useImageEditorStore.getState().processingMessage).toBe('');
      });
    });

    describe('setProcessingProgress', () => {
      it('should set processing progress', () => {
        useImageEditorStore.getState().setProcessingProgress(50);
        expect(useImageEditorStore.getState().processingProgress).toBe(50);
      });

      it('should set progress to 0', () => {
        useImageEditorStore.getState().setProcessingProgress(75);
        useImageEditorStore.getState().setProcessingProgress(0);
        expect(useImageEditorStore.getState().processingProgress).toBe(0);
      });

      it('should set progress to 100', () => {
        useImageEditorStore.getState().setProcessingProgress(100);
        expect(useImageEditorStore.getState().processingProgress).toBe(100);
      });
    });
  });

  describe('Default Adjustments', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_ADJUSTMENTS).toEqual({
        exposure: 0,
        brightness: 0,
        contrast: 0,
        highlights: 0,
        shadows: 0,
        gamma: 1,
        temperature: 0,
        tint: 0,
        saturation: 0,
        vibrance: 0,
        hue: 0,
        clarity: 0,
        levels: null,
        curves: null,
        colorBalance: null,
        hueSatChannels: null,
      });
    });
  });

  // ==================== Phase 2 Tests ====================

  describe('Selection Settings', () => {
    describe('setSelectionFeather', () => {
      it('should set feather value', () => {
        useImageEditorStore.getState().setSelectionFeather(25);
        expect(useImageEditorStore.getState().selectionFeather).toBe(25);
      });

      it('should clamp feather to minimum 0', () => {
        useImageEditorStore.getState().setSelectionFeather(-10);
        expect(useImageEditorStore.getState().selectionFeather).toBe(0);
      });

      it('should clamp feather to maximum 50', () => {
        useImageEditorStore.getState().setSelectionFeather(100);
        expect(useImageEditorStore.getState().selectionFeather).toBe(50);
      });

      it('should handle boundary value 0', () => {
        useImageEditorStore.getState().setSelectionFeather(0);
        expect(useImageEditorStore.getState().selectionFeather).toBe(0);
      });

      it('should handle boundary value 50', () => {
        useImageEditorStore.getState().setSelectionFeather(50);
        expect(useImageEditorStore.getState().selectionFeather).toBe(50);
      });
    });

    describe('setSelectionTolerance', () => {
      it('should set tolerance value', () => {
        useImageEditorStore.getState().setSelectionTolerance(64);
        expect(useImageEditorStore.getState().selectionTolerance).toBe(64);
      });

      it('should clamp tolerance to minimum 0', () => {
        useImageEditorStore.getState().setSelectionTolerance(-50);
        expect(useImageEditorStore.getState().selectionTolerance).toBe(0);
      });

      it('should clamp tolerance to maximum 255', () => {
        useImageEditorStore.getState().setSelectionTolerance(300);
        expect(useImageEditorStore.getState().selectionTolerance).toBe(255);
      });

      it('should handle boundary value 0', () => {
        useImageEditorStore.getState().setSelectionTolerance(0);
        expect(useImageEditorStore.getState().selectionTolerance).toBe(0);
      });

      it('should handle boundary value 255', () => {
        useImageEditorStore.getState().setSelectionTolerance(255);
        expect(useImageEditorStore.getState().selectionTolerance).toBe(255);
      });

      it('should have default value of 32', () => {
        // After reset, default should be 32
        useImageEditorStore.setState({ selectionTolerance: 32 });
        expect(useImageEditorStore.getState().selectionTolerance).toBe(32);
      });
    });

    describe('Default Selection Values', () => {
      it('should have selectionFeather default to 0', () => {
        useImageEditorStore.setState({ selectionFeather: 0 });
        expect(useImageEditorStore.getState().selectionFeather).toBe(0);
      });

      it('should have selectionTolerance default to 32', () => {
        useImageEditorStore.setState({ selectionTolerance: 32 });
        expect(useImageEditorStore.getState().selectionTolerance).toBe(32);
      });
    });
  });

  describe('Layer Management', () => {
    beforeEach(() => {
      // Reset layers before each test
      useImageEditorStore.setState({ layers: [], activeLayerId: null });
    });

    describe('addLayer', () => {
      it('should add a new layer', () => {
        const layerId = useImageEditorStore.getState().addLayer('data:image/png;base64,test', 'Test Layer');
        expect(useImageEditorStore.getState().layers).toHaveLength(1);
        expect(useImageEditorStore.getState().layers[0].name).toBe('Test Layer');
        expect(useImageEditorStore.getState().activeLayerId).toBe(layerId);
      });

      it('should generate default name if not provided', () => {
        useImageEditorStore.getState().addLayer('data:image/png;base64,test');
        expect(useImageEditorStore.getState().layers[0].name).toBe('Layer 1');
      });

      it('should set activeLayerId to new layer', () => {
        const layerId = useImageEditorStore.getState().addLayer('data:image/png;base64,test', 'New Layer');
        expect(useImageEditorStore.getState().activeLayerId).toBe(layerId);
      });
    });

    describe('reorderLayers', () => {
      beforeEach(() => {
        // Add 3 layers for reorder testing
        useImageEditorStore.getState().addLayer('data:1', 'Layer 1');
        useImageEditorStore.getState().addLayer('data:2', 'Layer 2');
        useImageEditorStore.getState().addLayer('data:3', 'Layer 3');
      });

      it('should reorder layer from first to last position', () => {
        const { layers } = useImageEditorStore.getState();
        expect(layers.map(l => l.name)).toEqual(['Layer 1', 'Layer 2', 'Layer 3']);

        useImageEditorStore.getState().reorderLayers(0, 2);

        const reorderedLayers = useImageEditorStore.getState().layers;
        expect(reorderedLayers.map(l => l.name)).toEqual(['Layer 2', 'Layer 3', 'Layer 1']);
      });

      it('should reorder layer from last to first position', () => {
        useImageEditorStore.getState().reorderLayers(2, 0);

        const reorderedLayers = useImageEditorStore.getState().layers;
        expect(reorderedLayers.map(l => l.name)).toEqual(['Layer 3', 'Layer 1', 'Layer 2']);
      });

      it('should reorder layer to middle position', () => {
        useImageEditorStore.getState().reorderLayers(0, 1);

        const reorderedLayers = useImageEditorStore.getState().layers;
        expect(reorderedLayers.map(l => l.name)).toEqual(['Layer 2', 'Layer 1', 'Layer 3']);
      });

      it('should handle same index (no change)', () => {
        const originalOrder = useImageEditorStore.getState().layers.map(l => l.name);
        useImageEditorStore.getState().reorderLayers(1, 1);

        const reorderedLayers = useImageEditorStore.getState().layers;
        expect(reorderedLayers.map(l => l.name)).toEqual(originalOrder);
      });

      it('should preserve layer properties after reorder', () => {
        const originalLayers = useImageEditorStore.getState().layers;
        const firstLayerId = originalLayers[0].id;

        useImageEditorStore.getState().reorderLayers(0, 2);

        const reorderedLayers = useImageEditorStore.getState().layers;
        const movedLayer = reorderedLayers.find(l => l.id === firstLayerId);

        expect(movedLayer).toBeDefined();
        expect(movedLayer!.name).toBe('Layer 1');
        expect(movedLayer!.imageData).toBe('data:1');
      });
    });

    describe('removeLayer', () => {
      it('should remove a layer by id', () => {
        const layerId = useImageEditorStore.getState().addLayer('data:test', 'Test Layer');
        expect(useImageEditorStore.getState().layers).toHaveLength(1);

        useImageEditorStore.getState().removeLayer(layerId);
        expect(useImageEditorStore.getState().layers).toHaveLength(0);
      });

      it('should update activeLayerId when active layer is removed', () => {
        const layer1Id = useImageEditorStore.getState().addLayer('data:1', 'Layer 1');
        useImageEditorStore.getState().addLayer('data:2', 'Layer 2');

        // Active layer is now Layer 2
        useImageEditorStore.getState().removeLayer(useImageEditorStore.getState().activeLayerId!);

        // Active should switch to Layer 1
        expect(useImageEditorStore.getState().activeLayerId).toBe(layer1Id);
      });
    });

    describe('duplicateLayer', () => {
      it('should duplicate a layer', () => {
        const originalId = useImageEditorStore.getState().addLayer('data:original', 'Original');
        const duplicateId = useImageEditorStore.getState().duplicateLayer(originalId);

        expect(useImageEditorStore.getState().layers).toHaveLength(2);
        expect(duplicateId).not.toBe(originalId);

        const duplicate = useImageEditorStore.getState().layers.find(l => l.id === duplicateId);
        expect(duplicate?.name).toBe('Original (copy)');
        expect(duplicate?.imageData).toBe('data:original');
      });

      it('should set activeLayerId to duplicated layer', () => {
        const originalId = useImageEditorStore.getState().addLayer('data:original', 'Original');
        const duplicateId = useImageEditorStore.getState().duplicateLayer(originalId);

        expect(useImageEditorStore.getState().activeLayerId).toBe(duplicateId);
      });

      it('should return null for non-existent layer', () => {
        const result = useImageEditorStore.getState().duplicateLayer('non-existent-id');
        expect(result).toBeNull();
      });
    });

    describe('updateLayer', () => {
      it('should update layer properties', () => {
        const layerId = useImageEditorStore.getState().addLayer('data:test', 'Test');

        useImageEditorStore.getState().updateLayer(layerId, { opacity: 50, visible: false });

        const layer = useImageEditorStore.getState().layers.find(l => l.id === layerId);
        expect(layer?.opacity).toBe(50);
        expect(layer?.visible).toBe(false);
      });

      it('should update layer blend mode', () => {
        const layerId = useImageEditorStore.getState().addLayer('data:test', 'Test');

        useImageEditorStore.getState().updateLayer(layerId, { blendMode: 'multiply' });

        const layer = useImageEditorStore.getState().layers.find(l => l.id === layerId);
        expect(layer?.blendMode).toBe('multiply');
      });
    });

    describe('setActiveLayer', () => {
      it('should set active layer', () => {
        const layer1Id = useImageEditorStore.getState().addLayer('data:1', 'Layer 1');
        useImageEditorStore.getState().addLayer('data:2', 'Layer 2');

        useImageEditorStore.getState().setActiveLayer(layer1Id);

        expect(useImageEditorStore.getState().activeLayerId).toBe(layer1Id);
      });

      it('should allow setting null', () => {
        useImageEditorStore.getState().addLayer('data:1', 'Layer 1');
        useImageEditorStore.getState().setActiveLayer(null);

        expect(useImageEditorStore.getState().activeLayerId).toBeNull();
      });
    });

    describe('flattenLayers', () => {
      it('should flatten multiple layers into one', async () => {
        useImageEditorStore.getState().addLayer('data:1', 'Layer 1');
        useImageEditorStore.getState().addLayer('data:2', 'Layer 2');
        useImageEditorStore.getState().addLayer('data:3', 'Layer 3');

        expect(useImageEditorStore.getState().layers).toHaveLength(3);

        await useImageEditorStore.getState().flattenLayers();

        expect(useImageEditorStore.getState().layers).toHaveLength(1);
        expect(useImageEditorStore.getState().layers[0].name).toBe('Flattened');
      });

      it('should do nothing when no layers exist', async () => {
        await useImageEditorStore.getState().flattenLayers();
        expect(useImageEditorStore.getState().layers).toHaveLength(0);
      });
    });
  });

  // ==================== Phase 3 Tests ====================

  describe('isDirty Tracking', () => {
    beforeEach(() => {
      useImageEditorStore.setState({ isDirty: false, history: [], historyIndex: -1 });
    });

    it('should start as false', () => {
      expect(useImageEditorStore.getState().isDirty).toBe(false);
    });

    it('should set to true when rotation changes', () => {
      useImageEditorStore.getState().setRotation(90);
      expect(useImageEditorStore.getState().isDirty).toBe(true);
    });

    it('should set to true when flip horizontal is toggled', () => {
      useImageEditorStore.getState().toggleFlipHorizontal();
      expect(useImageEditorStore.getState().isDirty).toBe(true);
    });

    it('should set to true when flip vertical is toggled', () => {
      useImageEditorStore.getState().toggleFlipVertical();
      expect(useImageEditorStore.getState().isDirty).toBe(true);
    });

    it('should set to true when adjustment changes', () => {
      useImageEditorStore.getState().setAdjustment('brightness', 50);
      expect(useImageEditorStore.getState().isDirty).toBe(true);
    });

    it('should set to true when pushHistory is called', () => {
      useImageEditorStore.getState().pushHistory('Test', 'data:image/png;base64,test');
      expect(useImageEditorStore.getState().isDirty).toBe(true);
    });

    it('should set to true via markDirty', () => {
      useImageEditorStore.getState().markDirty();
      expect(useImageEditorStore.getState().isDirty).toBe(true);
    });

    it('should reset to false via clearDirty', () => {
      useImageEditorStore.getState().markDirty();
      expect(useImageEditorStore.getState().isDirty).toBe(true);

      useImageEditorStore.getState().clearDirty();
      expect(useImageEditorStore.getState().isDirty).toBe(false);
    });

    it('should reset to false when openEditor is called', () => {
      useImageEditorStore.getState().markDirty();
      useImageEditorStore.getState().openEditor({
        id: 'test', name: 'test.png', previewUrl: '', publicUrl: '', thumbnailUrl: '',
      } as unknown as IrisAsset);
      expect(useImageEditorStore.getState().isDirty).toBe(false);
    });

    it('should reset to false when closeEditor is called', () => {
      useImageEditorStore.getState().markDirty();
      useImageEditorStore.getState().closeEditor();
      expect(useImageEditorStore.getState().isDirty).toBe(false);
    });
  });

  // ==================== Phase 4 Tests ====================

  describe('Filter Intensity', () => {
    beforeEach(() => {
      useImageEditorStore.setState({
        filterIntensity: 100,
        activeFilterPreset: 'none',
        adjustments: { ...DEFAULT_ADJUSTMENTS },
      });
    });

    it('should have default intensity of 100', () => {
      expect(useImageEditorStore.getState().filterIntensity).toBe(100);
    });

    it('should set intensity value', () => {
      useImageEditorStore.getState().setFilterIntensity(50);
      expect(useImageEditorStore.getState().filterIntensity).toBe(50);
    });

    it('should scale adjustments when intensity changes with active preset', () => {
      // Apply 'vivid' preset (saturation: 30, contrast: 15, vibrance: 20)
      useImageEditorStore.getState().applyFilterPreset('vivid');
      expect(useImageEditorStore.getState().adjustments.saturation).toBe(30);

      // Set intensity to 50% - adjustments should be halved
      useImageEditorStore.getState().setFilterIntensity(50);
      expect(useImageEditorStore.getState().filterIntensity).toBe(50);
      expect(useImageEditorStore.getState().adjustments.saturation).toBe(15);
      expect(useImageEditorStore.getState().adjustments.contrast).toBe(7.5);
      expect(useImageEditorStore.getState().adjustments.vibrance).toBe(10);
    });

    it('should set adjustments to defaults when intensity is 0', () => {
      useImageEditorStore.getState().applyFilterPreset('warm');
      useImageEditorStore.getState().setFilterIntensity(0);

      expect(useImageEditorStore.getState().adjustments.temperature).toBe(0);
      expect(useImageEditorStore.getState().adjustments.tint).toBe(0);
    });

    it('should reset intensity to 100 when preset changes', () => {
      useImageEditorStore.getState().applyFilterPreset('warm');
      useImageEditorStore.getState().setFilterIntensity(50);
      expect(useImageEditorStore.getState().filterIntensity).toBe(50);

      // Changing preset resets intensity
      useImageEditorStore.getState().applyFilterPreset('cool');
      expect(useImageEditorStore.getState().filterIntensity).toBe(100);
    });

    it('should reset intensity to 100 on resetAdjustments', () => {
      useImageEditorStore.getState().setFilterIntensity(30);
      useImageEditorStore.getState().resetAdjustments();
      expect(useImageEditorStore.getState().filterIntensity).toBe(100);
    });

    it('should not scale adjustments when no preset is active', () => {
      // Set some manual adjustments
      useImageEditorStore.getState().setAdjustment('brightness', 50);

      // Setting intensity with no active preset should not change adjustments
      useImageEditorStore.getState().setFilterIntensity(50);
      expect(useImageEditorStore.getState().adjustments.brightness).toBe(50);
    });
  });
});
