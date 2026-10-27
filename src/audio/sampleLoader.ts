import { ALL_TRACK_URLS } from './tracks';
import { audioGraph } from './graph';

const cache = new Map<string, AudioBuffer>();
let preloadPromise: Promise<void> | null = null;

export async function loadSample(url: string): Promise<AudioBuffer | null> {
  const cached = cache.get(url);
  if (cached) return cached;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.arrayBuffer();
    const ctx = audioGraph.ensure();
    const buffer = await ctx.decodeAudioData(data.slice(0));
    cache.set(url, buffer);
    return buffer;
  } catch {
    return null;
  }
}

export function preloadAllSamples(): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = Promise.all(ALL_TRACK_URLS.map(loadSample)).then(() => undefined);
  }
  return preloadPromise;
}

export function clearSampleCache() {
  cache.clear();
  preloadPromise = null;
}