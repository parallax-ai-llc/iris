/**
 * HistogramSection - Real-time RGB + Luminance histogram display
 * Shows channel distribution of the current canvas image.
 * Updates automatically when histogramData changes in the store.
 */

import { memo, useRef, useEffect, useState, useCallback } from 'react';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { CollapsibleSection } from '../CollapsibleSection';
import type { HistogramData } from '@/features/image-editor/canvas/histogram';

type HistogramChannel = 'rgb' | 'luminance';

const HISTOGRAM_WIDTH = 256;
const HISTOGRAM_HEIGHT = 100;

/**
 * Draw the histogram onto a canvas element.
 * Renders R, G, B as semi-transparent colored fills and luminance as a white line.
 */
function drawHistogram(
  canvas: HTMLCanvasElement,
  data: HistogramData,
  channel: HistogramChannel,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = '#18181b'; // zinc-900
  ctx.fillRect(0, 0, w, h);

  // Subtle grid lines
  ctx.strokeStyle = 'rgba(63, 63, 70, 0.4)'; // zinc-700 faint
  ctx.lineWidth = 0.5;
  for (let y = 0; y < h; y += 25) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  for (let x = 0; x < w; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  const scaleX = w / 256;

  if (channel === 'rgb') {
    // Draw filled areas for R, G, B with alpha blending
    const channels: Array<{ values: number[]; color: string }> = [
      { values: data.r, color: 'rgba(239, 68, 68, 0.45)' },   // red-500
      { values: data.g, color: 'rgba(34, 197, 94, 0.45)' },    // green-500
      { values: data.b, color: 'rgba(59, 130, 246, 0.45)' },   // blue-500
    ];

    for (const ch of channels) {
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let i = 0; i < 256; i++) {
        const x = i * scaleX;
        const barH = ch.values[i] * h;
        ctx.lineTo(x, h - barH);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = ch.color;
      ctx.fill();
    }

    // Draw luminance as a white line on top
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 256; i++) {
      const x = i * scaleX;
      const barH = data.l[i] * h;
      if (i === 0) {
        ctx.moveTo(x, h - barH);
      } else {
        ctx.lineTo(x, h - barH);
      }
    }
    ctx.stroke();
  } else {
    // Luminance only mode - white filled area
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < 256; i++) {
      const x = i * scaleX;
      const barH = data.l[i] * h;
      ctx.lineTo(x, h - barH);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 256; i++) {
      const x = i * scaleX;
      const barH = data.l[i] * h;
      if (i === 0) {
        ctx.moveTo(x, h - barH);
      } else {
        ctx.lineTo(x, h - barH);
      }
    }
    ctx.stroke();
  }
}

export const HistogramSection = memo(function HistogramSection() {
  const histogramData = useImageEditorStore((s) => s.histogramData);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [channel, setChannel] = useState<HistogramChannel>('rgb');

  // Redraw whenever histogramData or channel changes
  useEffect(() => {
    if (!canvasRef.current || !histogramData) return;
    drawHistogram(canvasRef.current, histogramData, channel);
  }, [histogramData, channel]);

  const toggleChannel = useCallback(() => {
    setChannel((prev) => (prev === 'rgb' ? 'luminance' : 'rgb'));
  }, []);

  return (
    <CollapsibleSection title="Histogram" defaultOpen>
      <div className="space-y-1.5">
        {/* Channel toggle */}
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={toggleChannel}
            className="text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors uppercase tracking-wider"
          >
            {channel === 'rgb' ? 'RGB + Luma' : 'Luminance'}
          </button>
        </div>

        {/* Histogram canvas */}
        <div className="rounded border border-zinc-700 overflow-hidden">
          <canvas
            ref={canvasRef}
            width={HISTOGRAM_WIDTH}
            height={HISTOGRAM_HEIGHT}
            className="w-full"
            style={{ imageRendering: 'pixelated', height: `${HISTOGRAM_HEIGHT}px` }}
          />
        </div>

        {/* Shadow / Midtone / Highlight labels */}
        <div className="flex justify-between text-[9px] text-zinc-500 px-0.5">
          <span>0</span>
          <span>Shadows</span>
          <span>Midtones</span>
          <span>Highlights</span>
          <span>255</span>
        </div>
      </div>
    </CollapsibleSection>
  );
});
