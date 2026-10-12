/**
 * SubtitleOverlay - Draggable subtitle display with animation support
 */

import { memo, useRef, useState, useCallback, type CSSProperties } from 'react';
import { cn } from '@/shared/lib/utils';
import { useShortcutLayer } from '@/shared/lib/shortcuts';
import type { SubtitleClip } from '@/types/editor.types';
import { subtitleAnimationFrame, subtitleKeyframeState, subtitleProgress } from '../lib/subtitleAnimation';

interface SubtitleOverlayProps {
  clip: SubtitleClip;
  currentTime: number;
  isSelected: boolean;
  onSelect: () => void;
  onPositionChange: (position: { x: number; y: number }) => void;
  /** Commit a resize: updates the anchor position plus the changed dimension(s)
   *  (width and/or height, each as % of the video frame). */
  onResize: (next: { position: { x: number; y: number }; width?: number; height?: number }) => void;
  /** Ratio of container width to project width (e.g. container=640, project=1280 → 0.5) */
  scale?: number;
  /** Actual video display rect inside parent (excluding object-contain letterbox).
   *  When provided, the overlay positions itself in pixels relative to this rect
   *  so % positions map to the real video frame, not the letterboxed parent. */
  videoRect?: { left: number; top: number; width: number; height: number };
}

/** Snap threshold in screen pixels — how close to a guide before it snaps. */
const SNAP_PX = 8;
/** Snap targets as % of the video frame: left/top edge, center, right/bottom edge. */
const SNAP_TARGETS = [0, 50, 100];

const clampPct = (v: number) => Math.max(0, Math.min(100, v));
/** Minimum box size as % of frame, so the box can't collapse to nothing. */
const MIN_SIZE_PCT = 5;
const clampSize = (v: number) => Math.max(MIN_SIZE_PCT, Math.min(100, v));

/** Snap a raw %-position to the nearest center/edge guide within SNAP_PX.
 *  `disable` (Shift held) bypasses snapping for free positioning. */
function applySnap(x: number, y: number, widthPx: number, heightPx: number, disable: boolean) {
  if (disable) return { x, y, guideX: null as number | null, guideY: null as number | null };
  let sx = x;
  let sy = y;
  let guideX: number | null = null;
  let guideY: number | null = null;
  for (const t of SNAP_TARGETS) {
    if (Math.abs(((x - t) / 100) * widthPx) <= SNAP_PX) {
      sx = t;
      guideX = t;
      break;
    }
  }
  for (const t of SNAP_TARGETS) {
    if (Math.abs(((y - t) / 100) * heightPx) <= SNAP_PX) {
      sy = t;
      guideY = t;
      break;
    }
  }
  return { x: sx, y: sy, guideX, guideY };
}

interface DragState {
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  widthPx: number;
  heightPx: number;
  rafId: number;
  pending: { x: number; y: number; guideX: number | null; guideY: number | null } | null;
}

type ResizeEdge = 'left' | 'right' | 'top' | 'bottom';

interface ResizeState {
  edge: ResizeEdge;
  /** True for left/right edges (horizontal axis), false for top/bottom. */
  horizontal: boolean;
  /** True for the "max" side (right/bottom) which grows in the positive direction. */
  maxSide: boolean;
  startClient: number; // clientX for horizontal, clientY for vertical
  startPos: number; // anchor x (horizontal) or y (vertical), in %
  startSize: number; // width (horizontal) or height (vertical), in %
  off: number; // anchor offset fraction along the resized axis
  framePx: number; // videoRect.width (horizontal) or .height (vertical)
  rafId: number;
  pending: { pos: number; size: number } | null;
}

/** CSS transitions the preview layers on top of each preset (export renders target states). */
const PRESET_TRANSITIONS: Record<string, string> = {
  highlight: 'color 0.15s ease',
  bounce: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s',
  scale: 'transform 0.2s ease, color 0.2s ease',
  'fade-word': 'opacity 0.25s ease',
  'slide-up': 'transform 0.3s ease-out',
};

/**
 * Render animated subtitle text. The per-word / per-character values come from
 * lib/subtitleAnimation.ts — the export rasterises the same values per frame.
 * Offsets are project pixels, so they are multiplied by the preview scale like
 * the font size.
 */
