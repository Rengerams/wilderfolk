/**
 * Leaving the intro must stop the theme and prevent gesture/bootstrap retries
 * from starting it again during map setup or gameplay.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.stubGlobal('Audio', FakeAudio);

vi.mock('../src/audio/trackPlayer', () => ({
  musicPlayer: {
    playLoop: vi.fn(async () => false),
    stop: vi.fn(),
  },
  ambientPlayer: {
    playLoop: vi.fn(async () => false),
    stop: vi.fn(),
  },
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

vi.mock('../src/audio/graph', () => {
  const state = { muted: false };
  return {
    audioGraph: {
      get isMuted() {
        return state.muted;
      },
      unlock: vi.fn(async () => true),
      primeUnlock: vi.fn(),
      setMusicBrightness: vi.fn(),
      ensure: vi.fn(),
    },
  };
});

import { soundDirector } from '../src/audio/director';
import { introMusic } from '../src/audio/introMusic';
import { isIntroAudioAllowed } from '../src/audio/session';

describe('intro audio dismiss', () => {
  beforeEach(() => {
    soundDirector.stopAll();
  });

  it('blocks ensureIntroAudio after dismissIntroAudio', async () => {
    soundDirector.dismissIntroAudio();
    expect(isIntroAudioAllowed()).toBe(false);
    expect(introMusic.isRunning).toBe(false);

    await soundDirector.ensureIntroAudio();
    expect(introMusic.isRunning).toBe(false);
  });

  it('beginGameplayAudio keeps intro dismissed', async () => {
    await soundDirector.beginGameplayAudio();
    expect(isIntroAudioAllowed()).toBe(false);
    expect(introMusic.isRunning).toBe(false);

    await soundDirector.ensureIntroAudio();
    expect(introMusic.isRunning).toBe(false);
  });

  it('stop() invalidates an in-flight start so intro cannot revive', async () => {
    const start = introMusic.start();
    introMusic.stop();
    await start;
    expect(introMusic.isRunning).toBe(false);
  });
});
