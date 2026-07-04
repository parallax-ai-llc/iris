/**
 * Face-aware liquify helpers
 *
 * Part of the image-editor adjustments library (see ./index.ts barrel),
 * extracted from the former monolithic adjustments.ts.
 */

export interface FaceRegion {
  leftEye: { x: number; y: number; width: number; height: number };
  rightEye: { x: number; y: number; width: number; height: number };
  nose: { x: number; y: number; width: number; height: number };
  mouth: { x: number; y: number; width: number; height: number };
  jawline: { x: number; y: number; width: number; height: number };
  forehead: { x: number; y: number; width: number; height: number };
}

export interface FaceAwareLiquifyParams {
  eyeSize?: number;        // -100 to 100
  eyeHeight?: number;      // -100 to 100
  eyeWidth?: number;       // -100 to 100
  eyeDistance?: number;     // -100 to 100
  noseHeight?: number;     // -100 to 100
  noseWidth?: number;      // -100 to 100
  mouthSmile?: number;     // -100 to 100
  mouthWidth?: number;     // -100 to 100
  mouthHeight?: number;    // -100 to 100
  jawWidth?: number;       // -100 to 100
  foreheadHeight?: number; // -100 to 100
}

/**
 * Generate displacement vectors for face-aware liquify.
 * Given face region landmarks and adjustment parameters, produces
 * dx/dy displacement arrays for warping.
 */
export function faceAwareLiquifyDisplacements(
  width: number,
  height: number,
  face: FaceRegion,
  params: FaceAwareLiquifyParams
): { dx: Float32Array; dy: Float32Array } {
  const dx = new Float32Array(width * height);
  const dy = new Float32Array(width * height);

  const applyRegionScale = (
    region: { x: number; y: number; width: number; height: number },
    scaleX: number,
    scaleY: number
  ) => {
    const cx = region.x + region.width / 2;
    const cy = region.y + region.height / 2;
    const rx = region.width / 2 * 1.5; // extend slightly beyond region
    const ry = region.height / 2 * 1.5;

    for (let py = Math.max(0, Math.floor(cy - ry)); py < Math.min(height, Math.ceil(cy + ry)); py++) {
      for (let px = Math.max(0, Math.floor(cx - rx)); px < Math.min(width, Math.ceil(cx + rx)); px++) {
        const nx = (px - cx) / rx;
        const ny = (py - cy) / ry;
        const d2 = nx * nx + ny * ny;
        if (d2 >= 1) continue;
        const falloff = (1 - d2) * (1 - d2); // smooth falloff
        const idx = py * width + px;
        dx[idx] += (px - cx) * scaleX * falloff;
        dy[idx] += (py - cy) * scaleY * falloff;
      }
    }
  };

  // Apply eye adjustments
  const eyeScale = (params.eyeSize ?? 0) / 200;
  if (eyeScale !== 0) {
    applyRegionScale(face.leftEye, eyeScale, eyeScale);
    applyRegionScale(face.rightEye, eyeScale, eyeScale);
  }

  // Nose width
  const noseWScale = (params.noseWidth ?? 0) / 200;
  if (noseWScale !== 0) {
    applyRegionScale(face.nose, noseWScale, 0);
  }

  // Mouth width
  const mouthWScale = (params.mouthWidth ?? 0) / 200;
  if (mouthWScale !== 0) {
    applyRegionScale(face.mouth, mouthWScale, 0);
  }

  // Jaw width
  const jawScale = (params.jawWidth ?? 0) / 200;
  if (jawScale !== 0) {
    applyRegionScale(face.jawline, jawScale, 0);
  }

  return { dx, dy };
}
