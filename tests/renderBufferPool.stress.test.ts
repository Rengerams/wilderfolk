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

    pool.release(short.index, new ArrayBuffer(expected - 1));
    pool.release(long.index, new ArrayBuffer(expected + 1));
    expect(pool.availableCount()).toBe(2);
    const restored = pool.acquire();
    const restoredSecond = pool.acquire();
    expect(restored?.buffer.byteLength).toBe(expected);
    expect(restoredSecond?.buffer.byteLength).toBe(expected);
    if (!restored || !restoredSecond) throw new Error('render pool lost a slot');

    pool.release(restored.index, new ArrayBuffer(0));
    pool.release(restored.index, new ArrayBuffer(expected));
    pool.release(-1, new ArrayBuffer(expected));
    pool.release(99, new ArrayBuffer(expected));
    expect(pool.availableCount()).toBe(1);
    pool.release(restoredSecond.index, restoredSecond.buffer);
    expect(pool.availableCount()).toBe(pool.size);
  });

  it('maintains capacity across 200,000 acquire/return cycles', () => {
    const pool = new RenderBufferPool(2);
    for (let i = 0; i < 200_000; i++) {
      const acquired = pool.acquire();
      if (!acquired) throw new Error(`no slot at cycle ${i}`);
      pool.release(acquired.index, acquired.buffer);
    }
    expect(pool.availableCount()).toBe(pool.size);
  });
});
