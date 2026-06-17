import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock ImageData if not available in jsdom
if (typeof globalThis.ImageData === 'undefined') {
  class MockImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace: PredefinedColorSpace = 'srgb';

    constructor(sw: number, sh: number);
    constructor(data: Uint8ClampedArray, sw: number, sh?: number);
    constructor(dataOrWidth: Uint8ClampedArray | number, swOrHeight: number, sh?: number) {
      if (typeof dataOrWidth === 'number') {
        this.width = dataOrWidth;
        this.height = swOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = dataOrWidth;
        this.width = swOrHeight;
        this.height = sh ?? (dataOrWidth.length / 4 / swOrHeight);
      }
    }
  }
  // @ts-expect-error - Mock ImageData
  globalThis.ImageData = MockImageData;
}

// Mock Canvas 2D Context
class MockCanvasRenderingContext2D {
  canvas: HTMLCanvasElement;
  fillStyle: string = '#000000';
  strokeStyle: string = '#000000';
  lineWidth: number = 1;
  lineCap: CanvasLineCap = 'butt';
  lineJoin: CanvasLineJoin = 'miter';
  font: string = '10px sans-serif';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  globalAlpha: number = 1;
  globalCompositeOperation: GlobalCompositeOperation = 'source-over';
  imageSmoothingEnabled: boolean = true;
  shadowBlur: number = 0;
  shadowColor: string = 'rgba(0, 0, 0, 0)';
  shadowOffsetX: number = 0;
  shadowOffsetY: number = 0;

  private _transformMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  /** @internal */ _pixelBuffer: Uint8ClampedArray | null = null;
  private _hasExplicitPixelData = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  // Transform methods
  translate(_x: number, _y: number): void {}
  rotate(_angle: number): void {}
  scale(_x: number, _y: number): void {}
  transform(_a: number, _b: number, _c: number, _d: number, _e: number, _f: number): void {}
  setTransform(_a: number, _b: number, _c: number, _d: number, _e: number, _f: number): void {
    this._transformMatrix = { a: _a, b: _b, c: _c, d: _d, e: _e, f: _f };
  }
  getTransform(): DOMMatrix {
    return new DOMMatrix([
      this._transformMatrix.a,
      this._transformMatrix.b,
      this._transformMatrix.c,
      this._transformMatrix.d,
      this._transformMatrix.e,
      this._transformMatrix.f,
    ]);
  }
  resetTransform(): void {
    this._transformMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }

  // Drawing methods
  save(): void {}
  restore(): void {}
  beginPath(): void {}
  closePath(): void {}
  moveTo(_x: number, _y: number): void {}
  lineTo(_x: number, _y: number): void {}
  arc(_x: number, _y: number, _r: number, _start: number, _end: number, _ccw?: boolean): void {}
  arcTo(_x1: number, _y1: number, _x2: number, _y2: number, _r: number): void {}
  rect(_x: number, _y: number, _w: number, _h: number): void {}
  ellipse(_x: number, _y: number, _rx: number, _ry: number, _rot: number, _start: number, _end: number, _ccw?: boolean): void {}
  bezierCurveTo(_cp1x: number, _cp1y: number, _cp2x: number, _cp2y: number, _x: number, _y: number): void {}
  quadraticCurveTo(_cpx: number, _cpy: number, _x: number, _y: number): void {}

  fill(_fillRule?: CanvasFillRule): void {}
  stroke(): void {}
  clip(_fillRule?: CanvasFillRule): void {}

  fillRect(_x: number, _y: number, _w: number, _h: number): void {}
  strokeRect(_x: number, _y: number, _w: number, _h: number): void {}
  clearRect(_x: number, _y: number, _w: number, _h: number): void {}

