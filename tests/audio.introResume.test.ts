/**
 * Every pointerdown/keydown on the intro screen re-runs the audio lifecycle. It must resume the theme
 * that is already playing rather than restarting the loop from 0:00.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = { currentUrl: null as string | null };
  return {
    state,
    playLoop: vi.fn(async (url: string) => {
      state.currentUrl = url;
      return true;
    }),
    stop: vi.fn(() => {
      state.currentUrl = null;
    }),
  };
});

class FakeAudio {
  loop = false;
  preload = 'auto';
  volume = 1;
  paused = true;
  currentTime = 0;
  play = vi.fn(async () => {
    throw new Error('autoplay blocked until a gesture');
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
}

vi.stubGlobal('Audio', FakeAudio);

vi.mock('../src/audio/trackPlayer', () => ({
  musicPlayer: {
    playLoop: mocks.playLoop,
    stop: mocks.stop,
    get currentUrl() {
      return mocks.state.currentUrl;
    },
  },
  ambientPlayer: { playLoop: vi.fn(async () => false), stop: vi.fn(), currentUrl: null },
}));

vi.mock('../src/audio/sampleLoader', () => ({
  preloadAllSamples: vi.fn(async () => undefined),
}));

vi.mock('../src/audio/backgroundMusic', () => ({
  backgroundMusic: {
    ensurePlaying: vi.fn(async () => undefined),
    stop: vi.fn(),
    syncMute: vi.fn(),
    setNightMode: vi.fn(async () => undefined),
  },
}));

vi.mock('../src/audio/ambient', () => ({
  ambientNature: {
    ensurePlaying: vi.fn(async () => undefined),
    stop: vi.fn(),
    setNightMode: vi.fn(),
  },
}));

vi.mock('../src/audio/graph', () => ({
  audioGraph: {
    isMuted: false,
    isUnlocked: true,
    unlock: vi.fn(async () => true),
    primeUnlock: vi.fn(),
    setMusicBrightness: vi.fn(),
    ensure: vi.fn(),
    musicPathGain: () => 0.232,
    bus: vi.fn(() => null),
  },
}));

import { soundDirector } from '../src/audio/director';
import { TRACKS, TRACK_VOLUMES } from '../src/audio/tracks';

describe('intro theme resume', () => {
  beforeEach(() => {
    soundDirector.stopAll();
    mocks.playLoop.mockClear();
    mocks.stop.mockClear();
    mocks.state.currentUrl = null;
  });

  it('never restarts a live intro loop on interaction', async () => {
    // Autoplay is blocked, so the theme starts through the Web Audio sample loop after the gesture.
    await soundDirector.beginIntroAudio();
    expect(mocks.playLoop).toHaveBeenCalledTimes(1);
    expect(mocks.playLoop).toHaveBeenCalledWith(TRACKS.intro, 'music', TRACK_VOLUMES.intro, 1.8);

    await soundDirector.ensureIntroAudio();
    await soundDirector.ensureIntroAudio();

    expect(mocks.playLoop).toHaveBeenCalledTimes(1);

    // A loop that really stopped still recovers on the next gesture.
    mocks.state.currentUrl = null;
    await soundDirector.ensureIntroAudio();
    expect(mocks.playLoop).toHaveBeenCalledTimes(2);
  });
});
