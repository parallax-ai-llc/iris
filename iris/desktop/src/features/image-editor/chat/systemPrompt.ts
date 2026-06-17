/**
 * System Prompt Builder for Editor Chat
 *
 * Builds a dynamic system prompt that includes current editor state
 * and available commands, so the LLM can make informed decisions.
 */

export interface LayerSnapshot {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: string;
  width: number;
  height: number;
  type?: string;
}

export interface AdjustmentsSnapshot {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  exposure: number;
  gamma: number;
  temperature: number;
  tint: number;
  highlights: number;
  shadows: number;
  clarity: number;
  vibrance: number;
}

export interface EditorStateSnapshot {
  canvasWidth: number;
  canvasHeight: number;
  layers: LayerSnapshot[];
  activeLayerId: string | null;
  editMode: string;
  activeTool: string;
  sourceAssetId: string | null;
  sourceAssetName: string | null;
  zoom: number;
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  adjustments: AdjustmentsSnapshot;
  activeFilterPreset: string;
}

const COMMAND_SCHEMA = `Available commands (respond with natural language AND embed a <command>{...}</command> block when action is needed):

1. Image Generation:
   <command>{"action":"generateImage","prompt":"description of image","negativePrompt":"things to avoid","aspectRatio":"1:1"}</command>
   - aspectRatio options: "1:1", "16:9", "9:16", "4:3", "3:4"

2. Background Removal:
   <command>{"action":"removeBackground"}</command>
   - Removes background from the active layer's source asset

3. Upscale:
   <command>{"action":"upscale","scale":2}</command>
   - scale: 2 or 4

4. Layer Operations:
   <command>{"action":"addLayer","name":"Layer Name"}</command>
   <command>{"action":"removeLayer","layerId":"optional-id"}</command>
   <command>{"action":"duplicateLayer","layerId":"optional-id"}</command>
   <command>{"action":"renameLayer","layerId":"optional-id","name":"New Name"}</command>
   <command>{"action":"setLayerVisibility","layerId":"id","visible":true}</command>
   <command>{"action":"setLayerOpacity","layerId":"id","opacity":75}</command>
   <command>{"action":"reorderLayer","layerId":"id","direction":"up"}</command>
   - direction: "up", "down", "top", "bottom"
   - If layerId is omitted, uses the active layer

5. History:
   <command>{"action":"undo"}</command>
   <command>{"action":"redo"}</command>
   <command>{"action":"flattenLayers"}</command>

6. AI Editing:
   <command>{"action":"faceRestore","model":"codeformer"}</command>
   - model: "gfpgan" or "codeformer"
   <command>{"action":"colorize"}</command>

7. Text:
   <command>{"action":"addText","text":"Hello World","x":100,"y":100}</command>

8. Tool/Mode Switch:
   <command>{"action":"setEditMode","mode":"drawing"}</command>
   <command>{"action":"setActiveTool","tool":"brush"}</command>
   <command>{"action":"setBrushSize","size":20}</command>
   <command>{"action":"setBrushColor","color":"#ff0000"}</command>

9. View:
   <command>{"action":"zoomTo","level":150}</command>
   <command>{"action":"zoomToFit"}</command>

10. Adjustments (non-destructive, modifies the global adjustments state):
    <command>{"action":"applyAdjustment","key":"brightness","value":20}</command>
    - key: "brightness" | "contrast" | "saturation" | "hue" | "exposure" | "gamma" | "temperature" | "tint" | "highlights" | "shadows" | "clarity" | "vibrance"
    - value ranges: brightness/contrast/saturation/exposure/temperature/tint/highlights/shadows/clarity/vibrance -100..100, hue 0..360, gamma 0.1..3.0

11. Filter Preset (one-shot lookup-style filter):
    <command>{"action":"applyFilterPreset","presetId":"vivid","intensity":80}</command>
    - presetId: "none" | "vivid" | "warm" | "cool" | "bw" | "sepia" | "dramatic" | "faded" | "vintage" | "cinematic"
    - intensity (optional): 0..100, scales the preset strength

12. Canvas Filter (destructive pixel filter, baked into the active layer):
    <command>{"action":"applyCanvasFilter","name":"gaussian-blur","params":{"radius":5}}</command>
    - name: "blur" | "gaussian-blur" | "motion-blur" | "sharpen" | "sharpen-more" | "sharpen-edges" | "unsharp-mask" | "noise" | "reduce-noise" | "vignette" | "pixelate" | "emboss" | "edge-detect" | "find-edges" | "posterize" | "invert" | "grayscale" | "sepia" | "solarize"
    - params (optional): filter-specific (e.g. radius/amount/distance/angle/threshold/levels/size/monochrome)

13. Advanced Layer Editing:
    <command>{"action":"setBlendMode","layerId":"optional-id","blendMode":"multiply"}</command>
    - blendMode: "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "color-dodge" | "color-burn" | "soft-light" | "hard-light" | "difference" | "exclusion" | "hue" | "saturation" | "color" | "luminosity" | "dissolve" | "linear-burn" | "linear-dodge" | "vivid-light" | "linear-light" | "pin-light" | "hard-mix" | "darker-color" | "lighter-color"
    <command>{"action":"setLayerLock","layerId":"optional-id","locked":true}</command>
    <command>{"action":"addLayerMask","layerId":"optional-id"}</command>
    <command>{"action":"removeLayerMask","layerId":"optional-id"}</command>
    <command>{"action":"addAdjustmentLayer","adjustmentType":"brightness-contrast","values":{"brightness":15,"contrast":10}}</command>
    - adjustmentType: "brightness-contrast" | "hue-saturation" | "levels" | "curves" | "exposure" | "color-balance" | "threshold" | "photo-filter" | "black-and-white" | "gradient-map" | "selective-color" | "channel-mixer" | "vibrance" | "posterize" | "invert"
    - values (optional): partial AdjustmentValues (same numeric keys as applyAdjustment)

14. Transforms:
    <command>{"action":"rotate","degrees":90}</command>
    - degrees: absolute rotation in degrees (modulo 360 applied internally)
    <command>{"action":"flip","axis":"horizontal"}</command>
    - axis: "horizontal" or "vertical" (toggles the corresponding flip flag)`;

