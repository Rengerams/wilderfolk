import Emoji from './Emoji';

export interface ActiveEventBannerEvent {
  emoji: string;
  title: string;
  description: string;
  effect: string;
  type: 'positive' | 'negative' | 'neutral';
}

export default function ActiveEventBanner({
  event,
  onDismiss,
}: {
  event: ActiveEventBannerEvent;
  onDismiss: () => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onDismiss();
      }}
      className={`pointer-events-auto fixed left-1/2 top-14 z-[199] w-[min(100%-1.5rem,20rem)] -translate-x-1/2 cursor-pointer rounded-lg border p-2.5 pr-8 text-left shadow-lg backdrop-blur hover:brightness-110 ${
        event.type === 'positive' ? 'border-emerald-500/40 bg-emerald-950/95' :
        event.type === 'negative' ? 'border-rose-500/40 bg-rose-950/95' :
        'border-stone-500/40 bg-stone-900/95'
      }`}
      aria-label="Dismiss event"
    >
      <span className="absolute right-1.5 top-1 text-base leading-none text-stone-400" aria-hidden>×</span>
      <div className="flex items-start gap-2">
        <Emoji className="text-lg">{event.emoji}</Emoji>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-white">{event.title}</h3>
          <p className="line-clamp-2 text-[11px] text-stone-300">{event.description}</p>
          <p className={`mt-0.5 truncate text-[10px] font-semibold ${
            event.type === 'positive' ? 'text-emerald-400' :
            event.type === 'negative' ? 'text-rose-400' : 'text-amber-400'
          }`}>{event.effect}</p>
        </div>
      </div>
    </button>
  );
}
