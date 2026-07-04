/**
 * Liquify tool filter
 *
 * Part of the image-editor filter library. See ./index.ts (barrel) and
 * ./registry.ts (Filter Gallery registry). Extracted from the former
 * monolithic filters.ts.
 */


/**
 * Liquify — mesh-based warp deformation
 * Uses forward warp at brush position with configurable tools.
 */
export function liquify(
  imageData: ImageData,
  deformations: LiquifyDeformation[]
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  // Build displacement map from all deformations
  const dispX = new Float32Array(width * height);
  const dispY = new Float32Array(width * height);

  for (const def of deformations) {
    const { cx, cy, radius, dx, dy, pressure, tool } = def;
    const r2 = radius * radius;

    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(height - 1, Math.ceil(cy + radius));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const distX = x - cx;
        const distY = y - cy;
        const dist2 = distX * distX + distY * distY;
        if (dist2 >= r2) continue;

        // Gaussian falloff
        const falloff = Math.exp(-dist2 / (2 * (radius * 0.5) * (radius * 0.5))) * pressure;
        const idx = y * width + x;

        switch (tool) {
          case 'push':
            dispX[idx] += dx * falloff;
            dispY[idx] += dy * falloff;
            break;
          case 'twirl-cw':
            dispX[idx] += -distY * falloff * 0.05;
            dispY[idx] += distX * falloff * 0.05;
            break;
          case 'twirl-ccw':
            dispX[idx] += distY * falloff * 0.05;
            dispY[idx] += -distX * falloff * 0.05;
            break;
          case 'pucker':
            dispX[idx] += -distX * falloff * 0.1;
            dispY[idx] += -distY * falloff * 0.1;
            break;
          case 'bloat':
            dispX[idx] += distX * falloff * 0.1;
            dispY[idx] += distY * falloff * 0.1;
            break;
          case 'reconstruct':
            dispX[idx] *= (1 - falloff);
            dispY[idx] *= (1 - falloff);
            break;
          case 'freeze':
            // Freeze prevents further modifications — handled externally
            break;
          case 'smooth': {
            // Average neighboring displacements to smooth the warp
            let avgDx = 0, avgDy = 0, cnt = 0;
            for (let sy = -1; sy <= 1; sy++) {
              for (let sx = -1; sx <= 1; sx++) {
                const nx = x + sx, ny = y + sy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                  const ni = ny * width + nx;
                  avgDx += dispX[ni]; avgDy += dispY[ni]; cnt++;
                }
              }
            }
            if (cnt > 0) {
              dispX[idx] += (avgDx / cnt - dispX[idx]) * falloff;
              dispY[idx] += (avgDy / cnt - dispY[idx]) * falloff;
            }
            break;
          }
          case 'push-left': {
            // Pushes pixels perpendicular (left) to brush stroke direction
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            dispX[idx] += (dy / len) * falloff * radius * 0.1;
            dispY[idx] += (-dx / len) * falloff * radius * 0.1;
            break;
          }
          case 'thaw':
            // Thaw removes freeze — resets freeze state (handled externally, but also reconstruct-like)
            dispX[idx] *= (1 - falloff);
            dispY[idx] *= (1 - falloff);
            break;
        }
      }
    }
  }

  // Apply displacement map with bilinear interpolation
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const srcX = x - dispX[idx];
      const srcY = y - dispY[idx];

      // Bilinear interpolation
      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = Math.min(x0 + 1, width - 1);
      const y1 = Math.min(y0 + 1, height - 1);
      const fx = srcX - x0;
      const fy = srcY - y0;

      const sx0 = Math.max(0, Math.min(x0, width - 1));
      const sy0 = Math.max(0, Math.min(y0, height - 1));
      const sx1 = Math.max(0, Math.min(x1, width - 1));
      const sy1 = Math.max(0, Math.min(y1, height - 1));

      const i00 = (sy0 * width + sx0) * 4;
      const i10 = (sy0 * width + sx1) * 4;
      const i01 = (sy1 * width + sx0) * 4;
      const i11 = (sy1 * width + sx1) * 4;

      const outIdx = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        resultData[outIdx + c] = Math.round(
          data[i00 + c] * (1 - fx) * (1 - fy) +
          data[i10 + c] * fx * (1 - fy) +
          data[i01 + c] * (1 - fx) * fy +
          data[i11 + c] * fx * fy
        );
      }
    }
  }

  return result;
}

export interface LiquifyDeformation {
  cx: number;         // center X
  cy: number;         // center Y
  radius: number;     // brush radius
  dx: number;         // displacement X (for push tool)
  dy: number;         // displacement Y (for push tool)
  pressure: number;   // 0-1 brush pressure
  tool: LiquifyTool;
}

export type LiquifyTool = 'push' | 'twirl-cw' | 'twirl-ccw' | 'pucker' | 'bloat' | 'reconstruct' | 'freeze' | 'smooth' | 'push-left' | 'thaw';
