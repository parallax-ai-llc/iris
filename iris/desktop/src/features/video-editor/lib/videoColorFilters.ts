/**
 * Video Color Filters - SVG filter-based rendering for Lumetri Color
 *
 * Generates SVG filter definitions for advanced color correction parameters
 * that cannot be achieved with CSS filters alone:
 * - Temperature / Tint (feColorMatrix)
 * - Highlights / Shadows / Whites / Blacks (feComponentTransfer tone curve)
 * - Vibrance (feColorMatrix saturation with luminance preservation)
 * - Curves (feComponentTransfer table via buildCurveLut)
 * - Color Wheels - Lift / Gamma / Gain (feColorMatrix + feComponentTransfer gamma)
 *
 * CSS filters continue to handle: Exposure, Contrast, Saturation, Sharpness.
 */

import { buildCurveLut } from '@/features/image-editor/canvas/adjustments';

// ==================== Helpers ====================

/** Sanitise an arbitrary string into a valid SVG id segment */
function sanitizeIdSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Build a globally-unique filter id for a clip's color-correction effect.
 * Including the effect id (when provided) prevents collisions when a clip
 * has multiple cc effects (e.g. its own + an adjustment-layer cc).
 */
function makeFilterId(clipId: string, effectId?: string): string {
  const base = 'cc-' + sanitizeIdSegment(clipId);
  return effectId ? `${base}-${sanitizeIdSegment(effectId)}` : base;
}

// ==================== SVG Filter Primitives ====================

/** Temperature / Tint -> feColorMatrix */
function buildTempTintFilter(temp: number, tint: number): string {
  const t = temp / 100;
  const ti = tint / 100;
  const r = 1 + t * 0.2;
  const g = 1 + ti * 0.15;
  const b = 1 - t * 0.2;
  return `<feColorMatrix type="matrix" values="${r.toFixed(4)} 0 0 0 0  0 ${g.toFixed(4)} 0 0 0  0 0 ${b.toFixed(4)} 0 0  0 0 0 1 0" result="tempTint"/>`;
}

/** Highlights / Shadows / Whites / Blacks -> feComponentTransfer with 17-point tone curve */
function buildToneCurveFilter(
  highlights: number,
  shadows: number,
  whites: number,
  blacks: number,
): string {
  const n = 17;
  const vals = Array.from({ length: n }, (_, i) => {
    const x = i / (n - 1);
    let y = x;
    // Highlights affect upper tones (0.5-1.0)
    if (x > 0.5) {
      const t = (x - 0.5) / 0.5;
      y += (highlights / 100) * 0.3 * t * t;
    }
    // Shadows affect lower tones (0-0.5)
    if (x < 0.5) {
      const t = (0.5 - x) / 0.5;
      y += (shadows / 100) * 0.3 * t * t;
    }
    // Whites shift overall highlight ceiling
    y += (whites / 100) * 0.2 * x * x;
    // Blacks shift shadow floor
    y += (blacks / 100) * 0.2 * (1 - x) * (1 - x) * (x < 0.3 ? 1 : 0);
    return Math.max(0, Math.min(1, y)).toFixed(4);
  }).join(' ');

  return `<feComponentTransfer in="tempTint" result="toneCurve">
    <feFuncR type="table" tableValues="${vals}"/>
    <feFuncG type="table" tableValues="${vals}"/>
    <feFuncB type="table" tableValues="${vals}"/>
  </feComponentTransfer>`;
}

/** Vibrance -> feColorMatrix (luminance-preserving partial saturation) */
function buildVibranceFilter(vibrance: number): string {
  if (Math.abs(vibrance) < 0.5) {
    return `<feColorMatrix in="toneCurve" result="vibrance" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/>`;
  }
  const v = vibrance / 100;
  const sat = 1 + v * 0.5;
  const rw = 0.213, gw = 0.715, bw = 0.072;
  const r = rw + (1 - rw) * sat;
  const g = gw + (1 - gw) * sat;
  const b = bw + (1 - bw) * sat;
  return `<feColorMatrix type="matrix" in="toneCurve" result="vibrance" values="${r.toFixed(4)} ${(-rw * (sat - 1)).toFixed(4)} ${(-rw * (sat - 1)).toFixed(4)} 0 0  ${(-gw * (sat - 1)).toFixed(4)} ${g.toFixed(4)} ${(-gw * (sat - 1)).toFixed(4)} 0 0  ${(-bw * (sat - 1)).toFixed(4)} ${(-bw * (sat - 1)).toFixed(4)} ${b.toFixed(4)} 0 0  0 0 0 1 0"/>`;
}

