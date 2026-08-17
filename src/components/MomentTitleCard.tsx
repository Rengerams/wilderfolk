import { useEffect, useState } from 'react';

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

/** Center-screen cinematic title card — fades in, holds, fades out. */
export default function MomentTitleCard({ moment, onDone }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!moment) return;
    // fade in on mount
    const raf = requestAnimationFrame(() => setVisible(true));
    const hold = window.setTimeout(() => setVisible(false), 3400);
    const clear = window.setTimeout(onDone, 4400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(hold);
      window.clearTimeout(clear);
    };
  }, [moment, onDone]);

  if (!moment) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
      <div
        className={`text-center transition-all duration-700 ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
      >
        <div className="mb-2 text-5xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">{moment.icon}</div>
        <h2 className="text-3xl font-black tracking-wide text-amber-200 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
          {moment.title}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-stone-200 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          {moment.detail}
        </p>
      </div>
    </div>
  );
}
