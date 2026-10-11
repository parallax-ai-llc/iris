/**
 * Video effect → FFmpeg filter mapping, part 2 (grading, keying, distort, stylize).
 *
 * Moved verbatim from electron/ipc/export.ts. Returns false when the effect
 * type is not handled here.
 */

import type { ExportEffect } from './types';

export function pushGradingEffectFilter(fx: ExportEffect, v: number, filters: string[]): boolean {
  switch (fx.filterType) {
    case 'three-way-color-corrector': {
      const p = fx.filterParams || {};
      const clamp3 = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
      const sw3 = p.shadowsWheel as [number, number] | undefined;
      const mw3 = p.midtonesWheel as [number, number] | undefined;
      const hw3 = p.highlightsWheel as [number, number] | undefined;
      const sc3 = 0.3;
      const [sx3, sy3] = sw3 ?? [0, 0];
      const [mx3, my3] = mw3 ?? [0, 0];
      const [hx3, hy3] = hw3 ?? [0, 0];
      const anyWheel = sx3 !== 0 || sy3 !== 0 || mx3 !== 0 || my3 !== 0 || hx3 !== 0 || hy3 !== 0;
      if (anyWheel) {
        const rs3 = clamp3(sx3 * sc3 - sy3 * 0.15 * sc3, -1, 1).toFixed(3);
        const gs3 = clamp3(sy3 * sc3, -1, 1).toFixed(3);
        const bs3 = clamp3(-sx3 * sc3 - sy3 * 0.15 * sc3, -1, 1).toFixed(3);
        const rm3 = clamp3(mx3 * sc3 - my3 * 0.15 * sc3, -1, 1).toFixed(3);
        const gm3 = clamp3(my3 * sc3, -1, 1).toFixed(3);
        const bm3 = clamp3(-mx3 * sc3 - my3 * 0.15 * sc3, -1, 1).toFixed(3);
        const rh3 = clamp3(hx3 * sc3 - hy3 * 0.15 * sc3, -1, 1).toFixed(3);
        const gh3 = clamp3(hy3 * sc3, -1, 1).toFixed(3);
        const bh3 = clamp3(-hx3 * sc3 - hy3 * 0.15 * sc3, -1, 1).toFixed(3);
        filters.push(`colorbalance=rs=${rs3}:gs=${gs3}:bs=${bs3}:rm=${rm3}:gm=${gm3}:bm=${bm3}:rh=${rh3}:gh=${gh3}:bh=${bh3}`);
      }
      if (p.shadowsLift) {
        const lift3 = clamp3((p.shadowsLift as number) / 400, 0, 0.3).toFixed(3);
        filters.push(`curves=master='0.000/${lift3} 0.500/0.500 1.000/1.000'`);
      }
      if (p.midtonesGamma) {
        const gamma3 = clamp3(1 + (p.midtonesGamma as number) / 100, 0.1, 10).toFixed(3);
        filters.push(`eq=gamma=${gamma3}`);
      }
      if (p.highlightsGain) {
        const hg3 = (p.highlightsGain as number) / 100;
        const pt3 = clamp3(0.75 + hg3 * 0.25, 0, 1).toFixed(3);
        filters.push(`curves=master='0.000/0.000 0.500/0.500 0.750/${pt3} 1.000/1.000'`);
      }
      break;
    }
    case 'change-color':
    case 'change-to-color': {
      const p = fx.filterParams || {};
      if (p.hue) filters.push(`hue=h=${p.hue}`);
      if (p.saturation) filters.push(`eq=saturation=${(1 + (p.saturation as number) / 100).toFixed(3)}`);
      break;
    }
    case 'video-limiter':
      filters.push(`colorlevels=rimin=0.063:gimin=0.063:bimin=0.063:rimax=0.922:gimax=0.922:bimax=0.922`);
      break;
    case 'crop-effect': {
      const p = fx.filterParams || {};
      if (p.width && p.height) {
        const x = (p.x as number) ?? 0;
        const y = (p.y as number) ?? 0;
        filters.push(`crop=${p.width}:${p.height}:${x}:${y}`);
      }
      break;
    }
    case 'lens-distortion': {
      const p = fx.filterParams || {};
      const k1 = ((p.k1 as number) ?? 0) / 100;
      const k2 = ((p.k2 as number) ?? 0) / 100;
      filters.push(`lenscorrection=k1=${k1.toFixed(4)}:k2=${k2.toFixed(4)}`);
      break;
    }
    case 'corner-pin': {
      const p = fx.filterParams || {};
      const x0 = (p.x0 as number) ?? 0; const y0 = (p.y0 as number) ?? 0;
      const x1 = (p.x1 as number) ?? 1920; const y1 = (p.y1 as number) ?? 0;
      const x2 = (p.x2 as number) ?? 1920; const y2 = (p.y2 as number) ?? 1080;
      const x3 = (p.x3 as number) ?? 0; const y3 = (p.y3 as number) ?? 1080;
      filters.push(`perspective=x0=${x0}:y0=${y0}:x1=${x1}:y1=${y1}:x2=${x2}:y2=${y2}:x3=${x3}:y3=${y3}:sense=source`);
      break;
    }
    case 'directional-blur': {
      const angle = ((fx.filterParams?.angle as number) ?? 0) * Math.PI / 180;
      const dist = Math.max(1, Math.round(v / 5));
      filters.push(`mblur=type=l:r=${dist}:angle=${angle.toFixed(4)}`);
      break;
    }
    case 'glow':
    case 'alpha-glow':
    case 'vr-glow': {
      const glowR = Math.max(1, Math.round(v / 10));
      filters.push(`gblur=sigma=${glowR}`);
      filters.push(`curves=master='0/0 0.7/0.85 1/1'`);
      break;
    }
    case 'channel-blur': {
      const p = fx.filterParams || {};
      const rb = (p.redBlur as number ?? 0);
      const gb = (p.greenBlur as number ?? 0);
      const bb = (p.blueBlur as number ?? 0);
      const avgBlur = (rb + gb + bb) / 3;
      if (avgBlur > 0) filters.push(`gblur=sigma=${Math.max(0.5, avgBlur).toFixed(1)}`);
      break;
    }
    case 'zoom-blur': {
      const p = fx.filterParams || {};
      const zr = Math.max(1, Math.round((p.amount as number ?? 20) / 5));
      filters.push(`mblur=type=z:r=${zr}`);
      break;
    }
    case 'color-pass':
    case 'leave-color': {
      // Approximate: reduce saturation to make non-selected colors near-gray
      // True per-hue isolation requires filter_complex; this is a best-effort
      filters.push(`eq=saturation=0.2`);
      break;
    }
    case 'mirror': {
      const p = fx.filterParams || {};
      const axis = (p.axis as number ?? 0);
      if (axis === 1) filters.push(`vflip`);
      else if (axis === 2) { filters.push(`hflip`); filters.push(`vflip`); }
      else filters.push(`hflip`);
      break;
    }
    case 'offset': {
      const p = fx.filterParams || {};
      const ox = Math.round((p.x as number ?? 0));
      const oy = Math.round((p.y as number ?? 0));
      if (ox !== 0 || oy !== 0) {
        const padW = `iw+${Math.abs(ox) * 2}`;
        const padH = `ih+${Math.abs(oy) * 2}`;
        const padX = ox < 0 ? 0 : Math.abs(ox);
        const padY = oy < 0 ? 0 : Math.abs(oy);
        const cropX = ox < 0 ? Math.abs(ox) : 0;
        const cropY = oy < 0 ? Math.abs(oy) : 0;
        filters.push(`pad=${padW}:${padH}:${padX}:${padY}`);
        filters.push(`crop=iw-${Math.abs(ox) * 2}:ih-${Math.abs(oy) * 2}:${cropX}:${cropY}`);
      }
      break;
    }
    case 'basic-3d': {
      const p = fx.filterParams || {};
      const swivel = ((p.swivel as number ?? 0)) * Math.PI / 180;
      const tilt = ((p.tilt as number ?? 0)) * Math.PI / 180;
      if (Math.abs(swivel) > 0.001) filters.push(`rotate=${swivel.toFixed(4)}:c=black@0`);
      if (Math.abs(tilt) > 0.001) {
        const dy = Math.round(Math.sin(tilt) * 200);
        filters.push(`perspective=x0=0:y0=${dy}:x1=iw:y1=${dy}:x2=0:y2=ih-${dy}:x3=iw:y3=ih-${dy}:sense=source`);
      }
      break;
    }
    case 'transform-effect': {
      const p = fx.filterParams || {};
      const scaleX = ((p.scaleX as number ?? 100)) / 100;
      const scaleY = ((p.scaleY as number ?? 100)) / 100;
      const rotation = ((p.rotation as number ?? 0)) * Math.PI / 180;
      if (Math.abs(scaleX - 1) > 0.001 || Math.abs(scaleY - 1) > 0.001)
        filters.push(`scale=iw*${scaleX.toFixed(3)}:ih*${scaleY.toFixed(3)}`);
      if (Math.abs(rotation) > 0.001) filters.push(`rotate=${rotation.toFixed(4)}:c=black@0`);
      break;
    }
    case 'motion-tile': {
      const p = fx.filterParams || {};
      const cols = Math.max(2, Math.round(200 / ((p.tileWidth as number ?? 100))));
      const rows = Math.max(2, Math.round(200 / ((p.tileHeight as number ?? 100))));
      filters.push(`tile=${cols}x${rows}`);
      break;
    }
    case 'wave-warp':
    case 'ripple-distort': {
      const p = fx.filterParams || {};
      const wh = Math.round((p.waveHeight as number ?? (p.radius as number ?? 10)));
      const ww = Math.max(1, Math.round((p.waveWidth as number ?? 20)));
      filters.push(`geq=r='r(X+${wh}*sin(2*PI*Y/${ww})\\,Y)':g='g(X+${wh}*sin(2*PI*Y/${ww})\\,Y)':b='b(X+${wh}*sin(2*PI*Y/${ww})\\,Y)'`);
      break;
    }
    case 'luma-key': {
      const p = fx.filterParams || {};
      const thr = Math.max(0.001, Math.min(0.999, ((p.threshold as number ?? 50)) / 100));
      const tol = Math.max(0.001, Math.min(0.999, ((p.tolerance as number ?? 20)) / 100));
      const soft = Math.max(0, Math.min(1, ((p.softness as number ?? 10)) / 100));
      filters.push(`lumakey=threshold=${thr.toFixed(3)}:tolerance=${tol.toFixed(3)}:softness=${soft.toFixed(3)}`);
      break;
    }
    case 'color-key':
    case 'non-red-key': {
      const p = fx.filterParams || {};
      const col = (p.color as string ?? '#00ff00').replace('#', '');
      const sim = Math.max(0.01, Math.min(0.99, ((p.tolerance as number ?? 30)) / 100));
      filters.push(`colorkey=color=${col}:similarity=${sim.toFixed(3)}:blend=0.05`);
      break;
    }
    case 'ultra-key': {
      const p = fx.filterParams || {};
      const kc = (p.keyColor as string ?? '#00ff00').replace('#', '0x');
      const sim = Math.max(0.01, Math.min(0.99, ((p.tolerance as number ?? 50)) / 100));
      filters.push(`chromakey=color=${kc}:similarity=${sim.toFixed(3)}:blend=0.05`);
      break;
    }
    case 'posterize-time': {
      const p = fx.filterParams || {};
      const fr = Math.max(1, Math.min(120, Math.round((p.frameRate as number ?? 12))));
      filters.push(`fps=${fr}`);
      break;
    }
    case 'flicker-removal':
    case 'reduce-interlace-flicker': {
      filters.push(`deflicker=s=5:m=am`);
      break;
    }
    case 'edge-feather': {
      const amount = Math.max(0.01, ((fx.filterParams?.amount as number) ?? 10) / 100);
      filters.push(`vignette=PI/${(2 / amount).toFixed(2)}:eval=init`);
      break;
    }
    case 'grid-generate': {
      const p = fx.filterParams || {};
      const gw = Math.max(1, Math.round(p.sizeX as number ?? 50));
      const gh = Math.max(1, Math.round(p.sizeY as number ?? 50));
      const lw = Math.max(1, Math.round(p.lineWidth as number ?? 1));
      filters.push(`drawgrid=x=0:y=0:width=${gw}:height=${gh}:color=white@0.8:t=${lw}`);
      break;
    }
    case 'vr-projection':
    case 'vr-rotate-sphere': {
      const p = fx.filterParams || {};
      const pan = ((p.pan as number ?? p.yaw as number ?? 0)).toFixed(1);
      const tilt2 = ((p.tilt as number ?? p.pitch as number ?? 0)).toFixed(1);
      const roll2 = ((p.roll as number ?? 0)).toFixed(1);
      filters.push(`v360=e:e:yaw=${pan}:pitch=${tilt2}:roll=${roll2}`);
      break;
    }
    case 'vr-de-noise': {
      const p = fx.filterParams || {};
      const s = Math.max(0.1, Math.min(20, ((p.strength as number ?? 50)) / 10));
      filters.push(`hqdn3d=${s.toFixed(1)}:${(s * 0.75).toFixed(1)}:${(s * 6).toFixed(1)}:${(s * 4.5).toFixed(1)}`);
      break;
    }
    case 'vr-sharpen': {
      const p = fx.filterParams || {};
      const amount2 = Math.max(0, Math.min(5, ((p.amount as number ?? 50)) / 100));
      filters.push(`unsharp=5:5:${amount2.toFixed(2)}:5:5:0`);
      break;
    }
    case 'vr-blur': {
      const p = fx.filterParams || {};
      const sigma2 = Math.max(0.5, ((p.radius as number ?? 10)) / 3);
      filters.push(`gblur=sigma=${sigma2.toFixed(1)}`);
      break;
    }
    case 'convolution-kernel': {
      const p = fx.filterParams || {};
      const mat = (p.matrix as string) ?? 'identity';
      if (mat === 'sharpen') {
        filters.push(`convolution=0m=0 -1 0 -1 5 -1 0 -1 0:1m=0 -1 0 -1 5 -1 0 -1 0:2m=0 -1 0 -1 5 -1 0 -1 0:3m=0 0 0 0 1 0 0 0 0`);
      } else if (mat === 'edge-detect') {
        filters.push(`convolution=0m=-1 -1 -1 -1 8 -1 -1 -1 -1:1m=-1 -1 -1 -1 8 -1 -1 -1 -1:2m=-1 -1 -1 -1 8 -1 -1 -1 -1:3m=0 0 0 0 1 0 0 0 0`);
      } else if (mat === 'blur') {
        filters.push(`convolution=0m=1 1 1 1 1 1 1 1 1:1m=1 1 1 1 1 1 1 1 1:2m=1 1 1 1 1 1 1 1 1:3m=0 0 0 0 1 0 0 0 0:0rdiv=9:1rdiv=9:2rdiv=9`);
      }
      break;
    }
    case 'extract-effect': {
      const p = fx.filterParams || {};
      const bv = ((p.blackPoint as number ?? 0)) / 255;
      const wv = Math.max(bv + 0.01, ((p.whitePoint as number ?? 255)) / 255);
      filters.push(`colorlevels=rimin=${bv.toFixed(3)}:gimin=${bv.toFixed(3)}:bimin=${bv.toFixed(3)}:rimax=${wv.toFixed(3)}:gimax=${wv.toFixed(3)}:bimax=${wv.toFixed(3)}`);
      break;
    }
    case 'arithmetic': {
      const p = fx.filterParams || {};
      const op = (p.operator as string ?? 'add');
      const rv = ((p.redValue as number ?? 0)) / 255;
      const gv2 = ((p.greenValue as number ?? 0)) / 255;
      const bv3 = ((p.blueValue as number ?? 0)) / 255;
      if (op === 'add') {
        filters.push(`geq=r='clip(r(X\\,Y)/255+${rv.toFixed(3)}\\,0\\,1)*255':g='clip(g(X\\,Y)/255+${gv2.toFixed(3)}\\,0\\,1)*255':b='clip(b(X\\,Y)/255+${bv3.toFixed(3)}\\,0\\,1)*255'`);
      } else if (op === 'subtract') {
        filters.push(`geq=r='clip(r(X\\,Y)/255-${rv.toFixed(3)}\\,0\\,1)*255':g='clip(g(X\\,Y)/255-${gv2.toFixed(3)}\\,0\\,1)*255':b='clip(b(X\\,Y)/255-${bv3.toFixed(3)}\\,0\\,1)*255'`);
      } else if (op === 'multiply') {
        const rm = Math.max(0.001, 1 + rv); const gm2 = Math.max(0.001, 1 + gv2); const bm2 = Math.max(0.001, 1 + bv3);
        filters.push(`geq=r='clip(r(X\\,Y)/255*${rm.toFixed(3)}\\,0\\,1)*255':g='clip(g(X\\,Y)/255*${gm2.toFixed(3)}\\,0\\,1)*255':b='clip(b(X\\,Y)/255*${bm2.toFixed(3)}\\,0\\,1)*255'`);
      }
      break;
    }
    case 'solid-composite': {
      const p = fx.filterParams || {};
      const col2 = (p.color as string ?? '#000000').replace('#', '').padEnd(6, '0');
      const op2 = Math.max(0, Math.min(1, ((p.opacity as number ?? 50)) / 100));
      const ri = (parseInt(col2.slice(0, 2), 16) / 255) * op2;
      const gi2 = (parseInt(col2.slice(2, 4), 16) / 255) * op2;
      const bi2 = (parseInt(col2.slice(4, 6), 16) / 255) * op2;
      filters.push(`geq=r='clip(r(X\\,Y)/255*(1-${op2.toFixed(3)})+${ri.toFixed(3)}\\,0\\,1)*255':g='clip(g(X\\,Y)/255*(1-${op2.toFixed(3)})+${gi2.toFixed(3)}\\,0\\,1)*255':b='clip(b(X\\,Y)/255*(1-${op2.toFixed(3)})+${bi2.toFixed(3)}\\,0\\,1)*255'`);
      break;
    }
    case 'dust-and-scratches': {
      const p = fx.filterParams || {};
      const r2 = Math.max(1, Math.min(5, Math.round(p.radius as number ?? 1)));
      filters.push(`median=radius=${r2}`);
      break;
    }
    case 'noise-hls': {
      const p = fx.filterParams || {};
      const ln = Math.round(Math.max(0, ((p.lightnessNoise as number ?? 0))) / 2);
      const sn = Math.round(Math.max(0, ((p.saturationNoise as number ?? 0))) / 2);
      const n2 = Math.max(ln, sn);
      if (n2 > 0) filters.push(`noise=alls=${n2}:allf=t+u`);
      break;
    }
    case 'noise-alpha': {
      const p = fx.filterParams || {};
      const an = Math.round(Math.max(0, ((p.amount as number ?? 50))) / 2);
      if (an > 0) filters.push(`noise=c3s=${an}:c3f=t+u`);
      break;
    }
    case 'color-emboss': {
      filters.push(`convolution=0m=-2 -1 0 -1 1 1 0 1 2:1m=-2 -1 0 -1 1 1 0 1 2:2m=-2 -1 0 -1 1 1 0 1 2:3m=0 0 0 0 1 0 0 0 0`);
      break;
    }
    case 'sdr-conform': {
      const p = fx.filterParams || {};
      const alg = (p.toneMapping as string ?? 'hable');
      filters.push(`tonemap=${alg}`);
      break;
    }
    case 'drop-shadow': {
      // Drop shadow requires filter_complex (split+blur+overlay); approximate with vignette
      const p = fx.filterParams || {};
      const softness = Math.max(0.5, ((p.softness as number ?? 5)) / 10);
      filters.push(`gblur=sigma=${softness.toFixed(1)}`);
      break;
    }
    case 'strobe-light':
    case 'strobe-effect': {
      const p = fx.filterParams || {};
      const fr2 = Math.max(1, Math.min(30, Math.round(1 / Math.max(0.033, (p.duration as number ?? 0.05)))));
      filters.push(`fps=${fr2}`);
      break;
    }
    case 'gradient-wipe-effect': {
      // Approximate gradient wipe as a partial brightness ramp
      filters.push(`curves=master='0/0 0.5/0.4 1/1'`);
      break;
    }
    case 'calculations': {
      const p = fx.filterParams || {};
      const srcCh = (p.sourceChannel as string ?? 'red');
      const tgtCh = (p.targetChannel as string ?? 'green');
      // Approximate: add source channel to target via colorchannelmixer
      const rr2 = 1; const rg3 = (tgtCh === 'red' && srcCh === 'green') ? 1 : 0; const rb3 = (tgtCh === 'red' && srcCh === 'blue') ? 1 : 0;
      const gr3 = (tgtCh === 'green' && srcCh === 'red') ? 1 : 0; const gg3 = 1; const gb3 = (tgtCh === 'green' && srcCh === 'blue') ? 1 : 0;
      const br4 = (tgtCh === 'blue' && srcCh === 'red') ? 1 : 0; const bg4 = (tgtCh === 'blue' && srcCh === 'green') ? 1 : 0; const bb3 = 1;
      filters.push(`colorchannelmixer=${rr2}:${rg3}:${rb3}:0:${gr3}:${gg3}:${gb3}:0:${br4}:${bg4}:${bb3}:0`);
      break;
    }
    default:
      return false;
  }
  return true;
}
