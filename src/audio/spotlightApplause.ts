import { audioGraph } from './graph';
import { loadSample } from './sampleLoader';
import { TRACKS, TRACK_VOLUMES } from './tracks';

// 6.1 s excerpt with a 0.5 s fade from the owner's uploaded crowd-cheering recording.
export const SPOTLIGHT_APPLAUSE_CLIP_MS = 6100;
export const SPOTLIGHT_APPLAUSE_AUDIO_URL = TRACKS.spotlightApplause;

const APPLAUSE_GAIN = TRACK_VOLUMES.spotlightApplause;
const FADE_OUT_SECONDS = 0.35;

/** Optional warm-up; failure only disables the sound, never the Spotlight scene. */
export async function preloadSpotlightApplause(): Promise<void> {
  await loadSample(SPOTLIGHT_APPLAUSE_AUDIO_URL);
}

/** A one-shot SFX on the normal mute/volume bus, with cancellation across scene swaps. */
export function playSpotlightApplause(): { stop: () => void } {
  let stopped = false;
  let source: AudioBufferSourceNode | null = null;
  let gain: GainNode | null = null;

  void (async () => {
    if (audioGraph.isMuted) return;
    const buffer = await loadSample(SPOTLIGHT_APPLAUSE_AUDIO_URL);
    if (stopped || !buffer || audioGraph.isMuted || !audioGraph.isUnlocked) return;
    const ctx = audioGraph.context;
    const parent = audioGraph.bus('sfx');
    if (!parent || stopped) return;

    const node = ctx.createBufferSource();
    const volume = ctx.createGain();
    const time = ctx.currentTime;
    const duration = Math.min(buffer.duration, SPOTLIGHT_APPLAUSE_CLIP_MS / 1000);
    node.buffer = buffer;
    volume.gain.setValueAtTime(0.0001, time);
    volume.gain.linearRampToValueAtTime(APPLAUSE_GAIN, time + 0.09);
    volume.gain.setValueAtTime(APPLAUSE_GAIN, time + Math.max(0.1, duration - FADE_OUT_SECONDS));
    volume.gain.linearRampToValueAtTime(0.0001, time + duration);
    node.connect(volume);
    volume.connect(parent);
    node.onended = () => { node.disconnect(); volume.disconnect(); };
    source = node;
    gain = volume;
    audioGraph.duckMusic(duration);
    node.start(time);
    node.stop(time + duration);
  })().catch(() => undefined);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (!source || !gain) return;
      try {
        const t = audioGraph.context.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0.0001, t + 0.04);
        source.stop(t + 0.05);
      } catch { /* already ended */ }
    },
  };
}
