import type { WorldState } from '../game/gameTypes';

type PendingRivalFate = NonNullable<WorldState['pendingRaidVictories']>[number];

interface RazeConfirmationProps {
  pending: PendingRivalFate;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Describe the saved rival fate without making or judging a simulation decision. */
export default function RazeConfirmation({ pending, onConfirm, onCancel }: RazeConfirmationProps) {
  return (
    <div role="group" aria-label="Confirm exterminating this village" className="space-y-2 rounded border border-rose-700/70 p-3">
      <p className="font-semibold text-stone-100">Do you want to exterminate this village?</p>
      <p className="text-sm text-stone-300">
        {pending.rivalName} — all {pending.enemySurvivors} surviving {pending.enemySurvivors === 1 ? 'inhabitant' : 'inhabitants'} will be killed. No one is released.
        This permanently removes the rival settlement from the current saved world and cancels its pending activities.
        Nearby settlements that witness the destruction may change their diplomatic attitude and future behavior.
      </p>
      <button type="button" className="mr-2 rounded bg-rose-900 px-3 py-2" onClick={onConfirm}>Yes — exterminate village</button>
      <button type="button" className="rounded bg-stone-700 px-3 py-2" onClick={onCancel}>No — spare the village</button>
    </div>
  );
}
