import type { WorldState, StoryEvent } from './gameTypes';
import { BuildingType } from './gameTypes';
import { TICKS_PER_DAY, getColonyDay } from './dayCycle';
import { getResidenceCapacity, isLeaderHouseResidence, isResidenceBuilding } from './housingModel';
import { displayYear } from './dayCycleClock';
import { addBigNews, addNotification } from './simEffects';
import { addCappedResource } from './resourceUtils';
import { spendFood } from './economyLedger';
import { isPlayerHuman } from './playerHuman';
import { adjustHumanStaminaFromEnergy } from './simulation/humanPhysiology';
import { logEvent } from './eventLog';
import { Human } from './gameConstants';
import { expireDeerParliament, getDeerParliamentChoiceEligibility, resolveDeerParliament } from './deerParliament';
import { expireTravelingTheatre, getTravelingTheatreChoiceEligibility, resolveTravelingTheatre } from './travelingTheatre';
import { expireWeddingDiplomacy, getWeddingDiplomacyChoiceEligibility, resolveWeddingDiplomacy } from './weddingDiplomacy';
import { getInventionFairChoiceEligibility, resolveInventionFair } from './inventionFair';
import { expireRumourLedger, resolveRumourLedger } from './rumourLedger';
import { addReputation } from './simHelpers';
import { adjustEcosystemHealth } from './dailyEcology';

/**
 * Authored cross-system stories: short player choices with real sim consequences and a chronicle
 * entry, so existing systems remember and react to one another.
 */

/** Add a story event to the pending queue (no duplicate id). */
export function offerStoryEvent(state: WorldState, event: StoryEvent): void {
  state.pendingStoryEvents ??= [];
  if (state.pendingStoryEvents.some((e) => e.id === event.id)) return;
  state.pendingStoryEvents.push(event);
}

const CHILDREN_SHELTER_CHILDREN = 10;
/** Children consume the canonical daily human ration. */
const CHILDREN_SHELTER_FOOD_PER_DAY = CHILDREN_SHELTER_CHILDREN * Human.DAILY_FOOD_CONSUMPTION;

function countFreeShelterBeds(state: WorldState): number {
  return state.buildings
    .filter((building) => isResidenceBuilding(building) && !isLeaderHouseResidence(building) && building.faction !== 'rival')
    .reduce((total, building) => total + Math.max(0, getResidenceCapacity(building) - building.occupants.length), 0);
}

function failChildrenShelter(state: WorldState, reason: 'not enough shelter' | 'not enough food'): void {
  state.storyFlags = { ...state.storyFlags, children_shelter_resolved: state.tick, children_shelter_failed: 1 };
  addReputation(state, -4);
  const rival = state.rivalSettlements[0];
  if (rival) {
    rival.relationship = 'tense';
    rival.peaceTreatyDays = 0;
    rival.raidCooldownDays = 0;
  }
  const message = reason === 'not enough shelter'
    ? 'There were not enough roofs to keep the ten children safe.'
    : 'The village could not feed the ten children.';
  addBigNews(state, '🕯️ The children did not survive', `${message} The quest has failed.`, 'negative');
  addNotification(
    state,
    'Quest failed',
    reason === 'not enough shelter' ? 'The children froze without shelter.' : 'The children starved without food.',
    'warning',
  );
  logEvent(
    state,
    'event',
    reason === 'not enough shelter'
      ? 'Ten sheltered children died because the village lacked beds'
      : 'Ten sheltered children died because the village lacked food',
    undefined,
  );
}

