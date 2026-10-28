import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadSample: vi.fn<(...args: unknown[]) => Promise<AudioBuffer | null>>(),
  bus: vi.fn(() => ({}) as GainNode),
}));

vi.mock('../src/audio/sampleLoader', () => ({
  loadSample: mocks.loadSample,
}));
vi.mock('../src/audio/graph', () => ({
  audioGraph: { isMuted: false, bus: mocks.bus },
}));

import { TrackPlayer } from '../src/audio/trackPlayer';

describe('Spotlight vs pending gameplay audio playback', () => {
  beforeEach(() => {
    mocks.loadSample.mockReset();
    mocks.bus.mockClear();
  });

  it('never connects a decoded gameplay track after the Spotlight suspension invalidates the request', async () => {
    let resolve!: (buffer: AudioBuffer | null) => void;
    const deferred = new Promise<AudioBuffer | null>((ok) => { resolve = ok; });
    mocks.loadSample.mockReturnValue(deferred);
    let active = true;
    const player = new TrackPlayer();
    const pending = player.playLoop('gameplay.ogg', 'music', 0.4, 1.2, () => active);

    expect(mocks.loadSample).toHaveBeenCalledTimes(1);
    active = false; // Spotlight takes the bus while the normal track is decoding.
    resolve({} as AudioBuffer);

    expect(await pending).toBe(false);
    expect(mocks.bus).not.toHaveBeenCalled();
    expect(player.currentUrl).toBeNull();
  });

  it('does not start loading gameplay sound if the scene already owns music', async () => {
    const player = new TrackPlayer();
    const result = await player.playLoop('gameplay.ogg', 'music', 0.4, 1.2, () => false);
    expect(result).toBe(false);
    expect(mocks.loadSample).not.toHaveBeenCalled();
    expect(player.currentUrl).toBeNull();
  });
});
