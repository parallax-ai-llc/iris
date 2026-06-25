/**
 * OverlayLayer - Composited video/image overlay rendered above the base video.
 *
 * Each visible video track above the base layer renders one OverlayLayer at the
 * current time. Images keep their natural pixel size (resolution-independent via
 * the project-pixel → stage scale); videos fit the frame. When the clip is
 * selected an interactive transform gizmo (move / corner-scale / rotate) is shown.
 */

import { memo, useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useEditorStore, type VideoClip, type Transform } from '@/features/video-editor/stores/editor.store';
import { useCachedAssetUrlById } from '@/shared/hooks/useCachedAssetUrl';
import { useProxyAwareAssetId } from '@/features/video-editor/stores/editor/proxyResolve';

interface OverlayLayerProps {
  clip: VideoClip;
  currentTime: number;
  isPlaying: boolean;
  /** Display pixels per project pixel (videoRect.width / projectWidth). */
  stageScale: number;
  projectWidth: number;
  projectHeight: number;
  isSelected: boolean;
  onSelect: () => void;
}

type DragMode = 'move' | 'scale' | 'rotate';
type Corner = 'tl' | 'tr' | 'bl' | 'br';

interface DragState {
  mode: DragMode;
  clipId: string;
  startPointerX: number;
  startPointerY: number;
  startTransform: Transform;
  centerX: number; // screen px (clip center at drag start)
  centerY: number;
  startDist: number;
  startAngle: number;
  // Corner-scale state — the OPPOSITE corner stays anchored while resizing.
  anchorX: number;       // fixed (opposite) corner in screen px
  anchorY: number;
  dispW0: number;        // displayed width/height at drag start (screen px)
  dispH0: number;
  dxSign: number;        // dragged-corner direction from center (+1 right / -1 left)
  dySign: number;        // (+1 bottom / -1 top)
  rotRad: number;
  stageCenterX: number;  // stage centre in screen px (origin for x/y offset)
  stageCenterY: number;
  diag0: number;         // anchor→dragged-corner distance at start
}

const MIN_SCALE = 0.05;

const CORNER_SIGN: Record<Corner, { dx: number; dy: number }> = {
  tl: { dx: -1, dy: -1 },
  tr: { dx: 1, dy: -1 },
  bl: { dx: -1, dy: 1 },
  br: { dx: 1, dy: 1 },
};

