/**
 * export-overlays.ts
 *
 * Overlay compositor for the video export pipeline.
 *
 * The preview uses a layered compositor model:
 *   - tracks[0] = top-most layer (painted last, above all others)
 *   - tracks[N-1] = bottom-most layer
 *
 * The base video is the bottom-most visible video track that has at least one
 * non-image clip. Everything else (other video tracks + image clips on the base
 * track) is an overlay that is composited on top via the overlay filter.
 *
 * Display size semantics (matching OverlayLayer.tsx):
 *   images : sourceWidth * scale  ×  sourceHeight * scale  (project px)
 *   videos : projectWidth * scale  ×  projectHeight * scale (project px)
 *
 * Clip centre = stage centre + (transform.x, transform.y) in project px.
 * Top-left = centre − (displayW/2, displayH/2)
 * → overlay x = (W − displayW)/2 + transform.x
 *   overlay y = (H − displayH)/2 + transform.y
 *
 * Since the output resolution equals the project resolution, project px == output px.
 */

// ==================== Types ====================

export interface OverlayClip {
  id: string;
  mediaType?: string; // 'image' | 'video' | undefined
  startTime: number;  // timeline start (project-seconds)
  endTime: number;    // timeline end
  sourceStartTime: number;
  sourceEndTime: number;
  sourceUrl: string;
  sourceWidth?: number;
  sourceHeight?: number;
  speed?: number;
  muted?: boolean;
  effects?: Array<{
    type: string;
    enabled: boolean;
    filterType?: string;
    filterIntensity?: number;
    filterParams?: Record<string, unknown>;
    transitionType?: string;
    transitionPosition?: 'start' | 'end' | 'both';
    transitionDuration?: number;
  }>;
  transform?: {
    scale: number;
    rotation: number;
    opacity: number;
    x: number;
    y: number;
  };
  blendMode?: string;
}

export interface OverlayTrack {
  id: string;
  trackIndex: number; // store order: 0 = top layer
  clips: OverlayClip[];
}

export interface OverlayCompositorParams {
  projectWidth: number;
  projectHeight: number;
  frameRate: number;
  /** Label of the accumulated video stream to paint overlays on top of. */
  accLabel: string;
  /** FFmpeg filter_complex parts array (mutated in-place). */
  filterParts: string[];
  /** Input map: sourceUrl → FFmpeg input index. */
  inputMap: Map<string, number>;
  /** Next available FFmpeg input index (for overlay image/video inputs). */
  nextInputIndex: { value: number };
  /** Extra `-loop 1 -f image2 -framerate N -i <path>` args prepended. Mutated. */
  extraInputArgs: string[];
  /** Set of source URLs that already have a split queue registered. */
  videoSplitQueue: Map<number, string[]>;
  audioSplitQueue: Map<number, string[]>;
}

// ==================== Helpers ====================

/**
 * Takes the next split label for a video input, or returns `${idx}:v` directly
 * when no split was registered (single user of that input pad).
 */
export function takeVideoSrcLabel(
  inputIdx: number,
  videoSplitQueue: Map<number, string[]>,
): string {
  const q = videoSplitQueue.get(inputIdx);
  if (!q || q.length === 0) return `${inputIdx}:v`;
  return q.shift()!;
}

/**
 * Computes the integer overlay x/y origin so the clip is centred on the stage
 * then offset by (transform.x, transform.y) — matching the preview compositor.
 *
 *   x = (W - displayW) / 2 + transform.x
 *   y = (H - displayH) / 2 + transform.y
 */
function overlayXY(
  projectW: number,
  projectH: number,
  displayW: number,
  displayH: number,
  tx: number,
  ty: number,
): { x: number; y: number } {
  return {
    x: Math.round((projectW - displayW) / 2 + tx),
    y: Math.round((projectH - displayH) / 2 + ty),
  };
}

/**
 * Build per-clip filter chain for one overlay clip.
 * Returns the label of the processed clip stream.
 *
 * Overlay clips render at project resolution so project px == output px.
 */
