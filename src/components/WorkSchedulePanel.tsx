import { useMemo, useState } from 'react';
import type { WorldState } from '../game/gameTypes';
import { getScheduleImpactPreview } from '../game/scheduleFeedback';
import {
  getWorkSchedule,
  getWorkScheduleHours,
  getWorkScheduleLabel,
  MAX_STANDARD_WORK_HOURS,
  MIN_STANDARD_WORK_HOURS,
  validateWorkSchedule,
} from '../game/workSchedule';

interface Props {
  state: WorldState;
  onApply: (startHour: number, endHour: number) => void;
}

export default function WorkSchedulePanel({ state, onApply }: Props) {
  const current = getWorkSchedule(state);
  const [startHour, setStartHour] = useState(current.startHour);
  const [endHour, setEndHour] = useState(current.endHour);
  const validation = useMemo(() => validateWorkSchedule(startHour, endHour), [startHour, endHour]);
  const currentHours = getWorkScheduleHours(current);
  const fatigueValues = state.entities.filter((entity) => entity.alive && !entity.faction && !entity.isJuvenile).map((entity) => entity.scheduleFatigue ?? 0);
  const averageFatigue = fatigueValues.length > 0 ? fatigueValues.reduce((sum, value) => sum + value, 0) / fatigueValues.length : 0;
  const fatigueLabel = averageFatigue >= 60 ? 'high' : averageFatigue >= 25 ? 'building' : 'low';
  const preview = getScheduleImpactPreview(state, 'ordinary', currentHours, validation.ok ? getWorkScheduleHours(validation.schedule) : currentHours);

  return (
    <div className="space-y-3 text-sm text-stone-300">
      <div>
        <p className="font-semibold text-stone-100">Ordinary weekday work</p>
        <p className="mt-1 text-xs leading-relaxed text-stone-400">
          Set one global, non-wrapping window for ordinary workplaces and construction. Weekends remain free.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-stone-400">
          Opens
          <select
            value={startHour}
            onChange={(event) => setStartHour(Number(event.target.value))}
            className="mt-1 w-full rounded border border-stone-600 bg-stone-900 px-2 py-1.5 text-stone-100"
          >
            {Array.from({ length: 18 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
          </select>
        </label>
        <label className="text-xs text-stone-400">
          Closes
          <select
            value={endHour}
            onChange={(event) => setEndHour(Number(event.target.value))}
            className="mt-1 w-full rounded border border-stone-600 bg-stone-900 px-2 py-1.5 text-stone-100"
          >
            {Array.from({ length: 18 }, (_, index) => {
              const hour = index + 6;
              return <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>;
            })}
          </select>
        </label>
      </div>
      <div className="rounded border border-stone-700/70 bg-stone-900/40 px-2.5 py-2 text-xs">
        <div className="flex items-center justify-between">
          <span>Current</span>
          <strong className="text-emerald-300">{getWorkScheduleLabel(current)} ({currentHours}h)</strong>
        </div>
        <p className="mt-1 text-stone-500">Allowed duration: {MIN_STANDARD_WORK_HOURS}–{MAX_STANDARD_WORK_HOURS} hours.</p>
      </div>
      <div className="rounded border border-stone-700/70 bg-stone-900/40 px-2.5 py-2 text-xs">
        <div className="flex items-center justify-between"><span>Preview</span><strong className="text-stone-200">{preview.expectedHours}h · {preview.affectedWorkplaces} workplaces</strong></div>
        <p className="mt-1 text-stone-400">{preview.assignedWorkers} assigned workers are affected. {preview.warning}</p>
      </div>
      <p className={`min-h-4 text-xs ${validation.ok ? 'text-emerald-300' : 'text-amber-300'}`}>
        {validation.ok ? `${validation.status === 'unchanged' ? 'Unchanged — no command will be sent.' : 'Accepted by bounds — ready to apply.'}` : `Blocked: ${validation.reason}`}
      </p>
      <button
        type="button"
        disabled={!validation.ok || (validation.schedule.startHour === current.startHour && validation.schedule.endHour === current.endHour)}
        onClick={() => {
          if (validation.ok) onApply(validation.schedule.startHour, validation.schedule.endHour);
        }}
        className="w-full rounded bg-emerald-700 px-3 py-2 font-semibold text-white enabled:hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Apply ordinary work hours
      </button>
      <div className="rounded border border-stone-700/70 bg-stone-900/40 px-2.5 py-2 text-xs">
        <div className="flex items-center justify-between"><span>Colony schedule fatigue</span><strong className={averageFatigue >= 60 ? 'text-red-300' : averageFatigue >= 25 ? 'text-amber-300' : 'text-emerald-300'}>{fatigueLabel} · {Math.round(averageFatigue)}%</strong></div>
        <p className="mt-1 text-stone-500">Longer shifts carry fatigue into the next day and can reduce staffed output. Rest and shorter shifts recover it.</p>
      </div>
      <p className="text-[11px] leading-relaxed text-stone-500">
        School, church, and Town Hall schedules remain fixed. Tavern and Hotel use the separate service windows below.
      </p>
    </div>
  );
}