// ==================== Curves ====================

/** Convert normalised [0-1, 0-1] curve points to SVG tableValues via buildCurveLut */
function curveToTableValues(
  points: [number, number][],
  numSamples = 17,
): string {
  if (!points || points.length < 2) {
    return Array.from({ length: numSamples }, (_, i) =>
      (i / (numSamples - 1)).toFixed(4),
    ).join(' ');
  }
  // buildCurveLut expects {x,y} in 0-255 range
  const pts255 = points.map(([x, y]) => ({ x: x * 255, y: y * 255 }));
  const lut = buildCurveLut(pts255);
  const vals = Array.from({ length: numSamples }, (_, i) => {
    const idx = Math.round(i * (255 / (numSamples - 1)));
    return (lut[Math.min(idx, 255)] / 255).toFixed(4);
  });
  return vals.join(' ');
}

/** Curves (Master + R/G/B) -> feComponentTransfer tables */
function buildCurvesFilter(
  master: [number, number][] | null,
  red: [number, number][] | null,
  green: [number, number][] | null,
  blue: [number, number][] | null,
): string {
  const masterVals =
    master && master.length >= 2 ? curveToTableValues(master) : null;
  const redVals =
    red && red.length >= 2 ? curveToTableValues(red) : null;
  const greenVals =
    green && green.length >= 2 ? curveToTableValues(green) : null;
  const blueVals =
    blue && blue.length >= 2 ? curveToTableValues(blue) : null;

  const hasCustomCurve = masterVals || redVals || greenVals || blueVals;
  if (!hasCustomCurve) return '';

  const identity = Array.from({ length: 17 }, (_, i) =>
    (i / 16).toFixed(4),
  ).join(' ');

  let result = '';

  if (masterVals) {
    result += `<feComponentTransfer in="vibrance" result="masterCurve">
      <feFuncR type="table" tableValues="${masterVals}"/>
      <feFuncG type="table" tableValues="${masterVals}"/>
      <feFuncB type="table" tableValues="${masterVals}"/>
    </feComponentTransfer>`;
  }

  const rgbIn = masterVals ? 'masterCurve' : 'vibrance';
  if (redVals || greenVals || blueVals) {
    result += `<feComponentTransfer in="${rgbIn}" result="curves">
      <feFuncR type="table" tableValues="${redVals ?? identity}"/>
      <feFuncG type="table" tableValues="${greenVals ?? identity}"/>
      <feFuncB type="table" tableValues="${blueVals ?? identity}"/>
    </feComponentTransfer>`;
  } else if (masterVals) {
    // Rename masterCurve -> curves for consistent pipeline
    result += `<feColorMatrix in="masterCurve" result="curves" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/>`;
  }

  return result;
}

// ==================== Color Wheels ====================

/** Map wheel x,y offset to RGB shift */
function wheelToRGB(
  x: number,
  y: number,
  scale = 0.1,
): [number, number, number] {
  return [(x - y * 0.5) * scale, y * scale, (-x - y * 0.5) * scale];
}

/**
 * Color Wheels (Lift / Gamma / Gain) ->
 *   Lift:  feColorMatrix offset
 *   Gamma: feComponentTransfer gamma exponent
 *   Gain:  feColorMatrix scale
 */
