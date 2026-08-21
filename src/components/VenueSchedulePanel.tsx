import { useMemo, useState } from 'react';
import type { WorldState } from '../game/gameTypes';
import { getScheduleImpactPreview } from '../game/scheduleFeedback';
import {
  getVenueSchedule,
  getVenueScheduleLabel,
  getVenueScheduleHours,
  MIN_VENUE_SERVICE_HOURS,
  MAX_VENUE_SERVICE_HOURS,
  validateVenueSchedule,
  type VenueScheduleKind,
} from '../game/venueSchedule';

interface Props { state: WorldState; onApply: (venue: VenueScheduleKind, startHour: number, endHour: number) => void }

export default function VenueSchedulePanel({ state, onApply }: Props) {
  const [venue, setVenue] = useState<VenueScheduleKind>('tavern');
  const current = getVenueSchedule(state, venue);
  const [startHour, setStartHour] = useState(current.startHour);
  const [endHour, setEndHour] = useState(current.endHour);
  const validation = useMemo(() => validateVenueSchedule(startHour, endHour), [startHour, endHour]);
  const label = venue === 'tavern' ? 'Tavern' : 'Hotel';
  const preview = getScheduleImpactPreview(state, venue, getVenueScheduleHours(current), validation.ok ? getVenueScheduleHours(validation.schedule) : getVenueScheduleHours(current));
  const festivalStatus = venue === 'tavern' && state.festival?.active === true ? 'Festival override: Tavern remains open all day while the festival is active.' : 'No temporary override is active.';

  return (
    <div className="space-y-3 text-sm text-stone-300">
      <div>
        <p className="font-semibold text-stone-100">Hospitality service hours</p>
        <p className="mt-1 text-xs leading-relaxed text-stone-400">Set separate windows for Tavern and Hotel staff. Guests are not employees, and festivals can still keep the Tavern open all day.</p>
      </div>
      <div className="flex gap-1 rounded-lg bg-stone-900/60 p-1">
        {(['tavern', 'hotel'] as VenueScheduleKind[]).map((kind) => (
          <button key={kind} type="button" onClick={() => { setVenue(kind); const next = getVenueSchedule(state, kind); setStartHour(next.startHour); setEndHour(next.endHour); }} className={`flex-1 rounded px-2 py-1.5 text-xs font-bold ${venue === kind ? 'bg-stone-600 text-white' : 'text-stone-400 hover:text-stone-200'}`}>
            {kind === 'tavern' ? '🍻 Tavern' : '🏨 Hotel'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['Opens', 'Closes'] as const).map((labelText, index) => (
          <label key={labelText} className="text-xs text-stone-400">{labelText}
            <select value={index === 0 ? startHour : endHour} onChange={(event) => (index === 0 ? setStartHour(Number(event.target.value)) : setEndHour(Number(event.target.value)))} className="mt-1 w-full rounded border border-stone-600 bg-stone-900 px-2 py-1.5 text-stone-100">
              {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="rounded border border-stone-700/70 bg-stone-900/40 px-2.5 py-2 text-xs"><div className="flex items-center justify-between"><span>{label} current</span><strong className="text-emerald-300">{getVenueScheduleLabel(current)} ({getVenueScheduleHours(current)}h)</strong></div><p className="mt-1 text-stone-500">Allowed duration: {MIN_VENUE_SERVICE_HOURS}–{MAX_VENUE_SERVICE_HOURS} hours.</p></div>
      <div className="rounded border border-stone-700/70 bg-stone-900/40 px-2.5 py-2 text-xs"><div className="flex items-center justify-between"><span>Preview</span><strong className="text-stone-200">{preview.expectedHours}h · {preview.affectedWorkplaces} venues</strong></div><p className="mt-1 text-stone-400">{preview.assignedWorkers} assigned staff are affected. {preview.warning}</p><p className="mt-1 text-sky-300">{festivalStatus}</p></div>
      <p className={`min-h-4 text-xs ${validation.ok ? 'text-emerald-300' : 'text-amber-300'}`}>{validation.ok ? (validation.status === 'unchanged' ? 'Unchanged — no command will be sent.' : 'Accepted by bounds — ready to apply.') : `Blocked: ${validation.reason}`}</p>
      <button type="button" disabled={!validation.ok || (validation.schedule.startHour === current.startHour && validation.schedule.endHour === current.endHour)} onClick={() => { if (validation.ok) onApply(venue, validation.schedule.startHour, validation.schedule.endHour); }} className="w-full rounded bg-emerald-700 px-3 py-2 font-semibold text-white enabled:hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40">Apply {label.toLowerCase()} service hours</button>
    </div>
  );
}
