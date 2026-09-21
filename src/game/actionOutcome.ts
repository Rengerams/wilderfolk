/**
 * One typed answer to "can the player do this right now?" (roadmap **O2** / **U2**).
 *
 * The gate itself always stays with its owner — this module only *shapes* the answer, so every card
 * and panel can render a refusal the same way and can carry a stable machine token beside the
 * owner's own wording. Two rules make it safe to put this in front of a refusal:
 *
 * - `explanation` is the owner's text **verbatim**. Nothing here re-words, re-orders, truncates or
 *   localises it, and nothing here invents a reason a gate did not give (`null` means "the owner
 *   said no without a reason", not "blocked for an unknown reason"). One source of truth per rule
 *   (`AGENTS.md` §5.2) — the message belongs to the owner that enforces it.
 * - `reasonCode` is derived from identifiers the event or choice already carries
 *   (`story.traveling_theatre.support_hospitality`), never from the message, so re-wording a refusal
 *   cannot change the code and a new choice cannot silently reuse an old one.
 *
 * The owner gates all share one shape — `{ ok: boolean; blockReason?: string }` — which is what
 * {@link actionOutcomeFromGate} converts.
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
