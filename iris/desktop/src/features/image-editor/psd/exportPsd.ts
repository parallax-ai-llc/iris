/**
 * PSD Export utility using ag-psd
 * Converts the image editor's layer structure into a Photoshop-compatible PSD file.
 * Supports: groups, clipping masks, layer effects, adjustment layers, text layers,
 * label colors, lock state, and layer masks.
 */

import { writePsd, type Psd, type Layer as AgPsdLayer, type LayerEffectsInfo, type LayerEffectShadow, type LayerEffectsOuterGlow, type LayerEffectInnerGlow, type LayerEffectBevel } from 'ag-psd';
import type { Layer, BlendMode, LayerEffect, DropShadowSettings, GlowSettings, BevelSettings, TextLayer, TextSettings, AdjustmentLayerType } from '@/features/image-editor/stores/imageEditor.store';

/** Map CSS blend modes to PSD blend mode strings */
function mapBlendMode(mode: BlendMode): string {
  const map: Record<BlendMode, string> = {
    'normal': 'normal',
    'multiply': 'multiply',
    'screen': 'screen',
    'overlay': 'overlay',
    'darken': 'darken',
    'lighten': 'lighten',
    'color-dodge': 'color dodge',
    'color-burn': 'color burn',
    'soft-light': 'soft light',
    'hard-light': 'hard light',
    'difference': 'difference',
    'exclusion': 'exclusion',
    'hue': 'hue',
    'saturation': 'saturation',
    'color': 'color',
    'luminosity': 'luminosity',
    'dissolve': 'dissolve',
    'linear-burn': 'linear burn',
    'linear-dodge': 'linear dodge',
    'vivid-light': 'vivid light',
    'linear-light': 'linear light',
    'pin-light': 'pin light',
    'hard-mix': 'hard mix',
    'darker-color': 'darker color',
    'lighter-color': 'lighter color',
  };
  return map[mode] || 'normal';
}

/** Map Iris label colors to ag-psd LayerColor */
function mapLabelColor(color: string | null | undefined): 'none' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet' | 'gray' {
  if (!color) return 'none';
  const map: Record<string, 'none' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet' | 'gray'> = {
    'red': 'red',
    'blue': 'blue',
    'green': 'green',
    'yellow': 'yellow',
    'orange': 'orange',
    'purple': 'violet',
    'pink': 'red',  // PSD doesn't have pink, map to red
  };
  return map[color] || 'none';
}

/** Parse hex color string to RGBA object for ag-psd */
function hexToRGBA(hex: string): { r: number; g: number; b: number; a: number } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const a = clean.length === 8 ? parseInt(clean.substring(6, 8), 16) : 255;
  return { r, g, b, a };
}

/** Convert a base64 data URL to an HTMLCanvasElement (for ag-psd) */
function base64ToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