export function tickChildrenShelter(state: WorldState): void {
  const started = state.storyFlags?.children_shelter_started ?? 0;
  const until = state.storyFlags?.children_shelter_until ?? 0;
  if (started <= 0 || until <= 0) return;
  if ((state.storyFlags?.children_shelter_resolved ?? 0) > 0) return;

  const helped = (state.storyFlags?.children_shelter_helped ?? 0) === 1;

  // Daily feeding + shelter-capacity check while the children are here.
  if (helped && state.tick < until) {
    const dayIndex = Math.floor((state.tick - started) / TICKS_PER_DAY);
    if ((state.storyFlags?.children_shelter_last_fed_day ?? -1) < dayIndex) {
      if (countFreeShelterBeds(state) < CHILDREN_SHELTER_CHILDREN) {
        failChildrenShelter(state, 'not enough shelter');
        return;
      }
      if (state.resources.food < CHILDREN_SHELTER_FOOD_PER_DAY) {
        failChildrenShelter(state, 'not enough food');
        return;
      }
      spendFood(state, 'shelter', CHILDREN_SHELTER_FOOD_PER_DAY);
      state.storyFlags = { ...state.storyFlags, children_shelter_last_fed_day: dayIndex };
    }
    return;
  }

  if (state.tick < until) return;

  const rival = state.rivalSettlements[0];
  state.storyFlags = { ...state.storyFlags, children_shelter_resolved: state.tick };
  if (!rival) return;

  const failed = (state.storyFlags?.children_shelter_failed ?? 0) === 1;
  if (helped && !failed) {
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
      `${rival.name} has declared war after the children were ${failed ? 'lost' : 'turned away'}. The reason is only clear now.`,
      'negative',
    );
    addNotification(
      state,
      `${rival.name} has declared war`,
      failed
        ? 'Their children were under your care and did not survive.'
        : 'Their hostility was hidden until the children’s five-day journey ended.',
      'warning',
    );
    logEvent(
      state,
      'event',
      failed
        ? `${rival.name} declared war after ${state.villageName} failed to protect ten displaced children`
        : `${rival.name} declared war after ${state.villageName} refused shelter to ten displaced children`,
      rival.name,
    );
  }
}

/**
 * Drops expired unanswered stories through one contract: the story that offered the card must resolve
 * its own chain, so a lapsed offer can never strand a later stage or the guided campaign.
 */
export type StoryExpiryResolver = (state: WorldState) => void;

/**
 * Keyed dispatch from the card queue to each story's owner-supplied resolver; the resolver and the
 * flags it writes stay in the owning module. Chainless cards (welcome, grief, debate, howler) pass.
 */
const STORY_EXPIRY_RESOLVERS: Partial<Record<StoryEvent['storyKey'], StoryExpiryResolver>> = {
  children_shelter: expireChildrenShelter,
  winter_prep: expireWinterPrep,
  wolf_choice: expireWolfChoice,
  ranger_visit: expireRangerVisit,
  deer_parliament: expireDeerParliament,
  traveling_theatre: expireTravelingTheatre,
  wedding_diplomacy: expireWeddingDiplomacy,
  rumour_ledger: expireRumourLedger,
};

export function tickPendingStoryEvents(state: WorldState): void {
  if (!state.pendingStoryEvents?.length) return;
  const expired = state.pendingStoryEvents.filter((event) => state.tick >= event.expiresAtTick);
  if (expired.length === 0) return;
  // Drop first so a resolver can never resurrect the card it is closing.
  state.pendingStoryEvents = state.pendingStoryEvents.filter((event) => state.tick < event.expiresAtTick);
  for (const event of expired) {
    STORY_EXPIRY_RESOLVERS[event.storyKey]?.(state);
  }
}

/**
 * Resolve a story choice (clones state like raid responses). Removes the event
 * and applies the chosen outcome plus a Chronicle-style memory.
 */
/**
 * Whether `respondToStoryEvent` would accept this answer right now. A refused answer is re-queued,
 * so a cadence-driven consumer would re-propose it forever; ungated stories always answer `ok`.
 */
