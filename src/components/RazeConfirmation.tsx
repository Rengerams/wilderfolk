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
    <div role="group" aria-label="Confirm razing this settlement" className="space-y-2 rounded border border-rose-700/70 p-3">
      <p className="font-semibold text-stone-100">Raze {pending.rivalName}?</p>
      <p className="text-sm text-stone-300">
        This permanently removes the rival settlement from the current saved world and cancels its pending activities.
        Its {pending.enemySurvivors} surviving {pending.enemySurvivors === 1 ? 'inhabitant is' : 'inhabitants are'} recorded as displaced, not killed by this decision.
        Nearby settlements that witness the destruction may change their diplomatic attitude and future behavior.
      </p>
      <button type="button" className="mr-2 rounded bg-rose-900 px-3 py-2" onClick={onConfirm}>Confirm raze</button>
      <button type="button" className="rounded bg-stone-700 px-3 py-2" onClick={onCancel}>Cancel</button>
    </div>
  );
}
