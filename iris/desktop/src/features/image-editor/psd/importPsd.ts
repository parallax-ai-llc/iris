/**
 * PSD Import utility using ag-psd
 * Parses a PSD file and converts it into the image editor's Layer[] structure.
 * Supports: groups (hierarchical), clipping masks, layer effects, adjustment layers,
 * text layers, label colors, lock state, and layer masks.
 */

import { readPsd, type Layer as AgPsdLayer, type LayerEffectsInfo, type LayerEffectShadow, type LayerEffectsOuterGlow, type LayerEffectInnerGlow, type LayerEffectBevel } from 'ag-psd';
import type { Layer, BlendMode, LayerEffect, DropShadowSettings, GlowSettings, BevelSettings, TextLayer, TextSettings, AdjustmentLayerType } from '@/features/image-editor/stores/imageEditor.store';
import type { AdjustmentValues, LevelsValues, CurvePoint, ColorBalanceValues, ColorBalanceTone } from '@/features/image-editor/stores/imageEditor.store';
import { generateId } from '@/shared/lib/utils/id';

/** Map PSD blend mode strings to CSS blend mode strings */
function mapPsdBlendMode(psdMode: string | undefined): BlendMode {
  const map: Record<string, BlendMode> = {
    'normal': 'normal',
    'multiply': 'multiply',
    'screen': 'screen',
    'overlay': 'overlay',
    'darken': 'darken',
    'lighten': 'lighten',
    'color dodge': 'color-dodge',
    'color burn': 'color-burn',
    'soft light': 'soft-light',
    'hard light': 'hard-light',
    'difference': 'difference',
    'exclusion': 'exclusion',
    'hue': 'hue',
    'saturation': 'saturation',
    'color': 'color',
    'luminosity': 'luminosity',
    // Map unsupported PSD modes to closest available
    'pass through': 'normal',
    'dissolve': 'normal',
    'linear burn': 'color-burn',
    'darker color': 'darken',
    'linear dodge': 'color-dodge',
    'lighter color': 'lighten',
    'vivid light': 'hard-light',
    'linear light': 'hard-light',
    'pin light': 'hard-light',
    'hard mix': 'hard-light',
    'subtract': 'difference',
    'divide': 'exclusion',
  };
  return map[psdMode || 'normal'] || 'normal';
}

/** Map ag-psd LayerColor to Iris label color */
function mapLabelColor(psdColor: string | undefined): 'red' | 'blue' | 'green' | 'yellow' | 'orange' | 'purple' | 'pink' | null {
  if (!psdColor || psdColor === 'none') return null;
  const map: Record<string, 'red' | 'blue' | 'green' | 'yellow' | 'orange' | 'purple' | 'pink'> = {
    'red': 'red',
    'orange': 'orange',
    'yellow': 'yellow',
    'green': 'green',
    'blue': 'blue',
    'violet': 'purple',
    'gray': 'blue',  // No gray in Iris, map to blue
  };
  return map[psdColor] || null;
}

/** Convert RGBA color object to hex string */
function rgbaToHex(color: Record<string, number> | undefined, fallback = '#000000'): string {
  if (!color) return fallback;
  const r = Math.round(color.r ?? 0);
  const g = Math.round(color.g ?? 0);
  const b = Math.round(color.b ?? 0);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Extract pixel value from UnitsValue or raw number */
function extractPixels(v: { value?: number; units?: string } | number | undefined, fallback = 0): number {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'number') return v;
  return v.value ?? fallback;
}

/** Convert an HTMLCanvasElement to a base64 data URL */
function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