export function getStoryChoiceEligibility(
  state: WorldState,
  event: StoryEvent,
  choiceId: string,
): { ok: boolean; blockReason?: string } {
  switch (event.storyKey) {
    case 'traveling_theatre':
      return getTravelingTheatreChoiceEligibility(state, choiceId);
    case 'deer_parliament':
      return getDeerParliamentChoiceEligibility(state, choiceId);
    case 'wedding_diplomacy':
      return getWeddingDiplomacyChoiceEligibility(state, choiceId);
    case 'invention_fair':
      return getInventionFairChoiceEligibility(state, choiceId, event.id);
    default:
      return { ok: true };
  }
}

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
    case 'traveling_theatre': {
      if (!resolveTravelingTheatre(state, choiceId)) {
        state.pendingStoryEvents ??= [];
        state.pendingStoryEvents.push(event);
      }
      break;
    }
    case 'deer_parliament': {
      if (!resolveDeerParliament(state, choiceId)) {
        state.pendingStoryEvents ??= [];
        state.pendingStoryEvents.push(event);
      }
      break;
    }
    case 'wedding_diplomacy': {
      if (!resolveWeddingDiplomacy(state, choiceId)) {
        state.pendingStoryEvents ??= [];
        state.pendingStoryEvents.push(event);
      }
      break;
    }
    case 'invention_fair': {
      const accepted = resolveInventionFair(state, choiceId, event.id);
      if (!accepted) {
        state.pendingStoryEvents ??= [];
        state.pendingStoryEvents.push(event);
      }
      break;
    }
    case 'rumour_ledger': {
      if (!resolveRumourLedger(state, choiceId)) {
        state.pendingStoryEvents ??= [];
        state.pendingStoryEvents.push(event);
      }
      break;
    }

  }
  return state;
}

// Story 0 — Ten children at the gate

/**
 * One-time request after colony day 10; the rival consequence resolves only after five shelter days.
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
      { id: 'help', label: 'Open the houses', detail: 'Shelter and feed all ten children for five days.' },
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
  addBigNews(state, '🧳 Ten children find shelter', `The children are taken in for five days. The village must shelter and feed them — ${shelterHouses} free ${shelterHouses === 1 ? 'house has' : 'houses have'} room now.`, 'neutral');
  addNotification(state, 'Shelter accepted', 'Ten children are under your care for five days. They must be sheltered and fed every day.', 'success');
  return true;
}

/**
 * An unanswered request means the children were turned away. Start the same five-day chain as an
 * explicit refusal so the rival consequence still resolves; never the friendly outcome.
 */
function expireChildrenShelter(state: WorldState): void {
  if ((state.storyFlags?.children_shelter_resolved ?? 0) > 0) return;
  if ((state.storyFlags?.children_shelter_started ?? 0) > 0) return;
  if ((state.storyFlags?.children_shelter_offered ?? 0) <= 0) return;
  resolveChildrenShelter(state, 'refuse');
}

// Story 1 — The pack watches (first-session ecological choice)

/** Stored fate of the wolf choice; 3 means the card lapsed without an answer. */
const WOLF_FATE_THINNED = 1;
const WOLF_FATE_SPARED = 2;
const WOLF_FATE_UNDECIDED = 3;

/**
 * Offer once, as a gentle invitation: waits for a house plus a first practical job, and guarantees
 * the moment by day 60.
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
  if ((state.storyFlags?.wolf_resolved ?? 0) > 0) return;
  // The valley remembers — the ranger story reads this choice.
  state.storyFlags = {
    ...state.storyFlags,
    wolf_resolved: choiceId === 'thin_pack' ? WOLF_FATE_THINNED : WOLF_FATE_SPARED,
    wolf_resolvedTick: state.tick,
  };
  if (choiceId === 'thin_pack') {
    adjustEcosystemHealth(state, -6);
    addReputation(state, 2);
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
    adjustEcosystemHealth(state, +4);
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

/**
 * The pack question lapsed: record an undecided fate so the ranger visit does not invent an answer,
 * and do not grant either pack outcome's ecology or reputation.
 */
function expireWolfChoice(state: WorldState): void {
  if ((state.storyFlags?.wolf_resolved ?? 0) > 0) return;
  if ((state.storyFlags?.wolf_choice ?? 0) <= 0) return;
  state.storyFlags = {
    ...state.storyFlags,
    wolf_resolved: WOLF_FATE_UNDECIDED,
    wolf_resolvedTick: state.tick,
  };
  addNotification(state, '🐺 The pack moves on', 'The moment to answer the elders passed; the valley made no choice.', 'info');
}

// Story 2 — The valley wakes (first-session welcome beat, day 0)

/**
 * Offer once at the first day boundary a live game reaches — sets the tone and the first course.
 */
