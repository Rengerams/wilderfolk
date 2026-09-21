import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export interface MomentCardData {
  id: string;
  icon: string;
  title: string;
  detail: string;
}

interface Props {
  moment: MomentCardData | null;
  onDone: () => void;
}

// 🎬 Explicit timing constants for cinematic flow
const TIMING = {
  FADE_IN_MS: 700,
  HOLD_MS: 3400,
  FADE_OUT_MS: 700,
} as const;

const TOTAL_MS = TIMING.FADE_IN_MS + TIMING.HOLD_MS + TIMING.FADE_OUT_MS; // 4800ms

/** Center-screen cinematic title card — fades in, holds, fades out. */
export default function MomentTitleCard({ moment, onDone }: Props) {
  const [phase, setPhase] = useState<'hidden' | 'visible' | 'fading'>('hidden');
  const hasFiredRef = useRef(false);

  const momentId = moment?.id;

  // Keep the latest `onDone` available to timers/skip without writing a ref
  // during render.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // (Re)play the card whenever the featured moment changes; also resets the
  // fired-guard when the moment is cleared. All timers are torn down on change.
  useEffect(() => {
    hasFiredRef.current = false;
    if (!momentId) return;

    // Fade in
    const raf = requestAnimationFrame(() => setPhase('visible'));

    // Start fade out after hold period
    const fadeOutTimer = window.setTimeout(() => {
      setPhase('fading');
    }, TIMING.FADE_IN_MS + TIMING.HOLD_MS);

    // Call onDone after fade out completes
    const doneTimer = window.setTimeout(() => {
      if (!hasFiredRef.current) {
        hasFiredRef.current = true;
        onDoneRef.current();
      }
    }, TOTAL_MS);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fadeOutTimer);
      window.clearTimeout(doneTimer);
    };
  }, [momentId]);

  const handleSkip = () => {
    if (!hasFiredRef.current) {
      hasFiredRef.current = true;
      onDoneRef.current();
    }
  };

  // The card is a full-screen click-catcher that holds the map for ~4.8 s, so it must also be
  // dismissable from the keyboard: Enter/Space activate it, Escape skips it
  // (2026-09-17 UI audit, R28).
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Escape') return;
    event.preventDefault();
    handleSkip();
  };

  if (!moment) return null;

  const isVisible = phase === 'visible';
  const isFading = phase === 'fading';

  return (
    <div
      role="button"
      tabIndex={0}
      className="pointer-events-auto absolute inset-0 z-40 flex cursor-pointer items-center justify-center bg-black/20 select-none backdrop-blur-[1px] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
      onClick={handleSkip}
      onKeyDown={handleKeyDown}
    >
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`text-center transition-all motion-reduce:transition-none ${
          isVisible
            ? 'translate-y-0 opacity-100'
            : isFading
              ? 'translate-y-0 opacity-0 motion-reduce:translate-y-0'
              : 'translate-y-3 opacity-0 motion-reduce:translate-y-0'
        }`}
        style={{
          transitionDuration: isVisible ? `${TIMING.FADE_IN_MS}ms` : `${TIMING.FADE_OUT_MS}ms`,
        }}
      >
        <div className="mb-2 text-5xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]" aria-hidden="true">
          {moment.icon}
        </div>
        <h2 className="text-3xl font-black tracking-wide text-amber-200 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
          {moment.title}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone-200 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          {moment.detail}
        </p>
        <p className="mt-4 text-xs tracking-wider text-stone-400 opacity-60">
          Click anywhere to skip
        </p>
      </div>
    </div>
  );
}