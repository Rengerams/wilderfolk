import { useMemo, useState } from 'react';
import type { WorldState } from '../game/gameTypes';
import { readVillageFatigue } from '../game/dailyScheduleFatigue';
import { getScheduleImpactPreview } from '../game/scheduleFeedback';
import {
  getWorkSchedule,
  getWorkScheduleHours,
  getWorkScheduleLabel,
  validateWorkSchedule,
} from '../game/workSchedule';

interface Props {
  state: WorldState;
  onApply: (startHour: number, endHour: number) => void;
}

/** The day's 24 whole hours — the domain both schedule selects offer. */
const HOURS_IN_DAY = 24;

/** One hour picker. Opens and Closes were two identical 24-option `<select>` blocks, so the hour
 * format and the domain had to be changed twice. */
function HourSelect({
  label,
  hour,
  onChange,
}: {
  label: string;
  hour: number;
  onChange: (hour: number) => void;
}) {
  return (
    <label className="text-xs text-stone-400">
      {label}
      <select
        value={hour}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full rounded border border-stone-600 bg-stone-900 px-2 py-1.5 text-stone-100"
      >
        {Array.from({ length: HOURS_IN_DAY }, (_, value) => (
          <option key={value} value={value}>
            {String(value).padStart(2, '0')}:00
          </option>
        ))}
      </select>
    </label>
  );
}

export default function WorkSchedulePanel({ state, onApply }: Props) {
  const current = getWorkSchedule(state);
  const [startHour, setStartHour] = useState(current.startHour);
  const [endHour, setEndHour] = useState(current.endHour);

  // `current` is rebuilt every render (the WorldState prop is mutated in place), so this is
  // derived each render rather than memoized on a value React cannot track — the same rule the
  // window preview below follows.
  const validation = validateWorkSchedule(startHour, endHour, {
    startHour: current.startHour,
    endHour: current.endHour,
  });
  const currentHours = getWorkScheduleHours(current);
  
  // The mean and its band are the fatigue owner's (`readVillageFatigue`): the panel used to average
  // `scheduleFatigue` and band it at 60/25 itself, so the thresholds were tunable only in this view.
  const fatigue = useMemo(() => readVillageFatigue(state), [state]);
  const fatigueLabel = fatigue.label;
  const outputPercent = Math.round(fatigue.outputShare * 100);
  
  // Preview the impact of the currently chosen window. The WorldState prop is
  // mutated in place by the sim, so the preview is derived each render instead
  // of memoized on a mutable object.
  const previewHours = validation.ok ? getWorkScheduleHours(validation.schedule) : currentHours;
  const preview = getScheduleImpactPreview(state, 'ordinary', currentHours, previewHours);

  // Drives both the message and the disabled Apply button, so "Unchanged" can never sit
  // next to an enabled button (the validation now reports `'unchanged'` itself).
  const isUnchanged = validation.ok && validation.status === 'unchanged';

  const isApplyDisabled = !validation.ok || isUnchanged;

  const handleApply = () => {
    if (validation.ok) {
      onApply(validation.schedule.startHour, validation.schedule.endHour);
    }
  };

  return (
    <div className="space-y-3 text-sm text-stone-300">
      <div>
        <p className="font-semibold text-stone-100">Ordinary weekday work</p>
        <p className="mt-1 text-xs leading-relaxed text-stone-400">
          Set one global, non-wrapping window for ordinary workplaces and construction. Weekends remain free.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <HourSelect label="Opens" hour={startHour} onChange={setStartHour} />
        <HourSelect label="Closes" hour={endHour} onChange={setEndHour} />
      </div>
      <div className="rounded border border-stone-700/70 bg-stone-900/40 px-2.5 py-2 text-xs">
        <div className="flex items-center justify-between">
          <span>Current</span>
          <strong className="text-emerald-300">{getWorkScheduleLabel(current)} ({currentHours}h)</strong>
        </div>
        <p className="mt-1 text-stone-500">Any length from 1 to 23 hours — no minimum or maximum.</p>
      </div>
      <div className="rounded border border-stone-700/70 bg-stone-900/40 px-2.5 py-2 text-xs">
        <div className="flex items-center justify-between">
          <span>Preview</span>
          <strong className="text-stone-200">{preview.expectedHours}h · {preview.affectedWorkplaces} workplaces</strong>
        </div>
        <p className="mt-1 text-stone-400">
          {preview.assignedWorkers} assigned workers are affected. {preview.warning}
        </p>
      </div>
      <p className={`min-h-4 text-xs ${validation.ok ? 'text-emerald-300' : 'text-amber-300'}`}>
        {validation.ok
          ? validation.status === 'unchanged'
            ? 'Unchanged — no command will be sent.'
            : 'Accepted by bounds — ready to apply.'
          : `Blocked: ${validation.reason}`}
      </p>
      <button
        type="button"
        disabled={isApplyDisabled}
        onClick={handleApply}
        className="w-full rounded bg-emerald-700 px-3 py-2 font-semibold text-white enabled:hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Apply ordinary work hours
      </button>
      <div className="rounded border border-stone-700/70 bg-stone-900/40 px-2.5 py-2 text-xs">
        <div className="flex items-center justify-between">
          <span>Crew work output</span>
          <strong
            className={
              // The tone follows the owner's band label, so the colour and the word beside it cannot
              // disagree about the same reading.
              fatigueLabel === 'high'
                ? 'text-red-300'
                : fatigueLabel === 'building'
                  ? 'text-amber-300'
                  : 'text-emerald-300'
            }
          >
            {outputPercent}%
          </strong>
        </div>
        <p className="mt-1 text-stone-500">
          Longer shifts cut into tomorrow's output. Rest and shorter shifts bring it back.
        </p>
      </div>
      <p className="text-[11px] leading-relaxed text-stone-500">
        School, church, and Town Hall schedules remain fixed. Tavern and Hotel use the separate service windows below.
      </p>
    </div>
  );
}