/** Convert PSD layer effects to Iris LayerEffect[] */
function convertPsdEffects(psdEffects: LayerEffectsInfo | undefined): LayerEffect[] {
  if (!psdEffects) return [];

  const effects: LayerEffect[] = [];

  // Drop shadow (PSD supports multiple, we take the first)
  if (psdEffects.dropShadow && psdEffects.dropShadow.length > 0) {
    const s = psdEffects.dropShadow[0] as LayerEffectShadow;
    if (s.present !== false) {
      const distance = extractPixels(s.distance);
      const angle = (s.angle ?? 120) * Math.PI / 180;
      const settings: DropShadowSettings = {
        color: rgbaToHex(s.color as Record<string, number>),
        offsetX: Math.round(distance * Math.cos(angle)),
        offsetY: Math.round(-distance * Math.sin(angle)),
        blur: extractPixels(s.size),
        spread: extractPixels(s.choke),
        opacity: Math.round((s.opacity ?? 0.75) * 100),
      };
      effects.push({ type: 'dropShadow', enabled: s.enabled !== false, settings });
    }
  }

  // Inner shadow
  if (psdEffects.innerShadow && psdEffects.innerShadow.length > 0) {
    const s = psdEffects.innerShadow[0] as LayerEffectShadow;
    if (s.present !== false) {
      const distance = extractPixels(s.distance);
      const angle = (s.angle ?? 120) * Math.PI / 180;
      const settings: DropShadowSettings = {
        color: rgbaToHex(s.color as Record<string, number>),
        offsetX: Math.round(distance * Math.cos(angle)),
        offsetY: Math.round(-distance * Math.sin(angle)),
        blur: extractPixels(s.size),
        spread: extractPixels(s.choke),
        opacity: Math.round((s.opacity ?? 0.75) * 100),
      };
      effects.push({ type: 'innerShadow', enabled: s.enabled !== false, settings });
    }
  }

  // Outer glow
  if (psdEffects.outerGlow) {
    const g = psdEffects.outerGlow as LayerEffectsOuterGlow;
    if (g.present !== false) {
      const settings: GlowSettings = {
        color: rgbaToHex(g.color as Record<string, number>, '#ffffff'),
        size: extractPixels(g.size, 10),
        opacity: Math.round((g.opacity ?? 0.75) * 100),
      };
      effects.push({ type: 'outerGlow', enabled: g.enabled !== false, settings });
    }
  }

  // Inner glow
  if (psdEffects.innerGlow) {
    const g = psdEffects.innerGlow as LayerEffectInnerGlow;
    if (g.present !== false) {
      const settings: GlowSettings = {
        color: rgbaToHex(g.color as Record<string, number>, '#ffffff'),
        size: extractPixels(g.size, 10),
        opacity: Math.round((g.opacity ?? 0.75) * 100),
      };
      effects.push({ type: 'innerGlow', enabled: g.enabled !== false, settings });
    }
  }

  // Bevel
  if (psdEffects.bevel) {
    const b = psdEffects.bevel as LayerEffectBevel;
    if (b.present !== false) {
      const styleMap: Record<string, 'outer' | 'inner' | 'emboss'> = {
        'outer bevel': 'outer',
        'inner bevel': 'inner',
        'emboss': 'emboss',
        'pillow emboss': 'emboss',
        'stroke emboss': 'emboss',
      };
      const settings: BevelSettings = {
        style: styleMap[b.style || 'inner bevel'] || 'inner',
        depth: b.strength ?? 100,
        size: extractPixels(b.size, 5),
        softness: extractPixels(b.soften),
        angle: b.angle ?? 120,
        highlightColor: rgbaToHex(b.highlightColor as Record<string, number>, '#ffffff'),
        shadowColor: rgbaToHex(b.shadowColor as Record<string, number>, '#000000'),
      };
      effects.push({ type: 'bevel', enabled: b.enabled !== false, settings });
    }
  }

  return effects;
}

