/**
 * F-RND-30 — the master bus is limited before the speakers.
 *
 * The `loud` preset scales the master past unity and every bus sums into it, so the last node
 * before `destination` has to bound the signal. Node has no Web Audio, so the graph is built
 * against a recording stand-in for `AudioContext` — the boundary, not one of our own modules.
 */
import { describe, expect, it, vi } from 'vitest';
import { LIMITER } from '../src/audio/constants';

class FakeNode {
  connections: unknown[] = [];
  connect = vi.fn((to: unknown) => {
    this.connections.push(to);
  });
}

class FakeGain extends FakeNode {
  gain = { value: 0, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() };
}

class FakeCompressor extends FakeNode {
  threshold = { value: 0 };
  knee = { value: 0 };
  ratio = { value: 0 };
  attack = { value: 0 };
  release = { value: 0 };
}

class FakeFilter extends FakeNode {
  type = '';
  Q = { value: 0 };
  frequency = { value: 0, setTargetAtTime: vi.fn() };
}

const created: FakeNode[] = [];
const destination = new FakeNode();

class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = destination;
  createGain = (): FakeGain => {
    const node = new FakeGain();
    created.push(node);
    return node;
  };
  createDynamicsCompressor = (): FakeCompressor => {
    const node = new FakeCompressor();
    created.push(node);
    return node;
  };
  createBiquadFilter = (): FakeFilter => {
    const node = new FakeFilter();
    created.push(node);
    return node;
  };
  resume = vi.fn(async () => undefined);
  decodeAudioData = vi.fn(async () => ({}));
}

describe('F-RND-30 — the master bus is limited before the speakers', () => {
  it('routes master gain through a compressor and never straight to the destination', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.resetModules();
    const { audioGraph } = await import('../src/audio/graph');
    audioGraph.ensure();

    const limiter = created.find((node) => node instanceof FakeCompressor) as FakeCompressor | undefined;
    const masterGain = created.find((node) => node instanceof FakeGain) as FakeGain | undefined;
    expect(limiter).toBeDefined();
    expect(masterGain).toBeDefined();
    expect(limiter!.threshold.value).toBe(LIMITER.thresholdDb);
    expect(limiter!.knee.value).toBe(LIMITER.kneeDb);
    expect(limiter!.ratio.value).toBe(LIMITER.ratio);
    expect(limiter!.attack.value).toBe(LIMITER.attackSec);
    expect(limiter!.release.value).toBe(LIMITER.releaseSec);

    expect(masterGain!.connections).toContain(limiter);
    expect(masterGain!.connections).not.toContain(destination);
    expect(limiter!.connections).toContain(destination);
  });
});