export function maybeOfferWelcome(state: WorldState): void {
  if ((state.storyFlags?.welcome ?? 0) > 0) return;
  if (state.year > 0 || state.dayInYear > 1) return;
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
    adjustEcosystemHealth(state, +2);
    addBigNews(state, '🌄 The elders nod', 'You began by watching the land. The valley remembers respect — and rewards it.', 'positive');
    logEvent(state, 'event', `${state.villageName} began by listening to the elders — the valley's first impression.`);
  } else {
    addCappedResource(state, 'wood', 5);
    addBigNews(state, '🔨 A fast start', 'You began at once — the first beams fall before noon. The valley watches.', 'neutral');
    logEvent(state, 'event', `${state.villageName} began at once — the first beams fell before noon.`);
  }
}

// Story 3 — The old ranger (remembers the wolf choice)

/** Offer a few days after the wolf choice resolves — the valley keeps memory. */
export function maybeOfferRangerVisit(state: WorldState): void {
  if ((state.storyFlags?.ranger_visit ?? 0) > 0) return;
  const resolved = state.storyFlags?.wolf_resolved;
  const resolvedTick = state.storyFlags?.wolf_resolvedTick ?? 0;
  // Only a real answer remembers a pack; an expired card (undecided) has no visit to remember.
  if (resolved !== WOLF_FATE_THINNED && resolved !== WOLF_FATE_SPARED) return;
  if (state.tick < resolvedTick + TICKS_PER_DAY * 3) return;
  state.storyFlags = { ...state.storyFlags, ranger_visit: state.tick };
  const thin = resolved === WOLF_FATE_THINNED;
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
  if ((state.storyFlags?.ranger_visit_resolved ?? 0) > 0) return;
  if ((state.storyFlags?.ranger_visit_lapsed ?? 0) > 0) return;
  const thin = (state.storyFlags?.wolf_resolved ?? 0) === WOLF_FATE_THINNED;
  // Any answer ends the visit; an unknown id must not leave the ranger chain open.
  state.storyFlags = { ...state.storyFlags, ranger_visit_resolved: state.tick };
  if (choiceId === 'acknowledge') {
    if (thin) {
      adjustEcosystemHealth(state, +1); // a gesture toward the debt
      addReputation(state, 1);
      addBigNews(state, '🧙 A debt acknowledged', 'The ranger leaves a single feather — “for the balance.” The valley keeps its ledger.', 'neutral');
      logEvent(state, 'event', `The ranger counted the pack after ${state.villageName} thinned it — a debt acknowledged.`);
    } else {
      addReputation(state, 2);
      addBigNews(state, '🧙 The old way holds', 'The ranger leaves a single feather — “for the old way.” The valley keeps its ledger.', 'positive');
      logEvent(state, 'event', `The ranger honored ${state.villageName} for sparing the pack — the old way holds.`);
    }
  }
}

/** The ranger waited and left unanswered: a terminal fate, never the acknowledgment beat. */
function expireRangerVisit(state: WorldState): void {
  if ((state.storyFlags?.ranger_visit_resolved ?? 0) > 0) return;
  if ((state.storyFlags?.ranger_visit_lapsed ?? 0) > 0) return;
  if ((state.storyFlags?.ranger_visit ?? 0) <= 0) return;
  state.storyFlags = { ...state.storyFlags, ranger_visit_lapsed: state.tick };
  addNotification(state, '🧙 The ranger moves on', 'The old ranger waited at the gate, then left without a word.', 'info');
}

// Story 4 — Old Kaia's winter test (first-year course-setting quest)

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
      '“First freeze comes at day 270,” Old Kaia says. “A warm village needs 120 wood and a full larder — 180 food. Meet it, and I will tell the valley your name.”',
    choices: [
      { id: 'accept', label: 'Accept the test', detail: 'Stockpile 120 wood and 180 food before the first freeze.' },
      { id: 'decline', label: 'Decline', detail: "Rely on the guide's winter advice instead." },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * 10,
  });
}

/**
 * The offer lapsed before an answer: remember that the pact was never accepted so the day-270 freeze
 * check can close the quest visibly instead of leaving winter_prep as a dead flag.
 */
