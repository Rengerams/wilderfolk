/**
 * The intro and gameplay themes can play through an `HTMLAudioElement`, outside the Web Audio bus
 * chain, so that path must apply the same music-chain gain the buses apply.
 */
import { describe, expect, it, vi } from 'vitest';
import { VOLUMES } from '../src/audio/constants';
import { levelsForPreset } from '../src/audio/preferences';
import { htmlAudioVolumeForPath } from '../src/audio/htmlAudioSync';
import { TRACK_VOLUMES } from '../src/audio/tracks';

class FakeAudio {
  loop = false;
  preload = 'auto';
  volume = 1;
  paused = true;
  currentTime = 0;
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
}

class FakeParam {
  value = 0;
  setValueAtTime = vi.fn();
  setTargetAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

class FakeNode {
  connect = vi.fn();
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeCompressor extends FakeNode {
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
}

class FakeFilter extends FakeNode {
  type = '';
  Q = new FakeParam();
  frequency = new FakeParam();
}

class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = new FakeNode();
  createGain = (): FakeGain => new FakeGain();
  createDynamicsCompressor = (): FakeCompressor => new FakeCompressor();
  createBiquadFilter = (): FakeFilter => new FakeFilter();
  resume = vi.fn(async () => undefined);
  decodeAudioData = vi.fn(async () => ({}));
}

vi.mock('../src/audio/scheduler', () => ({ scheduleTone: vi.fn() }));

vi.mock('../src/audio/sampleLoader', () => ({
  preloadAllSamples: vi.fn(async () => undefined),
  loadSample: vi.fn(async () => null),
}));

vi.mock('../src/audio/trackPlayer', () => ({
  musicPlayer: { playLoop: vi.fn(async () => false), stop: vi.fn(), currentUrl: null },
  ambientPlayer: { playLoop: vi.fn(async () => false), stop: vi.fn(), currentUrl: null },
}));

vi.mock('../src/audio/ambient', () => ({
  ambientNature: {
    ensurePlaying: vi.fn(async () => undefined),
    stop: vi.fn(),
    setNightMode: vi.fn(),
  },
}));

import { audioGraph } from '../src/audio/graph';
import { backgroundMusic } from '../src/audio/backgroundMusic';
import { introMusic } from '../src/audio/introMusic';
import { soundDirector } from '../src/audio/director';

describe('F-RND-30 — the HTMLAudio element path matches the Web Audio music chain', () => {
  it('scales by the music path gain the buses apply, not just the preset', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    audioGraph.setVolumePreset('normal');
    const normal = levelsForPreset('normal');
    expect(audioGraph.musicPathGain())
      .toBeCloseTo(VOLUMES.master * VOLUMES.music * normal.master * normal.music, 10);
    // The element path reaches the same chain gain as bus playback; scaling by the preset alone is 4.3× louder.
    expect(htmlAudioVolumeForPath(TRACK_VOLUMES.intro, audioGraph.musicPathGain()))
      .toBeCloseTo(TRACK_VOLUMES.intro * VOLUMES.master * VOLUMES.music, 10);
    expect(htmlAudioVolumeForPath(TRACK_VOLUMES.intro, audioGraph.musicPathGain()))
      .toBeLessThan(TRACK_VOLUMES.intro);
  });

  it('re-applies the path gain to both players when the preset changes', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('Audio', FakeAudio);
    audioGraph.setVolumePreset('normal');

    // Both players take the HTML path: the sample player returns false in the mock.
    await backgroundMusic.start();
    await introMusic.start();

    const gameplayEl = (backgroundMusic as unknown as { htmlAudio: FakeAudio }).htmlAudio;
    const introEl = (introMusic as unknown as { htmlAudio: FakeAudio }).htmlAudio;
    expect(gameplayEl).not.toBeNull();
    expect(introEl).not.toBeNull();

    for (const preset of ['normal', 'loud', 'soft'] as const) {
      soundDirector.setVolumePreset(preset);
      expect(gameplayEl.volume).toBeCloseTo(TRACK_VOLUMES.gameplay * audioGraph.musicPathGain(), 6);
      expect(introEl.volume).toBeCloseTo(TRACK_VOLUMES.intro * audioGraph.musicPathGain(), 6);
    }

    backgroundMusic.stop();
    introMusic.stop();
  });

  it('clamps the element volume into the 0–1 range', () => {
    expect(htmlAudioVolumeForPath(0.5, 0.5)).toBeCloseTo(0.25, 10);
    expect(htmlAudioVolumeForPath(4, 1)).toBe(1);
    expect(htmlAudioVolumeForPath(-1, 1)).toBe(0);
  });
});
