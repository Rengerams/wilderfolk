import type { WorldState, StoryEvent } from './gameTypes';
import { BuildingType } from './gameTypes';
import { TICKS_PER_DAY, getColonyDay, getResidenceCapacity, isLeaderHouseResidence, isResidenceBuilding } from './dayCycle';
import { addBigNews, addNotification } from './simEffects';
import { addCappedResource } from './resourceUtils';
import { isPlayerHuman } from './playerHuman';
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
export function tickChildrenShelter(state: WorldState): void {
  const started = state.storyFlags?.children_shelter_started ?? 0;
  const until = state.storyFlags?.children_shelter_until ?? 0;
  if (started <= 0 || until <= 0 || state.tick < until) return;
  if ((state.storyFlags?.children_shelter_resolved ?? 0) > 0) return;

  const rival = state.rivalSettlements[0];
  state.storyFlags = { ...state.storyFlags, children_shelter_resolved: state.tick };
  if (!rival) return;

  const helped = (state.storyFlags?.children_shelter_helped ?? 0) === 1;
  if (helped) {
    rival.relationship = 'friendly';
    rival.peaceTreatyDays = Math.max(rival.peaceTreatyDays, 180);
    addBigNews(
      state,
      '🕊️ A clan remembers your shelter',
      `${rival.name} has taken the children home. Their elders answer your kindness with friendship — the valley has gained a new ally.`,
      'positive',
    );
    addNotification(state, `${rival.name} is now friendly`, 'The children returned safely after five days under your roofs.', 'success');
    logEvent(state, 'event', `${rival.name} became friendly after ${state.villageName} sheltered ten displaced children`, rival.name);
  } else {
    rival.relationship = 'tense';
    rival.peaceTreatyDays = 0;
    rival.raidCooldownDays = 0;
    addBigNews(
      state,
      '⚔️ A clan turns away',
      `${rival.name} has declared war after the children were turned away. The reason is only clear now: the valley refused their plea.`,
      'negative',
    );
    addNotification(state, `${rival.name} has declared war`, 'Their hostility was hidden until the children’s five-day journey ended.', 'warning');
    logEvent(state, 'event', `${rival.name} declared war after ${state.villageName} refused shelter to ten displaced children`, rival.name);
  }
}

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
    case 'welcome':
      resolveWelcome(state, choiceId);
      break;
    case 'wolf_choice':
      resolveWolfChoice(state, choiceId);
      break;
    case 'ranger_visit':
      resolveRangerVisit(state, choiceId);
      break;
    case 'grief_beat':
      resolveGriefBeat(state, choiceId);
      break;
    case 'howler_rumor':
      resolveHowlerRumor(state, choiceId);
      break;
    case 'winter_prep':
      if (choiceId === 'accept') {
        state.storyFlags = { ...state.storyFlags, winter_accepted: state.tick };
        addBigNews(state, '❄️ The test is set', 'Old Kaia marks the day — 120 wood and 180 food before the first freeze.', 'neutral');
      }
      break;
        case 'valley_debate':
      resolveValleyDebate(state, choiceId);
      break;
    case 'children_shelter': {
      const accepted = resolveChildrenShelter(state, choiceId);
      if (!accepted) {
        state.pendingStoryEvents ??= [];
        state.pendingStoryEvents.push(event);
      }
      break;
    }

  }
  return state;
}

// ---------------------------------------------------------------------------
// Story 0 — Ten children at the gate
// ---------------------------------------------------------------------------

/**
 * One-time request after colony day 10. The rival consequence is deliberately
 * not disclosed in the choices; it resolves only after five shelter days.
 */
