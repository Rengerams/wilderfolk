import { useState } from 'react';
import Emoji from './Emoji';
import type { PriorityAlert, PriorityAlertSeverity } from '../game/priorityAlerts';

const SEVERITY_STYLE: Record<PriorityAlertSeverity, string> = {
  critical: 'border-rose-500/50 bg-rose-950/90 text-rose-100 hover:bg-rose-900/80',
  warning: 'border-amber-500/45 bg-amber-950/85 text-amber-100 hover:bg-amber-900/75',
  info: 'border-cyan-600/35 bg-cyan-950/70 text-cyan-100 hover:bg-cyan-900/65',
};

const VISIBLE_LIMIT = 2;

interface Props {
  alerts: PriorityAlert[];
  onAlert: (alert: PriorityAlert) => void;
}

export default function AlertBar({ alerts, onAlert }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) return null;

  const visible = expanded ? alerts : alerts.slice(0, VISIBLE_LIMIT);
  const hiddenCount = alerts.length - VISIBLE_LIMIT;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-stone-700/80 bg-stone-900/60 px-3 py-1">
      {visible.map((alert) => (
        <button
          key={alert.id}
          type="button"
          onClick={() => onAlert(alert)}
          title={alert.detail}
          className={`flex max-w-[10rem] items-center gap-1 rounded-lg border px-2 py-0.5 text-left transition-colors ${SEVERITY_STYLE[alert.severity]}`}
        >
          <Emoji className="text-xs">{alert.icon}</Emoji>
          <span className="truncate text-[10px] font-semibold">{alert.title}</span>
          <span className="shrink-0 text-[9px] opacity-60">→</span>
        </button>
      ))}
      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-md px-2 py-0.5 text-[9px] font-semibold text-stone-400 hover:bg-stone-800 hover:text-stone-200"
        >
          +{hiddenCount} more
        </button>
      )}
      {expanded && alerts.length > VISIBLE_LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="rounded-md px-2 py-0.5 text-[9px] font-semibold text-stone-500 hover:text-stone-300"
        >
          Less
        </button>
      )}
    </div>
  );
}