export const OverlayLayer = memo(function OverlayLayer({
  clip,
  currentTime,
  isPlaying,
  stageScale,
  projectWidth,
  projectHeight,
  isSelected,
  onSelect,
}: OverlayLayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const updateClip = useEditorStore((s) => s.updateClip);
  const pushHistory = useEditorStore((s) => s.pushHistory);

  const isImage = clip.mediaType === 'image';

  // Asset URL (proxy-aware for video; images use the original asset).
  const playbackAssetId = useProxyAwareAssetId(isImage ? undefined : clip.assetId);
  const { url: videoUrl } = useCachedAssetUrlById(
    isImage ? undefined : (playbackAssetId ?? clip.assetId),
    'video/mp4',
    { type: 'preview', enabled: !isImage },
  );
  const { url: imageUrl } = useCachedAssetUrlById(
    isImage ? clip.assetId : undefined,
    'image/jpeg',
    { type: 'preview', enabled: isImage },
  );

  // Natural pixel size for images (fall back to the stored clip dims, then to a
  // measured value once the <img> loads). Videos fit the project frame.
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(
    clip.sourceWidth && clip.sourceHeight
      ? { w: clip.sourceWidth, h: clip.sourceHeight }
      : null,
  );
  const wroteBackRef = useRef(false);

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) return;
      setNaturalSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
      // Persist measured dimensions once so reloads render at natural size.
      if (!wroteBackRef.current && (!clip.sourceWidth || !clip.sourceHeight)) {
        wroteBackRef.current = true;
        updateClip(clip.id, { sourceWidth: w, sourceHeight: h } as Partial<VideoClip>);
      }
    },
    [clip.id, clip.sourceWidth, clip.sourceHeight, updateClip],
  );

  // Base (pre-scale) display size in stage px.
  const baseW = isImage
    ? (naturalSize ? naturalSize.w * stageScale : projectWidth * stageScale)
    : projectWidth * stageScale;
  const baseH = isImage
    ? (naturalSize ? naturalSize.h * stageScale : projectHeight * stageScale)
    : projectHeight * stageScale;

  const scale = clip.transform.scale ?? 1;
  const rotation = clip.transform.rotation ?? 0;
  const opacity = clip.transform.opacity ?? 1;
  const offsetX = (clip.transform.x ?? 0) * stageScale;
  const offsetY = (clip.transform.y ?? 0) * stageScale;

  const displayW = baseW * scale;
  const displayH = baseH * scale;

  // ── Video overlay playback sync ───────────────────────────────────────────
  useEffect(() => {
    if (isImage) return;
    const video = videoRef.current;
    if (!video) return;
    const clipSpeed = clip.speed ?? 1;
    const sourceTime = clip.sourceStartTime + (currentTime - clip.startTime) * clipSpeed;
    if (Number.isFinite(sourceTime) && Math.abs(video.currentTime - sourceTime) > 0.15) {
      try { video.currentTime = Math.max(0, sourceTime); } catch { /* not seekable yet */ }
    }
    if (isPlaying) video.play().catch(() => {});
    else video.pause();
  }, [isImage, currentTime, isPlaying, clip.sourceStartTime, clip.startTime, clip.speed]);

  // ── Transform gizmo drag handling ─────────────────────────────────────────
  // The pointer handlers MUST keep a stable identity for the lifetime of a drag
  // — otherwise the unmount/cleanup effect would tear down the active window
  // listeners every time updateClip re-renders the component mid-drag (which
  // stopped resize/move after a single tick). All per-drag state lives in
  // dragRef, and live inputs (stageScale, transform/id) are read via refs.
  const dragRef = useRef<DragState | null>(null);
  const movedRef = useRef(false);
  const stageScaleRef = useRef(stageScale);
  stageScaleRef.current = stageScale;
  const transformRef = useRef(clip.transform);
  transformRef.current = clip.transform;
  const clipIdRef = useRef(clip.id);
  clipIdRef.current = clip.id;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  // Current displayed size (screen px) — read at drag start for anchor math.
  const dispRef = useRef({ w: 0, h: 0 });
  dispRef.current = { w: displayW, h: displayH };

  const handlePointerMove = useRef((e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    movedRef.current = true;
    const s = stageScaleRef.current || 1;
    const base = drag.startTransform;
    if (drag.mode === 'move') {
      const dx = (e.clientX - drag.startPointerX) / s;
      const dy = (e.clientY - drag.startPointerY) / s;
      updateClip(drag.clipId, {
        transform: { ...base, x: base.x + dx, y: base.y + dy },
      } as Partial<VideoClip>);
    } else if (drag.mode === 'scale') {
      // Uniform scale anchored at the OPPOSITE corner: the diagonal from the
      // fixed anchor to the cursor sets the new size, then the centre is shifted
      // so the anchor corner stays put (top-left fixed when dragging bottom-right).
      const dist = Math.hypot(e.clientX - drag.anchorX, e.clientY - drag.anchorY);
      const f = dist / (drag.diag0 || 1);
      const next = Math.max(MIN_SCALE, base.scale * f);
      const fActual = next / (base.scale || 1);
      const newDispW = drag.dispW0 * fActual;
      const newDispH = drag.dispH0 * fActual;
      // New centre = anchor + R(rot) * (dxSign*newDispW/2, dySign*newDispH/2)
      const cos = Math.cos(drag.rotRad);
      const sin = Math.sin(drag.rotRad);
      const vx = drag.dxSign * newDispW / 2;
      const vy = drag.dySign * newDispH / 2;
      const centerX = drag.anchorX + (vx * cos - vy * sin);
      const centerY = drag.anchorY + (vx * sin + vy * cos);
      const newX = (centerX - drag.stageCenterX) / s;
      const newY = (centerY - drag.stageCenterY) / s;
      updateClip(drag.clipId, {
        transform: { ...base, scale: next, x: newX, y: newY },
      } as Partial<VideoClip>);
    } else {
      const angle = Math.atan2(e.clientY - drag.centerY, e.clientX - drag.centerX);
      const deltaDeg = ((angle - drag.startAngle) * 180) / Math.PI;
      updateClip(drag.clipId, {
        transform: { ...base, rotation: Math.round(base.rotation + deltaDeg) },
      } as Partial<VideoClip>);
    }
  }).current;

  const handlePointerUp = useRef(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    // Only record history when the transform actually changed (a plain click
    // just selects the clip and must not create a history entry).
    if (movedRef.current) {
      movedRef.current = false;
      pushHistory('Transform Clip');
    }
  }).current;

  const beginDrag = useCallback(
    (mode: DragMode, corner?: Corner) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onSelectRef.current();
      movedRef.current = false;
      const rect = wrapperRef.current?.getBoundingClientRect();
      const centerX = rect ? rect.left + rect.width / 2 : e.clientX;
      const centerY = rect ? rect.top + rect.height / 2 : e.clientY;
      const t = transformRef.current;
      const s = stageScaleRef.current || 1;
      const { w: dispW0, h: dispH0 } = dispRef.current;
      const rotRad = ((t.rotation ?? 0) * Math.PI) / 180;
      // Stage centre in screen px: clip centre minus the clip's x/y offset.
      const stageCenterX = centerX - (t.x ?? 0) * s;
      const stageCenterY = centerY - (t.y ?? 0) * s;
      // Dragged-corner direction; anchor is the opposite corner (fixed point).
      const sign = corner ? CORNER_SIGN[corner] : { dx: 1, dy: 1 };
      const cos = Math.cos(rotRad);
      const sin = Math.sin(rotRad);
      const ax = -sign.dx * dispW0 / 2;
      const ay = -sign.dy * dispH0 / 2;
      const anchorX = centerX + (ax * cos - ay * sin);
      const anchorY = centerY + (ax * sin + ay * cos);
      dragRef.current = {
        mode,
        clipId: clipIdRef.current,
        startPointerX: e.clientX,
        startPointerY: e.clientY,
        startTransform: {
          scale: t.scale ?? 1,
          rotation: t.rotation ?? 0,
          opacity: t.opacity ?? 1,
          x: t.x ?? 0,
          y: t.y ?? 0,
        },
        centerX,
        centerY,
        startDist: Math.hypot(e.clientX - centerX, e.clientY - centerY),
        startAngle: Math.atan2(e.clientY - centerY, e.clientX - centerX),
        anchorX,
        anchorY,
        dispW0,
        dispH0,
        dxSign: sign.dx,
        dySign: sign.dy,
        rotRad,
        stageCenterX,
        stageCenterY,
        diag0: Math.hypot(dispW0, dispH0),
      };
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [handlePointerMove, handlePointerUp],
  );

  useEffect(() => () => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove, handlePointerUp]);

  const wrapperStyle = useMemo<React.CSSProperties>(
    () => ({
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: `${displayW}px`,
      height: `${displayH}px`,
      transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg)`,
      transformOrigin: 'center center',
      opacity,
      mixBlendMode:
        clip.blendMode && clip.blendMode !== 'normal'
          ? (clip.blendMode as React.CSSProperties['mixBlendMode'])
          : undefined,
    }),
    [displayW, displayH, offsetX, offsetY, rotation, opacity, clip.blendMode],
  );

  const handle = 'absolute w-2.5 h-2.5 bg-white border border-blue-500 rounded-sm';

  return (
    <div
      ref={wrapperRef}
      style={wrapperStyle}
      onPointerDown={beginDrag('move')}
      className={isSelected ? 'cursor-move' : 'cursor-pointer'}
    >
      {isImage
        ? imageUrl && (
            <img
              src={imageUrl}
              alt={clip.name}
              onLoad={handleImageLoad}
              draggable={false}
              className="w-full h-full object-contain select-none pointer-events-none"
            />
          )
        : videoUrl && (
            <video
              ref={videoRef}
              src={videoUrl}
              muted
              playsInline
              crossOrigin="anonymous"
              className="w-full h-full object-contain select-none pointer-events-none"
            />
          )}

      {/* Selection box + transform handles */}
      {isSelected && (
        <>
          <div className="absolute inset-0 border border-blue-500 pointer-events-none" />
          {/* Corner scale handles — the opposite corner stays anchored. */}
          <div className={`${handle} -left-1.5 -top-1.5 cursor-nwse-resize`} onPointerDown={beginDrag('scale', 'tl')} />
          <div className={`${handle} -right-1.5 -top-1.5 cursor-nesw-resize`} onPointerDown={beginDrag('scale', 'tr')} />
          <div className={`${handle} -left-1.5 -bottom-1.5 cursor-nesw-resize`} onPointerDown={beginDrag('scale', 'bl')} />
          <div className={`${handle} -right-1.5 -bottom-1.5 cursor-nwse-resize`} onPointerDown={beginDrag('scale', 'br')} />
          {/* Rotation handle */}
          <div
            className="absolute left-1/2 -translate-x-1/2 -top-7 w-px h-6 bg-blue-500 pointer-events-none"
          />
          <div
            className="absolute left-1/2 -translate-x-1/2 -top-9 w-3 h-3 bg-white border border-blue-500 rounded-full cursor-grab"
            onPointerDown={beginDrag('rotate')}
          />
        </>
      )}
    </div>
  );
});

export default OverlayLayer;