function expireWinterPrep(state: WorldState): void {
  if ((state.storyFlags?.winter_resolved ?? 0) > 0) return;
  if ((state.storyFlags?.winter_prep_lapsed ?? 0) > 0) return;
  if ((state.storyFlags?.winter_accepted ?? 0) > 0) return;
  if ((state.storyFlags?.winter_prep ?? 0) <= 0) return;
  state.storyFlags = { ...state.storyFlags, winter_prep_lapsed: state.tick };
  addNotification(state, '❄️ Old Kaia’s test goes unanswered', 'The offer of a winter pact lapsed. The first freeze will decide what the valley remembers.', 'info');
}

/**
 * Check the pact at the first freeze (day 270) — the valley remembers the result; 270 is the season
 * owner's boundary, not a preference.
 */
export function tickWinterFreezeCheck(state: WorldState): void {
  if (state.year > 0 || state.dayInYear !== 270) return;
  if ((state.storyFlags?.winter_resolved ?? 0) > 0) return;
  const pact = state.storyFlags?.winter_prep ?? 0;
  const accepted = pact > 0 && (state.storyFlags?.winter_accepted ?? 0) > 0;
  const lapsed = pact > 0 && (state.storyFlags?.winter_prep_lapsed ?? 0) > 0;
  state.storyFlags = { ...state.storyFlags, winter_resolved: state.tick };
  if (accepted && state.resources.wood >= 120 && state.resources.food >= 180) {
    addReputation(state, 2);
    addBigNews(state, '❄️ The first freeze holds', 'The first freeze came — and the village was ready. Old Kaia tells the valley your name.', 'positive');
    logEvent(state, 'event', `${state.villageName} passed Old Kaia's first winter test — 120 wood, a full larder, and a name remembered.`);
  } else if (accepted) {
    addReputation(state, -1);
    addBigNews(state, '❄️ A lean first freeze', 'The first freeze came early and the larder thin. Old Kaia says nothing — the valley remembers.', 'negative');
    logEvent(state, 'event', `${state.villageName} failed Old Kaia's first winter test — a lean freeze the valley remembers.`);
  } else if (lapsed) {
    addBigNews(state, '❄️ Old Kaia’s test went unanswered', 'The first freeze came and the pact was never accepted. Old Kaia says nothing — the valley remembers the silence.', 'neutral');
    logEvent(state, 'event', `${state.villageName} let Old Kaia's winter test go unanswered — the first freeze passed without a pact.`);
  }
}

// Story 5 — A household mourns (grief surfaces as a consequence)

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
    if (mourner) adjustHumanStaminaFromEnergy(mourner, 20);
    addReputation(state, 1);
    addBigNews(state, '🕯️ The household holds', 'A quiet word by the fire — the mourning settler rests easier, and the village stands a little closer.', 'positive');
    logEvent(state, 'event', `${state.villageName} comforted a grieving household — grief carried together, not alone.`);
  } else {
    addNotification(state, 'Grief takes its course', 'The household mourns in its own time — they will rejoin the village soon.', 'info');
    logEvent(state, 'event', `${state.villageName} gave a grieving household space — grief runs its own course.`);
  }
}

// Story 6 — The ranger's tale (Moon Howlers introduced as a rumor)

/** Which framing the howler card carries: the ranger's own tale or a traveller's warning. */
const HOWLER_VARIANT_RANGER = 1;
const HOWLER_VARIANT_TRAVELLER = 2;

/**
 * Offer late in the first year. A resolved ranger tells his own tale; otherwise a traveller carries
 * the same warning, so an unanswered ranger card never hides the Moon Howler telegraph.
 */
