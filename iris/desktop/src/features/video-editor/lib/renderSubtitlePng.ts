/**
 * renderSubtitlePng - Rasterize subtitle clips to full-frame transparent PNG data URLs.
 *
 * Runs in the Electron renderer process. Uses pure SVG (no foreignObject) so the
 * canvas is never tainted and can be toDataURL()d without SecurityError.
 *
 * Matches SubtitleOverlay.tsx box geometry exactly:
 *  - Box center-anchored at (position.x/100 * W, position.y/100 * H)
 *  - Width: explicit % or auto-fit capped at 80% W
 *  - Height: explicit % or auto (content height)
 *  - Padding: paddingX (default 12) / paddingY (default 4) in project px
 *  - Border-radius: 4px
 *  - textAlign maps to SVG text-anchor
 *  - stroke → paint-order stroke
 *  - dropShadow → feDropShadow (omitted when animation === 'glow')
 *  - textTransform applied before measuring / rendering
 *  - Export renders settled state (displayProgress = 1, no entrance animation)
 *
 * Limitation: animations are rendered fully settled. Font availability depends
 * on what the OS has installed.
 */

import type { SubtitleClip } from '@/types/editor.types';

// ==================== Text measurement ====================

function measureTextWidth(text: string, font: string, fontSize: number, letterSpacing = 0): number {
  // Rough estimate used when a real canvas measurement isn't available (no DOM,
  // or measureText returns 0 — e.g. jsdom). 0.55em per char is a decent average.
  const estimate = () => text.length * fontSize * 0.55 + Math.max(0, text.length - 1) * letterSpacing;
  if (typeof document === 'undefined') return estimate();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return estimate();
  ctx.font = font;
  const w = ctx.measureText(text).width;
  if (!w) return estimate();
  // Canvas measureText ignores letter-spacing; add it manually so wrapping and
  // auto-width match the rendered SVG (which applies letter-spacing).
  return w + Math.max(0, text.length - 1) * letterSpacing;
}