function buildColorWheelsFilter(
  liftX: number, liftY: number, liftMag: number,
  gammaX: number, gammaY: number, gammaMag: number,
  gainX: number, gainY: number, gainMag: number,
  lastIn: string,
): string {
  const hasLift =
    Math.abs(liftX) > 0.001 || Math.abs(liftY) > 0.001 || Math.abs(liftMag) > 0.001;
  const hasGamma =
    Math.abs(gammaX) > 0.001 || Math.abs(gammaY) > 0.001 || Math.abs(gammaMag) > 0.001;
  const hasGain =
    Math.abs(gainX) > 0.001 || Math.abs(gainY) > 0.001 || Math.abs(gainMag) > 0.001;

  if (!hasLift && !hasGamma && !hasGain) return '';

  let result = '';
  let currentIn = lastIn;

  if (hasLift) {
    const [lr, lg, lb] = wheelToRGB(liftX, liftY, 0.1);
    const lv = liftMag * 0.001; // liftMag is -100..100 -> small offset
    result += `<feColorMatrix type="matrix" in="${currentIn}" result="lift" values="1 0 0 0 ${(lr + lv).toFixed(4)}  0 1 0 0 ${(lg + lv).toFixed(4)}  0 0 1 0 ${(lb + lv).toFixed(4)}  0 0 0 1 0"/>`;
    currentIn = 'lift';
  }

  if (hasGamma) {
    const [gr, gg, gb] = wheelToRGB(gammaX, gammaY, 0.5);
    const gv = gammaMag * 0.005; // gammaMag is -100..100 -> moderate
    const expR = Math.max(0.1, 1 / (1 + (gr + gv) * 0.5));
    const expG = Math.max(0.1, 1 / (1 + (gg + gv) * 0.5));
    const expB = Math.max(0.1, 1 / (1 + (gb + gv) * 0.5));
    result += `<feComponentTransfer in="${currentIn}" result="gamma">
      <feFuncR type="gamma" exponent="${expR.toFixed(4)}" amplitude="1" offset="0"/>
      <feFuncG type="gamma" exponent="${expG.toFixed(4)}" amplitude="1" offset="0"/>
      <feFuncB type="gamma" exponent="${expB.toFixed(4)}" amplitude="1" offset="0"/>
    </feComponentTransfer>`;
    currentIn = 'gamma';
  }

  if (hasGain) {
    const [gnr, gng, gnb] = wheelToRGB(gainX, gainY, 0.15);
    const gnv = gainMag * 0.0015; // gainMag is -100..100 -> moderate scale
    result += `<feColorMatrix type="matrix" in="${currentIn}" result="gain" values="${(1 + gnr + gnv).toFixed(4)} 0 0 0 0  0 ${(1 + gng + gnv).toFixed(4)} 0 0 0  0 0 ${(1 + gnb + gnv).toFixed(4)} 0 0  0 0 0 1 0"/>`;
    currentIn = 'gain';
  }

  // Rename the last result to 'colorWheels' for a consistent output name
  const lastResult: string = hasGain ? 'gain' : hasGamma ? 'gamma' : 'lift';
  result = result.replace(
    new RegExp(`result="${lastResult}"(?!.*result="${lastResult}")`),
    'result="colorWheels"',
  );

  return result;
}

// ==================== Public API ====================

/**
 * Build a complete SVG `<filter>` definition string for a clip's color correction.
 *
 * @param clipId - Unique clip identifier (used to generate a unique filter ID)
 * @param params - The `filterParams` record from a `color-correction` ClipEffect.
 *                 Param names mirror `LumetriColorPanel`'s `ColorCorrectionParams`.
 * @returns `{ filterId, filterDef }` or `null` when no advanced params are active.
 */