export function maybeOfferHowlerRumor(state: WorldState): void {
  if ((state.storyFlags?.howler_rumor ?? 0) > 0) return;
  if (state.year > 0) return;
  if (state.dayInYear < 180) return;
  // A pending ranger card can still become the ranger's tale; wait for the answer or the lapse.
  if ((state.pendingStoryEvents ?? []).some((event) => event.storyKey === 'ranger_visit')) return;

  const resolved = (state.storyFlags?.ranger_visit_resolved ?? 0) > 0;
  // Legacy saves predate the resolution flag; a dropped card there proves the visit happened.
  const legacyVisit = (state.storyFlags?.ranger_visit ?? 0) > 0
    && (state.storyFlags?.ranger_visit_lapsed ?? 0) === 0;
  const rangerTale = resolved || legacyVisit;

  state.storyFlags = {
    ...state.storyFlags,
    howler_rumor: state.tick,
    howler_rumor_variant: rangerTale ? HOWLER_VARIANT_RANGER : HOWLER_VARIANT_TRAVELLER,
  };
  offerStoryEvent(state, {
    id: `howler_${state.tick}`,
    emoji: '🌕',
    storyKey: 'howler_rumor',
    title: rangerTale ? "The ranger's tale" : "A traveller's tale",
    description: rangerTale
      ? 'The ranger returns with a strange tale: on full-moon nights, something walks the treeline on two legs and howls like a wolf. “Keep a priest near, and trust the moon less.”'
      : 'A traveller passing through the valley speaks of full-moon nights: something walks the treeline on two legs and howls like a wolf. “Keep a priest near, and trust the moon less.”',
    choices: [
      { id: 'heed', label: 'Heed the warning', detail: 'The full moon will be watched — the Church gains weight in the village.' },
      { id: 'dismiss', label: "A hunter's tall tale", detail: 'Old stories — the village goes about its business.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * 5,
  });
}

function resolveHowlerRumor(state: WorldState, choiceId: string): void {
  const rangerTale = (state.storyFlags?.howler_rumor_variant ?? HOWLER_VARIANT_RANGER)
    === HOWLER_VARIANT_RANGER;
  if (choiceId === 'heed') {
    addReputation(state, 1);
    addBigNews(
      state,
      '🌕 The moon is watched',
      rangerTale
        ? 'The village heeds the ranger — priests keep watch on full-moon nights, and the treeline feels less certain.'
        : 'The village heeds the traveller’s warning — priests keep watch on full-moon nights, and the treeline feels less certain.',
      'neutral',
    );
    logEvent(
      state,
      'event',
      rangerTale
        ? `${state.villageName} heeded the ranger's tale — the full moon will be watched.`
        : `${state.villageName} heeded a traveller's warning — the full moon will be watched.`,
    );
  } else {
    addNotification(
      state,
      rangerTale ? "A hunter's tale" : "A traveller's tale",
      rangerTale
        ? 'The village shrugs off the ranger’s story — old tales for old folks.'
        : 'The village shrugs off the traveller’s story — old tales for old folks.',
      'info',
    );
    logEvent(
      state,
      'event',
      rangerTale
        ? `${state.villageName} dismissed the ranger's tale — old stories for old folks.`
        : `${state.villageName} dismissed a traveller's tale — old stories for old folks.`,
    );
  }
}

// Story 7 — The valley's future (philosophical election debate)

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
      adjustEcosystemHealth(state, -5);
      addReputation(state, 2);
      addBigNews(state, '🏗️ The growth mandate', 'The election settled it: outward. New ground opens — and the woods edge back.', 'neutral');
      logEvent(state, 'event', `The ${displayYear(state.year)} election chose growth — the forest edge retreated and the ledger grew.`);
      break;
    case 'preservation':
      adjustEcosystemHealth(state, +5);
      addBigNews(state, '🌿 The preservation mandate', 'The election settled it: build tight, spare the wild. The valley keeps its breath.', 'positive');
      logEvent(state, 'event', `The ${displayYear(state.year)} election chose the wild — building slowed, and the valley kept its breath.`);
      break;
    case 'predator_control':
      adjustEcosystemHealth(state, -3);
      addReputation(state, 1);
      addBigNews(state, '🛡️ The security mandate', 'The election settled it: walls and a steady cull. Settlers sleep safer — the deer know it.', 'neutral');
      logEvent(state, 'event', `The ${displayYear(state.year)} election chose security — the cull steadied, and the deer grew wary.`);
      break;
    default:
      addReputation(state, 3);
      addBigNews(state, '🎉 The festival mandate', 'The election settled it: feast and celebrate. Morale soars — a happy village spends more.', 'positive');
      logEvent(state, 'event', `The ${displayYear(state.year)} election chose joy — the feasts ran long and the ledger noticed.`);
      break;
  }
}
