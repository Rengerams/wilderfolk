import { audioGraph } from './graph';
import { backgroundMusic } from './backgroundMusic';
import { TRACKS, TRACK_VOLUMES } from './tracks';

export const SPOTLIGHT_MUSIC_URL = TRACKS.spotlightLore;
const FADE_IN_SEC = 0.35;
let preloadedAudio: HTMLAudioElement | null = null;

export interface SpotlightMusicPlayback {
  fadeOut(seconds?: number): void;
  stop(restoreBed?: boolean): void;
}

/** Buffer just enough to stream the rare long song; do not decode it at game boot. */
export function preloadSpotlightMusic(): Promise<void> {
  if (typeof Audio !== 'undefined' && !preloadedAudio) {
    preloadedAudio = new Audio(SPOTLIGHT_MUSIC_URL);
    preloadedAudio.preload = 'auto';
    preloadedAudio.load();
  }
  return Promise.resolve();
}

/** Exclusive music-bus stream, with exactly-once restoration on scene exit. */
export function playSpotlightMusic(): SpotlightMusicPlayback {
  const restore = backgroundMusic.suspendForSpotlight();
  const element = preloadedAudio ?? new Audio(SPOTLIGHT_MUSIC_URL);
  preloadedAudio = null;
  element.loop = false;
  let stopped = false;
  let restored = false;
  let source: MediaElementAudioSourceNode | null = null;
  let gain: GainNode | null = null;

  const restoreOnce = () => {
    if (restored) return;
    restored = true;
    restore();
  };

  try {
    const ctx = audioGraph.context;
    const parent = audioGraph.bus('music');
    if (!parent) throw new Error('[spotlight] Missing music bus');
    source = ctx.createMediaElementSource(element);
    gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(TRACK_VOLUMES.spotlightLore, ctx.currentTime + FADE_IN_SEC);
    source.connect(gain);
    gain.connect(parent);
    void element.play().catch(() => { if (!stopped) restoreOnce(); });
  } catch {
    element.pause();
    source?.disconnect();
    gain?.disconnect();
    restoreOnce();
  }

  return {
    fadeOut(seconds = 1.4) {
      if (stopped || !gain) return;
      const t = audioGraph.context.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(0, gain.gain.value), t);
      gain.gain.linearRampToValueAtTime(0, t + Math.max(0.05, seconds));
    },
    stop(restoreBed = true) {
      if (!stopped) {
        stopped = true;
        element.pause();
        element.removeAttribute('src');
        element.load();
        source?.disconnect();
        gain?.disconnect();
      }
      if (restoreBed) restoreOnce();
    },
  };
}