function buildOverlayClipChain(
  clip: OverlayClip,
  clipLabel: string,
  inputLabel: string, // e.g. "3:v" or "vsplit2_1"
  projectW: number,
  projectH: number,
  frameRate: number,
  filterParts: string[],
  buildEffectFilters: (effects: OverlayClip['effects']) => string[],
): string {
  const isImage = clip.mediaType === 'image';
  const speed = clip.speed || 1;
  const t = clip.transform ?? { scale: 1, rotation: 0, opacity: 1, x: 0, y: 0 };
  const scale = t.scale ?? 1;
  const rotation = t.rotation ?? 0;
  const opacity = t.opacity ?? 1;

  const filters: string[] = [];

  // 1. Trim
  if (isImage) {
    const dur = clip.endTime - clip.startTime;
    filters.push(`trim=end=${dur}`);
    filters.push('setpts=PTS-STARTPTS');
    filters.push(`fps=${frameRate}`);
  } else {
    filters.push(`trim=start=${clip.sourceStartTime}:end=${clip.sourceEndTime}`);
    filters.push('setpts=PTS-STARTPTS');
    if (speed !== 1) filters.push(`setpts=${(1 / speed).toFixed(6)}*PTS`);
  }

  // 2. Effects (color/style)
  filters.push(...buildEffectFilters(clip.effects));

  // 3. Compute display size in project px (== output px)
  let displayW: number;
  let displayH: number;

  if (isImage) {
    // Natural size × scale; fall back to full frame if no natural dims stored
    const natW = clip.sourceWidth ?? projectW;
    const natH = clip.sourceHeight ?? projectH;
    displayW = Math.round(natW * scale);
    displayH = Math.round(natH * scale);
  } else {
    // Videos scale the full frame
    displayW = Math.round(projectW * scale);
    displayH = Math.round(projectH * scale);
  }

  // Ensure even dims for H.264 compat
  const scaledW = Math.max(2, Math.floor(displayW / 2) * 2);
  const scaledH = Math.max(2, Math.floor(displayH / 2) * 2);

  // 4. Scale to computed display size
  filters.push(`scale=${scaledW}:${scaledH}:flags=lanczos`);

  // 5. Ensure alpha channel for compositing.
  //    Use 'rgba' (packed 8-bit RGBA) — the ffmpeg overlay filter handles rgba
  //    overlaid on yuv420p input correctly and transparently composites the alpha.
  //    'yuva420p' would also work in principle but needs format=auto on the overlay
  //    filter; rgba is more broadly compatible and is what most ffmpeg docs recommend
  //    for overlay-with-alpha use cases.
  filters.push('format=rgba');

  // 6. Opacity via colorchannelmixer alpha channel (rgba supports the 'a' channel)
  if (opacity < 0.999) {
    filters.push(`colorchannelmixer=aa=${opacity.toFixed(4)}`);
  }

  // 7. Rotation (approximate — keep rotated bounding box, transparent fill).
  //    The rotate filter with ow=rotw/oh=roth expands the bounding box to fit the
  //    rotated content; fill color 'none@0' keeps corners transparent.
  if (Math.abs(rotation) > 0.1) {
    const rad = (rotation * Math.PI) / 180;
    filters.push(`rotate=${rad.toFixed(6)}:c=none@0:ow=rotw(${rad.toFixed(6)}):oh=roth(${rad.toFixed(6)})`);
  }

  const processedLabel = `${clipLabel}_proc`;
  filterParts.push(`[${inputLabel}]${filters.join(',')}[${processedLabel}]`);

  return processedLabel;
}

/**
 * Append overlay compositing for a list of overlay tracks onto the accumulator stream.
 *
 * Overlay tracks are ordered so the bottom-most layer (highest trackIndex) is applied
 * first, and the topmost layer (trackIndex 0) is applied last — matching the CSS
 * z-order where index 0 paints on top.
 *
 * @returns The label of the final composited stream.
 */
