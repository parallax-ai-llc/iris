/**
 * Text Overlay Node
 * Adds a custom workflow node that overlays text on images.
 */

function drawText(
  data: Uint8Array,
  width: number,
  height: number,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  color: { r: number; g: number; b: number; a: number }
): Uint8Array {
  const result = new Uint8Array(data);

  // Simple bitmap text rendering (5x7 pixel font for ASCII)
  const CHAR_W = 5;
  const CHAR_H = 7;
  const scale = Math.max(1, Math.round(fontSize / 7));

  // Minimal 5x7 bitmap font for printable ASCII (space to ~)
  const FONT: Record<string, number[]> = {
    ' ': [0, 0, 0, 0, 0, 0, 0],
    A: [0x04, 0x0a, 0x11, 0x1f, 0x11, 0x11, 0x11],
    B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
    C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
    D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
    E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
    F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
    G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0e],
    H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
    I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
    J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
    K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
    L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
    M: [0x11, 0x1b, 0x15, 0x11, 0x11, 0x11, 0x11],
    N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
    O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
    P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
    Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
    R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
    S: [0x0e, 0x11, 0x10, 0x0e, 0x01, 0x11, 0x0e],
    T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
    U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
    V: [0x11, 0x11, 0x11, 0x11, 0x0a, 0x0a, 0x04],
    W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
    X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
    Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
    Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
    '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
    '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
    '2': [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
    '3': [0x0e, 0x11, 0x01, 0x06, 0x01, 0x11, 0x0e],
    '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
    '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
    '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
    '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
    '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
    '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  };

  let cursorX = x;
  for (const char of text.toUpperCase()) {
    const bitmap = FONT[char];
    if (!bitmap) {
      cursorX += (CHAR_W + 1) * scale;
      continue;
    }

    for (let row = 0; row < CHAR_H; row++) {
      for (let col = 0; col < CHAR_W; col++) {
        if (bitmap[row] & (1 << (CHAR_W - 1 - col))) {
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = cursorX + col * scale + sx;
              const py = y + row * scale + sy;

              if (px >= 0 && px < width && py >= 0 && py < height) {
                const idx = (py * width + px) * 4;
                const alpha = color.a / 255;
                result[idx] = Math.round(result[idx] * (1 - alpha) + color.r * alpha);
                result[idx + 1] = Math.round(result[idx + 1] * (1 - alpha) + color.g * alpha);
                result[idx + 2] = Math.round(result[idx + 2] * (1 - alpha) + color.b * alpha);
              }
            }
          }
        }
      }
    }

    cursorX += (CHAR_W + 1) * scale;
  }

  return result;
}

export function activate(context: IrisExtensionContext) {
  // Register workflow node
  context.subscriptions.push(
    iris.workflow.registerNode(
      {
        id: 'iris-official.text-overlay.node',
        name: 'Text Overlay',
        category: 'transform',
        inputs: [{ id: 'image', type: 'image' }],
        outputs: [{ id: 'result', type: 'image' }],
      },
      async (inputs, config) => {
        const image = inputs.image as { width: number; height: number; data: Uint8Array };
        if (!image) {
          throw new Error('No input image');
        }

        const text = (config?.text as string) || 'HELLO';
        const x = (config?.x as number) || 20;
        const y = (config?.y as number) || 20;
        const fontSize = (config?.fontSize as number) || 28;
        const colorR = (config?.colorR as number) ?? 255;
        const colorG = (config?.colorG as number) ?? 255;
        const colorB = (config?.colorB as number) ?? 255;
        const opacity = (config?.opacity as number) ?? 200;

        const result = drawText(
          image.data,
          image.width,
          image.height,
          text,
          x,
          y,
          fontSize,
          { r: colorR, g: colorG, b: colorB, a: opacity }
        );

        return {
          result: { width: image.width, height: image.height, data: result },
        };
      }
    )
  );

  iris.log.info('Text Overlay Node activated');
}

export function deactivate() {}