function applyTransform(text: string, transform: string | undefined): string {
  if (!transform || transform === 'none') return text;
  if (transform === 'uppercase') return text.toUpperCase();
  if (transform === 'lowercase') return text.toLowerCase();
  if (transform === 'capitalize') {
    return text.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return text;
}

function wrapText(
  text: string,
  font: string,
  maxWidth: number,
  fontSize: number,
  letterSpacing = 0,
): string[] {
  // Greedy word-wrap on space boundaries
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureTextWidth(candidate, font, fontSize, letterSpacing) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      // If a single word is wider than maxWidth, it goes on its own line
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

// ==================== SVG builder (exported for unit tests) ====================

export function buildSubtitleSvg(clip: SubtitleClip, W: number, H: number): string {
  const style = clip.style;

  const fontSize = style.fontSize;
  const fontFamily = style.fontFamily || 'Arial';
  const fontWeight = style.fontWeight ?? 'normal';
  const fontStyle = style.fontStyle ?? 'normal';
  const fontColor = style.fontColor || '#FFFFFF';
  const backgroundColor = style.backgroundColor || '#000000';
  const backgroundOpacity = style.backgroundOpacity ?? 1;
  const paddingX = style.paddingX ?? 12;
  const paddingY = style.paddingY ?? 4;
  const lineHeight = style.lineHeight ?? 1.2;
  const letterSpacing = style.letterSpacing ?? 0;
  const alignment = style.alignment ?? 'center';
  const verticalAlign = style.verticalAlign ?? 'middle';
  const animation = style.animation ?? 'none';

  // Apply textTransform before measuring
  const displayText = applyTransform(clip.text, style.textTransform);

  // Build the CSS-equivalent font string for canvas measurement
  const fontStr = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;

  // Center anchor in project px
  const centerX = (style.position.x / 100) * W;
  const centerY = (style.position.y / 100) * H;

  // Determine box width
  let boxW: number;
  if (style.width != null) {
    boxW = (style.width / 100) * W;
  } else {
    const maxAutoW = 0.8 * W;
    const measuredW = measureTextWidth(displayText, fontStr, fontSize, letterSpacing) + 2 * paddingX;
    boxW = Math.min(measuredW, maxAutoW);
  }

  // Word-wrap within (boxW - 2 * paddingX)
  const textAreaW = boxW - 2 * paddingX;
  const lines = wrapText(displayText, fontStr, textAreaW > 0 ? textAreaW : boxW, fontSize, letterSpacing);

  const lineHeightPx = fontSize * lineHeight;
  const totalTextH = lines.length * lineHeightPx;

  // Determine box height
  let boxH: number;
  if (style.height != null) {
    boxH = (style.height / 100) * H;
  } else {
    boxH = totalTextH + 2 * paddingY;
  }

  // Box top-left corner
  const boxX = centerX - boxW / 2;
  const boxY = centerY - boxH / 2;

  // Text anchor + X position
  let textAnchor: string;
  let textX: number;
  if (alignment === 'left') {
    textAnchor = 'start';
    textX = boxX + paddingX;
  } else if (alignment === 'right') {
    textAnchor = 'end';
    textX = boxX + boxW - paddingX;
  } else {
    textAnchor = 'middle';
    textX = centerX;
  }

  // First baseline Y (SVG text y = baseline of first line)
  let firstBaselineY: number;
  if (style.height != null) {
    // Fixed height: apply vertical alignment
    if (verticalAlign === 'top') {
      firstBaselineY = boxY + paddingY + fontSize;
    } else if (verticalAlign === 'bottom') {
      firstBaselineY = boxY + boxH - paddingY - (lines.length - 1) * lineHeightPx;
    } else {
      // middle
      firstBaselineY = boxY + boxH / 2 - ((lines.length - 1) / 2) * lineHeightPx + fontSize / 2;
    }
  } else {
    // Auto height: text starts at paddingY below boxY, baseline = paddingY + fontSize
    firstBaselineY = boxY + paddingY + fontSize;
  }

  // ---- Stroke ----
  const hasStroke = !!style.stroke;
  const strokeColor = style.stroke?.color ?? 'transparent';
  const strokeWidth = style.stroke?.width ?? 0;

  // ---- Glow (neon) ----
  // The 'glow' animation paints a coloured halo around the text (preview uses a
  // pulsing text-shadow in animationColor). Export renders a static glow at the
  // animation's mid intensity so neon presets don't come out flat.
  const hasGlow = animation === 'glow';
  const glowColor = style.animationColor ?? fontColor;
  const glowId = 'glow';

  // ---- Drop shadow filter ----
  const hasDropShadow = !!style.dropShadow && !hasGlow;
  const shadowId = 'ds';

  // ---- Build SVG tspan elements ----
  const tspans = lines
    .map((line, i) => {
      const escapedLine = escapeXml(line);
      const dy = i === 0 ? '0' : lineHeightPx.toFixed(2);
      return `    <tspan x="${textX.toFixed(2)}" dy="${dy}">${escapedLine}</tspan>`;
    })
    .join('\n');

  // ---- Assemble SVG ----
  let defsContent = '';
  if (hasGlow) {
    // Coloured halo: blur the glyph alpha, flood with the accent colour, then
    // stack the halo twice under the original text (matches the preview's
    // "0 0 4px color, 0 0 8px color" double text-shadow).
    defsContent =
      `\n  <defs>\n    <filter id="${glowId}" x="-50%" y="-50%" width="200%" height="200%">` +
      `\n      <feGaussianBlur in="SourceAlpha" stdDeviation="${(fontSize * 0.12).toFixed(2)}" result="b"/>` +
      `\n      <feFlood flood-color="${escapeXml(glowColor)}" flood-opacity="0.9" result="c"/>` +
      `\n      <feComposite in="c" in2="b" operator="in" result="g"/>` +
      `\n      <feMerge><feMergeNode in="g"/><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>` +
      `\n    </filter>\n  </defs>`;
  } else if (hasDropShadow) {
    defsContent = `\n  <defs>\n    <filter id="${shadowId}" x="-20%" y="-20%" width="140%" height="140%">\n      <feDropShadow dx="${style.dropShadow!.offsetX}" dy="${style.dropShadow!.offsetY}" stdDeviation="${style.dropShadow!.blur / 2}" flood-color="${escapeXml(style.dropShadow!.color)}" flood-opacity="1"/>\n    </filter>\n  </defs>`;
  }

  const filterAttr = hasGlow
    ? ` filter="url(#${glowId})"`
    : hasDropShadow
      ? ` filter="url(#${shadowId})"`
      : '';
  const paintOrderAttr = hasStroke ? ' paint-order="stroke"' : '';
  const strokeAttr = hasStroke
    ? ` stroke="${escapeXml(strokeColor)}" stroke-width="${strokeWidth}"`
    : ' stroke="none" stroke-width="0"';
  const letterSpacingAttr = letterSpacing !== 0 ? ` letter-spacing="${letterSpacing}"` : '';

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`,
    defsContent,
    `  <rect x="${boxX.toFixed(2)}" y="${boxY.toFixed(2)}" width="${boxW.toFixed(2)}" height="${boxH.toFixed(2)}"`,
    `        rx="4" ry="4"`,
    `        fill="${escapeXml(backgroundColor)}" fill-opacity="${backgroundOpacity}" />`,
    `  <text x="${textX.toFixed(2)}" y="${firstBaselineY.toFixed(2)}"`,
    `        font-family="${escapeXml(fontFamily)}"`,
    `        font-size="${fontSize}"`,
    `        font-weight="${fontWeight}"`,
    `        font-style="${fontStyle}"`,
    `        fill="${escapeXml(fontColor)}"`,
    `        text-anchor="${textAnchor}"${letterSpacingAttr}${paintOrderAttr}${strokeAttr}${filterAttr}>`,
    tspans,
    `  </text>`,
    `</svg>`,
  ]
    .filter(Boolean)
    .join('\n');

  return svg;
}

// ==================== XML escaping ====================

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ==================== Public API ====================

/**
 * Rasterize one subtitle clip to a full-frame (W×H) transparent PNG data URL.
 *
 * The box is positioned at project resolution (scale=1), matching
 * SubtitleOverlay.tsx exactly.
 *
 * Limitations:
 *  - Animations are rendered in their settled state (progress=1). Per-frame
 *    animation is not supported during export.
 *  - Font availability depends on what the OS has installed.
 */
export async function renderSubtitleClipToPng(
  clip: SubtitleClip,
  projectWidth: number,
  projectHeight: number,
): Promise<string> {
  const svgStr = buildSubtitleSvg(clip, projectWidth, projectHeight);

  // Use Blob URL to avoid the 2MB data: URL limit for large frames
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(new Error(`SVG image load failed: ${String(e)}`));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = projectWidth;
    canvas.height = projectHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context');
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