export function buildOverlayCompositor(
  overlayTracks: OverlayTrack[],
  params: OverlayCompositorParams,
  buildEffectFilters: (effects: OverlayClip['effects']) => string[],
): string {
  const {
    projectWidth: W,
    projectHeight: H,
    frameRate,
    filterParts,
    inputMap,
    nextInputIndex,
    extraInputArgs,
    videoSplitQueue,
  } = params;

  let accLabel = params.accLabel;

  // Sort: paint bottom layer first (highest trackIndex = bottom), top layer last.
  const sorted = [...overlayTracks].sort((a, b) => b.trackIndex - a.trackIndex);

  let overlaySeq = 0;

  for (const ovTrack of sorted) {
    // Collect clips active during the project (could span multiple times)
    for (const clip of ovTrack.clips) {
      if (!clip.sourceUrl) continue;

      const isImage = clip.mediaType === 'image';
      const clipLabel = `ov${overlaySeq}`;
      overlaySeq++;

      // Ensure the source is registered as an FFmpeg input
      let inputIdx = inputMap.get(clip.sourceUrl);
      if (inputIdx === undefined) {
        inputIdx = nextInputIndex.value++;
        inputMap.set(clip.sourceUrl, inputIdx);
        if (isImage) {
          extraInputArgs.push('-loop', '1', '-f', 'image2', '-framerate', String(frameRate));
        }
        extraInputArgs.push('-i', clip.sourceUrl);
      }

      const inputLabel = takeVideoSrcLabel(inputIdx, videoSplitQueue);

      // Build per-clip chain (trim → effects → scale → format → opacity → rotate)
      const processedLabel = buildOverlayClipChain(
        clip,
        clipLabel,
        inputLabel,
        W,
        H,
        frameRate,
        filterParts,
        buildEffectFilters,
      );

      // Compute actual rendered size for overlay placement
      // (rotation may enlarge the bounding box — we use the post-rotate size for centering)
      const t = clip.transform ?? { scale: 1, rotation: 0, opacity: 1, x: 0, y: 0 };
      const scale = t.scale ?? 1;
      const rotation = t.rotation ?? 0;

      let displayW: number;
      let displayH: number;
      if (isImage) {
        const natW = clip.sourceWidth ?? W;
        const natH = clip.sourceHeight ?? H;
        displayW = Math.round(natW * scale);
        displayH = Math.round(natH * scale);
      } else {
        displayW = Math.round(W * scale);
        displayH = Math.round(H * scale);
      }

      // Adjust for rotation bounding box enlargement
      // The rotate filter with ow=rotw(...)/oh=roth(...) makes the bounding box
      // larger than the pre-rotate box. We need to overlay at the centre of that
      // bounding box, which is the stage centre + transform offset.
      let placeW = displayW;
      let placeH = displayH;
      if (Math.abs(rotation) > 0.1) {
        const rad = (rotation * Math.PI) / 180;
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));
        placeW = Math.round(displayW * cos + displayH * sin);
        placeH = Math.round(displayW * sin + displayH * cos);
      }

      const { x: ox, y: oy } = overlayXY(W, H, placeW, placeH, t.x ?? 0, t.y ?? 0);
      const clipStart = clip.startTime.toFixed(4);
      const clipEnd = clip.endTime.toFixed(4);
      const enable = `between(t,${clipStart},${clipEnd})`;

      // TODO: blendMode mapping — currently only 'normal' is supported via overlay.
      // blend filter could approximate screen/multiply for future work.

      const outLabel = `${clipLabel}_comp`;
      // overlay=format=auto lets FFmpeg pick the right internal pixel format based on
      // input streams (yuv420p base + rgba overlay → auto-converts for compositing).
      // Do NOT pass 'yuva420p' or 'rgba' to the overlay filter's format option —
      // that option controls the output format, not the input expectation, and only
      // accepts a small set of tokens ('yuv420', 'yuv444', 'rgb', 'gbrp', 'auto').
      filterParts.push(
        `[${accLabel}][${processedLabel}]overlay=x=${ox}:y=${oy}:enable='${enable}'[${outLabel}]`,
      );
      accLabel = outLabel;
    }
  }

  return accLabel;
}
