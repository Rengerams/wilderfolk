/**
 * Roadmap **U2/O2** — the shared action outcome.
 *
 * `U2`'s stated outcome is *"every blocked story choice gives a clear reason and remains available
 * until the player can act"*. The card staying open was already true (`respondToStoryEvent` re-queues
 * a refused answer); the missing half was the reason, which is what these cases pin.
 *
 * The gate itself stays with its owner, so this file asserts the **shaping** contract and the
 * **wiring**, not the tuning values: no case restates a cost (`Need 30🍖`), because a restated number
 * is exactly the duplication the campaign's audits keep finding. What is asserted instead is that a
 * blocked answer carries the owner's own text unchanged, that a gate which refuses without a reason
 * does not get an invented one, and that every answer the simulation can actually refuse reports
 * blocked while a free alternative beside it stays open (the negative control that keeps the table
 * from passing vacuously).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  // A colony that cannot pay any of the gated answers, which is the player-visible case U2 is about.
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
 * Every answer the simulation can refuse, with a free alternative beside it. The set is complete as
 * of 2026-09-20: `children_shelter` and `rumour_ledger` push their card back but their resolvers
 * never return false, so the four gated stories below are the whole refusing surface.
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
    // The wedding envoy gate is not about resources: it needs a living adult who can carry the
    // answer. A colony with no living settler therefore refuses it, and the outcome still has to
    // carry a reason — the U2 row asks for the missing "resource or condition".
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

function read(relativePath: string): string {
  // `ACTION_OUTCOME_ROOT` lets the red-before proof run this guard against a mirrored pre-fix tree
  // (`tmp/red-before-u2`) without touching `src/` — the `uiSingleOwner.test.ts` house pattern.
  const root = process.env.ACTION_OUTCOME_ROOT ?? process.cwd();
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('story card wiring (roadmap U2)', () => {
  const app = read('src/App.tsx');
  const storyCard = app.slice(app.indexOf('Signature story cards'), app.indexOf('Diplomacy event cards'));
  const diplomacyCard = app.slice(app.indexOf('Diplomacy event cards'), app.indexOf('Favorite citizen follow banner'));
  // Both cards render the one shared control (2026-09-20 audit, clone 2), so the *rendering* half of
  // these requirements lives in that component now while the *wiring* half stays in the card regions.
  // Asserting both halves keeps every original requirement: the card asks the owner, and a refused
  // answer is disabled and explained in visible text.
  const choiceButton = app.slice(app.indexOf('function GatedChoiceButton'));

  it('asks the story owner for eligibility instead of offering every answer', () => {
    // Pre-fix the story card rendered every choice as an enabled button with `title={choice.detail}`
    // and never consulted a gate, so an unaffordable answer looked clickable and refused in silence.
    expect(storyCard, 'the story card no longer asks the story owner').toContain(
      'getStoryChoiceEligibility(world, evt, choice.id)',
    );
    expect(storyCard, 'the story card stopped passing the gate verdict to the control').toContain(
      'blocked={blocked}',
    );
    expect(choiceButton, 'a blocked answer is offered again').toContain('disabled={blocked}');
    expect(storyCard, 'the pre-fix hint-only title is back').not.toContain('title={choice.detail}');
  });

  it('renders the owner refusal as visible text, not only as a hover title', () => {
    expect(storyCard, 'the card stopped passing the refusal to the control').toContain(
      'explanation={outcome.explanation}',
    );
    expect(
      choiceButton,
      'the refusal is hidden behind the title attribute again',
    ).toContain('{explanation && (');
    expect(diplomacyCard, 'the diplomacy card stopped using the shared outcome').toContain(
      'actionOutcomeFromGate(',
    );
    expect(diplomacyCard, 'the diplomacy card stopped passing the refusal to the control').toContain(
      'explanation={outcome.explanation}',
    );
  });
});