export function buildColorCorrectionSvgFilter(
  clipId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>,
  effectId?: string,
): { filterId: string; filterDef: string } | null {
  // Basic correction params (handled by SVG)
  const temp = params.temperature ?? 0;
  const tint = params.tint ?? 0;
  const highlights = params.highlights ?? 0;
  const shadows = params.shadows ?? 0;
  const whites = params.whites ?? 0;
  const blacks = params.blacks ?? 0;
  const vibrance = params.vibrance ?? 0;

  // Curves (normalised [0-1, 0-1] point arrays from LumetriColorPanel)
  const curveMaster: [number, number][] | null = params.curveMaster ?? null;
  const curveRed: [number, number][] | null = params.curveRed ?? null;
  const curveGreen: [number, number][] | null = params.curveGreen ?? null;
  const curveBlue: [number, number][] | null = params.curveBlue ?? null;

  // Color wheels ([x,y] with x,y in -1..1)
  const shadowsWheel: [number, number] = params.shadowsWheel ?? [0, 0];
  const midtonesWheel: [number, number] = params.midtonesWheel ?? [0, 0];
  const highlightsWheel: [number, number] = params.highlightsWheel ?? [0, 0];
  const shadowsLift: number = params.shadowsLift ?? 0;
  const midtonesGamma: number = params.midtonesGamma ?? 0;
  const highlightsGain: number = params.highlightsGain ?? 0;

  // Check if any advanced (non-CSS-filter) param is active
  const isIdentityCurve = (pts: [number, number][] | null) =>
    !pts ||
    pts.length < 2 ||
    (pts.length === 2 &&
      Math.abs(pts[0][0]) < 0.001 && Math.abs(pts[0][1]) < 0.001 &&
      Math.abs(pts[1][0] - 1) < 0.001 && Math.abs(pts[1][1] - 1) < 0.001);

  const hasAdvanced =
    Math.abs(temp) > 0.5 ||
    Math.abs(tint) > 0.5 ||
    Math.abs(highlights) > 0.5 ||
    Math.abs(shadows) > 0.5 ||
    Math.abs(whites) > 0.5 ||
    Math.abs(blacks) > 0.5 ||
    Math.abs(vibrance) > 0.5 ||
    !isIdentityCurve(curveMaster) ||
    !isIdentityCurve(curveRed) ||
    !isIdentityCurve(curveGreen) ||
    !isIdentityCurve(curveBlue) ||
    Math.abs(shadowsWheel[0]) > 0.001 || Math.abs(shadowsWheel[1]) > 0.001 ||
    Math.abs(midtonesWheel[0]) > 0.001 || Math.abs(midtonesWheel[1]) > 0.001 ||
    Math.abs(highlightsWheel[0]) > 0.001 || Math.abs(highlightsWheel[1]) > 0.001 ||
    Math.abs(shadowsLift) > 0.5 ||
    Math.abs(midtonesGamma) > 0.5 ||
    Math.abs(highlightsGain) > 0.5;

  if (!hasAdvanced) return null;

  const filterId = makeFilterId(clipId, effectId);

  // Build the filter pipeline: tempTint -> toneCurve -> vibrance -> curves -> colorWheels
  const tempTintPrimitive = buildTempTintFilter(temp, tint);
  const tonePrimitive = buildToneCurveFilter(highlights, shadows, whites, blacks);
  const vibrancePrimitive = buildVibranceFilter(vibrance);

  const curvesPrimitives = buildCurvesFilter(
    isIdentityCurve(curveMaster) ? null : curveMaster,
    isIdentityCurve(curveRed) ? null : curveRed,
    isIdentityCurve(curveGreen) ? null : curveGreen,
    isIdentityCurve(curveBlue) ? null : curveBlue,
  );

  // Determine the last result name for color wheels input
  let lastCurvesResult = 'vibrance';
  if (curvesPrimitives.includes('result="curves"')) lastCurvesResult = 'curves';
  else if (curvesPrimitives.includes('result="masterCurve"'))
    lastCurvesResult = 'masterCurve';

  const wheelsPrimitives = buildColorWheelsFilter(
    shadowsWheel[0], shadowsWheel[1], shadowsLift,
    midtonesWheel[0], midtonesWheel[1], midtonesGamma,
    highlightsWheel[0], highlightsWheel[1], highlightsGain,
    lastCurvesResult,
  );

  const filterDef = `<filter id="${filterId}" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
  ${tempTintPrimitive}
  ${tonePrimitive}
  ${vibrancePrimitive}
  ${curvesPrimitives}
  ${wheelsPrimitives}
</filter>`;

  return { filterId, filterDef };
}

/**
 * Build the CSS filter string for basic color correction params.
 * Handles: exposure, contrast, saturation, sharpness.
 */
export function buildColorCorrectionCssFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>,
): string {
  const parts: string[] = [];

  const exposure = params.exposure ?? 0;
  const contrast = params.contrast ?? 0;
  const saturation = params.saturation ?? 0;
  const sharpness = params.sharpness ?? 0;

  if (Math.abs(exposure) > 0.01) {
    parts.push(`brightness(${(1 + exposure / 100).toFixed(3)})`);
  }
  if (Math.abs(contrast) > 0.01) {
    parts.push(`contrast(${(1 + contrast / 100).toFixed(3)})`);
  }
  if (Math.abs(saturation) > 0.01) {
    parts.push(`saturate(${(1 + saturation / 100).toFixed(3)})`);
  }
  if (Math.abs(sharpness) > 0.01 && sharpness > 0) {
    parts.push(`contrast(${(1 + sharpness / 200).toFixed(3)})`);
  }

  return parts.join(' ');
}