  fillText(_text: string, _x: number, _y: number, _maxWidth?: number): void {}
  strokeText(_text: string, _x: number, _y: number, _maxWidth?: number): void {}
  measureText(text: string): TextMetrics {
    return {
      width: text.length * 10,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: text.length * 10,
      fontBoundingBoxAscent: 10,
      fontBoundingBoxDescent: 2,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
      emHeightAscent: 10,
      emHeightDescent: 2,
      hangingBaseline: 8,
      alphabeticBaseline: 0,
      ideographicBaseline: -2,
    };
  }

  drawImage(
    image: CanvasImageSource,
    dx: number,
    dy: number,
    _dw?: number,
    _dh?: number,
    _sx?: number,
    _sy?: number,
    _sw?: number,
    _sh?: number
  ): void {
    // Support copying pixels from another canvas
    if (image instanceof HTMLCanvasElement) {
      const srcCtx = image.getContext('2d') as unknown as MockCanvasRenderingContext2D | null;
      if (srcCtx && srcCtx._hasExplicitPixelData && srcCtx._pixelBuffer) {
        this._hasExplicitPixelData = true;
        const buf = this._ensureBuffer();
        const srcW = image.width;
        const dstW = this.canvas.width;
        const copyW = Math.min(srcW, dstW - dx);
        const copyH = Math.min(image.height, this.canvas.height - dy);
        for (let row = 0; row < copyH; row++) {
          for (let col = 0; col < copyW; col++) {
            const srcIdx = (row * srcW + col) * 4;
            const dstIdx = ((dy + row) * dstW + (dx + col)) * 4;
            buf[dstIdx] = srcCtx._pixelBuffer[srcIdx];
            buf[dstIdx + 1] = srcCtx._pixelBuffer[srcIdx + 1];
            buf[dstIdx + 2] = srcCtx._pixelBuffer[srcIdx + 2];
            buf[dstIdx + 3] = srcCtx._pixelBuffer[srcIdx + 3];
          }
        }
      }
    }
  }

  createImageData(width: number, height: number): ImageData;
  createImageData(imagedata: ImageData): ImageData;
  createImageData(widthOrImageData: number | ImageData, height?: number): ImageData {
    if (typeof widthOrImageData === 'number') {
      return new ImageData(widthOrImageData, height!);
    }
    return new ImageData(widthOrImageData.width, widthOrImageData.height);
  }

  private _ensureBuffer(): Uint8ClampedArray {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const needed = w * h * 4;
    if (!this._pixelBuffer || this._pixelBuffer.length !== needed) {
      this._pixelBuffer = new Uint8ClampedArray(needed);
    }
    return this._pixelBuffer;
  }

  getImageData(_sx: number, _sy: number, sw: number, sh: number): ImageData {
    // If putImageData was called, return actual pixel data; otherwise return
    // the legacy default gray pixels for backward compatibility with tests that
    // rely on canvas drawing ops (fill, stroke) which are no-ops in this mock.
    if (this._hasExplicitPixelData) {
      const buf = this._ensureBuffer();
      const canvasW = this.canvas.width;
      const data = new Uint8ClampedArray(sw * sh * 4);
      for (let row = 0; row < sh; row++) {
        const srcY = _sy + row;
        if (srcY < 0 || srcY >= this.canvas.height) continue;
        for (let col = 0; col < sw; col++) {
          const srcX = _sx + col;
          if (srcX < 0 || srcX >= canvasW) continue;
          const srcIdx = (srcY * canvasW + srcX) * 4;
          const dstIdx = (row * sw + col) * 4;
          data[dstIdx] = buf[srcIdx];
          data[dstIdx + 1] = buf[srcIdx + 1];
          data[dstIdx + 2] = buf[srcIdx + 2];
          data[dstIdx + 3] = buf[srcIdx + 3];
        }
      }
      return new ImageData(data, sw, sh);
    }

    // Legacy fallback: return gray pixels
    const data = new Uint8ClampedArray(sw * sh * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 128;     // R
      data[i + 1] = 128; // G
      data[i + 2] = 128; // B
      data[i + 3] = 255; // A
    }
    return new ImageData(data, sw, sh);
  }