/** Convert Iris LayerEffect[] to ag-psd LayerEffectsInfo */
function convertEffects(effects: LayerEffect[] | undefined): LayerEffectsInfo | undefined {
  if (!effects || effects.length === 0) return undefined;

  const info: LayerEffectsInfo = {};

  for (const effect of effects) {
    if (!effect.enabled) continue;

    switch (effect.type) {
      case 'dropShadow': {
        const s = effect.settings as DropShadowSettings;
        const shadow: LayerEffectShadow = {
          present: true,
          enabled: true,
          color: hexToRGBA(s.color),
          opacity: s.opacity / 100,
          distance: { units: 'Pixels', value: Math.sqrt(s.offsetX ** 2 + s.offsetY ** 2) },
          angle: Math.round(Math.atan2(-s.offsetY, s.offsetX) * 180 / Math.PI),
          size: { units: 'Pixels', value: s.blur },
          choke: { units: 'Pixels', value: s.spread },
          blendMode: 'multiply',
        };
        info.dropShadow = [shadow];
        break;
      }
      case 'innerShadow': {
        const s = effect.settings as DropShadowSettings;
        const shadow: LayerEffectShadow = {
          present: true,
          enabled: true,
          color: hexToRGBA(s.color),
          opacity: s.opacity / 100,
          distance: { units: 'Pixels', value: Math.sqrt(s.offsetX ** 2 + s.offsetY ** 2) },
          angle: Math.round(Math.atan2(-s.offsetY, s.offsetX) * 180 / Math.PI),
          size: { units: 'Pixels', value: s.blur },
          choke: { units: 'Pixels', value: s.spread },
          blendMode: 'multiply',
        };
        info.innerShadow = [shadow];
        break;
      }
      case 'outerGlow': {
        const s = effect.settings as GlowSettings;
        const glow: LayerEffectsOuterGlow = {
          present: true,
          enabled: true,
          color: hexToRGBA(s.color),
          opacity: s.opacity / 100,
          size: { units: 'Pixels', value: s.size },
          blendMode: 'screen',
        };
        info.outerGlow = glow;
        break;
      }
      case 'innerGlow': {
        const s = effect.settings as GlowSettings;
        const glow: LayerEffectInnerGlow = {
          present: true,
          enabled: true,
          color: hexToRGBA(s.color),
          opacity: s.opacity / 100,
          size: { units: 'Pixels', value: s.size },
          blendMode: 'screen',
          source: 'edge',
        };
        info.innerGlow = glow;
        break;
      }
      case 'bevel': {
        const s = effect.settings as BevelSettings;
        const styleMap: Record<string, 'outer bevel' | 'inner bevel' | 'emboss'> = {
          'outer': 'outer bevel',
          'inner': 'inner bevel',
          'emboss': 'emboss',
        };
        const bevel: LayerEffectBevel = {
          present: true,
          enabled: true,
          style: styleMap[s.style] || 'inner bevel',
          strength: s.depth,
          size: { units: 'Pixels', value: s.size },
          soften: { units: 'Pixels', value: s.softness },
          angle: s.angle,
          highlightColor: hexToRGBA(s.highlightColor),
          shadowColor: hexToRGBA(s.shadowColor),
          highlightBlendMode: 'screen',
          shadowBlendMode: 'multiply',
          highlightOpacity: 0.75,
          shadowOpacity: 0.75,
        };
        info.bevel = bevel;
        break;
      }
    }
  }

  return info;
}

/** Map Iris AdjustmentLayerType to ag-psd adjustment data */
function convertAdjustmentLayer(
  type: AdjustmentLayerType | undefined,
  values: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!type) return undefined;

  switch (type) {
    case 'brightness-contrast':
      return {
        type: 'brightness/contrast',
        brightness: (values?.brightness as number) ?? 0,
        contrast: (values?.contrast as number) ?? 0,
      };
    case 'hue-saturation':
      return {
        type: 'hue/saturation',
        master: {
          a: 0, b: 0, c: 0, d: 0,
          hue: (values?.hue as number) ?? 0,
          saturation: (values?.saturation as number) ?? 0,
          lightness: 0,
        },
      };
    case 'levels': {
      const lv = values?.levels as { inputBlack?: number; inputWhite?: number; gamma?: number; outputBlack?: number; outputWhite?: number } | undefined;
      return {
        type: 'levels',
        rgb: {
          shadowInput: lv?.inputBlack ?? 0,
          highlightInput: lv?.inputWhite ?? 255,
          midtoneInput: lv?.gamma ?? 1,
          shadowOutput: lv?.outputBlack ?? 0,
          highlightOutput: lv?.outputWhite ?? 255,
        },
      };
    }
    case 'curves': {
      const cv = values?.curves as Array<Array<{ x: number; y: number }>> | undefined;
      const mapChannel = (points: Array<{ x: number; y: number }> | undefined) =>
        points?.map(p => ({ input: p.x, output: p.y }));
      return {
        type: 'curves',
        rgb: mapChannel(cv?.[0]),
        red: mapChannel(cv?.[1]),
        green: mapChannel(cv?.[2]),
        blue: mapChannel(cv?.[3]),
      };
    }
    case 'exposure':
      return {
        type: 'exposure',
        exposure: (values?.exposure as number) ?? 0,
        offset: 0,
        gamma: (values?.gamma as number) ?? 1,
      };
    case 'color-balance': {
      const cb = values?.colorBalance as { shadows?: { cyan: number; magenta: number; yellow: number }; midtones?: { cyan: number; magenta: number; yellow: number }; highlights?: { cyan: number; magenta: number; yellow: number }; preserveLuminosity?: boolean } | undefined;
      return {
        type: 'color balance',
        shadows: cb?.shadows ? { cyanRed: cb.shadows.cyan, magentaGreen: cb.shadows.magenta, yellowBlue: cb.shadows.yellow } : undefined,
        midtones: cb?.midtones ? { cyanRed: cb.midtones.cyan, magentaGreen: cb.midtones.magenta, yellowBlue: cb.midtones.yellow } : undefined,
        highlights: cb?.highlights ? { cyanRed: cb.highlights.cyan, magentaGreen: cb.highlights.magenta, yellowBlue: cb.highlights.yellow } : undefined,
        preserveLuminosity: cb?.preserveLuminosity ?? true,
      };
    }
    default:
      return undefined;
  }
}

