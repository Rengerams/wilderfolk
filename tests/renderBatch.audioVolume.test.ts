/**
 * F-RND-30 — the volume preset has to reach the HTMLAudio fallback.
 *
 * The gameplay and intro themes play through an `HTMLAudioElement` first, which sits outside the
 * Web Audio bus chain: `audioGraph` scales its own buses, so the only way the preset reaches the
 * element is the sync in `htmlAudioSync`.
 */
import { describe, expect, it, vi } from 'vitest';
import { VOLUME_PRESETS, levelsForPreset } from '../src/audio/preferences';
import { htmlAudioVolumeForPreset } from '../src/audio/htmlAudioSync';
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

const graphState = vi.hoisted(() => ({ preset: 'normal' }));

vi.mock('../src/audio/graph', async () => {
  const { levelsForPreset: levels } = await import('../src/audio/preferences');
  return {
    audioGraph: {
      isMuted: false,
      isUnlocked: true,
      ensure: vi.fn(),
      getLevels: () => levels(graphState.preset as 'soft' | 'normal' | 'loud'),
      getVolumePreset: () => graphState.preset,
      setVolumePreset: (preset: string) => {
        graphState.preset = preset;
      },
      primeUnlock: vi.fn(),
      unlock: vi.fn(async () => true),
      setMusicBrightness: vi.fn(),
      // The procedural fallback asks for a bus; a null bus makes `scheduleTone` a no-op.
      bus: vi.fn(() => null),
    },
  };
});

describe('F-RND-30 — the preset reaches the element the fallback plays through', () => {
  it('scales the element volume by master × music, and clamps at 1', () => {
    const base = 0.4;
    expect(htmlAudioVolumeForPreset(base, levelsForPreset('normal'))).toBeCloseTo(base, 6);
    expect(htmlAudioVolumeForPreset(base, levelsForPreset('soft')))
      .toBeCloseTo(base * VOLUME_PRESETS.soft.master * VOLUME_PRESETS.soft.music, 6);
    expect(htmlAudioVolumeForPreset(base, levelsForPreset('loud')))
      .toBeGreaterThan(htmlAudioVolumeForPreset(base, levelsForPreset('normal')));
    expect(htmlAudioVolumeForPreset(1, levelsForPreset('loud'))).toBe(1);
  });

  it('re-applies it to both players when the preset changes', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    vi.resetModules();
    graphState.preset = 'normal';

    const { backgroundMusic } = await import('../src/audio/backgroundMusic');
    const { introMusic } = await import('../src/audio/introMusic');
    const { soundDirector } = await import('../src/audio/director');

    // Both players take the HTML path: the sample player returns false in the mock.
    await backgroundMusic.start();
    await introMusic.start();

    const gameplayEl = (backgroundMusic as unknown as { htmlAudio: FakeAudio }).htmlAudio;
    const introEl = (introMusic as unknown as { htmlAudio: FakeAudio }).htmlAudio;
    expect(gameplayEl).not.toBeNull();
    expect(introEl).not.toBeNull();

    const expected = (trackVolume: number, preset: keyof typeof VOLUME_PRESETS): number =>
      htmlAudioVolumeForPreset(trackVolume, levelsForPreset(preset));

    expect(gameplayEl.volume).toBeCloseTo(expected(TRACK_VOLUMES.gameplay, 'normal'), 6);
    expect(introEl.volume).toBeCloseTo(expected(TRACK_VOLUMES.intro, 'normal'), 6);

    soundDirector.setVolumePreset('loud');
    expect(gameplayEl.volume).toBeCloseTo(expected(TRACK_VOLUMES.gameplay, 'loud'), 6);
    expect(introEl.volume).toBeCloseTo(expected(TRACK_VOLUMES.intro, 'loud'), 6);

    soundDirector.setVolumePreset('soft');
    expect(gameplayEl.volume).toBeCloseTo(expected(TRACK_VOLUMES.gameplay, 'soft'), 6);
    expect(introEl.volume).toBeCloseTo(expected(TRACK_VOLUMES.intro, 'soft'), 6);

    backgroundMusic.stop();
    introMusic.stop();
  });
});
