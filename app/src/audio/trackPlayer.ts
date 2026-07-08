import { audioGraph } from './graph';
import type { AudioBus } from './graph';
import { loadSample } from './sampleLoader';

interface ActiveLoop {
  source: AudioBufferSourceNode;
  gain: GainNode;
  url: string;
}

function startLoopSource(
  ctx: AudioContext,
  buffer: AudioBuffer,
  parent: AudioNode,
  volume: number,
  fadeSec: number,
): Omit<ActiveLoop, 'url'> {
  const t = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), t + fadeSec);
  source.connect(gain);
  gain.connect(parent);
  source.start(t);
  return { source, gain };
}

function scheduleLoopFadeOut(loop: ActiveLoop, fadeSec: number): void {
  const ctx = audioGraph.context;
  const t = ctx.currentTime;
  loop.gain.gain.cancelScheduledValues(t);
  loop.gain.gain.setValueAtTime(Math.max(loop.gain.gain.value, 0.0001), t);
  loop.gain.gain.exponentialRampToValueAtTime(0.0001, t + fadeSec);
  const ref = loop;
  setTimeout(() => {
    try { ref.source.stop(); } catch { /* ended */ }
  }, fadeSec * 1000 + 80);
}

/** Looping or one-shot playback through an audio bus. */
export class TrackPlayer {
  private loopA: ActiveLoop | null = null;
  private loopB: ActiveLoop | null = null;

  async playLoop(
    url: string,
    bus: AudioBus,
    volume: number,
    fadeInSec = 1.2,
  ): Promise<boolean> {
    if (audioGraph.isMuted) return false;
    const buffer = await loadSample(url);
    const parent = audioGraph.bus(bus);
    if (!buffer || !parent) return false;

    this.stop(0.6);

    const ctx = audioGraph.context;
    const { source, gain } = startLoopSource(ctx, buffer, parent, volume, fadeInSec);
    this.loopA = { source, gain, url };
    return true;
  }

  async crossfadeLoop(
    url: string,
    bus: AudioBus,
    volume: number,
    durationSec = 2.5,
  ): Promise<boolean> {
    if (audioGraph.isMuted) return false;
    const current = this.loopA;
    if (current?.url === url) return true;

    const buffer = await loadSample(url);
    const parent = audioGraph.bus(bus);
    if (!buffer || !parent) return false;

    const ctx = audioGraph.context;
    const { source, gain } = startLoopSource(ctx, buffer, parent, volume, durationSec);

    if (current) scheduleLoopFadeOut(current, durationSec);

    this.loopA = { source, gain, url };
    return true;
  }

  async playOneShot(
    url: string,
    bus: AudioBus,
    volume: number,
    playbackRate = 1,
  ): Promise<boolean> {
    if (audioGraph.isMuted) return false;
    const buffer = await loadSample(url);
    const parent = audioGraph.bus(bus);
    if (!buffer || !parent) return false;

    const ctx = audioGraph.context;
    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + buffer.duration / playbackRate);

    source.connect(gain);
    gain.connect(parent);
    source.start(t);
    source.stop(t + buffer.duration / playbackRate + 0.05);
    return true;
  }

  stop(fadeSec = 0.5) {
    for (const loop of [this.loopA, this.loopB]) {
      if (loop) scheduleLoopFadeOut(loop, fadeSec);
    }
    this.loopA = null;
    this.loopB = null;
  }

  get currentUrl(): string | null {
    return this.loopA?.url ?? null;
  }
}

export const musicPlayer = new TrackPlayer();
export const ambientPlayer = new TrackPlayer();
export const sfxPlayer = new TrackPlayer();