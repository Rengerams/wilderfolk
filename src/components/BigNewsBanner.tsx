export interface BigNewsItem {
  id: string;
  title: string;
  message: string;
  type: 'positive' | 'negative' | 'neutral';
}

function BigNewsTypeBadge({ type }: { type: 'positive' | 'negative' | 'neutral' }) {
  const styles = {
    positive: 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200',
    negative: 'border-rose-400/40 bg-rose-500/20 text-rose-200',
    neutral: 'border-amber-400/40 bg-amber-500/20 text-amber-200',
  }[type];
  const label = type === 'positive' ? '+' : type === 'negative' ? '!' : 'i';
  const title = type === 'positive' ? 'Good news' : type === 'negative' ? 'Urgent news' : 'News';
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-black ${styles}`}
      title={title}
      aria-label={title}
    >
      {label}
    </span>
  );
}

export default function BigNewsBanner({
  news,
  onDismiss,
}: {
  news: BigNewsItem[];
  onDismiss: (id: string) => void;
}) {
  if (news.length === 0) return null;
  const item = news[news.length - 1];
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onDismiss(item.id);
      }}
      className={`pointer-events-auto fixed left-1/2 top-24 z-[200] w-[min(100%-1.5rem,22rem)] -translate-x-1/2 cursor-pointer rounded-lg border p-2.5 pr-8 text-left shadow-lg backdrop-blur hover:brightness-110 ${
        item.type === 'positive' ? 'border-emerald-400/50 bg-emerald-950/90' :
        item.type === 'negative' ? 'border-rose-400/50 bg-rose-950/90' :
        'border-amber-400/50 bg-amber-950/90'
      }`}
    >
      <span className="absolute right-1.5 top-1 text-base leading-none text-stone-400" aria-hidden>×</span>
      <div className="flex items-start gap-2">
        <BigNewsTypeBadge type={item.type} />
        <div className="min-w-0">
          <h3 className={`truncate text-sm font-bold ${
            item.type === 'positive' ? 'text-emerald-300' :
            item.type === 'negative' ? 'text-rose-300' : 'text-amber-300'
          }`}>{item.title}</h3>
          <p className="line-clamp-3 text-[13px] text-stone-200">{item.message}</p>
        </div>
      </div>
    </button>
  );
}
