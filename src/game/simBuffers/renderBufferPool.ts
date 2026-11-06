import { renderBufferByteLength } from './schema';

/** Buffers in flight between worker and main — enables pipelined ticks. */
/** One slot is typically held on main for the active display buffer. */
export const RENDER_BUFFER_POOL_SIZE = 5;

export type AcquiredRenderBuffer = {
  index: number;
  buffer: ArrayBuffer;
  /** Unique per acquisition; a return must present the lease it was handed. */
  lease: number;
};

/** Fixed-size transferable buffer pool shared by worker tick + command render refresh. */
export class RenderBufferPool {
  readonly size: number;
  private readonly expectedByteLength: number;
  private readonly slots: ArrayBuffer[];
  private readonly outbound: boolean[];
  private readonly leases: number[];
  private nextLease = 1;

  constructor(size = RENDER_BUFFER_POOL_SIZE) {
    this.size = size;
    this.expectedByteLength = renderBufferByteLength();
    this.slots = Array.from({ length: size }, () => new ArrayBuffer(this.expectedByteLength));
    this.outbound = new Array(size).fill(false) as boolean[];
    this.leases = new Array(size).fill(0) as number[];
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
        const lease = this.nextLease++;
        this.outbound[i] = true;
        this.leases[i] = lease;
        return { index: i, buffer: this.slots[i], lease };
      }
    }
    return null;
  }

  /** Restore a transferred buffer after main thread finishes reading. */
  release(index: number, lease: number, buffer: ArrayBuffer | null | undefined): void {
    if (index < 0 || index >= this.size) return;
    if (!this.outbound[index]) return;
    // A delayed or duplicated return from an earlier acquisition must not free a newer lease.
    if (this.leases[index] !== lease) return;

    // Recreate any returned buffer whose length differs from the pool's fixed schema.
    if (!buffer || buffer.byteLength !== this.expectedByteLength) {
      this.slots[index] = new ArrayBuffer(this.expectedByteLength);
    } else {
      this.slots[index] = buffer;
    }

    this.leases[index] = 0;
    this.outbound[index] = false;
  }
}