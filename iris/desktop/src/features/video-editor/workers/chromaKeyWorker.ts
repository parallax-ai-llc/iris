/**
 * ChromaKey Web Worker - Offloads per-pixel chroma-key processing from main thread
 *
 * Receives raw ImageData buffer via Transferable (zero-copy),
 * processes chroma-key removal, and returns the buffer back.
 */

interface ChromaKeyMessage {
  type: 'process';
  buffer: ArrayBuffer;
  width: number;
  height: number;
  keyColor: [number, number, number];
  threshold: number;
  smoothBand: number;
  spillFactor: number;
}

interface ChromaKeyResult {
  type: 'result';
  buffer: ArrayBuffer;
}

function colorDistance(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number,
): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

self.onmessage = (e: MessageEvent<ChromaKeyMessage>) => {
  if (e.data.type !== 'process') return;

  const { buffer, keyColor, threshold, smoothBand, spillFactor } = e.data;
  const data = new Uint8ClampedArray(buffer);

  const [kr, kg, kb] = keyColor;
  const greenDom = kg >= kr && kg >= kb;
  const blueDom = !greenDom && kb >= kr;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const dist = colorDistance(r, g, b, kr, kg, kb);

    if (dist < threshold) {
      data[i + 3] = 0;
    } else if (smoothBand > 0 && dist < threshold + smoothBand) {
      const edgeProgress = (dist - threshold) / smoothBand;
      data[i + 3] = Math.round(edgeProgress * 255);

      if (spillFactor > 0) {
        const spillAmount = (1 - edgeProgress) * spillFactor;
        if (greenDom) {
          const target = Math.max(r, b);
          data[i + 1] = Math.round(g - (g - target) * spillAmount);
        } else if (blueDom) {
          const target = Math.max(r, g);
          data[i + 2] = Math.round(b - (b - target) * spillAmount);
        }
      }
    }
  }

  const resultBuffer = data.buffer as ArrayBuffer;
  (self as unknown as Worker).postMessage(
    { type: 'result', buffer: resultBuffer } satisfies ChromaKeyResult,
    [resultBuffer],
  );
};
