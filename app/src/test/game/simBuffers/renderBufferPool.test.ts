import { describe, expect, it } from 'vitest';
import { RenderBufferPool } from '@/game/simBuffers/renderBufferPool';

describe('RenderBufferPool', () => {
  it('acquires and releases buffers up to pool size', () => {
    const pool = new RenderBufferPool(3);
    const a = pool.acquire();
    const b = pool.acquire();
    const c = pool.acquire();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(c).not.toBeNull();
    expect(pool.acquire()).toBeNull();

    pool.release(c!.index, c!.buffer);
    expect(pool.availableCount()).toBe(1);

    const d = pool.acquire();
    expect(d).not.toBeNull();
    expect(d!.index).toBe(c!.index);
  });
});