  putImageData(imageData: ImageData, dx: number, dy: number): void {
    this._hasExplicitPixelData = true;
    const buf = this._ensureBuffer();
    const canvasW = this.canvas.width;
    for (let row = 0; row < imageData.height; row++) {
      const dstY = dy + row;
      if (dstY < 0 || dstY >= this.canvas.height) continue;
      for (let col = 0; col < imageData.width; col++) {
        const dstX = dx + col;
        if (dstX < 0 || dstX >= canvasW) continue;
        const srcIdx = (row * imageData.width + col) * 4;
        const dstIdx = (dstY * canvasW + dstX) * 4;
        buf[dstIdx] = imageData.data[srcIdx];
        buf[dstIdx + 1] = imageData.data[srcIdx + 1];
        buf[dstIdx + 2] = imageData.data[srcIdx + 2];
        buf[dstIdx + 3] = imageData.data[srcIdx + 3];
      }
    }
  }

  createLinearGradient(_x0: number, _y0: number, _x1: number, _y1: number): CanvasGradient {
    return {
      addColorStop: () => {},
    } as CanvasGradient;
  }

  createRadialGradient(_x0: number, _y0: number, _r0: number, _x1: number, _y1: number, _r1: number): CanvasGradient {
    return {
      addColorStop: () => {},
    } as CanvasGradient;
  }

  createPattern(_image: CanvasImageSource, _repetition: string | null): CanvasPattern | null {
    return {} as CanvasPattern;
  }

  isPointInPath(_x: number, _y: number): boolean {
    return false;
  }

  isPointInStroke(_x: number, _y: number): boolean {
    return false;
  }

  setLineDash(_segments: number[]): void {}
  getLineDash(): number[] {
    return [];
  }
}

// Mock HTMLCanvasElement
const originalCreateElement = document.createElement.bind(document);
document.createElement = function (tagName: string, options?: ElementCreationOptions) {
  if (tagName.toLowerCase() === 'canvas') {
    const canvas = originalCreateElement(tagName, options) as HTMLCanvasElement;

    let _width = 300;
    let _height = 150;

    Object.defineProperty(canvas, 'width', {
      get: () => _width,
      set: (value: number) => { _width = value; },
      configurable: true,
    });

    Object.defineProperty(canvas, 'height', {
      get: () => _height,
      set: (value: number) => { _height = value; },
      configurable: true,
    });

    let _cachedCtx: MockCanvasRenderingContext2D | null = null;
    canvas.getContext = function (contextId: string) {
      if (contextId === '2d') {
        if (!_cachedCtx) {
          _cachedCtx = new MockCanvasRenderingContext2D(canvas);
        }
        return _cachedCtx as unknown as CanvasRenderingContext2D;
      }
      return null;
    } as typeof canvas.getContext;

    canvas.toDataURL = function (_type?: string, _quality?: number): string {
      return 'data:image/png;base64,mockImageData';
    };

    canvas.toBlob = function (callback: BlobCallback, _type?: string, _quality?: number): void {
      const blob = new Blob(['mock'], { type: _type || 'image/png' });
      callback(blob);
    };

    return canvas;
  }
  return originalCreateElement(tagName, options);
} as typeof document.createElement;

// Mock Image
class MockImage {
  src: string = '';
  width: number = 100;
  height: number = 100;
  onload: (() => void) | null = null;
  onerror: ((error: Error) => void) | null = null;
  crossOrigin: string | null = null;

  constructor() {
    // Simulate async image load
    setTimeout(() => {
      if (this.onload) {
        this.onload();
      }
    }, 0);
  }
}

// @ts-expect-error - Mock Image
globalThis.Image = MockImage;

// Mock URL.createObjectURL and revokeObjectURL
URL.createObjectURL = vi.fn(() => 'blob:mock-url');
URL.revokeObjectURL = vi.fn();

// Mock ResizeObserver
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
