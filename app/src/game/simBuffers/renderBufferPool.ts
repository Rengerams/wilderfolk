import { renderBufferByteLength } from './schema';

/** Buffers in flight between worker and main — enables pipelined ticks. */
/** One slot is typically held on main for the active display buffer. */
export const RENDER_BUFFER_POOL_SIZE = 5;

export type AcquiredRenderBuffer = {
  index: number;
  buffer: ArrayBuffer;
};

/** Fixed-size transferable buffer pool shared by worker tick + command render refresh. */
export class RenderBufferPool {
  readonly size: number;
  private readonly expectedByteLength: number;
  private readonly slots: ArrayBuffer[];
  private readonly outbound: boolean[];

  constructor(size = RENDER_BUFFER_POOL_SIZE) {
    this.size = size;
    this.expectedByteLength = renderBufferByteLength();
    this.slots = Array.from({ length: size }, () => new ArrayBuffer(this.expectedByteLength));
    this.outbound = new Array(size).fill(false) as boolean[];
  }

  availableCount(): number {
    let n = 0;
    for (let i = 0; i < this.size; i++) if (!this.outbound[i]) n++;
    return n;
  }

  /** Grab next free buffer for packing; returns null when pool is exhausted. */
  acquire(): AcquiredRenderBuffer | null {
    for (let i = 0; i < this.size; i++) {
      if (!this.outbound[i]) {
        this.outbound[i] = true;
        return { index: i, buffer: this.slots[i] };
      }
    }
    return null;
  }

  /** Restore a transferred buffer after main thread finishes reading. */
  release(index: number, buffer: ArrayBuffer): void {
    if (index < 0 || index >= this.size) return;
    if (!this.outbound[index]) return;
    if (this.slots[index] !== buffer && buffer.byteLength < this.expectedByteLength) return;
    if (buffer.byteLength < this.expectedByteLength) {
      this.slots[index] = new ArrayBuffer(this.expectedByteLength);
    } else {
      this.slots[index] = buffer;
    }
    this.outbound[index] = false;
  }
}