export function buildSystemPrompt(editorState: EditorStateSnapshot): string {
  const layerList = editorState.layers.length > 0
    ? editorState.layers.map((l, i) => {
        const active = l.id === editorState.activeLayerId ? ' [ACTIVE]' : '';
        const vis = l.visible ? 'visible' : 'hidden';
        return `  ${i + 1}. "${l.name}" (${l.width}x${l.height}, ${vis}, opacity:${l.opacity}%, ${l.blendMode})${active}`;
      }).join('\n')
    : '  (no layers)';

  const adj = editorState.adjustments;
  const adjustmentsLine = `brightness:${adj.brightness}, contrast:${adj.contrast}, saturation:${adj.saturation}, hue:${adj.hue}, exposure:${adj.exposure}, gamma:${adj.gamma}, temperature:${adj.temperature}, tint:${adj.tint}, highlights:${adj.highlights}, shadows:${adj.shadows}, clarity:${adj.clarity}, vibrance:${adj.vibrance}`;

  return `You are an AI assistant integrated into the Iris image editor. You help users edit images by understanding their natural language commands and executing editor actions.

## Current Editor State
- Canvas: ${editorState.canvasWidth}x${editorState.canvasHeight}px
- Zoom: ${editorState.zoom}%
- Rotation: ${editorState.rotation}° (flipH: ${editorState.flipHorizontal}, flipV: ${editorState.flipVertical})
- Edit Mode: ${editorState.editMode}
- Active Tool: ${editorState.activeTool}
- Source Asset: ${editorState.sourceAssetName || 'none'} (ID: ${editorState.sourceAssetId || 'none'})
- Adjustments: ${adjustmentsLine}
- Active Filter Preset: ${editorState.activeFilterPreset}
- Layers:
${layerList}
- Active Layer: ${editorState.activeLayerId || 'none'}

## ${COMMAND_SCHEMA}

## Rules
1. Always respond in the same language the user uses.
2. Include exactly ONE <command> block per action. If multiple actions are needed, execute the most important one first and suggest the next steps.
3. For generateImage, write the prompt in English for best results, even if the user speaks another language.
4. If the user's request is unclear or you need more information, just respond with text (no command).
5. Keep responses concise - the chat panel has limited space.
6. When referencing layers, use the layer ID from the state above.
7. For operations on the active layer, you can omit the layerId parameter.`;
}
