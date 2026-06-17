/**
 * Shape Drawing Library
 * Functions for drawing various shapes on canvas
 */

import type { ShapeSettings, ShapeTool } from '@/features/image-editor/stores/imageEditor.store';

// ==================== Types ====================

export interface ShapeDrawOptions {
  x1: number;  // Start point
  y1: number;
  x2: number;  // End point
  y2: number;
  shiftKey?: boolean;  // Constrain proportions
  altKey?: boolean;    // Draw from center
}

export interface Point {
  x: number;
  y: number;
}

// ==================== Rectangle ====================

/**
 * Draw a rectangle with optional rounded corners
 */
export function drawRectangle(
  ctx: CanvasRenderingContext2D,
  options: ShapeDrawOptions,
  settings: ShapeSettings
): void {
  const { x1, y1, x2, y2, shiftKey, altKey } = options;
  let width = x2 - x1;
  let height = y2 - y1;

  // Constrain to square if shift is held
  if (shiftKey) {
    const size = Math.max(Math.abs(width), Math.abs(height));
    width = width >= 0 ? size : -size;
    height = height >= 0 ? size : -size;
  }

  // Draw from center if alt is held
  let x = x1;
  let y = y1;
  if (altKey) {
    x = x1 - width;
    y = y1 - height;
    width *= 2;
    height *= 2;
  }

  // Normalize for negative dimensions
  if (width < 0) {
    x += width;
    width = Math.abs(width);
  }
  if (height < 0) {
    y += height;
    height = Math.abs(height);
  }

  ctx.beginPath();

  if (settings.cornerRadius > 0) {
    // Rounded rectangle
    const radius = Math.min(settings.cornerRadius, width / 2, height / 2);
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.rect(x, y, width, height);
  }

  applyShapeStyle(ctx, settings);
}

// ==================== Ellipse ====================

/**
 * Draw an ellipse/circle
 */
export function drawEllipse(
  ctx: CanvasRenderingContext2D,
  options: ShapeDrawOptions,
  settings: ShapeSettings
): void {
  const { x1, y1, x2, y2, shiftKey, altKey } = options;
  let width = x2 - x1;
  let height = y2 - y1;

  // Constrain to circle if shift is held
  if (shiftKey) {
    const size = Math.max(Math.abs(width), Math.abs(height));
    width = width >= 0 ? size : -size;
    height = height >= 0 ? size : -size;
  }

  let cx: number, cy: number, rx: number, ry: number;

  if (altKey) {
    // Draw from center
    cx = x1;
    cy = y1;
    rx = Math.abs(width);
    ry = Math.abs(height);
  } else {
    // Draw from corner
    rx = Math.abs(width) / 2;
    ry = Math.abs(height) / 2;
    cx = Math.min(x1, x2) + rx;
    cy = Math.min(y1, y2) + ry;
  }

  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);

  applyShapeStyle(ctx, settings);
}

// ==================== Line ====================

/**
 * Draw a line
 */
export function drawLine(
  ctx: CanvasRenderingContext2D,
  options: ShapeDrawOptions,
  settings: ShapeSettings
): void {
  const { x1, y1, shiftKey } = options;
  let { x2, y2 } = options;

  // Constrain to 45-degree angles if shift is held
  if (shiftKey) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx * dx + dy * dy);

    // Snap to nearest 45 degrees
    const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    x2 = x1 + Math.cos(snappedAngle) * length;
    y2 = y1 + Math.sin(snappedAngle) * length;
  }

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);

  // Lines only have stroke
  if (settings.strokeEnabled) {
    ctx.strokeStyle = settings.strokeColor;
    ctx.lineWidth = settings.strokeWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

// ==================== Arrow ====================

/**
 * Draw an arrow
 */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  options: ShapeDrawOptions,
  settings: ShapeSettings,
  headSize: number = 20
): void {
  const { x1, y1, shiftKey } = options;
  let { x2, y2 } = options;

  // Constrain to 45-degree angles if shift is held
  if (shiftKey) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx * dx + dy * dy);
    const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    x2 = x1 + Math.cos(snappedAngle) * length;
    y2 = y1 + Math.sin(snappedAngle) * length;
  }

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

  // Adjust head size based on line length
  const actualHeadSize = Math.min(headSize, length / 3);

  // Calculate arrow head points
  const headAngle = Math.PI / 6; // 30 degrees
  const head1X = x2 - actualHeadSize * Math.cos(angle - headAngle);
  const head1Y = y2 - actualHeadSize * Math.sin(angle - headAngle);
  const head2X = x2 - actualHeadSize * Math.cos(angle + headAngle);
  const head2Y = y2 - actualHeadSize * Math.sin(angle + headAngle);

  ctx.beginPath();

  // Draw line
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);

  // Draw arrow head
  ctx.moveTo(x2, y2);
  ctx.lineTo(head1X, head1Y);
  ctx.moveTo(x2, y2);
  ctx.lineTo(head2X, head2Y);

  if (settings.strokeEnabled) {
    ctx.strokeStyle = settings.strokeColor;
    ctx.lineWidth = settings.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

// ==================== Polygon ====================

/**
 * Draw a regular polygon (triangle, pentagon, hexagon, etc.)
 */
export function drawPolygon(
  ctx: CanvasRenderingContext2D,
  options: ShapeDrawOptions,
  settings: ShapeSettings
): void {
  const { x1, y1, x2, y2, altKey } = options;
  const sides = Math.max(3, Math.min(12, settings.sides));

  let cx: number, cy: number, radius: number;

  if (altKey) {
    // Draw from center
    cx = x1;
    cy = y1;
    radius = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  } else {
    // Draw from bounding box
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    cx = Math.min(x1, x2) + width / 2;
    cy = Math.min(y1, y2) + height / 2;
    radius = Math.min(width, height) / 2;
  }

  // Calculate rotation from cursor position
  const rotation = Math.atan2(y2 - cy, x2 - cx) - Math.PI / 2;

  ctx.beginPath();

  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i * 2 * Math.PI) / sides;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.closePath();
  applyShapeStyle(ctx, settings);
}