const AnimatedSubtitleText = memo(function AnimatedSubtitleText({
  text,
  animation,
  animationColor,
  progress,
  fontColor,
  scale,
}: {
  text: string;
  animation: string;
  animationColor: string;
  progress: number;
  fontColor: string;
  scale: number;
}) {
  if (animation === 'none' || !animation) {
    return <>{text}</>;
  }

  const frame = subtitleAnimationFrame(text, animation, progress, fontColor, animationColor);
  const transition = PRESET_TRANSITIONS[animation];
  const inlineBlock = animation === 'bounce' || animation === 'scale' || animation === 'wave';
  const spans = frame.segments.map((s, i) => {
    if (s.space) return <span key={i}>{s.text}</span>;
    const style: CSSProperties = { transition };
    if (s.color !== fontColor || animation === 'highlight' || animation === 'scale') style.color = s.color;
    if (s.opacity !== 1 || animation === 'bounce' || animation === 'fade-word') style.opacity = s.opacity;
    if (inlineBlock) {
      style.display = 'inline-block';
      style.transform = animation === 'scale' ? `scale(${s.scale})` : `translateY(${s.translateY * scale}px)`;
      if (animation === 'wave' && s.text === ' ') style.whiteSpace = 'pre';
    }
    return <span key={i} style={style}>{s.text}</span>;
  });

  if (animation === 'slide-up') {
    return (
      <span
        style={{
          display: 'inline-block',
          transform: `translateY(${frame.blockTranslateY * scale}px)`,
          opacity: frame.blockOpacity,
          transition,
        }}
      >
        {spans}
      </span>
    );
  }
  if (animation === 'glow') {
    const g = frame.glow * scale;
    return <span style={{ textShadow: `0 0 ${g}px ${animationColor}, 0 0 ${g * 2}px ${animationColor}40` }}>{spans}</span>;
  }
  return <>{spans}</>;
});

