import { useState } from 'react';
import Emoji from './Emoji';
import type { PriorityAlert, PriorityAlertSeverity } from '../game/priorityAlerts';

const SEVERITY_STYLE: Record<PriorityAlertSeverity, string> = {
  critical: 'border-rose-500/50 bg-rose-950/90 text-rose-100 hover:bg-rose-900/80',
  warning: 'border-amber-500/45 bg-amber-950/85 text-amber-100 hover:bg-amber-900/75',
  info: 'border-cyan-600/35 bg-cyan-950/70 text-cyan-100 hover:bg-cyan-900/65',
};

const VISIBLE_LIMIT = 2;

/** The disclosure target the two toggles name with `aria-controls`. */
const ALERT_LIST_ID = 'alert-bar-list';

/** The critical chip's marker, in `BigNewsBanner`'s badge idiom: severity must not be colour alone. */
const CRITICAL_MARKER = { glyph: '!', name: 'Critical' } as const;

/**
 * The chips the strip shows: every `critical` alert, then the first `VISIBLE_LIMIT` of the rest. A
 * critical alert is never collapsed — the owner returns at most four, so one behind "+N more" is a
 * missed raid.
 */
export function visibleAlertChips(alerts: readonly PriorityAlert[], expanded: boolean): PriorityAlert[] {
  if (expanded) return [...alerts];
  const critical: PriorityAlert[] = [];
  const rest: PriorityAlert[] = [];
  for (const alert of alerts) {
    if (alert.severity === 'critical') critical.push(alert);
    else rest.push(alert);
  }
  return [...critical, ...rest.slice(0, VISIBLE_LIMIT)];
}

/** How many chips stay behind "+N more": exactly what {@link visibleAlertChips} leaves out. */
export function collapsedAlertCount(alerts: readonly PriorityAlert[]): number {
  return alerts.length - visibleAlertChips(alerts, false).length;
}

interface Props {
  alerts: PriorityAlert[];
  onAlert: (alert: PriorityAlert) => void;
}

export default function AlertBar({ alerts, onAlert }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) return null;

  const visible = visibleAlertChips(alerts, expanded);
  const hiddenCount = collapsedAlertCount(alerts);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-stone-700/80 bg-stone-900/60 px-3 py-1">
      {/* `display: contents` so the disclosure target can carry an id without adding a flex item —
          the chip row's layout is unchanged. Both toggles below state the state they set and name
          the element they change, the `aria-expanded` + `aria-controls` pairing
          `SimulationDiagnosticsPanel.tsx` uses (2026-09-20 audit, A7). */}
      <div id={ALERT_LIST_ID} className="contents">
        {visible.map((alert) => (
          <button
            key={alert.id}
            type="button"
            onClick={() => onAlert(alert)}
            title={alert.detail}
            className={`flex max-w-[10rem] items-center gap-1 rounded-lg border px-2 py-0.5 text-left transition-colors ${SEVERITY_STYLE[alert.severity]}`}
          >
            <Emoji className="text-sm">{alert.icon}</Emoji>
            <span className="truncate text-xs font-semibold">{alert.title}</span>
            {alert.severity === 'critical' && (
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-rose-300/60 bg-rose-500/25 text-[10px] font-black text-rose-50"
                title={CRITICAL_MARKER.name}
                aria-label={CRITICAL_MARKER.name}
              >
                {CRITICAL_MARKER.glyph}
              </span>
            )}
            <span className="shrink-0 text-[11px] opacity-60">→</span>
          </button>
        ))}
      </div>
      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={expanded}
          aria-controls={ALERT_LIST_ID}
          className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-stone-400 hover:bg-stone-800 hover:text-stone-200"
        >
          +{hiddenCount} more
        </button>
      )}
      {expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-expanded={expanded}
          aria-controls={ALERT_LIST_ID}
          className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-stone-400 hover:text-stone-300"
        >
          Less
        </button>
      )}
    </div>
  );
}