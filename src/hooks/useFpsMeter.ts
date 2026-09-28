import { useEffect, useState } from 'react';

/** Sampling window for one FPS reading — long enough to be steady, short enough to feel live. */
const SAMPLE_WINDOW_MS = 500;

/** Current frame rate plus the session extremes behind the readout. */
export interface FpsSessionStats {
  /** Latest sample; `null` until the first window closes. */
  current: number | null;
  /** Lowest sample seen since the meter was enabled. */
  min: number | null;
  /** Mean of every sample since the meter was enabled. */
  avg: number | null;
  /** How many samples `min`/`avg` are built from. */
  samples: number;
}

const EMPTY_FPS_SESSION: FpsSessionStats = { current: null, min: null, avg: null, samples: 0 };

/** Presentation-only FPS estimate; it never reads or mutates simulation state. */
export function useFpsMeter(enabled: boolean): FpsSessionStats {
  const [stats, setStats] = useState<FpsSessionStats>(EMPTY_FPS_SESSION);

  useEffect(() => {
    if (!enabled) return undefined;

    let frameCount = 0;
    let windowStart = performance.now();
    let rafId = 0;
    let min: number | null = null;
    let total = 0;
    let samples = 0;
    let sessionStarted = false;

    const sample = (now: number) => {
      if (!sessionStarted) {
        // First frame of a fresh session: drop the previous run's numbers.
        sessionStarted = true;
        windowStart = now;
        setStats(EMPTY_FPS_SESSION);
      }
      frameCount++;
      const elapsed = now - windowStart;
      if (elapsed >= SAMPLE_WINDOW_MS) {
        const fps = Math.round((frameCount * 1000) / elapsed);
        frameCount = 0;
        windowStart = now;
        min = min == null ? fps : Math.min(min, fps);
        total += fps;
        samples++;

        const next: FpsSessionStats = {
          current: fps,
          min,
          avg: Math.round(total / samples),
          samples,
        };
        // Skip the commit when nothing visible changed (idle frames repeat a lot).
        setStats((previous) => (
          previous.current === next.current
          && previous.min === next.min
          && previous.avg === next.avg
            ? previous
            : next
        ));
      }
      rafId = window.requestAnimationFrame(sample);
    };
    rafId = window.requestAnimationFrame(sample);
    return () => window.cancelAnimationFrame(rafId);
  }, [enabled]);

  return enabled ? stats : EMPTY_FPS_SESSION;
}