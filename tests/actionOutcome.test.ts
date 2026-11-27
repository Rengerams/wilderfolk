/**
 * The shaping and wiring of the shared action outcome: a blocked answer carries the owner's own text
 * unchanged, and a gate that refuses without a reason never gets an invented one.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { getStoryChoiceEligibility } from '../src/game/storyEvents';
import {
  ACTION_ACCEPTED,
  actionOutcomeFromGate,
  diplomacyChoiceReasonCode,
  storyChoiceReasonCode,
} from '../src/game/actionOutcome';
import type { StoryEvent, WorldState } from '../src/game/gameTypes';
import { EntityType } from '../src/game/gameTypes';

let starved: WorldState;

beforeAll(() => {
  starved = initGame({ seed: 4242 });
  // A colony that cannot pay any of the gated answers — the player-visible refusal case.
  starved.resources = { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 };
});

/** `getStoryChoiceEligibility` dispatches on `storyKey` alone, so the rest of the card is filler. */
function storyEvent(storyKey: StoryEvent['storyKey']): StoryEvent {
  return {
    id: `test-${storyKey}`,
    emoji: '🎭',
    title: 'Test card',
    description: 'Test card',
    choices: [],
    createdAtTick: 0,
    expiresAtTick: Number.MAX_SAFE_INTEGER,
    storyKey,
  };
}

/**
 * Every answer the simulation can refuse, with a free alternative beside it: the four gated stories
 * below are the whole refusing surface — `children_shelter` and `rumour_ledger` never return false.
 */
const GATED_ANSWERS: ReadonlyArray<{
  storyKey: StoryEvent['storyKey'];
  choiceId: string;
  free: string;
}> = [
  { storyKey: 'traveling_theatre', choiceId: 'support_hospitality', free: 'support_improvise' },
  { storyKey: 'traveling_theatre', choiceId: 'support_venue', free: 'support_improvise' },
  { storyKey: 'deer_parliament', choiceId: 'preserve', free: 'reduce_hunting' },
  { storyKey: 'deer_parliament', choiceId: 'symbolic_treaty', free: 'reduce_hunting' },
  { storyKey: 'wedding_diplomacy', choiceId: 'gift_practical', free: 'decline' },
  { storyKey: 'wedding_diplomacy', choiceId: 'gift_impressive', free: 'decline' },
  { storyKey: 'wedding_diplomacy', choiceId: 'host_feast', free: 'decline' },
  { storyKey: 'wedding_diplomacy', choiceId: 'send_delegation', free: 'decline' },
  { storyKey: 'invention_fair', choiceId: 'fund_gate', free: 'keep' },
];

describe('action outcome (roadmap U2/O2)', () => {
  it('reports an accepted gate as accepted, with no code and no text of its own', () => {
    const outcome = actionOutcomeFromGate({ ok: true }, 'story.welcome.accept');

    expect(outcome).toBe(ACTION_ACCEPTED);
    expect(outcome.kind).toBe('accepted');
    expect(outcome.reasonCode).toBeNull();
    expect(outcome.explanation).toBeNull();
  });

  it("carries the owner's refusal text verbatim — the adapter never re-words it", () => {
    const reason = 'Need 30🍖';
    const outcome = actionOutcomeFromGate({ ok: false, blockReason: reason }, 'story.x.y');

    expect(outcome.kind).toBe('blocked');
    expect(outcome.explanation).toBe(reason);
    expect(outcome.reasonCode).toBe('story.x.y');
  });

  it('leaves the explanation null when the gate refuses without a reason, rather than inventing one', () => {
    const outcome = actionOutcomeFromGate({ ok: false }, 'story.x.y');

    expect(outcome.kind).toBe('blocked');
    expect(outcome.explanation).toBeNull();
  });

  it('derives namespaced reason codes from identifiers the event already carries', () => {
    expect(storyChoiceReasonCode('traveling_theatre', 'support_venue')).toBe(
      'story.traveling_theatre.support_venue',
    );
    expect(diplomacyChoiceReasonCode('border_dispute', 'militia')).toBe(
      'diplomacy.border_dispute.militia',
    );
  });

  it.each(GATED_ANSWERS)(
    'blocks $storyKey/$choiceId with the owner reason while $free stays open',
    ({ storyKey, choiceId, free }) => {
      const event = storyEvent(storyKey);

      const blocked = actionOutcomeFromGate(
        getStoryChoiceEligibility(starved, event, choiceId),
        storyChoiceReasonCode(storyKey, choiceId),
      );
      expect(blocked.kind).toBe('blocked');
      expect(blocked.reasonCode).toBe(`story.${storyKey}.${choiceId}`);
      expect(blocked.explanation).toBeTruthy();

      // The negative control: the card still offers an answer the player can take right now.
      const open = actionOutcomeFromGate(
        getStoryChoiceEligibility(starved, event, free),
        storyChoiceReasonCode(storyKey, free),
      );
      expect(open.kind).toBe('accepted');
    },
  );

  it('blocks an answer refused for a condition rather than a cost, and still explains it', () => {
    // The wedding envoy gate needs a living adult who can carry the answer, not resources, and the
    // refusal still has to explain itself.
    const noAdults = initGame({ seed: 4242 });
    for (const entity of noAdults.entities) {
      if (entity.type === EntityType.Human) entity.alive = false;
    }

    const outcome = actionOutcomeFromGate(
      getStoryChoiceEligibility(noAdults, storyEvent('wedding_diplomacy'), 'envoy'),
      storyChoiceReasonCode('wedding_diplomacy', 'envoy'),
    );

    expect(outcome.kind).toBe('blocked');
    expect(outcome.explanation).toBeTruthy();
    expect(outcome.reasonCode).toBe('story.wedding_diplomacy.envoy');
  });
});

