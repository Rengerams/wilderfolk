import { useState, type ReactNode } from 'react';

interface Props {
  title: string;
  icon?: string;
  subtitle?: string;
  defaultOpen?: boolean;
  badge?: string | number;
  children: ReactNode;
  accent?: 'emerald' | 'amber' | 'cyan' | 'orange' | 'indigo' | 'stone';
}

const ACCENT: Record<NonNullable<Props['accent']>, string> = {
  emerald: 'border-emerald-800/30 bg-emerald-950/15',
  amber: 'border-amber-800/30 bg-amber-950/15',
  cyan: 'border-cyan-800/30 bg-cyan-950/15',
  orange: 'border-orange-800/30 bg-orange-950/15',
  indigo: 'border-indigo-800/30 bg-indigo-950/15',
  stone: 'border-stone-600/40 bg-stone-800/30',
};

export default function CollapsibleSection({
  title,
  icon,
  subtitle,
  defaultOpen = true,
  badge,
  children,
  accent = 'stone',
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`rounded-xl border ${ACCENT[accent]} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-stone-800/40"
        aria-expanded={open}
      >
        {icon && <span className="text-sm leading-none">{icon}</span>}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[11px] font-bold text-stone-200">{title}</h3>
            {badge != null && badge !== '' && (
              <span className="rounded-full bg-stone-700 px-1.5 py-0.5 text-[8px] font-bold text-stone-300">
                {badge}
              </span>
            )}
          </div>
          {subtitle && !open && (
            <p className="truncate text-[11px] text-stone-500">{subtitle}</p>
          )}
        </div>
        <span className={`shrink-0 text-[11px] text-stone-500 transition-transform ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {open && <div className="border-t border-stone-700/50 px-3 pb-3 pt-2">{children}</div>}
    </section>
  );
}