/**
 * usePreviewZoom — viewport zoom & pan for the video editor preview stage.
 *
 * View-only (not persisted to the project): lets the user inspect detail by
 * scaling the project-ratio stage and panning around when zoomed in.
 *
 * - Ctrl/Cmd + wheel zooms toward the cursor (native non-passive listener so
 *   preventDefault actually works — React's onWheel is passive).
 * - `onPanStart` drives drag-to-pan, but only once zoomed past fit.
 * - Returns a `transform` string to apply to the stage element.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;
/** Preset stops used by the +/- steppers. 1 = fit-to-frame. */
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const isFit = (z: number) => z <= 1.0001;

export interface PreviewZoom {
  zoom: number;
  pan: { x: number; y: number };
  /** undefined when at fit & no pan, so the stage keeps its plain layout. */
  transform: string | undefined;
  isPanning: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  setZoomLevel: (z: number) => void;
  fit: () => void;
  onPanStart: (e: React.MouseEvent) => void;
}

export function usePreviewZoom(
  videoRect: Rect,
  containerRef: React.RefObject<HTMLDivElement | null>,
): PreviewZoom {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // Mirror latest state into refs so the wheel/drag handlers stay stable and
  // always read current values without re-subscribing.
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  zoomRef.current = zoom;
  panRef.current = pan;

  const clampPan = useCallback(
    (p: { x: number; y: number }, z: number) => {
      // Keep at least the stage centre reachable — don't let it fly off-screen.
      const maxX = (videoRect.width * z) / 2;
      const maxY = (videoRect.height * z) / 2;
      return { x: clamp(p.x, -maxX, maxX), y: clamp(p.y, -maxY, maxY) };
    },
    [videoRect.width, videoRect.height],
  );

  // Core: move to `nextZoom`, optionally keeping the screen point `anchor`
  // (clientX/clientY) fixed over the same underlying content.
  const applyZoom = useCallback(
    (nextZoom: number, anchor?: { x: number; y: number }) => {
      const z0 = zoomRef.current;
      const z1 = clamp(nextZoom, ZOOM_MIN, ZOOM_MAX);
      if (z1 === z0) return;

      let nextPan: { x: number; y: number };
      const el = containerRef.current;
      if (z1 <= 1) {
        // At or below fit the stage is no larger than the viewport, so panning
        // is meaningless — keep it centred.
        nextPan = { x: 0, y: 0 };
      } else if (anchor && el) {
        const rect = el.getBoundingClientRect();
        // Stage centre in container coords (transform-origin is center center).
        const cx = videoRect.left + videoRect.width / 2;
        const cy = videoRect.top + videoRect.height / 2;
        const mx = anchor.x - rect.left - cx;
        const my = anchor.y - rect.top - cy;
        nextPan = {
          x: mx * (1 - z1 / z0) + (z1 / z0) * panRef.current.x,
          y: my * (1 - z1 / z0) + (z1 / z0) * panRef.current.y,
        };
      } else {
        // No anchor → scale the existing pan so the centred view holds.
        nextPan = { x: (z1 / z0) * panRef.current.x, y: (z1 / z0) * panRef.current.y };
      }
      nextPan = clampPan(nextPan, z1);

      zoomRef.current = z1;
      panRef.current = nextPan;
      setZoom(z1);
      setPan(nextPan);
    },
    [clampPan, containerRef, videoRect.left, videoRect.top, videoRect.width, videoRect.height],
  );

  const zoomIn = useCallback(
    () => applyZoom(ZOOM_STEPS.find((s) => s > zoomRef.current + 1e-3) ?? ZOOM_MAX),
    [applyZoom],
  );
  const zoomOut = useCallback(
    () =>
      applyZoom(
        [...ZOOM_STEPS].reverse().find((s) => s < zoomRef.current - 1e-3) ?? ZOOM_MIN,
      ),
    [applyZoom],
  );
  const setZoomLevel = useCallback((z: number) => applyZoom(z), [applyZoom]);
  const fit = useCallback(() => applyZoom(1), [applyZoom]);

  // Ctrl/Cmd + wheel → zoom to cursor. Native listener so preventDefault works.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      applyZoom(zoomRef.current * factor, { x: e.clientX, y: e.clientY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoom, containerRef]);

  // Drag-to-pan (left button) — only meaningful when zoomed past fit.
  const onPanStart = useCallback(
    (e: React.MouseEvent) => {
      if (isFit(zoomRef.current) || e.button !== 0) return;
      e.preventDefault();
      const start = { x: e.clientX, y: e.clientY };
      const panStart = { ...panRef.current };
      setIsPanning(true);

      const move = (ev: MouseEvent) => {
        const next = clampPan(
          { x: panStart.x + (ev.clientX - start.x), y: panStart.y + (ev.clientY - start.y) },
          zoomRef.current,
        );
        panRef.current = next;
        setPan(next);
      };
      const up = () => {
        setIsPanning(false);
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    },
    [clampPan],
  );

  // Re-clamp pan when the stage size changes (panel resize) so it stays valid.
  useEffect(() => {
    if (isFit(zoomRef.current)) return;
    const next = clampPan(panRef.current, zoomRef.current);
    if (next.x !== panRef.current.x || next.y !== panRef.current.y) {
      panRef.current = next;
      setPan(next);
    }
  }, [clampPan]);

  const transform =
    isFit(zoom) && pan.x === 0 && pan.y === 0
      ? undefined
      : `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;

  return { zoom, pan, transform, isPanning, zoomIn, zoomOut, setZoomLevel, fit, onPanStart };
}
