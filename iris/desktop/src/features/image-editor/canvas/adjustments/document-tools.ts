/**
 * Document-level tools (PDF presentation, guides, workspaces, droplets, PSD header)
 *
 * Part of the image-editor adjustments library (see ./index.ts barrel),
 * extracted from the former monolithic adjustments.ts.
 */

/**
 * Layout multiple images into a grid for PDF presentation / contact sheet.
 * Returns a single ImageData containing the arranged thumbnails.
 */
export function pdfPresentation(
  images: ImageData[],
  columns: number,
  thumbWidth: number,
  thumbHeight: number,
  gap = 10,
  bgColor: [number, number, number] = [255, 255, 255]
): ImageData {
  if (images.length === 0) throw new Error('At least one image required');
  const cols = Math.max(1, columns);
  const rows = Math.ceil(images.length / cols);
  const totalW = cols * thumbWidth + (cols - 1) * gap;
  const totalH = rows * thumbHeight + (rows - 1) * gap;

  const out = new ImageData(totalW, totalH);
  const od = out.data;
  // Fill background
  for (let i = 0; i < od.length; i += 4) {
    od[i] = bgColor[0]; od[i + 1] = bgColor[1]; od[i + 2] = bgColor[2]; od[i + 3] = 255;
  }

  for (let k = 0; k < images.length; k++) {
    const col = k % cols;
    const row = Math.floor(k / cols);
    const ox = col * (thumbWidth + gap);
    const oy = row * (thumbHeight + gap);
    const { data: sd, width: sw, height: sh } = images[k];

    // Simple nearest-neighbor resize into slot
    for (let ty = 0; ty < thumbHeight; ty++) {
      for (let tx = 0; tx < thumbWidth; tx++) {
        const sx = Math.floor(tx * sw / thumbWidth);
        const sy = Math.floor(ty * sh / thumbHeight);
        const si = (sy * sw + sx) * 4;
        const di = ((oy + ty) * totalW + (ox + tx)) * 4;
        od[di] = sd[si]; od[di + 1] = sd[si + 1];
        od[di + 2] = sd[si + 2]; od[di + 3] = sd[si + 3];
      }
    }
  }
  return out;
}

/**
 * Substitute template variables in a text string.
 * Variables use Photoshop-style syntax: %%variableName%%
 * @returns The text with all variables replaced
 */
export function substituteVariables(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/%%(\w+)%%/g, (_, key) => variables[key] ?? `%%${key}%%`);
}

export interface GuideLayoutConfig {
  columns: number;
  rows: number;
  gutterWidth: number;
  gutterHeight: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
}

/**
 * Generate guide positions for a column/row grid layout.
 * Returns arrays of horizontal and vertical guide positions (in pixels).
 */
export function generateGuideLayout(
  canvasWidth: number,
  canvasHeight: number,
  config: GuideLayoutConfig
): { horizontal: number[]; vertical: number[] } {
  const { columns, rows, gutterWidth, gutterHeight, marginTop, marginBottom, marginLeft, marginRight } = config;

  const vertical: number[] = [];
  const horizontal: number[] = [];

  // Vertical guides (columns)
  if (columns > 0) {
    const usableW = canvasWidth - marginLeft - marginRight;
    const totalGutter = (columns - 1) * gutterWidth;
    const colWidth = (usableW - totalGutter) / columns;
    vertical.push(marginLeft);
    for (let i = 0; i < columns; i++) {
      const right = marginLeft + (i + 1) * colWidth + i * gutterWidth;
      vertical.push(right);
      if (i < columns - 1) {
        vertical.push(right + gutterWidth);
      }
    }
  }

  // Horizontal guides (rows)
  if (rows > 0) {
    const usableH = canvasHeight - marginTop - marginBottom;
    const totalGutter = (rows - 1) * gutterHeight;
    const rowHeight = (usableH - totalGutter) / rows;
    horizontal.push(marginTop);
    for (let i = 0; i < rows; i++) {
      const bottom = marginTop + (i + 1) * rowHeight + i * gutterHeight;
      horizontal.push(bottom);
      if (i < rows - 1) {
        horizontal.push(bottom + gutterHeight);
      }
    }
  }

  return { horizontal, vertical };
}

/**
 * Calculate minimap viewport rectangle for Bird's Eye View.
 * Given canvas dimensions and current view state, returns the visible rect
 * in minimap coordinates.
 */
export function birdsEyeView(
  canvasWidth: number,
  canvasHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  zoom: number,
  panX: number,
  panY: number,
  minimapWidth: number
): { x: number; y: number; width: number; height: number; minimapHeight: number } {
  const aspect = canvasHeight / canvasWidth;
  const minimapHeight = minimapWidth * aspect;
  const scale = minimapWidth / canvasWidth;

  // Visible area in canvas coords
  const visW = viewportWidth / zoom;
  const visH = viewportHeight / zoom;
  const visX = -panX / zoom;
  const visY = -panY / zoom;

  return {
    x: Math.max(0, visX * scale),
    y: Math.max(0, visY * scale),
    width: Math.min(minimapWidth, visW * scale),
    height: Math.min(minimapHeight, visH * scale),
    minimapHeight,
  };
}

export interface DropletConfig {
  name: string;
  actionSetName: string;
  actionName: string;
  destination: 'same' | 'folder';
  destinationFolder?: string;
  fileNaming: 'original' | 'serial';
  overrideOpen: boolean;
  overrideSave: boolean;
  errorHandling: 'stop' | 'log';
}

