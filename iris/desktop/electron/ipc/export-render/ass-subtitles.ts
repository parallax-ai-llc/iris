/**
 * Burned-subtitle ASS fallback (used only when the renderer did not send
 * pre-rasterized subtitle PNGs). Moved from electron/ipc/export.ts.
 */

// ==================== ASS Subtitle Generator ====================

function hexToAssBGR(hex: string, alpha = 0): string {
  const h = hex.replace('#', '').padEnd(6, '0');
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  const aa = Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase();
  return `&H${aa}${b}${g}${r}`.toUpperCase();
}

function toAssAlignment(
  verticalAlign?: 'top' | 'middle' | 'bottom',
  alignment?: 'left' | 'center' | 'right'
): number {
  const col = alignment === 'left' ? 0 : alignment === 'right' ? 2 : 1;
  const row = verticalAlign === 'top' ? 6 : verticalAlign === 'middle' ? 3 : 0;
  return 1 + col + row;
}

function toAssTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.round((s % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export interface SubClip {
  startTime: number;
  endTime: number;
  text?: string;
  style?: {
    fontSize?: number;
    fontFamily?: string;
    fontColor?: string;
    backgroundColor?: string;
    backgroundOpacity?: number;
    position?: { x: number; y: number };
    alignment?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'middle' | 'bottom';
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    stroke?: { color: string; width: number };
    dropShadow?: { color: string; offsetX: number; offsetY: number; blur: number };
    letterSpacing?: number;
    lineHeight?: number;
    textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
    paddingX?: number;
    paddingY?: number;
  };
}

export function buildAssContent(subs: SubClip[], width: number, height: number): string {
  // No scale needed — preview now renders at project resolution ratio
  const assHeader = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Default style: white text, semi-transparent black background (BorderStyle=3 = opaque box)
    // MarginL/MarginR = 10% of width for ~80% maxWidth wrapping (matching preview)
    `Style: Default,Arial,24,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,3,2,0,2,${Math.round(width * 0.1)},${Math.round(width * 0.1)},30,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const assEvents = subs.map((sub) => {
    const style = sub.style;
    const tags: string[] = [];

    if (style) {
      // Use \an5 (middle-center anchor) + \pos(x,y) to centre the box at (x%,y%).
      // This matches the preview compositor which uses translate(-50%,-50%) at
      // left=x%, top=y% — the element centre sits exactly at the percentage point.
      // toAssAlignment is kept for the text justification within the box (not for
      // anchor position — \an5 overrides that); we emit \q2 for left-justify only.
      tags.push('\\an5');

      if (style.position) {
        const px = Math.round((style.position.x / 100) * width);
        const py = Math.round((style.position.y / 100) * height);
        tags.push(`\\pos(${px},${py})`);
      }

      // Font
      if (style.fontSize) tags.push(`\\fs${Math.round(style.fontSize)}`);
      if (style.fontFamily) tags.push(`\\fn${style.fontFamily}`);
      if (style.fontColor) tags.push(`\\c${hexToAssBGR(style.fontColor)}&`);
      if (style.fontWeight === 'bold') tags.push('\\b1');
      if (style.fontStyle === 'italic') tags.push('\\i1');

      // Background (ASS BorderStyle=3 = opaque box, \\4c = box colour, \\4a = box alpha).
      // paddingX/paddingY are approximated via \\bord — ASS padding is not per-axis,
      // so we take the larger of the two and use it as the symmetric border width.
      if (style.backgroundColor) {
        const bgAlpha = 1 - (style.backgroundOpacity ?? 0.7); // ASS alpha: 0=opaque, 1=transparent
        tags.push(`\\4c${hexToAssBGR(style.backgroundColor)}&`);
        tags.push(`\\4a&H${Math.round(bgAlpha * 255).toString(16).padStart(2, '0').toUpperCase()}&`);
        const padX = style.paddingX ?? 12;
        const padY = style.paddingY ?? 4;
        const bord = Math.max(padX, padY, 2);
        tags.push(`\\bord${bord}`);
      }

      // Outline/stroke (overrides bord set above if stroke is present — stroke takes priority)
      if (style.stroke) {
        tags.push(`\\3c${hexToAssBGR(style.stroke.color)}&`);
        tags.push(`\\bord${style.stroke.width}`);
      }

      // Drop shadow
      if (style.dropShadow) {
        tags.push(`\\shad${Math.round(style.dropShadow.blur)}`);
        // Shadow colour goes to \\4c; if we already set it for background, this
        // will override it — acceptable for clips that have a shadow but no bg.
        if (!style.backgroundColor) {
          tags.push(`\\4c${hexToAssBGR(style.dropShadow.color)}&`);
        }
      }

      // Letter spacing
      if (style.letterSpacing) tags.push(`\\fsp${style.letterSpacing}`);
    }

    const overrideTags = tags.length > 0 ? `{${tags.join('')}}` : '';
    let text = (sub.text || '').replace(/\n/g, '\\N');

    // Text transform
    if (style?.textTransform === 'uppercase') text = text.toUpperCase();
    else if (style?.textTransform === 'lowercase') text = text.toLowerCase();

    return `Dialogue: 0,${toAssTime(sub.startTime)},${toAssTime(sub.endTime)},Default,,0,0,0,,${overrideTags}${text}`;
  }).join('\n');

  return assHeader + '\n' + assEvents + '\n';
}
