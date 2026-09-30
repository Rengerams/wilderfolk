/**
 * Work & venue hours — its own window, not a section of the overview stack.
 *
 * Owner ruling, 2026-09-29: *"each subject should just have its own window not stacking up"*. These
 * editors used to live inside `CitizenOverviewScreen`, reachable only through Overview → Village,
 * below the Village panel's own content — so the owner's report *"i cannot change work times the
 * butotn to apply doesn work"* was filed against a control that was hard to reach in the first place.
 *
 * The three editors are unchanged owner-owned panels (`WorkSchedulePanel`, `VenueSchedulePanel`,
 * `WorkforcePolicyPanel`); this window only gives them somewhere to live. It adds no rule and no
 * second copy of one — routing it into a `GameWindow` is the whole change, which is why the Apply
 * button's behaviour is identical to before and the `GameWindow` shell is what gets reused.
 *
 * The body is an index plus the one editor it names, not the three editors stacked: the same
 * index-and-subject shape `SelectedEntityPanel` and `VillageTabPanel` use.
 */
import { useState } from 'react';
import type { WorldState } from '../game/gameTypes';
import type { WorkforcePreset } from '../game/workforcePolicy';
import type { VenueScheduleKind } from '../game/venueSchedule';
import GameWindow from './GameWindow';
import WorkSchedulePanel from './WorkSchedulePanel';
import VenueSchedulePanel from './VenueSchedulePanel';
import WorkforcePolicyPanel from './WorkforcePolicyPanel';

/** Which of the three editors the window shows. */
type WorkHoursSubjectId = 'work' | 'venue' | 'workforce';

/**
 * The index, in the shape `SelectedEntityPanel` renders: one entry per subject, carrying the glyph
 * for its editor and the line that says what that editor answers. The entry and the editor behind it
 * cannot drift, because the same id selects the entry and the body.
 */
const WORK_HOURS_SUBJECTS: ReadonlyArray<{
  id: WorkHoursSubjectId;
  icon: string;
  label: string;
  hint: string;
}> = [
  { id: 'work', icon: '🕰️', label: 'Work hours', hint: 'Ordinary weekday window for workplaces and construction' },
  { id: 'venue', icon: '🍻', label: 'Venue hours', hint: 'Separate service windows for the Tavern and the Hotel' },
  { id: 'workforce', icon: '⚒️', label: 'Workforce policy', hint: 'Which workplace receives the next idle settler' },
];

export interface WorkHoursWindowProps {
  state: WorldState;
  onApplyWorkSchedule: (startHour: number, endHour: number) => void;
  onApplyVenueSchedule: (venue: VenueScheduleKind, startHour: number, endHour: number) => void;
  onApplyWorkforcePolicy: (preset: WorkforcePreset) => void;
  onClose: () => void;
}

export default function WorkHoursWindow({
  state,
  onApplyWorkSchedule,
  onApplyVenueSchedule,
  onApplyWorkforcePolicy,
  onClose,
}: WorkHoursWindowProps) {
  const [subject, setSubject] = useState<WorkHoursSubjectId>('work');

  return (
    <GameWindow title="Work & venue hours" icon="🕰️" onClose={onClose} maxBodyClassName="max-h-[70vh]">
      <div className="space-y-1">
        {WORK_HOURS_SUBJECTS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setSubject(entry.id)}
            aria-current={subject === entry.id}
            className={`block w-full rounded-lg px-2 py-1.5 text-left ring-1 transition-colors ${
              subject === entry.id
                ? 'bg-amber-900/50 ring-amber-500/50'
                : 'bg-stone-800/60 ring-stone-600/40 hover:bg-stone-700/60'
            }`}
          >
            <span className="flex items-center gap-1 text-[12px] font-bold text-amber-100">
              <span aria-hidden>{entry.icon}</span>
              {entry.label}
            </span>
            <span className="block text-[10px] leading-snug text-stone-400">{entry.hint}</span>
          </button>
        ))}
      </div>
      {/*
        All three editors stay mounted, as they were when they were stacked, and the hidden ones are
        `hidden` rather than absent: an editor's hour selects hold a pending choice, and switching
        subject must not silently discard it. Only the selected editor is visible.
      */}
      <div className="mt-3">
        <div className={subject === 'work' ? 'block' : 'hidden'}>
          <WorkSchedulePanel state={state} onApply={onApplyWorkSchedule} />
        </div>
        <div className={subject === 'venue' ? 'block' : 'hidden'}>
          <VenueSchedulePanel state={state} onApply={onApplyVenueSchedule} />
        </div>
        <div className={subject === 'workforce' ? 'block' : 'hidden'}>
          <WorkforcePolicyPanel state={state} onApply={onApplyWorkforcePolicy} />
        </div>
      </div>
    </GameWindow>
  );
}