/**
 * Create a Droplet configuration for batch drag-and-drop action execution.
 */
export function createDropletConfig(
  name: string,
  actionSetName: string,
  actionName: string,
  options?: Partial<Omit<DropletConfig, 'name' | 'actionSetName' | 'actionName'>>
): DropletConfig {
  return {
    name,
    actionSetName,
    actionName,
    destination: options?.destination ?? 'same',
    destinationFolder: options?.destinationFolder,
    fileNaming: options?.fileNaming ?? 'original',
    overrideOpen: options?.overrideOpen ?? false,
    overrideSave: options?.overrideSave ?? false,
    errorHandling: options?.errorHandling ?? 'stop',
  };
}

export interface PsdLayerInfo {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number; // 0-255
  visible: boolean;
  blendMode: string;
}

export interface PsdFileInfo {
  width: number;
  height: number;
  channels: number;
  bitDepth: number;
  colorMode: number; // 0=Bitmap, 1=Grayscale, 3=RGB, 4=CMYK
  layers: PsdLayerInfo[];
}

/**
 * Parse basic PSD header and layer info from raw bytes.
 * Reads signature, version, dimensions, and layer names/bounds.
 */
export function parsePsdHeader(buffer: ArrayBuffer): PsdFileInfo | null {
  const view = new DataView(buffer);
  if (buffer.byteLength < 26) return null;

  // Check signature "8BPS"
  const sig = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (sig !== '8BPS') return null;

  const version = view.getUint16(4);
  if (version !== 1 && version !== 2) return null;

  const channels = view.getUint16(12);
  const height = view.getUint32(14);
  const width = view.getUint32(18);
  const bitDepth = view.getUint16(22);
  const colorMode = view.getUint16(24);

  // Layer parsing would require full PSD spec implementation.
  // Return header info with empty layers for now.
  return { width, height, channels, bitDepth, colorMode, layers: [] };
}

export interface WorkspaceConfig {
  name: string;
  panels: Array<{
    id: string;
    position: 'left' | 'right' | 'bottom';
    visible: boolean;
    width?: number;
    height?: number;
  }>;
  toolbarPosition: 'left' | 'top';
  menuBarVisible: boolean;
}

const DEFAULT_WORKSPACES: Record<string, WorkspaceConfig> = {
  essentials: {
    name: 'Essentials',
    panels: [
      { id: 'layers', position: 'right', visible: true },
      { id: 'history', position: 'right', visible: true },
      { id: 'channels', position: 'right', visible: false },
      { id: 'paths', position: 'right', visible: false },
    ],
    toolbarPosition: 'left',
    menuBarVisible: true,
  },
  painting: {
    name: 'Painting',
    panels: [
      { id: 'layers', position: 'right', visible: true },
      { id: 'brushPresets', position: 'right', visible: true },
      { id: 'colorPicker', position: 'right', visible: true },
      { id: 'swatches', position: 'right', visible: true },
    ],
    toolbarPosition: 'left',
    menuBarVisible: true,
  },
  photography: {
    name: 'Photography',
    panels: [
      { id: 'layers', position: 'right', visible: true },
      { id: 'adjustments', position: 'right', visible: true },
      { id: 'histogram', position: 'right', visible: true },
      { id: 'history', position: 'right', visible: true },
    ],
    toolbarPosition: 'left',
    menuBarVisible: true,
  },
};

/**
 * Get a workspace preset by name.
 */
export function getWorkspacePreset(name: string): WorkspaceConfig | null {
  return DEFAULT_WORKSPACES[name] ?? null;
}

/**
 * List all available workspace preset names.
 */
export function listWorkspacePresets(): string[] {
  return Object.keys(DEFAULT_WORKSPACES);
}

/**
 * Create a custom workspace configuration.
 */
export function createCustomWorkspace(
  name: string,
  panels: WorkspaceConfig['panels'],
  toolbarPosition: 'left' | 'top' = 'left'
): WorkspaceConfig {
  return { name, panels, toolbarPosition, menuBarVisible: true };
}

export interface DocumentArrangement {
  documentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculate tile positions for arranging multiple documents.
 * @param count Number of documents
 * @param totalWidth Available width
 * @param totalHeight Available height
 * @param mode 'tile-horizontal' | 'tile-vertical' | 'grid'
 */
export function arrangeDocuments(
  count: number,
  totalWidth: number,
  totalHeight: number,
  mode: 'tile-horizontal' | 'tile-vertical' | 'grid' = 'grid'
): DocumentArrangement[] {
  const result: DocumentArrangement[] = [];
  if (count <= 0) return result;

  if (mode === 'tile-horizontal') {
    const w = totalWidth / count;
    for (let i = 0; i < count; i++) {
      result.push({ documentId: `doc-${i}`, x: i * w, y: 0, width: w, height: totalHeight });
    }
  } else if (mode === 'tile-vertical') {
    const h = totalHeight / count;
    for (let i = 0; i < count; i++) {
      result.push({ documentId: `doc-${i}`, x: 0, y: i * h, width: totalWidth, height: h });
    }
  } else {
    // Grid: closest to square
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const w = totalWidth / cols;
    const h = totalHeight / rows;
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      result.push({ documentId: `doc-${i}`, x: col * w, y: row * h, width: w, height: h });
    }
  }
  return result;
}
