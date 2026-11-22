import { useEffect } from 'react';

/** Runs `onGesture` on the first pointer or key press — the browser's audio-unlock boundary. */
export function useGestureUnlock(onGesture: () => void): void {
  useEffect(() => {
    const unlock = () => onGesture();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [onGesture]);
}
