/**
 * Minimal OffscreenCanvas + 2d context for Vitest (Node has no DOM canvas).
 * Supports the draw/clear/resize paths used by terrainLayer and entityLayer.
 */
class TestCanvas2DContext {
  fillStyle = '#000000';
  strokeStyle = '#000000';
  lineWidth = 1;
  lineCap: CanvasLineCap = 'butt';
  lineJoin: CanvasLineJoin = 'miter';
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = 'source-over';

  setTransform(_a: number, _b: number, _c: number, _d: number, _e: number, _f: number): void {}
  clearRect(_x: number, _y: number, _w: number, _h: number): void {}
  fillRect(_x: number, _y: number, _w: number, _h: number): void {}
  strokeRect(_x: number, _y: number, _w: number, _h: number): void {}
  beginPath(): void {}
  moveTo(_x: number, _y: number): void {}
  lineTo(_x: number, _y: number): void {}
  stroke(): void {}
  drawImage(
    _image: CanvasImageSource,
    _dx: number,
    _dy: number,
    _dw?: number,
    _dh?: number,
  ): void {}
  save(): void {}
  restore(): void {}
}

class TestOffscreenCanvas {
  width: number;
  height: number;
  private ctx = new TestCanvas2DContext();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext(type: string): TestCanvas2DContext | null {
    return type === '2d' ? this.ctx : null;
  }
}

if (typeof globalThis.OffscreenCanvas === 'undefined') {
  (globalThis as typeof globalThis & { OffscreenCanvas: typeof OffscreenCanvas }).OffscreenCanvas =
    TestOffscreenCanvas as unknown as typeof OffscreenCanvas;
}