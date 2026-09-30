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
 */
import type { WorldState } from '../game/gameTypes';
import type { WorkforcePreset } from '../game/workforcePolicy';
import type { VenueScheduleKind } from '../game/venueSchedule';
import GameWindow from './GameWindow';
import WorkSchedulePanel from './WorkSchedulePanel';
import VenueSchedulePanel from './VenueSchedulePanel';
import WorkforcePolicyPanel from './WorkforcePolicyPanel';

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
  return (
    <GameWindow title="Work & venue hours" icon="🕰️" onClose={onClose} maxBodyClassName="max-h-[70vh]">
      <WorkSchedulePanel state={state} onApply={onApplyWorkSchedule} />
      <div className="my-3 border-t border-stone-700/60 pt-3">
        <VenueSchedulePanel state={state} onApply={onApplyVenueSchedule} />
      </div>
      <div className="my-3 border-t border-stone-700/60 pt-3">
        <WorkforcePolicyPanel state={state} onApply={onApplyWorkforcePolicy} />
      </div>
    </GameWindow>
  );
}
