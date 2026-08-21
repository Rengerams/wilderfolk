import { useEffect, useState } from 'react';

/** Presentation-only FPS estimate; it never reads or mutates simulation state. */
export function useFpsMeter(enabled: boolean): number | null {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;

    let frameCount = 0;
    let windowStart = performance.now();
    let rafId = 0;
    const sample = (now: number) => {
      frameCount++;
      const elapsed = now - windowStart;
      if (elapsed >= 500) {
        setFps(Math.round((frameCount * 1000) / elapsed));
        frameCount = 0;
        windowStart = now;
      }
      rafId = window.requestAnimationFrame(sample);
    };
    rafId = window.requestAnimationFrame(sample);
    return () => window.cancelAnimationFrame(rafId);
  }, [enabled]);

  return enabled ? fps : null;
}
