import { describe, expect, it } from 'vitest';
import { RenderBufferPool } from '../src/game/simBuffers/renderBufferPool';
import { renderBufferByteLength } from '../src/game/simBuffers/schema';

describe('fixed-size render buffer lifecycle', () => {
  it('replaces undersized, oversized and detached buffers', () => {
    const pool = new RenderBufferPool(2);
    const expected = renderBufferByteLength();
    const short = pool.acquire();
    const long = pool.acquire();
    expect(short).not.toBeNull();
    expect(long).not.toBeNull();
    if (!short || !long) throw new Error('render pool did not fill');
    expect(pool.acquire()).toBeNull();

    pool.release(short.index, short.lease, new ArrayBuffer(expected - 1));
    pool.release(long.index, long.lease, new ArrayBuffer(expected + 1));
    expect(pool.availableCount()).toBe(2);
    const restored = pool.acquire();
    const restoredSecond = pool.acquire();
    expect(restored?.buffer.byteLength).toBe(expected);
    expect(restoredSecond?.buffer.byteLength).toBe(expected);
    if (!restored || !restoredSecond) throw new Error('render pool lost a slot');

    pool.release(restored.index, restored.lease, new ArrayBuffer(0));
    pool.release(restored.index, restored.lease, new ArrayBuffer(expected));
    pool.release(-1, 0, new ArrayBuffer(expected));
    pool.release(99, 0, new ArrayBuffer(expected));
    expect(pool.availableCount()).toBe(1);
    pool.release(restoredSecond.index, restoredSecond.lease, restoredSecond.buffer);
    expect(pool.availableCount()).toBe(pool.size);
  });

  it('ignores a stale lease instead of freeing a slot that was reacquired', () => {
    const pool = new RenderBufferPool(1);
    const first = pool.acquire();
    if (!first) throw new Error('render pool did not fill');
    pool.release(first.index, first.lease, first.buffer);

    const second = pool.acquire();
    if (!second) throw new Error('render pool did not free');
    expect(second.lease).not.toBe(first.lease);

    // A delayed duplicate of the first return must not free the second lease.
    pool.release(first.index, first.lease, first.buffer);
    expect(pool.availableCount()).toBe(0);
    pool.release(second.index, second.lease, second.buffer);
    expect(pool.availableCount()).toBe(1);
  });

  it('maintains capacity across 200,000 acquire/return cycles', () => {
    const pool = new RenderBufferPool(2);
    for (let i = 0; i < 200_000; i++) {
      const acquired = pool.acquire();
      if (!acquired) throw new Error(`no slot at cycle ${i}`);
      pool.release(acquired.index, acquired.lease, acquired.buffer);
    }
    expect(pool.availableCount()).toBe(pool.size);
  });
});
