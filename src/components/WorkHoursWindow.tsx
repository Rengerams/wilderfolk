/**
 * Work & venue hours — its own window, not a section of the overview stack.
 * The body is an index plus the one editor it names; the editors and `GameWindow` are reused as-is.
 */
import { useState } from 'react';
import type { WorldState } from '../game/gameTypes';
import type { WorkforcePreset } from '../game/workforcePolicy';
import type { VenueScheduleKind } from '../game/venueSchedule';
import GameWindow from './GameWindow';
import WorkSchedulePanel from './WorkSchedulePanel';
import VenueSchedulePanel from './VenueSchedulePanel';
import WorkforcePolicyPanel from './WorkforcePolicyPanel';
import { useOverlayKeyboard } from '../hooks/useOverlayKeyboard';

/** Which of the three editors the window shows. */
type WorkHoursSubjectId = 'work' | 'venue' | 'workforce';

/**
 * The index, in the shape `SelectedEntityPanel` renders: one entry per subject, carrying
 * the glyph and hint for its editor, with the same id selecting the entry and the body.
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
  // `GameWindow` owns the focus half of the overlay contract; this hook supplies the keyboard half.
  useOverlayKeyboard('work-hours-window', onClose);

  return (
    // Modal, not an anchored side panel: it opens from the citizen overview dialog, and a window under
    // that dialog's backdrop is unreachable. `GameWindow` owns the stack and focus for that mode.
    <GameWindow title="Work & venue hours" icon="🕰️" onClose={onClose} centered maxBodyClassName="max-h-[70vh]">
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
        All three editors stay mounted with `hidden` rather than absent, so a pending hour
        choice in an unselected editor is not silently discarded.
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