// ==================== Star ====================

/**
 * Draw a star shape
 */
export function drawStar(
  ctx: CanvasRenderingContext2D,
  options: ShapeDrawOptions,
  settings: ShapeSettings,
  points: number = 5
): void {
  const { x1, y1, x2, y2, altKey } = options;

  let cx: number, cy: number, outerRadius: number;

  if (altKey) {
    cx = x1;
    cy = y1;
    outerRadius = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  } else {
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    cx = Math.min(x1, x2) + width / 2;
    cy = Math.min(y1, y2) + height / 2;
    outerRadius = Math.min(width, height) / 2;
  }

  // Inner radius is a percentage of outer radius
  const innerRadius = outerRadius * (settings.innerRadius / 100);

  // Calculate rotation from cursor
  const rotation = Math.atan2(y2 - cy, x2 - cx) - Math.PI / 2;

  ctx.beginPath();

  for (let i = 0; i < points * 2; i++) {
    const angle = rotation + (i * Math.PI) / points;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.closePath();
  applyShapeStyle(ctx, settings);
}

// ==================== Helper Functions ====================

/**
 * Apply fill and stroke styles to shape
 */
function applyShapeStyle(
  ctx: CanvasRenderingContext2D,
  settings: ShapeSettings
): void {
  if (settings.fillEnabled) {
    ctx.fillStyle = settings.fillColor;
    ctx.fill();
  }

  if (settings.strokeEnabled) {
    ctx.strokeStyle = settings.strokeColor;
    ctx.lineWidth = settings.strokeWidth;
    ctx.stroke();
  }
}

/**
 * Draw shape based on tool type
 */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  tool: ShapeTool,
  options: ShapeDrawOptions,
  settings: ShapeSettings
): void {
  ctx.save();

  switch (tool) {
    case 'rectangle':
      drawRectangle(ctx, options, settings);
      break;
    case 'ellipse':
      drawEllipse(ctx, options, settings);
      break;
    case 'line':
      drawLine(ctx, options, settings);
      break;
    case 'arrow':
      drawArrow(ctx, options, settings);
      break;
    case 'polygon':
      drawPolygon(ctx, options, settings);
      break;
    case 'star':
      drawStar(ctx, options, settings);
      break;
    case 'custom':
      // Custom shapes are drawn using SVG path data
      // The pathData is provided externally via drawCustomShape
      break;
  }

  ctx.restore();
}

/**
 * Draw a custom shape from SVG path data
 * Phase 4: Custom Shape Tool
 */
export function drawCustomShape(
  ctx: CanvasRenderingContext2D,
  pathData: string,
  options: ShapeDrawOptions,
  settings: ShapeSettings
): void {
  const { x1, y1, x2, y2 } = options;
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);

  if (width < 1 || height < 1) return;

  ctx.save();
  ctx.translate(x, y);
  // Scale the SVG path (assumed 24x24 viewBox) to fit the draw area
  ctx.scale(width / 24, height / 24);

  const path = new Path2D(pathData);

  if (settings.fillEnabled) {
    ctx.fillStyle = settings.fillColor;
    ctx.fill(path);
  }
  if (settings.strokeEnabled) {
    ctx.strokeStyle = settings.strokeColor;
    ctx.lineWidth = settings.strokeWidth * (24 / Math.max(width, height));
    ctx.stroke(path);
  }

  ctx.restore();
}

/**
 * Get shape bounding box from draw options
 */
export function getShapeBounds(
  options: ShapeDrawOptions
): { x: number; y: number; width: number; height: number } {
  const { x1, y1, x2, y2 } = options;
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

// ==================== Shape Preview ====================

/**
 * Draw shape preview (dashed outline)
 */
export function drawShapePreview(
  ctx: CanvasRenderingContext2D,
  tool: ShapeTool,
  options: ShapeDrawOptions,
  settings: ShapeSettings
): void {
  ctx.save();

  // Use dashed line for preview
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(0, 120, 255, 0.8)';
  ctx.fillStyle = 'rgba(0, 120, 255, 0.1)';
  ctx.lineWidth = 1;

  // Create a temporary settings for preview (always show stroke)
  const previewSettings: ShapeSettings = {
    ...settings,
    fillEnabled: true,
    strokeEnabled: true,
    fillColor: 'rgba(0, 120, 255, 0.1)',
    strokeColor: 'rgba(0, 120, 255, 0.8)',
    strokeWidth: 1,
  };

  drawShape(ctx, tool, options, previewSettings);

  ctx.restore();
}