/** Convert PSD adjustment data to Iris AdjustmentLayerType + values */
function convertPsdAdjustment(adj: Record<string, unknown> | undefined): { type: AdjustmentLayerType; values: Partial<AdjustmentValues> } | null {
  if (!adj || !adj.type) return null;

  switch (adj.type) {
    case 'brightness/contrast':
      return {
        type: 'brightness-contrast',
        values: {
          brightness: (adj.brightness as number) ?? 0,
          contrast: (adj.contrast as number) ?? 0,
        },
      };
    case 'hue/saturation': {
      const master = adj.master as { hue?: number; saturation?: number; lightness?: number } | undefined;
      return {
        type: 'hue-saturation',
        values: {
          hue: master?.hue ?? 0,
          saturation: master?.saturation ?? 0,
        },
      };
    }
    case 'levels': {
      const rgb = adj.rgb as { shadowInput?: number; highlightInput?: number; midtoneInput?: number; shadowOutput?: number; highlightOutput?: number } | undefined;
      const levelsValues: LevelsValues = {
        inputBlack: rgb?.shadowInput ?? 0,
        inputWhite: rgb?.highlightInput ?? 255,
        gamma: rgb?.midtoneInput ?? 1,
        outputBlack: rgb?.shadowOutput ?? 0,
        outputWhite: rgb?.highlightOutput ?? 255,
      };
      return {
        type: 'levels',
        values: { levels: levelsValues },
      };
    }
    case 'curves': {
      const mapChannel = (ch: Array<{ input: number; output: number }> | undefined): CurvePoint[] | undefined =>
        ch?.map(p => ({ x: p.input, y: p.output }));
      const curves = [
        mapChannel(adj.rgb as Array<{ input: number; output: number }>) || [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        mapChannel(adj.red as Array<{ input: number; output: number }>) || [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        mapChannel(adj.green as Array<{ input: number; output: number }>) || [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        mapChannel(adj.blue as Array<{ input: number; output: number }>) || [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      ];
      return {
        type: 'curves',
        values: { curves },
      };
    }
    case 'exposure':
      return {
        type: 'exposure',
        values: {
          exposure: (adj.exposure as number) ?? 0,
          gamma: (adj.gamma as number) ?? 1,
        },
      };
    case 'color balance': {
      const mapTone = (t: { cyanRed?: number; magentaGreen?: number; yellowBlue?: number } | undefined): ColorBalanceTone => ({
        cyan: t?.cyanRed ?? 0,
        magenta: t?.magentaGreen ?? 0,
        yellow: t?.yellowBlue ?? 0,
      });
      const cbValues: ColorBalanceValues = {
        shadows: mapTone(adj.shadows as Record<string, number>),
        midtones: mapTone(adj.midtones as Record<string, number>),
        highlights: mapTone(adj.highlights as Record<string, number>),
        preserveLuminosity: (adj.preserveLuminosity as boolean) ?? true,
      };
      return {
        type: 'color-balance',
        values: { colorBalance: cbValues },
      };
    }
    default:
      return null;
  }
}

/** Convert PSD text data to Iris TextSettings */
function convertPsdText(psdText: { text?: string; style?: Record<string, unknown>; paragraphStyle?: Record<string, unknown> } | undefined): { text: string; settings: TextSettings } | null {
  if (!psdText || !psdText.text) return null;

  const style = psdText.style || {};
  const font = style.font as { name?: string } | undefined;
  const paragraphStyle = psdText.paragraphStyle || {};
  const justification = paragraphStyle.justification as string | undefined;

  const alignmentMap: Record<string, 'left' | 'center' | 'right'> = {
    'left': 'left',
    'center': 'center',
    'right': 'right',
    'justify-left': 'left',
    'justify-center': 'center',
    'justify-right': 'right',
    'justify-all': 'left',
  };

  const settings: TextSettings = {
    fontFamily: font?.name || 'Arial',
    fontSize: (style.fontSize as number) || 24,
    fontWeight: style.fauxBold ? 'bold' : 'normal',
    fontStyle: style.fauxItalic ? 'italic' : 'normal',
    color: rgbaToHex(style.fillColor as Record<string, number>),
    alignment: alignmentMap[justification || 'left'] || 'left',
    lineHeight: style.leading ? (style.leading as number) / ((style.fontSize as number) || 24) : 1.2,
    letterSpacing: style.tracking ? (style.tracking as number) * ((style.fontSize as number) || 24) / 1000 : 0,
  };

  return { text: psdText.text, settings };
}

export interface PsdImportResult {
  layers: Layer[];
  textLayers: TextLayer[];
  width: number;
  height: number;
  compositeDataUrl: string | null;
}

/**
 * Process ag-psd layers recursively, preserving group hierarchy.
 * Returns { layers, textLayers } with proper parentId references.
 */
function processPsdLayers(
  psdLayers: AgPsdLayer[],
  parentId?: string,
): { layers: Layer[]; textLayers: TextLayer[] } {
  const allLayers: Layer[] = [];
  const allTextLayers: TextLayer[] = [];

  for (const psdLayer of psdLayers) {
    const layerId = generateId();
    const isGroup = psdLayer.children && psdLayer.children.length > 0;

    // Check if it's an adjustment layer
    const adjustment = convertPsdAdjustment(psdLayer.adjustment as unknown as Record<string, unknown>);
    const isAdjustment = !!adjustment;

    // Determine layer type
    let layerType: 'raster' | 'group' | 'adjustment' = 'raster';
    if (isGroup) layerType = 'group';
    else if (isAdjustment) layerType = 'adjustment';

    // Base position/size
    const left = psdLayer.left ?? 0;
    const top = psdLayer.top ?? 0;
    const right = psdLayer.right ?? (left + (psdLayer.canvas?.width ?? 0));
    const bottom = psdLayer.bottom ?? (top + (psdLayer.canvas?.height ?? 0));

    // Convert layer effects
    const effects = convertPsdEffects(psdLayer.effects);

    // Check for text layer
    const textData = convertPsdText(psdLayer.text as unknown as Record<string, unknown>);

    // Process children for groups
    let childIds: string[] | undefined;
    if (isGroup && psdLayer.children) {
      const { layers: childLayers, textLayers: childTextLayers } = processPsdLayers(psdLayer.children, layerId);
      childIds = childLayers.filter(cl => cl.parentId === layerId).map(cl => cl.id);
      allLayers.push(...childLayers);
      allTextLayers.push(...childTextLayers);
    }

    // Determine locked state from protection flags
    const isLocked = !!(psdLayer.protected?.transparency || psdLayer.protected?.composite || psdLayer.protected?.position);

    const layer: Layer = {
      id: layerId,
      name: psdLayer.name || (isGroup ? 'Group' : `Layer ${allLayers.length + 1}`),
      visible: !psdLayer.hidden,
      locked: isLocked,
      opacity: Math.round((psdLayer.opacity ?? 1) * 100),
      blendMode: mapPsdBlendMode(psdLayer.blendMode),
      imageData: psdLayer.canvas ? canvasToDataUrl(psdLayer.canvas) : '',
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      type: layerType,
      clippingMask: psdLayer.clipping ?? false,
      labelColor: mapLabelColor(psdLayer.layerColor),
    };

    // Group properties
    if (isGroup) {
      layer.children = childIds;
      layer.isExpanded = psdLayer.opened ?? true;
    }

    // Parent reference
    if (parentId) {
      layer.parentId = parentId;
    }

    // Adjustment layer properties
    if (isAdjustment && adjustment) {
      layer.adjustmentType = adjustment.type;
      layer.adjustmentValues = adjustment.values;
    }

    // Layer effects
    if (effects.length > 0) {
      layer.effects = effects;
    }

    // Layer mask
    if (psdLayer.mask?.canvas) {
      layer.mask = {
        data: canvasToDataUrl(psdLayer.mask.canvas),
        enabled: !psdLayer.mask.disabled,
        linked: true,
      };
    }

    allLayers.push(layer);

    // Text layer data
    if (textData) {
      allTextLayers.push({
        id: layerId,
        text: textData.text,
        x: left,
        y: top,
        settings: textData.settings,
      });
    }
  }

  return { layers: allLayers, textLayers: allTextLayers };
}

/**
 * Import a PSD file from an ArrayBuffer.
 *
 * @param buffer - The PSD file contents as ArrayBuffer
 * @returns Parsed layers (with hierarchy), text layers, dimensions, and composite preview
 */
export function importPsd(buffer: ArrayBuffer): PsdImportResult {
  const psd = readPsd(buffer);

  // Process layers with full hierarchy support
  const { layers, textLayers } = psd.children
    ? processPsdLayers(psd.children)
    : { layers: [], textLayers: [] };

  // Get composite preview image
  let compositeDataUrl: string | null = null;
  if (psd.canvas) {
    compositeDataUrl = canvasToDataUrl(psd.canvas);
  }

  return {
    layers,
    textLayers,
    width: psd.width,
    height: psd.height,
    compositeDataUrl,
  };
}
