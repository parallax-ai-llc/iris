/**
 * Video effect → FFmpeg filter mapping, part 1 (basic, stylize, curves).
 *
 * Moved verbatim from electron/ipc/export.ts. `pushBasicEffectFilter` returns
 * false when the effect type is not handled here so the dispatcher in
 * ./video-effect-filters.ts can try the next group.
 */

import type { ExportEffect } from './types';

/** Converts [x,y][] curve points to FFmpeg curves point string */
export function formatCurvePoints(pts: [number, number][]): string {
  if (!pts || pts.length < 2) return '';
  return pts
    .map(([x, y]) => `${Math.max(0, Math.min(1, x)).toFixed(3)}/${Math.max(0, Math.min(1, y)).toFixed(3)}`)
    .join(' ');
}

export function pushBasicEffectFilter(fx: ExportEffect, v: number, filters: string[]): boolean {
  switch (fx.filterType) {
    case 'brightness':
      filters.push(`eq=brightness=${(v / 200).toFixed(3)}`); break;
    case 'contrast':
      filters.push(`eq=contrast=${(1 + v / 100).toFixed(3)}`); break;
    case 'saturation':
      filters.push(`eq=saturation=${(1 + v / 100).toFixed(3)}`); break;
    case 'hue':
      filters.push(`hue=h=${v}`); break;
    case 'blur':
      filters.push(`gblur=sigma=${Math.max(0.5, v / 5).toFixed(1)}`); break;
    case 'grayscale':
      // v=0 → s=1 (no change), v=100 → s=0 (full grayscale)
      filters.push(`hue=s=${Math.max(0, 1 - v / 100).toFixed(3)}`); break;
    case 'sepia':
      filters.push(`colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131`); break;
    case 'invert':
      filters.push(`negate`); break;
    case 'sharpen':
    case 'unsharp-mask':
      filters.push(`unsharp=5:5:${(v / 50).toFixed(2)}:5:5:0`); break;
    case 'gaussian-blur':
      filters.push(`gblur=sigma=${Math.max(0.1, v / 10).toFixed(1)}`); break;
    case 'noise':
      filters.push(`noise=alls=${Math.round(v / 2)}:allf=t+u`); break;
    case 'horizontal-flip':
      filters.push(`hflip`); break;
    case 'vertical-flip':
      filters.push(`vflip`); break;
    case 'mosaic':
      filters.push(`pixelize=w=${Math.max(2, Math.round(v / 5))}:h=${Math.max(2, Math.round(v / 5))}`); break;
    case 'vignette':
      filters.push(`vignette=PI/${Math.max(0.5, 5 - v * 0.04).toFixed(2)}`); break;
    case 'brightness-contrast':
      filters.push(`eq=brightness=${(v / 200).toFixed(3)}:contrast=${(1 + v / 100).toFixed(3)}`); break;
    case 'color-correction': {
      const p = fx.filterParams || {};
      const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

      // Basic
      if (p.exposure) filters.push(`eq=brightness=${((p.exposure as number) / 200).toFixed(3)}`);
      if (p.contrast) filters.push(`eq=contrast=${(1 + (p.contrast as number) / 100).toFixed(3)}`);
      if (p.saturation) filters.push(`eq=saturation=${(1 + (p.saturation as number) / 100).toFixed(3)}`);
      if (p.vibrance) filters.push(`eq=saturation=${(1 + (p.vibrance as number) * 0.006).toFixed(3)}`);
      if (p.temperature != null && (p.temperature as number) !== 0) {
        // colortemperature filter requires FFmpeg 5.0+; use colorbalance for 4.x compat
        const t = (p.temperature as number) / 100; // -1~+1 normalized
        const r = clamp(t * 0.3, -1, 1).toFixed(3);
        const g = clamp(t * 0.05, -1, 1).toFixed(3);
        const b = clamp(-t * 0.3, -1, 1).toFixed(3);
        filters.push(`colorbalance=rs=${r}:gs=${g}:bs=${b}:rm=${r}:gm=${g}:bm=${b}:rh=${r}:gh=${g}:bh=${b}`);
      }
      // Tint: negative = green, positive = magenta
      if (p.tint) {
        const t = (p.tint as number) / 200;
        const gs = clamp(-t, -1, 1).toFixed(3);
        const rs = clamp(t * 0.5, -1, 1).toFixed(3);
        const bs = clamp(t * 0.5, -1, 1).toFixed(3);
        filters.push(`colorbalance=rs=${rs}:gs=${gs}:bs=${bs}:rm=${rs}:gm=${gs}:bm=${bs}:rh=${rs}:gh=${gs}:bh=${bs}`);
      }

      // Tone adjustments via curves
      if (p.highlights) {
        const h = clamp(0.75 + (p.highlights as number) / 400, 0, 1).toFixed(3);
        filters.push(`curves=master='0/0 0.500/0.500 0.750/${h} 1.000/1.000'`);
      }
      if (p.shadows) {
        const s = clamp(0.25 + (p.shadows as number) / 400, 0, 1).toFixed(3);
        filters.push(`curves=master='0.000/0.000 0.250/${s} 0.500/0.500 1.000/1.000'`);
      }
      if (p.whites) {
        const wv = p.whites as number;
        if (wv > 0) {
          const pt = clamp(0.875 + wv / 400, 0, 1).toFixed(3);
          filters.push(`curves=master='0.000/0.000 0.500/0.500 0.875/${pt} 1.000/1.000'`);
        } else {
          const w = clamp(1 + wv / 400, 0, 1).toFixed(3);
          filters.push(`curves=master='0.000/0.000 0.500/0.500 1.000/${w}'`);
        }
      }
      if (p.blacks) {
        const bv = p.blacks as number;
        if (bv > 0) {
          // Lift blacks (fade): raise the shadow floor
          const b = clamp(bv / 400, 0, 0.3).toFixed(3);
          filters.push(`curves=master='0.000/${b} 0.500/0.500 1.000/1.000'`);
        } else {
          // Crush blacks: pull the 0.25 point down toward 0
          const b = clamp(0.25 + bv / 400, 0, 0.25).toFixed(3);
          filters.push(`curves=master='0.000/0.000 0.250/${b} 1.000/1.000'`);
        }
      }
      if (p.fadedFilm) {
        const lift = clamp((p.fadedFilm as number) / 400, 0, 0.3).toFixed(3);
        const ceiling = clamp(1 - (p.fadedFilm as number) / 400, 0.7, 1).toFixed(3);
        filters.push(`curves=master='0.000/${lift} 1.000/${ceiling}'`);
      }

      // User-defined RGB curves
      const masterPts = p.curveMaster as [number, number][] | undefined;
      const redPts = p.curveRed as [number, number][] | undefined;
      const greenPts = p.curveGreen as [number, number][] | undefined;
      const bluePts = p.curveBlue as [number, number][] | undefined;
      const masterStr = formatCurvePoints(masterPts ?? []);
      const redStr = formatCurvePoints(redPts ?? []);
      const greenStr = formatCurvePoints(greenPts ?? []);
      const blueStr = formatCurvePoints(bluePts ?? []);
      if (masterStr || redStr || greenStr || blueStr) {
        const parts: string[] = [];
        if (masterStr) parts.push(`master='${masterStr}'`);
        if (redStr) parts.push(`red='${redStr}'`);
        if (greenStr) parts.push(`green='${greenStr}'`);
        if (blueStr) parts.push(`blue='${blueStr}'`);
        filters.push(`curves=${parts.join(':')}`);
      }

      // Color wheels (three-way: shadows/midtones/highlights)
      const sw = p.shadowsWheel as [number, number] | undefined;
      const mw = p.midtonesWheel as [number, number] | undefined;
      const hw = p.highlightsWheel as [number, number] | undefined;
      const scale = 0.3;
      if ((sw && (sw[0] !== 0 || sw[1] !== 0)) || (mw && (mw[0] !== 0 || mw[1] !== 0)) || (hw && (hw[0] !== 0 || hw[1] !== 0))) {
        const [sx, sy] = sw ?? [0, 0];
        const [mx, my] = mw ?? [0, 0];
        const [hx, hy] = hw ?? [0, 0];
        const cbRs = clamp(sx * scale - sy * 0.15 * scale, -1, 1).toFixed(3);
        const cbGs = clamp(sy * scale, -1, 1).toFixed(3);
        const cbBs = clamp(-sx * scale - sy * 0.15 * scale, -1, 1).toFixed(3);
        const cbRm = clamp(mx * scale - my * 0.15 * scale, -1, 1).toFixed(3);
        const cbGm = clamp(my * scale, -1, 1).toFixed(3);
        const cbBm = clamp(-mx * scale - my * 0.15 * scale, -1, 1).toFixed(3);
        const cbRh = clamp(hx * scale - hy * 0.15 * scale, -1, 1).toFixed(3);
        const cbGh = clamp(hy * scale, -1, 1).toFixed(3);
        const cbBh = clamp(-hx * scale - hy * 0.15 * scale, -1, 1).toFixed(3);
        filters.push(`colorbalance=rs=${cbRs}:gs=${cbGs}:bs=${cbBs}:rm=${cbRm}:gm=${cbGm}:bm=${cbBm}:rh=${cbRh}:gh=${cbGh}:bh=${cbBh}`);
      }
      if (p.shadowsLift) {
        const lift = clamp((p.shadowsLift as number) / 400, 0, 0.3).toFixed(3);
        filters.push(`curves=master='0.000/${lift} 0.500/0.500 1.000/1.000'`);
      }
      if (p.midtonesGamma) {
        const gamma = clamp(1 + (p.midtonesGamma as number) / 100, 0.1, 10).toFixed(3);
        filters.push(`eq=gamma=${gamma}`);
      }
      if (p.highlightsGain) {
        const hg = (p.highlightsGain as number) / 100; // -1~+1
        const pt = clamp(0.75 + hg * 0.25, 0, 1).toFixed(3);
        filters.push(`curves=master='0.000/0.000 0.500/0.500 0.750/${pt} 1.000/1.000'`);
      }

      // HSL Secondary — approximate: average non-zero channels
      const hslSat = p.hslSaturation as number[] | undefined;
      const hslHue = p.hslHue as number[] | undefined;
      const hslLum = p.hslLuminance as number[] | undefined;
      if (hslSat && hslSat.length > 0) {
        const nonZero = hslSat.filter((v) => v !== 0);
        if (nonZero.length > 0) {
          const avg = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
          filters.push(`eq=saturation=${(1 + avg / 100).toFixed(3)}`);
        }
      }
      if (hslHue && hslHue.length > 0) {
        const nonZero = hslHue.filter((v) => v !== 0);
        if (nonZero.length > 0) {
          const avg = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
          filters.push(`hue=h=${avg.toFixed(2)}`);
        }
      }
      if (hslLum && hslLum.length > 0) {
        const nonZero = hslLum.filter((v) => v !== 0);
        if (nonZero.length > 0) {
          const avg = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
          filters.push(`eq=brightness=${(avg / 200).toFixed(3)}`);
        }
      }
      break;
    }
    case 'black-and-white':
      filters.push(`hue=s=0`); break;
    case 'posterize':
      filters.push(`posterize=${Math.max(2, Math.round(8 - v / 15))}`); break;
    case 'find-edges':
      filters.push(`edgedetect=low=0.1:high=0.4`); break;
    case 'threshold': {
      const t = Math.max(0.001, Math.min(0.999, v / 100));
      filters.push(`curves=master='0/0 ${(t - 0.001).toFixed(3)}/0 ${t.toFixed(3)}/1 1/1'`); break;
    }
    case 'emboss':
      filters.push(`convolution=0m=-2 -1 0 -1 1 1 0 1 2:1m=-2 -1 0 -1 1 1 0 1 2:2m=-2 -1 0 -1 1 1 0 1 2:3m=0 0 0 0 1 0 0 0 0`); break;
    case 'solarize': {
      const thr = Math.max(0.001, 1 - v / 100);
      filters.push(`curves=master='0/0 ${thr.toFixed(3)}/1 1/0'`); break;
    }
    case 'anti-alias-blur':
      filters.push(`gblur=sigma=0.5`); break;
    case 'camera-blur':
    case 'compound-blur':
      filters.push(`gblur=sigma=${Math.max(0.1, v / 10).toFixed(1)}`); break;
    case 'median':
      filters.push(`median=radius=${Math.max(1, Math.round(v / 20))}`); break;
    case 'replicate':
      filters.push(`tile=${Math.max(2, Math.round(v / 25) + 1)}x${Math.max(2, Math.round(v / 25) + 1)}`); break;
    case 'equalize':
      filters.push(`histeq=strength=${Math.max(0.01, v / 100).toFixed(2)}`); break;
    case 'auto-levels':
    case 'auto-contrast':
    case 'auto-color':
      filters.push(`normalize`); break;
    case 'tint': {
      const p = fx.filterParams || {};
      const color = (p.color as string) ?? '#ffaa44';
      const hex = color.replace('#', '').padEnd(6, '0');
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const intensity = v / 100;
      const rr = (1 - intensity + intensity * r).toFixed(3);
      const rg = (intensity * g * 0.3).toFixed(3);
      const rb = (intensity * b * 0.3).toFixed(3);
      const gr = (intensity * r * 0.3).toFixed(3);
      const gg = (1 - intensity + intensity * g).toFixed(3);
      const gb = (intensity * b * 0.3).toFixed(3);
      const br2 = (intensity * r * 0.3).toFixed(3);
      const bg2 = (intensity * g * 0.3).toFixed(3);
      const bb = (1 - intensity + intensity * b).toFixed(3);
      filters.push(`colorchannelmixer=${rr}:${rg}:${rb}:0:${gr}:${gg}:${gb}:0:${br2}:${bg2}:${bb}:0`);
      break;
    }
    case 'proc-amp': {
      const p = fx.filterParams || {};
      if (p.brightness) filters.push(`eq=brightness=${((p.brightness as number) / 200).toFixed(3)}`);
      if (p.contrast) filters.push(`eq=contrast=${(1 + (p.contrast as number) / 100).toFixed(3)}`);
      if (p.saturation) filters.push(`eq=saturation=${(1 + (p.saturation as number) / 100).toFixed(3)}`);
      if (p.hue) filters.push(`hue=h=${p.hue}`);
      break;
    }
    case 'gamma-correction': {
      const p = fx.filterParams || {};
      const gamma = (p.gamma as number) ?? 1.0;
      if (gamma !== 1) filters.push(`eq=gamma=${gamma.toFixed(3)}`);
      break;
    }
    case 'levels': {
      const p = fx.filterParams || {};
      const inMin = ((p.inputBlack as number) ?? 0) / 255;
      const inMax = ((p.inputWhite as number) ?? 255) / 255;
      const outMin = ((p.outputBlack as number) ?? 0) / 255;
      const outMax = ((p.outputWhite as number) ?? 255) / 255;
      filters.push(`colorlevels=rimin=${inMin.toFixed(3)}:gimin=${inMin.toFixed(3)}:bimin=${inMin.toFixed(3)}:rimax=${inMax.toFixed(3)}:gimax=${inMax.toFixed(3)}:bimax=${inMax.toFixed(3)}:romin=${outMin.toFixed(3)}:gomin=${outMin.toFixed(3)}:bomin=${outMin.toFixed(3)}:romax=${outMax.toFixed(3)}:gomax=${outMax.toFixed(3)}:bomax=${outMax.toFixed(3)}`);
      break;
    }
    case 'shadow-highlight': {
      const p = fx.filterParams || {};
      const shadow = ((p.shadowAmount as number) ?? 0) / 100;
      const highlight = ((p.highlightAmount as number) ?? 0) / 100;
      if (shadow !== 0 || highlight !== 0) {
        const shadowOut = Math.min(1, shadow * 0.5).toFixed(3);
        const highlightOut = Math.max(0, 1 - highlight * 0.5).toFixed(3);
        filters.push(`curves=master='0/${shadowOut} 0.5/0.5 1/${highlightOut}'`);
      }
      break;
    }
    case 'channel-mixer': {
      const p = fx.filterParams || {};
      const rr = (p.rr as number) ?? 1; const rg2 = (p.rg as number) ?? 0; const rb2 = (p.rb as number) ?? 0;
      const gr2 = (p.gr as number) ?? 0; const gg2 = (p.gg as number) ?? 1; const gb2 = (p.gb as number) ?? 0;
      const br3 = (p.br as number) ?? 0; const bg3 = (p.bg as number) ?? 0; const bb2 = (p.bb as number) ?? 1;
      filters.push(`colorchannelmixer=${rr}:${rg2}:${rb2}:0:${gr2}:${gg2}:${gb2}:0:${br3}:${bg3}:${bb2}:0`);
      break;
    }
    case 'color-balance-rgb': {
      const p = fx.filterParams || {};
      const r = 1 + ((p.red as number) ?? 0) / 100;
      const g = 1 + ((p.green as number) ?? 0) / 100;
      const b = 1 + ((p.blue as number) ?? 0) / 100;
      filters.push(`colorchannelmixer=${r.toFixed(3)}:0:0:0:0:${g.toFixed(3)}:0:0:0:0:${b.toFixed(3)}:0`);
      break;
    }
    case 'color-balance-hls': {
      const p = fx.filterParams || {};
      if (p.hue) filters.push(`hue=h=${p.hue}`);
      if (p.saturation) filters.push(`eq=saturation=${(1 + (p.saturation as number) / 100).toFixed(3)}`);
      if (p.lightness) filters.push(`eq=brightness=${((p.lightness as number) / 200).toFixed(3)}`);
      break;
    }
    case 'fast-color-corrector':
    case 'luma-corrector': {
      const p = fx.filterParams || {};
      if (p.brightness) filters.push(`eq=brightness=${((p.brightness as number) / 200).toFixed(3)}`);
      if (p.contrast) filters.push(`eq=contrast=${(1 + (p.contrast as number) / 100).toFixed(3)}`);
      if (p.saturation) filters.push(`eq=saturation=${(1 + (p.saturation as number) / 100).toFixed(3)}`);
      if (p.hue) filters.push(`hue=h=${p.hue}`);
      break;
    }
    case 'rgb-color-corrector': {
      const p = fx.filterParams || {};
      const r = 1 + ((p.redGain as number) ?? 0) / 100;
      const g = 1 + ((p.greenGain as number) ?? 0) / 100;
      const b = 1 + ((p.blueGain as number) ?? 0) / 100;
      filters.push(`colorchannelmixer=${r.toFixed(3)}:0:0:0:0:${g.toFixed(3)}:0:0:0:0:${b.toFixed(3)}:0`);
      break;
    }
    case 'asc-cdl': {
      const p = fx.filterParams || {};
      const slope = (p.slope as number) ?? 1;
      const offset = (p.offset as number) ?? 0;
      const power = (p.power as number) ?? 1;
      if (slope !== 1) filters.push(`eq=contrast=${slope.toFixed(3)}`);
      if (offset !== 0) filters.push(`eq=brightness=${(offset / 2).toFixed(3)}`);
      if (power !== 1) filters.push(`eq=gamma=${(1 / power).toFixed(3)}`);
      break;
    }
    case 'rgb-curves': {
      const p = fx.filterParams || {};
      const masterPts2 = p.curveMaster as [number, number][] | undefined;
      const redPts2 = p.curveRed as [number, number][] | undefined;
      const greenPts2 = p.curveGreen as [number, number][] | undefined;
      const bluePts2 = p.curveBlue as [number, number][] | undefined;
      const masterStr2 = formatCurvePoints(masterPts2 ?? []);
      const redStr2 = formatCurvePoints(redPts2 ?? []);
      const greenStr2 = formatCurvePoints(greenPts2 ?? []);
      const blueStr2 = formatCurvePoints(bluePts2 ?? []);
      if (masterStr2 || redStr2 || greenStr2 || blueStr2) {
        const parts2: string[] = [];
        if (masterStr2) parts2.push(`master='${masterStr2}'`);
        if (redStr2) parts2.push(`red='${redStr2}'`);
        if (greenStr2) parts2.push(`green='${greenStr2}'`);
        if (blueStr2) parts2.push(`blue='${blueStr2}'`);
        filters.push(`curves=${parts2.join(':')}`);
      }
      break;
    }
    case 'luma-curve': {
      const p = fx.filterParams || {};
      const pts = p.curveMaster as [number, number][] | undefined;
      const str = formatCurvePoints(pts ?? []);
      if (str) filters.push(`curves=master='${str}'`);
      break;
    }
    default:
      return false;
  }
  return true;
}
