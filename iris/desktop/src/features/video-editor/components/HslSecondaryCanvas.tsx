/**
 * HslSecondaryCanvas - Canvas-based HSL Secondary (per-hue channel) rendering
 *
 * Overlays a canvas on top of the video element and processes each frame,
 * applying per-hue adjustments to Hue, Saturation, and Luminance across
 * 8 color channels: Red, Orange, Yellow, Green, Aqua, Blue, Purple, Magenta.
 *
 * Pattern follows ChromaKeyCanvas.tsx — requestAnimationFrame loop with
 * offscreen canvas for pixel manipulation.
 */

import { memo, useRef, useEffect, useCallback } from 'react';

interface HslSecondaryCanvasProps {
  videoElement: HTMLVideoElement | null;
  enabled: boolean;
  /** 8-element arrays for per-hue-channel adjustments (-100 to 100 each) */
  hslHue: number[];
  hslSaturation: number[];
  hslLuminance: number[];
  className?: string;
}

// 8 channel center hues (degrees) matching LumetriColorPanel order:
// Red, Orange, Yellow, Green, Aqua, Blue, Purple, Magenta
const CHANNEL_CENTERS = [0, 30, 60, 120, 180, 240, 270, 300];
const HUE_RANGE = 30; // half-width of each channel's influence zone

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function hueDist(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function processPixels(
  data: Uint8ClampedArray,
  hslHue: number[],
  hslSat: number[],
  hslLum: number[],
) {
  for (let i = 0; i < data.length; i += 4) {
    let [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);

    for (let ch = 0; ch < 8; ch++) {
      const dh = hslHue[ch];
      const ds = hslSat[ch];
      const dl = hslLum[ch];
      if (dh === 0 && ds === 0 && dl === 0) continue;

      const dist = hueDist(h, CHANNEL_CENTERS[ch]);
      if (dist > HUE_RANGE * 2) continue;
      const w = Math.max(0, 1 - dist / HUE_RANGE);
      if (w <= 0) continue;

      h += dh * w;
      s = clamp(s + (ds / 100) * w, 0, 1);
      l = clamp(l + (dl / 100) * w, 0, 1);
    }

    const [r, g, b] = hslToRgb(h, s, l);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

export const HslSecondaryCanvas = memo(function HslSecondaryCanvas({
  videoElement,
  enabled,
  hslHue,
  hslSaturation,
  hslLuminance,
  className,
}: HslSecondaryCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  const paramsRef = useRef({ hslHue, hslSaturation, hslLuminance });
  useEffect(() => {
    paramsRef.current = { hslHue, hslSaturation, hslLuminance };
  }, [hslHue, hslSaturation, hslLuminance]);

  const processFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoElement;

    if (!canvas || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const w = video.videoWidth || video.offsetWidth || canvas.width;
    const h = video.videoHeight || video.offsetHeight || canvas.height;

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas');
    }
    const offscreen = offscreenRef.current;
    if (offscreen.width !== w || offscreen.height !== h) {
      offscreen.width = w;
      offscreen.height = h;
    }

    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!offCtx || !ctx) {
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }

    offCtx.drawImage(video, 0, 0, w, h);
    const imageData = offCtx.getImageData(0, 0, w, h);

    const { hslHue: hue, hslSaturation: sat, hslLuminance: lum } = paramsRef.current;
    processPixels(imageData.data, hue, sat, lum);

    ctx.clearRect(0, 0, w, h);
    ctx.putImageData(imageData, 0, 0);

    rafRef.current = requestAnimationFrame(processFrame);
  }, [videoElement]);

  useEffect(() => {
    if (!enabled || !videoElement) return;

    rafRef.current = requestAnimationFrame(processFrame);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [enabled, videoElement, processFrame]);

  useEffect(() => {
    return () => { offscreenRef.current = null; };
  }, []);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        objectFit: 'contain',
      }}
    />
  );
});

export default HslSecondaryCanvas;
