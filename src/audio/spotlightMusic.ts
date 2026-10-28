import { audioGraph } from './graph';
import { backgroundMusic } from './backgroundMusic';
import { loadSample } from './sampleLoader';
import { TRACKS, TRACK_VOLUMES } from './tracks';

export const SPOTLIGHT_MUSIC_URL = TRACKS.spotlightLore;
const FADE_IN_SEC = 0.35;
const FADE_OUT_SEC = 0.7;

export function preloadSpotlightMusic(): Promise<void> {
  return loadSample(SPOTLIGHT_MUSIC_URL).then(() => undefined);
}

/** Exclusive, cancellable soundtrack on the normal music bus; never touches WorldState. */
export function playSpotlightMusic(): { stop: () => void } {
  const restore = backgroundMusic.suspendForSpotlight();
  let cancelled = false;
  let source: AudioBufferSourceNode | null = null;
  let gain: GainNode | null = null;

  void (async () => {
    const buffer = await loadSample(SPOTLIGHT_MUSIC_URL);
    if (cancelled || !buffer) {
      if (!cancelled) restore();
      return;
    }
    const parent = audioGraph.bus('music');
    if (!parent || cancelled) return;
    const ctx = audioGraph.context;
    const node = ctx.createBufferSource();
    const volume = ctx.createGain();
    const startAt = ctx.currentTime;
    node.buffer = buffer;
    node.loop = true;
    volume.gain.setValueAtTime(0.0001, startAt);
    volume.gain.linearRampToValueAtTime(TRACK_VOLUMES.spotlightLore, startAt + FADE_IN_SEC);
    node.connect(volume);
    volume.connect(parent);
    node.onended = () => {
      node.disconnect();
      volume.disconnect();
    };
    source = node;
    gain = volume;
    node.start(startAt);
  })().catch(() => {
    if (!cancelled) restore();
  });

  return {
    stop() {
      if (cancelled) return;
      cancelled = true;
      if (source && gain) {
        try {
          const t = audioGraph.context.currentTime;
          gain.gain.cancelScheduledValues(t);
          gain.gain.setValueAtTime(gain.gain.value, t);
          gain.gain.linearRampToValueAtTime(0.0001, t + FADE_OUT_SEC);
          source.stop(t + FADE_OUT_SEC + 0.01);
        } catch { /* source may already have ended */ }
      }
      restore();
    },
  };
}