export function maybeOfferChildrenShelter(state: WorldState): void {
  if ((state.storyFlags?.children_shelter_offered ?? 0) > 0) return;
  if (getColonyDay(state) < 10 || state.rivalSettlements.length === 0) return;

  state.storyFlags = { ...state.storyFlags, children_shelter_offered: state.tick };
  offerStoryEvent(state, {
    id: `children_shelter_${state.tick}`,
    emoji: '🧳',
    storyKey: 'children_shelter',
    title: 'Ten children at the gate',
    description: 'Ten frightened children arrive at the edge of the valley. They ask for shelter for five days while their people cross dangerous ground to bring them home.',
    choices: [
      { id: 'help', label: 'Open the houses', detail: 'Use available beds to shelter all ten children for five days.' },
      { id: 'refuse', label: 'Turn them away', detail: 'Keep the village’s beds and supplies for your own people.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * 3,
  });
}

function resolveChildrenShelter(state: WorldState, choiceId: string): boolean {
  if (choiceId === 'refuse') {
    state.storyFlags = { ...state.storyFlags, children_shelter_helped: 0, children_shelter_started: state.tick, children_shelter_until: state.tick + TICKS_PER_DAY * 5 };
    addNotification(state, 'The children leave', 'Their five-day journey continues beyond the valley.', 'warning');
    return true;
  }
  if (choiceId !== 'help') return true;

  const freeBeds = state.buildings
    .filter((building) => isResidenceBuilding(building) && !isLeaderHouseResidence(building) && building.faction !== 'rival')
    .reduce((total, building) => total + Math.max(0, getResidenceCapacity(building) - building.occupants.length), 0);
  if (freeBeds < 10) {
    addNotification(state, 'Not enough shelter', `Ten children need ten free beds; the village has only ${freeBeds}. No decision was made.`, 'warning');
    return false;
  }

  const shelterHouses = state.buildings.filter(
    (building) => isResidenceBuilding(building) && !isLeaderHouseResidence(building) && building.faction !== 'rival'
      && getResidenceCapacity(building) - building.occupants.length > 0,
  ).length;
  state.storyFlags = {
    ...state.storyFlags,
    children_shelter_helped: 1,
    children_shelter_started: state.tick,
    children_shelter_until: state.tick + TICKS_PER_DAY * 5,
    children_shelter_house_count: shelterHouses,
  };
  addBigNews(state, '🧳 Ten children find shelter', `The children are placed temporarily across ${shelterHouses} free ${shelterHouses === 1 ? 'house' : 'houses'} for five days. What follows is unknown.`, 'neutral');
  addNotification(state, 'Shelter provided', 'Ten children are safe for five days. The village will learn what this means when they return.', 'success');
  return true;
}

// ---------------------------------------------------------------------------
// Story 1 — The pack watches (first-session ecological choice)
// ---------------------------------------------------------------------------

/**
 * Offer once, as a gentle invitation: waits for the player to settle in (a
 * house plus a first practical job — the ~6–10 minute window), and guarantees
 * the moment by the end of the first two months (day 60) no matter what.
 */
export function maybeOfferWolfChoice(state: WorldState): void {
  if ((state.storyFlags?.wolf_choice ?? 0) > 0) return;
  if (state.year > 0) return;

  const hasHome = state.buildings.some(
    (b) => b.completed && b.type === BuildingType.House,
  );
  const startedWork = state.buildings.some(
    (b) => b.completed
      && (b.type === BuildingType.Farm
        || b.type === BuildingType.HuntingSpot
        || b.type === BuildingType.LumberMill),
  );
  if ((!hasHome || !startedWork) && state.dayInYear < 60) return;

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
  // The valley remembers — the ranger story reads this choice.
  state.storyFlags = {
    ...state.storyFlags,
    wolf_resolved: choiceId === 'thin_pack' ? 1 : 2,
    wolf_resolvedTick: state.tick,
  };
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
// Story 2 — The valley wakes (first-session welcome beat, day 0)
// ---------------------------------------------------------------------------

/** Offer once, on the very first day — sets the tone and the first course. */
export function maybeOfferWelcome(state: WorldState): void {
  if ((state.storyFlags?.welcome ?? 0) > 0) return;
  if (state.year > 0 || state.dayInYear >= 1) return;
  state.storyFlags = { ...state.storyFlags, welcome: state.tick };
  offerStoryEvent(state, {
    id: `welcome_${state.tick}`,
    emoji: '🌄',
    storyKey: 'welcome',
    title: 'The valley wakes',
    description:
      'Dawn over a valley that already has owners — deer, wolves, and a hundred quiet ways. The elders say: move in gently, or not at all. Where do you begin?',
    choices: [
      { id: 'listen_elders', label: 'Listen to the elders', detail: 'Start by watching the land — the valley remembers respect.' },
      { id: 'set_to_work', label: 'Set to work', detail: 'Start building at once — mouths to feed, roofs to raise.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY,
  });
}

function resolveWelcome(state: WorldState, choiceId: string): void {
  if (choiceId === 'listen_elders') {
    setEco(state, eco(state) + 2);
    addBigNews(state, '🌄 The elders nod', 'You began by watching the land. The valley remembers respect — and rewards it.', 'positive');
    logEvent(state, 'event', `${state.villageName} began by listening to the elders — the valley's first impression.`);
  } else {
    addCappedResource(state, 'wood', 5);
    addBigNews(state, '🔨 A fast start', 'You began at once — the first beams fall before noon. The valley watches.', 'neutral');
    logEvent(state, 'event', `${state.villageName} began at once — the first beams fell before noon.`);
  }
}

// ---------------------------------------------------------------------------
// Story 3 — The old ranger (remembers the wolf choice)
// ---------------------------------------------------------------------------

/** Offer a few days after the wolf choice resolves — the valley keeps memory. */
export function maybeOfferRangerVisit(state: WorldState): void {
  if ((state.storyFlags?.ranger_visit ?? 0) > 0) return;
  const resolved = state.storyFlags?.wolf_resolved;
  const resolvedTick = state.storyFlags?.wolf_resolvedTick ?? 0;
  if (resolved == null || state.tick < resolvedTick + TICKS_PER_DAY * 3) return;
  state.storyFlags = { ...state.storyFlags, ranger_visit: state.tick };
  const thin = resolved === 1;
  offerStoryEvent(state, {
    id: `ranger_${state.tick}`,
    emoji: '🧙',
    storyKey: 'ranger_visit',
    title: thin ? 'The ranger counts the pack' : 'The ranger nods',
    description: thin
      ? 'An old ranger walks the treeline, counting the missing. “Fewer wolves now. The deer will grow bold, and bold deer thin the fields. Balance is a debt.”'
      : 'An old ranger stops at your gate. “You let the pack be. That is the old way — the deer stay honest, and so does this valley.”',
    choices: [
      { id: 'acknowledge', label: '“I will remember.”', detail: 'The valley keeps its history — so will you.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * 5,
  });
}

function resolveRangerVisit(state: WorldState, choiceId: string): void {
  const thin = (state.storyFlags?.wolf_resolved ?? 0) === 1;
  if (choiceId === 'acknowledge') {
    if (thin) {
      setEco(state, eco(state) + 1); // a gesture toward the debt
      bumpRep(state, 1);
      addBigNews(state, '🧙 A debt acknowledged', 'The ranger leaves a single feather — “for the balance.” The valley keeps its ledger.', 'neutral');
      logEvent(state, 'event', `The ranger counted the pack after ${state.villageName} thinned it — a debt acknowledged.`);
    } else {
      bumpRep(state, 2);
      addBigNews(state, '🧙 The old way holds', 'The ranger leaves a single feather — “for the old way.” The valley keeps its ledger.', 'positive');
      logEvent(state, 'event', `The ranger honored ${state.villageName} for sparing the pack — the old way holds.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Story 4 — Old Kaia's winter test (first-year course-setting quest)
// ---------------------------------------------------------------------------

/** Offer mid first year: a goal with a real deadline — the first freeze. */
export function maybeOfferWinterPrep(state: WorldState): void {
  if ((state.storyFlags?.winter_prep ?? 0) > 0) return;
  if (state.year > 0 || state.dayInYear !== 210) return;
  state.storyFlags = { ...state.storyFlags, winter_prep: state.tick };
  offerStoryEvent(state, {
    id: `winter_prep_${state.tick}`,
    emoji: '❄️',
    storyKey: 'winter_prep',
    title: "Old Kaia's winter test",
    description:
      '“First freeze comes at day 260,” Old Kaia says. “A warm village needs 120 wood and a full larder — 180 food. Meet it, and I will tell the valley your name.”',
    choices: [
      { id: 'accept', label: 'Accept the test', detail: 'Stockpile 120 wood and 180 food before the first freeze.' },
      { id: 'decline', label: 'Decline', detail: "Rely on the guide's winter advice instead." },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * 10,
  });
}

/** Check the pact at the first freeze (day 260) — the valley remembers the result. */
export function tickWinterFreezeCheck(state: WorldState): void {
  if (state.year > 0 || state.dayInYear !== 260) return;
  if ((state.storyFlags?.winter_resolved ?? 0) > 0) return;
  const pact = state.storyFlags?.winter_prep ?? 0;
  const accepted = pact > 0 && (state.storyFlags?.winter_accepted ?? 0) > 0;
  state.storyFlags = { ...state.storyFlags, winter_resolved: state.tick };
  if (accepted && state.resources.wood >= 120 && state.resources.food >= 180) {
    bumpRep(state, 2);
    addBigNews(state, '❄️ The first freeze holds', 'The first freeze came — and the village was ready. Old Kaia tells the valley your name.', 'positive');
    logEvent(state, 'event', `${state.villageName} passed Old Kaia's first winter test — 120 wood, a full larder, and a name remembered.`);
  } else if (accepted) {
    bumpRep(state, -1);
    addBigNews(state, '❄️ A lean first freeze', 'The first freeze came early and the larder thin. Old Kaia says nothing — the valley remembers.', 'negative');
    logEvent(state, 'event', `${state.villageName} failed Old Kaia's first winter test — a lean freeze the valley remembers.`);
  }
}

// ---------------------------------------------------------------------------
// Story 5 — A household mourns (grief surfaces as a consequence)
// ---------------------------------------------------------------------------

/** Offer once in the first year, after a player settler with family is grieving. */
export function maybeOfferGriefBeat(state: WorldState): void {
  if ((state.storyFlags?.grief_beat ?? 0) > 0) return;
  if (state.year > 0) return;
  const mourner = state.entities.find(
    (e) => e.alive
      && isPlayerHuman(e)
      && (e.griefUntilTick ?? 0) > state.tick
      && ((e.childrenIds?.length ?? 0) > 0 || e.partnerId != null),
  );
  if (!mourner) return;
  state.storyFlags = { ...state.storyFlags, grief_beat: state.tick };
  offerStoryEvent(state, {
    id: `grief_${state.tick}`,
    emoji: '🕯️',
    storyKey: 'grief_beat',
    title: 'A household mourns',
    description:
      `${mourner.name} sits by the fire with the household — grief is a weight carried together, and what the lost one built now passes to kin.`,
    choices: [
      { id: 'comfort', label: 'Comfort them', detail: 'A quiet word — mourning settlers rest more, and the household holds.' },
      { id: 'space', label: 'Give them space', detail: 'Grief runs its own course — they will rejoin the village in their own time.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * 3,
  });
}

function resolveGriefBeat(state: WorldState, choiceId: string): void {
  const mourner = state.entities.find(
    (e) => e.alive && isPlayerHuman(e) && (e.griefUntilTick ?? 0) > state.tick,
  );
  if (choiceId === 'comfort') {
    if (mourner) mourner.energy = Math.min(mourner.maxEnergy, mourner.energy + 20);
    bumpRep(state, 1);
    addBigNews(state, '🕯️ The household holds', 'A quiet word by the fire — the mourning settler rests easier, and the village stands a little closer.', 'positive');
    logEvent(state, 'event', `${state.villageName} comforted a grieving household — grief carried together, not alone.`);
  } else {
    addNotification(state, 'Grief takes its course', 'The household mourns in its own time — they will rejoin the village soon.', 'info');
    logEvent(state, 'event', `${state.villageName} gave a grieving household space — grief runs its own course.`);
  }
}

// ---------------------------------------------------------------------------
// Story 6 — The ranger's tale (Moon Howlers introduced as a rumor)
// ---------------------------------------------------------------------------

/** Offer late in the first year, after the ranger visited — the pack mystery deepens. */
export function maybeOfferHowlerRumor(state: WorldState): void {
  if ((state.storyFlags?.howler_rumor ?? 0) > 0) return;
  if (state.year > 0) return;
  if ((state.storyFlags?.ranger_visit ?? 0) === 0) return;
  if (state.dayInYear < 180) return;
  state.storyFlags = { ...state.storyFlags, howler_rumor: state.tick };
  offerStoryEvent(state, {
    id: `howler_${state.tick}`,
    emoji: '🌕',
    storyKey: 'howler_rumor',
    title: "The ranger's tale",
    description:
      'The ranger returns with a strange tale: on full-moon nights, something walks the treeline on two legs and howls like a wolf. “Keep a priest near, and trust the moon less.”',
    choices: [
      { id: 'heed', label: 'Heed the warning', detail: 'The full moon will be watched — the Church gains weight in the village.' },
      { id: 'dismiss', label: "A hunter's tall tale", detail: 'Old stories — the village goes about its business.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * 5,
  });
}

function resolveHowlerRumor(state: WorldState, choiceId: string): void {
  if (choiceId === 'heed') {
    bumpRep(state, 1);
    addBigNews(state, '🌕 The moon is watched', 'The village heeds the ranger — priests keep watch on full-moon nights, and the treeline feels less certain.', 'neutral');
    logEvent(state, 'event', `${state.villageName} heeded the ranger's tale — the full moon will be watched.`);
  } else {
    addNotification(state, "A hunter's tale", 'The village shrugs off the ranger’s story — old tales for old folks.', 'info');
    logEvent(state, 'event', `${state.villageName} dismissed the ranger's tale — old stories for old folks.`);
  }
}

// ---------------------------------------------------------------------------
// Story 7 — The valley's future (philosophical election debate)
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
