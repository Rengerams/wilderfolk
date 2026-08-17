import type { WorldState, StoryEvent } from './gameTypes';
import { TICKS_PER_DAY } from './dayCycle';
import { addBigNews, addNotification } from './simEffects';
import { logEvent } from './eventLog';

/**
 * Authored cross-system stories (v0.6.1+ "signature stories") — visible choices
 * that make existing systems remember, interpret, and react to one another.
 * A story is a short player choice with real sim consequences: ecology, food,
 * reputation, and a Chronicle-style entry. The valley keeps history.
 */

/** Clamp ecosystem health to 0..100. */
function eco(state: WorldState): number {
  return state.ecosystemHealth ?? 80;
}

function setEco(state: WorldState, value: number): void {
  state.ecosystemHealth = Math.max(0, Math.min(100, value));
}

function bumpRep(state: WorldState, amount: number): void {
  state.villageReputation = Math.max(0, state.villageReputation + amount);
}

/** Add a story event to the pending queue (no duplicate id). */
export function offerStoryEvent(state: WorldState, event: StoryEvent): void {
  state.pendingStoryEvents ??= [];
  if (state.pendingStoryEvents.some((e) => e.id === event.id)) return;
  state.pendingStoryEvents.push(event);
}

/** Drop expired unanswered stories — the moment passes quietly. */
export function tickPendingStoryEvents(state: WorldState): void {
  if (!state.pendingStoryEvents?.length) return;
  state.pendingStoryEvents = state.pendingStoryEvents.filter(
    (e) => state.tick < e.expiresAtTick,
  );
}

/**
 * Resolve a story choice (clones state like raid responses). Removes the event
 * and applies the chosen outcome plus a Chronicle-style memory.
 */
export function respondToStoryEvent(
  originalState: WorldState,
  eventId: string,
  choiceId: string,
): WorldState {
  const state = structuredClone(originalState);
  const idx = state.pendingStoryEvents?.findIndex((e) => e.id === eventId) ?? -1;
  if (idx < 0) return state;
  const event = state.pendingStoryEvents![idx];
  state.pendingStoryEvents = state.pendingStoryEvents!.filter((e) => e.id !== eventId);

  switch (event.storyKey) {
    case 'wolf_choice':
      resolveWolfChoice(state, choiceId);
      break;
    case 'valley_debate':
      resolveValleyDebate(state, choiceId);
      break;
  }
  return state;
}

// ---------------------------------------------------------------------------
// Story 1 — The pack watches (first-session ecological choice)
// ---------------------------------------------------------------------------

/** Offer always, once, somewhere in the first two months (year 0, days 0–59). */
export function maybeOfferWolfChoice(state: WorldState): void {
  if ((state.storyFlags?.wolf_choice ?? 0) > 0) return;
  if (state.year > 0 || state.dayInYear >= 60) return;

  state.storyFlags = { ...state.storyFlags, wolf_choice: state.tick };
  offerStoryEvent(state, {
    id: `wolf_choice_${state.tick}`,
    emoji: '🐺',
    storyKey: 'wolf_choice',
    title: 'The pack watches',
    description:
      'A wolf pack has been seen at the treeline near your fields — the same pack that keeps the deer honest. The elders disagree on what to do.',
    choices: [
      { id: 'thin_pack', label: 'Thin the pack', detail: 'A hunt for safety and meat — but the valley loses a guardian.' },
      { id: 'let_be', label: 'Let them be', detail: 'Trust the old way — the wolves keep the herd strong.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * 4,
  });
}

function resolveWolfChoice(state: WorldState, choiceId: string): void {
  if (choiceId === 'thin_pack') {
    setEco(state, eco(state) - 6);
    bumpRep(state, 2);
    addBigNews(
      state,
      '🐺 The pack thins',
      'Hunters took the first wolves at the treeline. The deer will grow bolder — and the elders shake their heads.',
      'negative',
    );
    addNotification(state, 'The pack thins', 'Ecology −6 · the valley remembers.', 'warning');
    logEvent(
      state,
      'event',
      `The first wolves fell to ${state.villageName} — the deer will grow bolder. The valley remembers the thinning.`,
      undefined,
    );
  } else {
    setEco(state, eco(state) + 4);
    addBigNews(
      state,
      '🐺 The pack stays',
      'You let the pack be. The deer stay honest and the valley keeps a guardian — an elder nods: “That is the old way.”',
      'positive',
    );
    addNotification(state, 'The pack stays', 'Ecology +4 · the old way holds.', 'success');
    logEvent(
      state,
      'event',
      `${state.villageName} let the first pack be — the deer stay honest, and the valley keeps its guardian.`,
      undefined,
    );
  }
}

// ---------------------------------------------------------------------------
// Story 2 — The valley's future (philosophical election debate)
// ---------------------------------------------------------------------------

/** Offer once per election season when candidates genuinely disagree. */
export function maybeOfferValleyDebate(state: WorldState, candidateNames: string[]): void {
  const flagKey = `valley_debate_${state.year}`;
  if ((state.storyFlags?.[flagKey] ?? 0) > 0) return;
  if (candidateNames.length < 2) return;

  state.storyFlags = { ...state.storyFlags, [flagKey]: state.tick };
  offerStoryEvent(state, {
    id: `valley_debate_${state.tick}`,
    emoji: '🗳️',
    storyKey: 'valley_debate',
    title: "The valley's future",
    description:
      `${candidateNames[0]} and ${candidateNames[1]} clash over what this settlement should become. `
      + 'Your answer shapes the term — and the valley.',
    choices: [
      { id: 'expansion', label: 'Grow outward', detail: 'Clear more land, build faster. The valley bends to the village.' },
      { id: 'preservation', label: 'Preserve the wild', detail: 'Build tight, spare the woods. The village bends to the valley.' },
      { id: 'predator_control', label: 'Secure the borders', detail: 'Walls and a steady cull — safety first, at nature’s cost.' },
      { id: 'festivals', label: 'Feast and celebrate', detail: 'Morale and festivals — a happy village, whatever the ledger says.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * 5,
  });
}

function resolveValleyDebate(state: WorldState, choiceId: string): void {
  switch (choiceId) {
    case 'expansion':
      setEco(state, eco(state) - 5);
      bumpRep(state, 2);
      addBigNews(state, '🏗️ The growth mandate', 'The election settled it: outward. New ground opens — and the woods edge back.', 'neutral');
      logEvent(state, 'event', `The ${state.year} election chose growth — the forest edge retreated and the ledger grew.`);
      break;
    case 'preservation':
      setEco(state, eco(state) + 5);
      addBigNews(state, '🌿 The preservation mandate', 'The election settled it: build tight, spare the wild. The valley keeps its breath.', 'positive');
      logEvent(state, 'event', `The ${state.year} election chose the wild — building slowed, and the valley kept its breath.`);
      break;
    case 'predator_control':
      setEco(state, eco(state) - 3);
      bumpRep(state, 1);
      addBigNews(state, '🛡️ The security mandate', 'The election settled it: walls and a steady cull. Settlers sleep safer — the deer know it.', 'neutral');
      logEvent(state, 'event', `The ${state.year} election chose security — the cull steadied, and the deer grew wary.`);
      break;
    default:
      bumpRep(state, 3);
      addBigNews(state, '🎉 The festival mandate', 'The election settled it: feast and celebrate. Morale soars — a happy village spends more.', 'positive');
      logEvent(state, 'event', `The ${state.year} election chose joy — the feasts ran long and the ledger noticed.`);
      break;
  }
}
