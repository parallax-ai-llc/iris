/**
 * Clip transition filters (fade / dip / zoom / blur). Moved from
 * electron/ipc/export.ts.
 */

import type { ExportClip } from './types';

/**
 * Spatial intra-clip transition filters (zoom, blur). These must run BEFORE
 * the output-resolution scale so that the downstream `scale=W:H:FOAR=decrease`
 * upscales the cropped/blurred region back to the final output size.
 */
export function buildSpatialTransitionVideoFilters(
  effects: ExportClip['effects'],
  clipDuration: number,
  outW: number,
  outH: number,
  fps: number,
): string[] {
  if (!effects) return [];
  const filters: string[] = [];
  for (const fx of effects) {
    if (!fx.enabled || fx.type !== 'transition') continue;
    const dur = fx.transitionDuration ?? 0.5;
    const pos = fx.transitionPosition ?? 'start';
    const fadeOutStart = Math.max(0, clipDuration - dur).toFixed(4);
    const t = fx.transitionType;
    if (t === 'zoom' || t === 'cross-zoom' || t === 'zoom-basic' || t === 'multi-spin') {
      // Animate zoom via the `zoompan` filter. zoompan uses `on` (output frame
      // number) inside its `z` expression and requires LITERAL output
      // dimensions in `s` (it does not accept `iw`/`ih`). We pass the project
      // output W×H and fps so the animation is sized correctly.
      const maxZoom = (fx.filterParams?.scale as number | undefined) ?? 1.2;
      const startFrames = Math.max(1, Math.round(dur * fps));
      const endStartFrame = Math.max(0, Math.round((clipDuration - dur) * fps));
      const endFrames = Math.max(1, Math.round(dur * fps));
      const zParts: string[] = [];
      if (pos === 'start' || pos === 'both') {
        // ramp maxZoom → 1 over the first `startFrames` frames
        zParts.push(`if(lte(on,${startFrames}),${maxZoom}-(${maxZoom}-1)*on/${startFrames},1)`);
      }
      if (pos === 'end' || pos === 'both') {
        // ramp 1 → maxZoom over the last `endFrames` frames
        zParts.push(`if(gte(on,${endStartFrame}),1+(${maxZoom}-1)*(on-${endStartFrame})/${endFrames},1)`);
      }
      const zExpr = zParts.length === 1 ? zParts[0] : `max(${zParts.join(',')})`;
      // d=1 means produce 1 output frame per input frame (no still-image zoom).
      // x/y center the zoom on the middle of the frame.
      //
      // CRITICAL: zoompan retimes its output to its `fps` parameter. If the
      // input frame rate differs (e.g. source is 60fps but project is 30fps),
      // the duration of the segment is stretched or squeezed → visible
      // slow-/fast-motion. Force the input rate to match `fps` first.
      filters.push(`fps=${fps}`);
      filters.push(
        `zoompan=z='${zExpr}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${outW}x${outH}:fps=${fps}`
      );
    } else if (t === 'blur' || t === 'blur-transition') {
      const maxBlur = Math.max(1, ((fx.filterParams?.intensity as number | undefined) ?? 20) / 2);
      const STEPS = 10;
      const cmds: string[] = [];
      if (pos === 'start' || pos === 'both') {
        for (let i = 0; i <= STEPS; i++) {
          const tt = (i / STEPS) * dur;
          const sigma = maxBlur * (1 - i / STEPS);
          cmds.push(`${tt.toFixed(4)} gblur sigma ${sigma.toFixed(2)}`);
        }
      }
      if (pos === 'end' || pos === 'both') {
        const startT = clipDuration - dur;
        for (let i = 0; i <= STEPS; i++) {
          const tt = startT + (i / STEPS) * dur;
          const sigma = maxBlur * (i / STEPS);
          cmds.push(`${tt.toFixed(4)} gblur sigma ${sigma.toFixed(2)}`);
        }
      }
      if (pos === 'both') cmds.push(`${dur.toFixed(4)} gblur sigma 0`);
      filters.push(`sendcmd=c='${cmds.join(';')}',gblur=sigma=0`);
    }
  }
  return filters;
}

export function buildTransitionVideoFilters(effects: ExportClip['effects'], clipDuration: number): string[] {
  if (!effects) return [];
  const filters: string[] = [];
  for (const fx of effects) {
    if (!fx.enabled || fx.type !== 'transition') continue;
    const dur = fx.transitionDuration ?? 0.5;
    const pos = fx.transitionPosition ?? 'start';
    const fadeOutStart = Math.max(0, clipDuration - dur).toFixed(4);
    const t = fx.transitionType;
    if (t === 'fade' || t === 'dissolve' || t === 'dip-to-black') {
      if (pos === 'start' || pos === 'both') filters.push(`fade=t=in:st=0:d=${dur}`);
      if (pos === 'end' || pos === 'both') filters.push(`fade=t=out:st=${fadeOutStart}:d=${dur}`);
    } else if (t === 'dip-to-white') {
      if (pos === 'start' || pos === 'both') filters.push(`fade=t=in:st=0:d=${dur}:color=white`);
      if (pos === 'end' || pos === 'both') filters.push(`fade=t=out:st=${fadeOutStart}:d=${dur}:color=white`);
    }
    // zoom/blur are spatial transitions and are handled in
    // `buildSpatialTransitionVideoFilters` (which must run BEFORE the
    // output-resolution scale).
    // slide/wipe and other complex types are handled at the junction xfade layer
    // (XFADE_MAP). Intra-clip approximations would require splitting the clip,
    // which is out of scope for this filter helper.
  }
  return filters;
}
