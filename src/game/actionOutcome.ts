/**
 * Shapes the answer to "can the player do this right now?"; the gate stays with its owner.
 * `explanation` is the owner's verbatim refusal and `reasonCode` derives from identifiers, never text.
 */

export type ActionOutcomeKind = 'accepted' | 'blocked';

export interface ActionOutcome {
  kind: ActionOutcomeKind;
  /** Stable token for the gate that refused: `<domain>.<subject>.<choice>`. `null` when accepted. */
  reasonCode: string | null;
  /** The owner's refusal text, verbatim. `null` when accepted, or when the gate gave no reason. */
  explanation: string | null;
}

/** The accepted answer, shared so a caller has one value to compare against. */
export const ACTION_ACCEPTED: ActionOutcome = {
  kind: 'accepted',
  reasonCode: null,
  explanation: null,
};

/** Convert one owner gate into the shared outcome, without touching its message. */
export function actionOutcomeFromGate(
  gate: { ok: boolean; blockReason?: string },
  reasonCode: string,
): ActionOutcome {
  if (gate.ok) return ACTION_ACCEPTED;
  return { kind: 'blocked', reasonCode, explanation: gate.blockReason ?? null };
}

/** Reason code for a story choice, from the identifiers the event already carries. */
export function storyChoiceReasonCode(storyKey: string, choiceId: string): string {
  return `story.${storyKey}.${choiceId}`;
}

/** Reason code for a diplomacy answer, from the event kind and the chosen answer. */
export function diplomacyChoiceReasonCode(kind: string, choiceId: string): string {
  return `diplomacy.${kind}.${choiceId}`;
}
