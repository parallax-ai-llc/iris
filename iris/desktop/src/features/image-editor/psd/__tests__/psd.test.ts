/**
 * PSD Import/Export Round-trip Tests
 *
 * Tests that the PSD export → import cycle preserves layer structure,
 * effects, adjustment layers, text layers, clipping masks, labels, and lock state.
 */

import { describe, it, expect } from 'vitest';
import { exportAsPsd } from '../exportPsd';
import { importPsd } from '../importPsd';
import type { Layer, TextLayer, LayerEffect, DropShadowSettings, GlowSettings, BevelSettings } from '@/features/image-editor/stores/imageEditor.store';

// Helper to create a mock base64 data URL for canvas (jsdom mock returns this)
const MOCK_IMAGE_DATA = 'data:image/png;base64,mockImageData';

function makeLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: `layer-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Layer',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    imageData: MOCK_IMAGE_DATA,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    ...overrides,
  };
}


describe('PSD Export', () => {
  describe('exportAsPsd', () => {
    it('should export a single raster layer as a valid PSD blob', async () => {
      const layers = [makeLayer({ name: 'Background' })];
      const blob = await exportAsPsd(layers, 200, 150);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
      expect(blob.type).toBe('application/octet-stream');
    });

    it('should export multiple layers', async () => {
      const layers = [
        makeLayer({ name: 'Layer 1', opacity: 80, blendMode: 'multiply' }),
        makeLayer({ name: 'Layer 2', opacity: 50, blendMode: 'screen' }),
      ];
      const blob = await exportAsPsd(layers, 200, 150);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should export layers with locked state', async () => {
      const layers = [makeLayer({ name: 'Locked Layer', locked: true })];
      const blob = await exportAsPsd(layers, 200, 150);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should export layers with clipping mask', async () => {
      const layers = [
        makeLayer({ name: 'Base Layer' }),
        makeLayer({ name: 'Clipped Layer', clippingMask: true }),
      ];
      const blob = await exportAsPsd(layers, 200, 150);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should export layers with label colors', async () => {
      const layers = [
        makeLayer({ name: 'Red Label', labelColor: 'red' }),
        makeLayer({ name: 'Blue Label', labelColor: 'blue' }),
        makeLayer({ name: 'Purple Label', labelColor: 'purple' }),
      ];
      const blob = await exportAsPsd(layers, 200, 150);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should export group layers with children', async () => {
      const childId = 'child-1';
      const groupId = 'group-1';
      const layers = [
        makeLayer({
          id: groupId,
          name: 'Group 1',
          type: 'group',
          children: [childId],
          isExpanded: true,
          imageData: '',
        }),
        makeLayer({
          id: childId,
          name: 'Child Layer',
          parentId: groupId,
        }),
      ];
      const blob = await exportAsPsd(layers, 200, 150);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should export layers with drop shadow effect', async () => {
      const effects: LayerEffect[] = [
        {
          type: 'dropShadow',
          enabled: true,
          settings: {
            color: '#000000',
            offsetX: 5,
            offsetY: 5,
            blur: 10,
            spread: 0,
            opacity: 75,
          } as DropShadowSettings,
        },
      ];
      const layers = [makeLayer({ name: 'With Shadow', effects })];
      const blob = await exportAsPsd(layers, 200, 150);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should export layers with multiple effects', async () => {
      const effects: LayerEffect[] = [
        {
          type: 'dropShadow',
          enabled: true,
          settings: { color: '#000000', offsetX: 5, offsetY: 5, blur: 10, spread: 0, opacity: 75 } as DropShadowSettings,
        },
        {
          type: 'outerGlow',
          enabled: true,
          settings: { color: '#ffffff', size: 15, opacity: 50 } as GlowSettings,
        },
        {
          type: 'bevel',
          enabled: true,
          settings: { style: 'inner', depth: 100, size: 5, softness: 2, angle: 120, highlightColor: '#ffffff', shadowColor: '#000000' } as BevelSettings,
        },
      ];
      const layers = [makeLayer({ name: 'Multi Effects', effects })];
      const blob = await exportAsPsd(layers, 200, 150);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should export adjustment layers', async () => {
      const layers = [
        makeLayer({
          name: 'Brightness/Contrast',
          type: 'adjustment',
          adjustmentType: 'brightness-contrast',
          adjustmentValues: { brightness: 20, contrast: 10 },
          imageData: '',
        }),
      ];
      const blob = await exportAsPsd(layers, 200, 150);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should export text layers with font info', async () => {
      const layers = [makeLayer({ id: 'text-1', name: 'Text Layer' })];
      const textLayers: TextLayer[] = [
        {
          id: 'text-1',
          text: 'Hello World',
          x: 10,
          y: 20,
          settings: {
            fontFamily: 'Arial',
            fontSize: 24,
            fontWeight: 'bold',
            fontStyle: 'italic',
            color: '#ff0000',
            alignment: 'center',
            lineHeight: 1.5,
            letterSpacing: 2,
          },
        },
      ];
      const blob = await exportAsPsd(layers, 200, 150, null, textLayers);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });
  });
});

describe('PSD Import/Export Round-trip', () => {
  it('should preserve basic layer properties in round-trip', async () => {
    const originalLayers = [
      makeLayer({
        name: 'Layer A',
        opacity: 75,
        blendMode: 'multiply',
        visible: true,
        x: 10,
        y: 20,
        width: 100,
        height: 80,
      }),
      makeLayer({
        name: 'Layer B',
        opacity: 50,
        blendMode: 'screen',
        visible: false,
      }),
    ];

    // Export
    const blob = await exportAsPsd(originalLayers, 300, 200);
    const buffer = await blob.arrayBuffer();

    // Import
    const result = importPsd(buffer);

    expect(result.width).toBe(300);
    expect(result.height).toBe(200);
    expect(result.layers.length).toBe(2);

    // Check first layer
    const layerA = result.layers.find(l => l.name === 'Layer A');
    expect(layerA).toBeDefined();
    expect(layerA!.opacity).toBe(75);
    expect(layerA!.blendMode).toBe('multiply');
    expect(layerA!.visible).toBe(true);

    // Check second layer
    const layerB = result.layers.find(l => l.name === 'Layer B');
    expect(layerB).toBeDefined();
    expect(layerB!.opacity).toBe(50);
    expect(layerB!.blendMode).toBe('screen');
    expect(layerB!.visible).toBe(false);
  });

  it('should preserve locked state in round-trip', async () => {
    const layers = [
      makeLayer({ name: 'Locked', locked: true }),
      makeLayer({ name: 'Unlocked', locked: false }),
    ];

    const blob = await exportAsPsd(layers, 200, 200);
    const result = importPsd(await blob.arrayBuffer());

    const locked = result.layers.find(l => l.name === 'Locked');
    const unlocked = result.layers.find(l => l.name === 'Unlocked');
    expect(locked!.locked).toBe(true);
    expect(unlocked!.locked).toBe(false);
  });

  it('should preserve clipping mask in round-trip', async () => {
    const layers = [
      makeLayer({ name: 'Base' }),
      makeLayer({ name: 'Clipped', clippingMask: true }),
    ];

    const blob = await exportAsPsd(layers, 200, 200);
    const result = importPsd(await blob.arrayBuffer());

    const clipped = result.layers.find(l => l.name === 'Clipped');
    expect(clipped!.clippingMask).toBe(true);

    const base = result.layers.find(l => l.name === 'Base');
    expect(base!.clippingMask).toBe(false);
  });

  it('should preserve label colors in round-trip', async () => {
    const layers = [
      makeLayer({ name: 'Red', labelColor: 'red' }),
      makeLayer({ name: 'Blue', labelColor: 'blue' }),
      makeLayer({ name: 'Green', labelColor: 'green' }),
      makeLayer({ name: 'Yellow', labelColor: 'yellow' }),
      makeLayer({ name: 'Orange', labelColor: 'orange' }),
      makeLayer({ name: 'Purple', labelColor: 'purple' }),
      makeLayer({ name: 'No Color', labelColor: null }),
    ];

    const blob = await exportAsPsd(layers, 200, 200);
    const result = importPsd(await blob.arrayBuffer());

    expect(result.layers.find(l => l.name === 'Red')!.labelColor).toBe('red');
    expect(result.layers.find(l => l.name === 'Blue')!.labelColor).toBe('blue');
    expect(result.layers.find(l => l.name === 'Green')!.labelColor).toBe('green');
    expect(result.layers.find(l => l.name === 'Yellow')!.labelColor).toBe('yellow');
    expect(result.layers.find(l => l.name === 'Orange')!.labelColor).toBe('orange');
    // purple maps to violet in PSD, then back to purple on import
    expect(result.layers.find(l => l.name === 'Purple')!.labelColor).toBe('purple');
    expect(result.layers.find(l => l.name === 'No Color')!.labelColor).toBeNull();
  });

  it('should preserve group layer hierarchy in round-trip', async () => {
    const childId1 = 'c1';
    const childId2 = 'c2';
    const groupId = 'g1';
    const layers = [
      makeLayer({
        id: groupId,
        name: 'My Group',
        type: 'group',
        children: [childId1, childId2],
        isExpanded: true,
        imageData: '',
      }),
      makeLayer({ id: childId1, name: 'Child 1', parentId: groupId }),
      makeLayer({ id: childId2, name: 'Child 2', parentId: groupId }),
    ];

    const blob = await exportAsPsd(layers, 300, 300);
    const result = importPsd(await blob.arrayBuffer());

    // Find group
    const group = result.layers.find(l => l.name === 'My Group');
    expect(group).toBeDefined();
    expect(group!.type).toBe('group');
    expect(group!.children).toBeDefined();
    expect(group!.children!.length).toBe(2);

    // Children should have parentId pointing to group
    const child1 = result.layers.find(l => l.name === 'Child 1');
    const child2 = result.layers.find(l => l.name === 'Child 2');
    expect(child1).toBeDefined();
    expect(child2).toBeDefined();
    expect(child1!.parentId).toBe(group!.id);
    expect(child2!.parentId).toBe(group!.id);
  });

  it('should preserve blend modes in round-trip', async () => {
    const blendModes = [
      'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
      'color-dodge', 'color-burn', 'soft-light', 'hard-light',
      'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
    ] as const;

    const layers = blendModes.map(mode =>
      makeLayer({ name: `blend-${mode}`, blendMode: mode })
    );

    const blob = await exportAsPsd(layers, 200, 200);
    const result = importPsd(await blob.arrayBuffer());

    for (const mode of blendModes) {
      const layer = result.layers.find(l => l.name === `blend-${mode}`);
      expect(layer, `blend mode '${mode}' should be preserved`).toBeDefined();
      expect(layer!.blendMode).toBe(mode);
    }
  });

  it('should preserve drop shadow effect in round-trip', async () => {
    const effects: LayerEffect[] = [
      {
        type: 'dropShadow',
        enabled: true,
        settings: {
          color: '#000000',
          offsetX: 5,
          offsetY: 5,
          blur: 10,
          spread: 2,
          opacity: 75,
        } as DropShadowSettings,
      },
    ];
    const layers = [makeLayer({ name: 'Shadow Layer', effects })];

    const blob = await exportAsPsd(layers, 200, 200);
    const result = importPsd(await blob.arrayBuffer());

    const imported = result.layers.find(l => l.name === 'Shadow Layer');
    expect(imported!.effects).toBeDefined();
    expect(imported!.effects!.length).toBeGreaterThanOrEqual(1);

    const shadow = imported!.effects!.find(e => e.type === 'dropShadow');
    expect(shadow).toBeDefined();
    expect(shadow!.enabled).toBe(true);

    const s = shadow!.settings as DropShadowSettings;
    expect(s.blur).toBe(10);
    expect(s.opacity).toBe(75);
  });

  it('should preserve outer glow effect in round-trip', async () => {
    const effects: LayerEffect[] = [
      {
        type: 'outerGlow',
        enabled: true,
        settings: { color: '#ffff00', size: 20, opacity: 60 } as GlowSettings,
      },
    ];
    const layers = [makeLayer({ name: 'Glow Layer', effects })];

    const blob = await exportAsPsd(layers, 200, 200);
    const result = importPsd(await blob.arrayBuffer());

    const imported = result.layers.find(l => l.name === 'Glow Layer');
    const glow = imported!.effects!.find(e => e.type === 'outerGlow');
    expect(glow).toBeDefined();

    const s = glow!.settings as GlowSettings;
    expect(s.size).toBe(20);
    expect(s.opacity).toBe(60);
  });

  it('should preserve bevel effect in round-trip', async () => {
    const effects: LayerEffect[] = [
      {
        type: 'bevel',
        enabled: true,
        settings: {
          style: 'inner',
          depth: 100,
          size: 8,
          softness: 3,
          angle: 120,
          highlightColor: '#ffffff',
          shadowColor: '#000000',
        } as BevelSettings,
      },
    ];
    const layers = [makeLayer({ name: 'Bevel Layer', effects })];

    const blob = await exportAsPsd(layers, 200, 200);
    const result = importPsd(await blob.arrayBuffer());

    const imported = result.layers.find(l => l.name === 'Bevel Layer');
    const bevel = imported!.effects!.find(e => e.type === 'bevel');
    expect(bevel).toBeDefined();

    const s = bevel!.settings as BevelSettings;
    expect(s.style).toBe('inner');
    expect(s.size).toBe(8);
    expect(s.angle).toBe(120);
  });

  it('should preserve brightness-contrast adjustment layer in round-trip', async () => {
    const layers = [
      makeLayer({
        name: 'BC Adjust',
        type: 'adjustment',
        adjustmentType: 'brightness-contrast',
        adjustmentValues: { brightness: 30, contrast: -15 },
        imageData: '',
      }),
    ];

    const blob = await exportAsPsd(layers, 200, 200);
    const result = importPsd(await blob.arrayBuffer());

    const adj = result.layers.find(l => l.name === 'BC Adjust');
    expect(adj).toBeDefined();
    expect(adj!.type).toBe('adjustment');
    expect(adj!.adjustmentType).toBe('brightness-contrast');
    expect(adj!.adjustmentValues?.brightness).toBe(30);
    expect(adj!.adjustmentValues?.contrast).toBe(-15);
  });

  it('should preserve levels adjustment layer in round-trip', async () => {
    const layers = [
      makeLayer({
        name: 'Levels',
        type: 'adjustment',
        adjustmentType: 'levels',
        adjustmentValues: {
          levels: {
            inputBlack: 10,
            inputWhite: 240,
            gamma: 1.2,
            outputBlack: 5,
            outputWhite: 250,
          },
        },
        imageData: '',
      }),
    ];

    const blob = await exportAsPsd(layers, 200, 200);
    const result = importPsd(await blob.arrayBuffer());

    const adj = result.layers.find(l => l.name === 'Levels');
    expect(adj).toBeDefined();
    expect(adj!.adjustmentType).toBe('levels');
    const levels = adj!.adjustmentValues?.levels;
    expect(levels).toBeDefined();
    expect(levels!.inputBlack).toBe(10);
    expect(levels!.inputWhite).toBe(240);
    expect(levels!.outputBlack).toBe(5);
    expect(levels!.outputWhite).toBe(250);
  });

  it('should preserve curves adjustment layer in round-trip', async () => {
    const curvePoints = [
      [{ x: 0, y: 0 }, { x: 128, y: 140 }, { x: 255, y: 255 }],
      [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    ];
    const layers = [
      makeLayer({
        name: 'Curves',
        type: 'adjustment',
        adjustmentType: 'curves',
        adjustmentValues: { curves: curvePoints },
        imageData: '',
      }),
    ];

    const blob = await exportAsPsd(layers, 200, 200);
    const result = importPsd(await blob.arrayBuffer());

    const adj = result.layers.find(l => l.name === 'Curves');
    expect(adj).toBeDefined();
    expect(adj!.adjustmentType).toBe('curves');
    const curves = adj!.adjustmentValues?.curves;
    expect(curves).toBeDefined();
    // RGB channel should have 3 points
    expect(curves![0].length).toBe(3);
    expect(curves![0][1].x).toBe(128);
    expect(curves![0][1].y).toBe(140);
  });

  it('should preserve exposure adjustment layer in round-trip', async () => {
    const layers = [
      makeLayer({
        name: 'Exposure',
        type: 'adjustment',
        adjustmentType: 'exposure',
        adjustmentValues: { exposure: 1.5, gamma: 0.8 },
        imageData: '',
      }),
    ];

    const blob = await exportAsPsd(layers, 200, 200);
    const result = importPsd(await blob.arrayBuffer());

    const adj = result.layers.find(l => l.name === 'Exposure');
    expect(adj).toBeDefined();
    expect(adj!.adjustmentType).toBe('exposure');
    expect(adj!.adjustmentValues?.exposure).toBe(1.5);
    expect(adj!.adjustmentValues?.gamma).toBeCloseTo(0.8, 5);
  });

  it('should return textLayers from import when text data is present', async () => {
    const layers = [makeLayer({ id: 'txt-1', name: 'My Text' })];
    const textLayers: TextLayer[] = [
      {
        id: 'txt-1',
        text: 'Hello PSD',
        x: 50,
        y: 100,
        settings: {
          fontFamily: 'Helvetica',
          fontSize: 36,
          fontWeight: 'bold',
          fontStyle: 'normal',
          color: '#ff0000',
          alignment: 'center',
          lineHeight: 1.4,
          letterSpacing: 0,
        },
      },
    ];

    const blob = await exportAsPsd(layers, 400, 300, null, textLayers);
    const result = importPsd(await blob.arrayBuffer());

    // Should have text layers in result
    expect(result.textLayers).toBeDefined();
    expect(result.textLayers.length).toBeGreaterThanOrEqual(1);

    const txt = result.textLayers[0];
    expect(txt.text).toBe('Hello PSD');
    expect(txt.settings.fontWeight).toBe('bold');
    expect(txt.settings.alignment).toBe('center');
  });

  it('should preserve color-balance adjustment layer in round-trip', async () => {
    const layers = [
      makeLayer({
        name: 'Color Balance',
        type: 'adjustment',
        adjustmentType: 'color-balance',
        adjustmentValues: {
          colorBalance: {
            shadows: { cyan: -20, magenta: 10, yellow: 5 },
            midtones: { cyan: 0, magenta: 0, yellow: 0 },
            highlights: { cyan: 15, magenta: -5, yellow: -10 },
            preserveLuminosity: true,
          },
        },
        imageData: '',
      }),
    ];

    const blob = await exportAsPsd(layers, 200, 200);
    const result = importPsd(await blob.arrayBuffer());

    const adj = result.layers.find(l => l.name === 'Color Balance');
    expect(adj).toBeDefined();
    expect(adj!.adjustmentType).toBe('color-balance');
    const cb = adj!.adjustmentValues?.colorBalance;
    expect(cb).toBeDefined();
    expect(cb!.shadows.cyan).toBe(-20);
    expect(cb!.highlights.cyan).toBe(15);
    expect(cb!.preserveLuminosity).toBe(true);
  });

  it('should handle complex multi-layer document with mixed types', async () => {
    const groupId = 'grp-main';
    const child1Id = 'child-raster';
    const child2Id = 'child-adj';

    const layers: Layer[] = [
      // Root raster layer
      makeLayer({ name: 'Background', labelColor: 'blue' }),
      // Group
      makeLayer({
        id: groupId,
        name: 'Effects Group',
        type: 'group',
        children: [child1Id, child2Id],
        isExpanded: true,
        imageData: '',
      }),
      // Child raster with effects
      makeLayer({
        id: child1Id,
        name: 'Styled Layer',
        parentId: groupId,
        locked: true,
        clippingMask: false,
        effects: [
          {
            type: 'innerShadow',
            enabled: true,
            settings: { color: '#333333', offsetX: 2, offsetY: 2, blur: 5, spread: 0, opacity: 60 } as DropShadowSettings,
          },
        ],
      }),
      // Child adjustment
      makeLayer({
        id: child2Id,
        name: 'Hue/Sat',
        parentId: groupId,
        type: 'adjustment',
        adjustmentType: 'hue-saturation',
        adjustmentValues: { hue: 30, saturation: -20 },
        imageData: '',
      }),
    ];

    const blob = await exportAsPsd(layers, 500, 400);
    const result = importPsd(await blob.arrayBuffer());

    // Check total structure
    expect(result.layers.length).toBeGreaterThanOrEqual(4);

    // Background
    const bg = result.layers.find(l => l.name === 'Background');
    expect(bg).toBeDefined();
    expect(bg!.labelColor).toBe('blue');

    // Group
    const group = result.layers.find(l => l.name === 'Effects Group');
    expect(group).toBeDefined();
    expect(group!.type).toBe('group');

    // Styled child
    const styled = result.layers.find(l => l.name === 'Styled Layer');
    expect(styled).toBeDefined();
    expect(styled!.locked).toBe(true);
    expect(styled!.effects).toBeDefined();
    expect(styled!.effects!.some(e => e.type === 'innerShadow')).toBe(true);

    // Adjustment child
    const hueSat = result.layers.find(l => l.name === 'Hue/Sat');
    expect(hueSat).toBeDefined();
    expect(hueSat!.type).toBe('adjustment');
    expect(hueSat!.adjustmentType).toBe('hue-saturation');
  });
});

describe('PSD Import edge cases', () => {
  it('should handle empty PSD (no layers)', async () => {
    // Export with no layers
    const blob = await exportAsPsd([], 100, 100);
    const result = importPsd(await blob.arrayBuffer());

    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
    // ag-psd may add a background layer for empty documents
    expect(result.layers.length).toBeLessThanOrEqual(1);
  });

  it('should map unsupported blend modes to closest available', async () => {
    // We can't directly test unsupported modes from our export (which only has supported modes),
    // but we can verify the mapping logic by exporting all supported modes and checking round-trip
    const modes = ['normal', 'multiply', 'screen', 'overlay'] as const;
    const layers = modes.map(m => makeLayer({ name: m, blendMode: m }));

    const blob = await exportAsPsd(layers, 200, 200);
    const result = importPsd(await blob.arrayBuffer());

    for (const mode of modes) {
      const layer = result.layers.find(l => l.name === mode);
      expect(layer!.blendMode).toBe(mode);
    }
  });

  it('should set compositeDataUrl from PSD canvas', async () => {
    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = 200;
    compositeCanvas.height = 150;

    const layers = [makeLayer({ name: 'Layer 1' })];
    const blob = await exportAsPsd(layers, 200, 150, compositeCanvas);
    const result = importPsd(await blob.arrayBuffer());

    // Composite should be available (mock returns data:image/png;base64,mockImageData)
    expect(result.compositeDataUrl).toBeDefined();
  });
});