/** Render text to a canvas for PSD export */
function renderTextToCanvas(text: string, settings: TextSettings, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width || 400;
  canvas.height = height || 100;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const fontStyle = settings.fontStyle === 'italic' ? 'italic' : '';
  const fontWeight = settings.fontWeight === 'bold' ? 'bold' : '';
  ctx.font = `${fontStyle} ${fontWeight} ${settings.fontSize}px ${settings.fontFamily}`.trim();
  ctx.fillStyle = settings.color;
  ctx.textAlign = settings.alignment as CanvasTextAlign;
  ctx.textBaseline = 'top';

  const x = settings.alignment === 'center' ? canvas.width / 2 : settings.alignment === 'right' ? canvas.width : 0;
  const lines = text.split('\n');
  const lineH = settings.fontSize * settings.lineHeight;
  lines.forEach((line, i) => {
    ctx.fillText(line, x, i * lineH);
  });

  return canvas;
}

/**
 * Build a tree of ag-psd layers from the flat Iris layer list.
 * Iris stores layers flat with parentId references; PSD needs nested children.
 */
async function buildLayerTree(
  layers: Layer[],
  textLayers: TextLayer[],
): Promise<AgPsdLayer[]> {
  // Build a map of layer id to layer
  const layerMap = new Map<string, Layer>();
  for (const l of layers) layerMap.set(l.id, l);

  // Find root layers (no parentId)
  const rootIds = layers.filter(l => !l.parentId).map(l => l.id);

  async function convertLayer(layer: Layer): Promise<AgPsdLayer> {
    const psdLayer: AgPsdLayer = {
      name: layer.name,
      opacity: layer.opacity / 100,
      blendMode: (layer.type === 'group' ? 'pass through' : mapBlendMode(layer.blendMode)) as AgPsdLayer['blendMode'],
      hidden: !layer.visible,
      layerColor: mapLabelColor(layer.labelColor),
    };

    // Lock state
    if (layer.locked) {
      psdLayer.protected = {
        transparency: true,
        composite: true,
        position: true,
      };
    }

    // Clipping mask
    if (layer.clippingMask) {
      psdLayer.clipping = true;
    }

    // Layer effects
    const effects = convertEffects(layer.effects);
    if (effects) {
      psdLayer.effects = effects;
    }

    // Group layer
    if (layer.type === 'group') {
      psdLayer.opened = layer.isExpanded ?? true;
      // Build children recursively
      const childLayers: AgPsdLayer[] = [];
      if (layer.children) {
        for (const childId of layer.children) {
          const child = layerMap.get(childId);
          if (child) {
            childLayers.push(await convertLayer(child));
          }
        }
      }
      psdLayer.children = childLayers;
      return psdLayer;
    }

    // Adjustment layer
    if (layer.type === 'adjustment' && layer.adjustmentType) {
      const adj = convertAdjustmentLayer(layer.adjustmentType, layer.adjustmentValues as Record<string, unknown>);
      if (adj) {
        psdLayer.adjustment = adj as unknown as AgPsdLayer['adjustment'];
      }
      // Adjustment layers in PSD are typically full-canvas sized with no pixel data
      psdLayer.left = 0;
      psdLayer.top = 0;
      psdLayer.right = layer.width || 1;
      psdLayer.bottom = layer.height || 1;
      return psdLayer;
    }

    // Raster / image layer
    if (layer.imageData) {
      const canvas = await base64ToCanvas(layer.imageData);
      psdLayer.left = layer.x;
      psdLayer.top = layer.y;
      psdLayer.right = layer.x + layer.width;
      psdLayer.bottom = layer.y + layer.height;
      psdLayer.canvas = canvas;
    }

    // Layer mask
    if (layer.mask?.data && layer.mask.enabled) {
      try {
        const maskCanvas = await base64ToCanvas(layer.mask.data);
        psdLayer.mask = {
          left: layer.x,
          top: layer.y,
          right: layer.x + layer.width,
          bottom: layer.y + layer.height,
          canvas: maskCanvas,
          defaultColor: 255,
        };
      } catch {
        // Skip mask if conversion fails
      }
    }

    // Check if this layer corresponds to a text layer
    const textLayer = textLayers.find(tl => tl.id === layer.id);
    if (textLayer) {
      const fontSize = textLayer.settings.fontSize;
      psdLayer.text = {
        text: textLayer.text,
        orientation: 'horizontal',
        antiAlias: 'smooth',
        style: {
          font: { name: textLayer.settings.fontFamily },
          fontSize,
          fauxBold: textLayer.settings.fontWeight === 'bold',
          fauxItalic: textLayer.settings.fontStyle === 'italic',
          fillColor: hexToRGBA(textLayer.settings.color),
          tracking: textLayer.settings.letterSpacing * 1000 / fontSize, // convert px to tracking units
        },
        paragraphStyle: {
          justification: textLayer.settings.alignment === 'center' ? 'center' : textLayer.settings.alignment === 'right' ? 'right' : 'left',
        },
      };
      // Ensure text layer has a rasterized canvas for compatibility
      if (!psdLayer.canvas) {
        psdLayer.canvas = renderTextToCanvas(
          textLayer.text,
          textLayer.settings,
          layer.width || 400,
          layer.height || 100,
        );
        psdLayer.left = textLayer.x;
        psdLayer.top = textLayer.y;
        psdLayer.right = textLayer.x + (layer.width || 400);
        psdLayer.bottom = textLayer.y + (layer.height || 100);
      }
    }

    return psdLayer;
  }

  // Build tree from root layers
  const result: AgPsdLayer[] = [];
  for (const id of rootIds) {
    const layer = layerMap.get(id);
    if (layer) {
      result.push(await convertLayer(layer));
    }
  }

  return result;
}

/**
 * Export layers as a PSD file blob.
 *
 * @param layers - Array of Layer objects from imageEditor.store
 * @param canvasWidth - Total canvas width
 * @param canvasHeight - Total canvas height
 * @param compositeCanvas - Optional: the flattened composite canvas for the merged image preview
 * @param textLayers - Optional: text layer data for preserving text editability
 * @returns Blob of the PSD file
 */
export async function exportAsPsd(
  layers: Layer[],
  canvasWidth: number,
  canvasHeight: number,
  compositeCanvas?: HTMLCanvasElement | null,
  textLayers?: TextLayer[],
): Promise<Blob> {
  // Build hierarchical layer tree
  const psdLayers = await buildLayerTree(layers, textLayers || []);

  // Build the PSD document
  const psd: Psd = {
    width: canvasWidth,
    height: canvasHeight,
    children: psdLayers,
  };

  // Add composite (merged) canvas if provided — this is the preview image in PSD
  if (compositeCanvas) {
    psd.canvas = compositeCanvas;
  }

  // Write PSD to ArrayBuffer
  const buffer = writePsd(psd, {
    generateThumbnail: true,
    trimImageData: true,
    invalidateTextLayers: false,
  });
  return new Blob([buffer], { type: 'application/octet-stream' });
}