export const SubtitleOverlay = memo(function SubtitleOverlay({
  clip,
  currentTime,
  isSelected,
  onSelect,
  onPositionChange,
  onResize,
  scale = 1,
  videoRect,
}: SubtitleOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  // Live position/size while dragging or resizing (null when idle). Tracked locally and
  // only committed to the store on mouse-up — committing every frame re-rendered the whole
  // preview tree (rebuilds all tracks) and made dragging stutter.
  const [live, setLive] = useState<{
    x: number;
    y: number;
    width: number | undefined;
    height: number | undefined;
  } | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);

  const style = clip.style;
  // animationKeyframes (position / opacity / scale / rotation / font size) —
  // same values the export rasterises (lib/subtitleAnimation.ts).
  const kf = subtitleKeyframeState(clip.animationKeyframes, currentTime - clip.startTime);
  const posX = live ? live.x : (kf.x ?? style.position.x);
  const posY = live ? live.y : (kf.y ?? style.position.y);
  const effectiveWidth = live ? live.width : style.width;
  const effectiveHeight = live ? live.height : style.height;

  const clipDuration = clip.endTime - clip.startTime;
  const progress = subtitleProgress(currentTime - clip.startTime, clipDuration);
  // While a clip is selected (being authored), show its text fully settled so entrance
  // animations (fade/typewriter/slide) don't render it blank at progress 0 — otherwise a
  // freshly-added lower third looks like nothing was applied. Playback animates normally.
  const displayProgress = isSelected ? 1 : progress;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onSelect();

      const parent = overlayRef.current?.parentElement;
      let widthPx: number;
      let heightPx: number;
      if (videoRect) {
        widthPx = videoRect.width;
        heightPx = videoRect.height;
      } else {
        const rect = parent?.getBoundingClientRect();
        widthPx = rect?.width ?? 1;
        heightPx = rect?.height ?? 1;
      }

      const startWidth = style.width;
      const startHeight = style.height;
      dragRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startX: style.position.x,
        startY: style.position.y,
        widthPx,
        heightPx,
        rafId: 0,
        pending: null,
      };
      setIsDragging(true);

      const handleMouseMove = (ev: MouseEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const rawX = clampPct(d.startX + ((ev.clientX - d.startClientX) / d.widthPx) * 100);
        const rawY = clampPct(d.startY + ((ev.clientY - d.startClientY) / d.heightPx) * 100);
        d.pending = applySnap(rawX, rawY, d.widthPx, d.heightPx, ev.shiftKey);
        // Coalesce DOM/state updates to one per frame to keep dragging smooth.
        if (!d.rafId) {
          d.rafId = requestAnimationFrame(() => {
            const dd = dragRef.current;
            if (!dd) return;
            dd.rafId = 0;
            if (dd.pending) {
              setLive({ x: dd.pending.x, y: dd.pending.y, width: startWidth, height: startHeight });
              setSnapGuides({ x: dd.pending.guideX, y: dd.pending.guideY });
            }
          });
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        const d = dragRef.current;
        if (d?.rafId) cancelAnimationFrame(d.rafId);
        const final = d?.pending ?? null;
        dragRef.current = null;
        setIsDragging(false);
        setSnapGuides({ x: null, y: null });
        setLive(null);
        if (final) onPositionChange({ x: final.x, y: final.y });
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [onSelect, onPositionChange, style.position, style.width, style.height, videoRect]
  );

  // Resize the box by dragging an edge handle. The opposite edge stays visually fixed;
  // we adjust both the size and the anchor along that axis so the box grows/shrinks toward
  // the dragged side regardless of alignment. Works for all four edges (left/right = width,
  // top/bottom = height).
  const handleResizeMouseDown = useCallback(
    (edge: ResizeEdge) => (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!videoRect || videoRect.width <= 0 || videoRect.height <= 0) return;
      onSelect();

      const horizontal = edge === 'left' || edge === 'right';
      const maxSide = edge === 'right' || edge === 'bottom';
      const framePx = horizontal ? videoRect.width : videoRect.height;

      // Starting size %: explicit value, or measure the current auto-fit box.
      let startSize = horizontal ? style.width : style.height;
      if (startSize == null) {
        const box = overlayRef.current?.getBoundingClientRect();
        const sizePx = (horizontal ? box?.width : box?.height) ?? 0;
        startSize = clampSize((sizePx / framePx) * 100);
      }
      // Both axes are anchored by the box center (independent of text alignment), so
      // resizing keeps the opposite edge fixed and shifts the center by half the delta.
      const off = 0.5;
      resizeRef.current = {
        edge,
        horizontal,
        maxSide,
        startClient: horizontal ? e.clientX : e.clientY,
        startPos: horizontal ? style.position.x : style.position.y,
        startSize,
        off,
        framePx,
        rafId: 0,
        pending: null,
      };
      setIsResizing(true);

      const handleMouseMove = (ev: MouseEvent) => {
        const r = resizeRef.current;
        if (!r) return;
        const client = r.horizontal ? ev.clientX : ev.clientY;
        const dd = ((client - r.startClient) / r.framePx) * 100;
        let newSize: number;
        let effDd: number;
        if (r.maxSide) {
          // Dragging the max edge (right/bottom): grow toward positive, keep opposite edge.
          newSize = clampSize(r.startSize + dd);
          effDd = newSize - r.startSize;
          r.pending = { pos: clampPct(r.startPos + r.off * effDd), size: newSize };
        } else {
          // Dragging the min edge (left/top): keep the far edge, move the near one.
          newSize = clampSize(r.startSize - dd);
          effDd = r.startSize - newSize;
          r.pending = { pos: clampPct(r.startPos + (1 - r.off) * effDd), size: newSize };
        }
        if (!r.rafId) {
          r.rafId = requestAnimationFrame(() => {
            const rr = resizeRef.current;
            if (!rr || !rr.pending) return;
            rr.rafId = 0;
            if (rr.horizontal) {
              setLive({ x: rr.pending.pos, y: style.position.y, width: rr.pending.size, height: style.height });
            } else {
              setLive({ x: style.position.x, y: rr.pending.pos, width: style.width, height: rr.pending.size });
            }
          });
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        const r = resizeRef.current;
        if (r?.rafId) cancelAnimationFrame(r.rafId);
        const final = r?.pending ?? null;
        resizeRef.current = null;
        setIsResizing(false);
        setLive(null);
        if (final && r) {
          if (r.horizontal) {
            onResize({ position: { x: final.pos, y: style.position.y }, width: final.size });
          } else {
            onResize({ position: { x: style.position.x, y: final.pos }, height: final.size });
          }
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [onSelect, onResize, style.width, style.height, style.position, videoRect]
  );

  // Arrow-key nudge for the selected subtitle. Same editor scope as the
  // timeline's arrow seek, but a higher priority, so a selected subtitle wins
  // (the playhead does not move). Shift = coarse (10px) step.
  const nudge = (dxDir: number, dyDir: number) => (e: KeyboardEvent) => {
    const stepX = videoRect ? (1 / videoRect.width) * 100 : 0.5;
    const stepY = videoRect ? (1 / videoRect.height) * 100 : 0.5;
    const mult = e.shiftKey ? 10 : 1;
    const { x, y } = style.position;
    onPositionChange({
      x: clampPct(x + dxDir * stepX * mult),
      y: clampPct(y + dyDir * stepY * mult),
    });
  };
  useShortcutLayer(
    'editor',
    [
      { id: 'subtitle.nudgeLeft', keys: ['ArrowLeft', 'Shift+ArrowLeft'], run: nudge(-1, 0) },
      { id: 'subtitle.nudgeRight', keys: ['ArrowRight', 'Shift+ArrowRight'], run: nudge(1, 0) },
      { id: 'subtitle.nudgeUp', keys: ['ArrowUp', 'Shift+ArrowUp'], run: nudge(0, -1) },
      { id: 'subtitle.nudgeDown', keys: ['ArrowDown', 'Shift+ArrowDown'], run: nudge(0, 1) },
    ],
    { enabled: isSelected, priority: 1 },
  );

  // The box is anchored by its center (position.x/y) on both axes — independent of
  // `alignment`/`verticalAlign`, which only justify text *inside* the box. This keeps the
  // box put when alignment changes; it relocates only when position itself changes.
  const getTransform = () =>
    'translate(-50%, -50%)' +
    (kf.scale !== undefined ? ` scale(${kf.scale})` : '') +
    (kf.rotation !== undefined ? ` rotate(${kf.rotation}deg)` : '');

  return (
    <>
      {/* Snap guide lines (vertical = x target, horizontal = y target) */}
      {isDragging && videoRect && snapGuides.x != null && (
        <div
          className="pointer-events-none absolute z-20"
          style={{
            left: `${videoRect.left + (snapGuides.x / 100) * videoRect.width}px`,
            top: `${videoRect.top}px`,
            width: '1px',
            height: `${videoRect.height}px`,
            background: 'rgba(34,211,238,0.9)',
          }}
        />
      )}
      {isDragging && videoRect && snapGuides.y != null && (
        <div
          className="pointer-events-none absolute z-20"
          style={{
            left: `${videoRect.left}px`,
            top: `${videoRect.top + (snapGuides.y / 100) * videoRect.height}px`,
            width: `${videoRect.width}px`,
            height: '1px',
            background: 'rgba(34,211,238,0.9)',
          }}
        />
      )}
      <div
        ref={overlayRef}
        className={cn(
          'absolute cursor-move select-none',
          // No transition on position — `transition-all` made the box lag behind the
          // cursor while dragging and behind arrow-key nudges.
          isSelected && 'ring-2 ring-white/50 ring-offset-2 ring-offset-transparent',
          (isDragging || isResizing) && 'opacity-80'
        )}
        style={{
          // When videoRect is provided, position in pixels relative to actual video frame
          // (excluding object-contain letterbox). Otherwise fall back to % of parent.
          left: videoRect
            ? `${videoRect.left + (posX / 100) * videoRect.width}px`
            : `${posX}%`,
          top: videoRect
            ? `${videoRect.top + (posY / 100) * videoRect.height}px`
            : `${posY}%`,
          transform: getTransform(),
          opacity: kf.opacity !== undefined ? Math.max(0, Math.min(1, kf.opacity)) : undefined,
        fontSize: `${(kf.fontSize ?? style.fontSize) * scale}px`,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight ?? 'normal',
        fontStyle: style.fontStyle ?? 'normal',
        color: style.fontColor,
        backgroundColor: `${style.backgroundColor}${Math.round(style.backgroundOpacity * 255)
          .toString(16)
          .padStart(2, '0')}`,
        padding: `${(style.paddingY ?? 4) * scale}px ${(style.paddingX ?? 12) * scale}px`,
        borderRadius: '4px',
        textAlign: style.alignment,
        // Explicit width (% of frame) when set, otherwise auto-fit capped at 80%.
        width:
          effectiveWidth != null
            ? videoRect
              ? `${(effectiveWidth / 100) * videoRect.width}px`
              : `${effectiveWidth}%`
            : undefined,
        maxWidth: effectiveWidth != null ? 'none' : '80%',
        // Explicit height (% of frame) when set; text is vertically positioned inside it
        // per verticalAlign. Otherwise the box auto-fits its content.
        height:
          effectiveHeight != null
            ? videoRect
              ? `${(effectiveHeight / 100) * videoRect.height}px`
              : `${effectiveHeight}%`
            : undefined,
        display: effectiveHeight != null ? 'flex' : undefined,
        flexDirection: effectiveHeight != null ? 'column' : undefined,
        justifyContent:
          effectiveHeight != null
            ? style.verticalAlign === 'top'
              ? 'flex-start'
              : style.verticalAlign === 'bottom'
                ? 'flex-end'
                : 'center'
            : undefined,
        overflow: effectiveHeight != null ? 'hidden' : undefined,
        zIndex: isSelected ? 10 : 1,
        letterSpacing: style.letterSpacing != null ? `${style.letterSpacing * scale}px` : undefined,
        lineHeight: style.lineHeight != null ? style.lineHeight : undefined,
        textTransform: style.textTransform ?? undefined,
        WebkitTextStroke: style.stroke
          ? `${style.stroke.width * scale}px ${style.stroke.color}`
          : undefined,
        textShadow:
          style.dropShadow && (style.animation ?? 'none') !== 'glow'
            ? `${style.dropShadow.offsetX * scale}px ${style.dropShadow.offsetY * scale}px ${style.dropShadow.blur * scale}px ${style.dropShadow.color}`
            : undefined,
      }}
      onMouseDown={handleMouseDown}
    >
      {effectiveHeight != null ? (
        // Fixed height: wrap so the text flows as a single block the flex container
        // can position vertically (a bare fragment of spans would stack as flex items).
        <div style={{ width: '100%', textAlign: style.alignment }}>
          <AnimatedSubtitleText
            text={clip.text}
            animation={style.animation ?? 'none'}
            animationColor={style.animationColor ?? '#FFD700'}
            progress={displayProgress}
            fontColor={style.fontColor}
            scale={scale}
          />
        </div>
      ) : (
        <AnimatedSubtitleText
          text={clip.text}
          animation={style.animation ?? 'none'}
          animationColor={style.animationColor ?? '#FFD700'}
          progress={displayProgress}
          fontColor={style.fontColor}
          scale={scale}
        />
      )}

        {/* Edge handles to resize the box (left/right = width, top/bottom = height) */}
        {isSelected && videoRect && (
          <>
            <div
              role="presentation"
              onMouseDown={handleResizeMouseDown('left')}
              className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-5 rounded-sm bg-white border border-zinc-700 cursor-ew-resize"
              style={{ zIndex: 11 }}
            />
            <div
              role="presentation"
              onMouseDown={handleResizeMouseDown('right')}
              className="absolute left-full top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-5 rounded-sm bg-white border border-zinc-700 cursor-ew-resize"
              style={{ zIndex: 11 }}
            />
            <div
              role="presentation"
              onMouseDown={handleResizeMouseDown('top')}
              className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-5 h-2 rounded-sm bg-white border border-zinc-700 cursor-ns-resize"
              style={{ zIndex: 11 }}
            />
            <div
              role="presentation"
              onMouseDown={handleResizeMouseDown('bottom')}
              className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-1/2 w-5 h-2 rounded-sm bg-white border border-zinc-700 cursor-ns-resize"
              style={{ zIndex: 11 }}
            />
          </>
        )}
      </div>
    </>
  );
});
