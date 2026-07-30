import { soundDirector } from './director';
import { audioGraph } from './graph';
import { preloadAllSamples } from './sampleLoader';

let bootstrapped = false;

/** Start intro audio as early as possible — on load and on any unlock gesture. */
export function bootstrapIntroAudio(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  audioGraph.ensure();
  void preloadAllSamples();

  const attempt = () => {
    void soundDirector.ensureIntroAudio();
  };

  // Route through director so gameplay sessions never restart intro on gesture.
  attempt();
  requestAnimationFrame(attempt);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attempt, { once: true });
  }

  window.addEventListener('pageshow', attempt);
  window.addEventListener('focus', attempt);

  const unlock = () => attempt();
  document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  document.addEventListener('touchstart', unlock, { capture: true, passive: true });
  document.addEventListener('keydown', unlock, { capture: true });
}