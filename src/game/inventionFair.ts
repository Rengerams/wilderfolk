/**
 * The Apprentice's Terrible Invention Fair: three inventions → fund/redesign → delayed
 * demonstration → keep/improve/dismantle.
 */
import type { WorldState, StoryEvent, InventionFairProject, InventionFairOutcome } from './gameTypes';
import { BuildingType } from './gameTypes';
import { TICKS_PER_DAY, TICKS_PER_HOUR, getColonyDay } from './dayCycle';
import { addBigNews, addNotification } from './simEffects';
import { logEvent } from './eventLog';
import { storyFlag, setStoryFlags, bumpVillageReputation, eligibleDayForStory, seededRoll, hashSalt, pushStoryCard, AUTHORED_STORY_COOLDOWN_FLAG } from './storyHelpers';
import { addCappedResource, consumeResources, deductResource, canAfford } from './resourceUtils';
import { isPlayerHuman } from './playerHuman';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { adjustHumanStaminaFromEnergy } from './simulation/humanPhysiology';
import { getSimRng, personDayRoll } from './simRng';
import { crowdGatherPosition } from './simulation/humanMovement';
import { isGroundWalkableAt } from './pathfinding';

export const STORY_KEY = 'invention_fair';
export const AUTHORED_STORY_COOLDOWN_DAYS = 14;

const FLAG_OFFERED = 'invention_fair_offered';
const FLAG_STATUS = 'invention_fair_status';
const FLAG_INVENTION = 'invention_fair_invention';
const FLAG_RISK = 'invention_fair_risk';
const FLAG_APPRENTICE = 'invention_fair_apprentice';
const FLAG_RESOLVE_DAY = 'invention_fair_resolve_day';
const FLAG_RESOLVED = 'invention_fair_resolved';
/** Set when the one-time Demonstration card is pushed, so it is never re-offered. */
const FLAG_DEMO_OFFERED = 'invention_fair_demo_offered';

const MIN_DAY = 30;
const WINDOW_DAYS = 90;
const CARD_DURATION_DAYS = 4;

const STATUS = {
  offered: 1,
  funded: 2,
} as const;

const RISK = {
  experimental: 1,
  safe: 2,
} as const;

const INVENTION_COSTS: Record<string, number> = {
  granary_counter: 15,
  polite_gate: 10,
  emergency_bell: 12,
};

/** 8 = the extra timber a safer redesign charges on top of the granary counter. */
const SAFER_REDESIGN_EXTRA_WOOD = 8;
/** 8 = timber the stage-2 "improve it" answer charges. */
const IMPROVE_WOOD_COST = 8;

/**
 * Wood each funding answer charges. One table, so the resolver and the
 * eligibility check below cannot drift apart.
 */
const FUNDING_WOOD_COST: Record<string, number> = {
  fund_granary: INVENTION_COSTS.granary_counter,
  fund_gate: INVENTION_COSTS.polite_gate,
  fund_bell: INVENTION_COSTS.emergency_bell,
  safer_redesign: INVENTION_COSTS.granary_counter + SAFER_REDESIGN_EXTRA_WOOD,
  improve: IMPROVE_WOOD_COST,
};

type Stage1Choice = 'fund_granary' | 'fund_gate' | 'fund_bell' | 'reject' | 'safer_redesign';
type Stage2Choice = 'keep' | 'improve' | 'dismantle';

const STAGE1_CHOICES: ReadonlySet<string> = new Set<Stage1Choice>([
  'fund_granary', 'fund_gate', 'fund_bell', 'reject', 'safer_redesign',
]);
const STAGE2_CHOICES: ReadonlySet<string> = new Set<Stage2Choice>(['keep', 'improve', 'dismantle']);

export function inventionFairEligibleDay(mapSeed: number | undefined): number {
  return eligibleDayForStory(mapSeed, STORY_KEY, MIN_DAY, WINDOW_DAYS);
}

function findApprentice(state: WorldState): { id: number; name: string } | null {
  const apprentice = state.entities.find((e) => e.alive && e.apprenticeOfId != null);
  if (!apprentice) return null;
  return { id: apprentice.id, name: apprentice.name ?? 'the apprentice' };
}

export function maybeOfferInventionFair(state: WorldState): void {
  if (storyFlag(state, FLAG_OFFERED) > 0 || state.inventionFair) return;
  const colonyDay = getColonyDay(state);
  if (colonyDay < inventionFairEligibleDay(state.worldMap?.seed)) return;
  if (storyFlag(state, AUTHORED_STORY_COOLDOWN_FLAG) > colonyDay) return;
  if ((state.pendingStoryEvents ?? []).length > 0) return;
  if (state.resources.wood < 30) return;
  const site = state.buildings.find((b) =>
    b.completed && b.faction !== 'rival' && b.type === BuildingType.TownHall);
  if (!site) return;
  if (state.entities.filter((e) => e.alive && isPlayerHuman(e)).length < 15) return;
  const apprentice = findApprentice(state);
  if (!apprentice) return;

  const eventId = `invention_notice_${state.tick}`;
  state.inventionFair = {
    stage: 'selection',
    apprenticeId: apprentice.id,
    siteBuildingId: site.id,
    project: null,
    offeredAtTick: state.tick,
    activeEventId: eventId,
    expiresAtTick: state.tick + TICKS_PER_DAY * CARD_DURATION_DAYS,
    readyDay: 0,
    startedAtTick: 0,
    lastPhase: 0,
    outcome: null,
    outcomeApplied: false,
    damagedHealth: 0,
    spectatorSlots: [],
  };
  setStoryFlags(state, {
    [FLAG_OFFERED]: state.tick,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
  });
  pushStoryCard(state, {
    id: eventId,
    emoji: '⚙️',
    storyKey: STORY_KEY,
    title: 'The Apprentice’s Terrible Invention Fair',
    description: `${apprentice.name} proposes three experimental machines for a public demonstration. Higher funding promises better discoveries, but increases the risk of serious damage.`,
    choices: [
      { id: 'fund_low_budget', label: 'Low-budget mechanical rig (10 wood)', detail: '10% success, 40% useful failure, 50% comic malfunction, no danger.' },
      { id: 'fund_standard', label: 'Standard utility apparatus (25 wood, 10 gold)', detail: '20% success, 40% useful failure, 30% comic malfunction, 10% danger.' },
      { id: 'fund_high_risk', label: 'High-risk experimental engine (50 wood, 25 gold)', detail: '35% success, 15% useful failure, 20% comic malfunction, 30% danger.' },
      { id: 'decline', label: 'Decline sponsorship', detail: 'No cost; the fair is cancelled without a reputation penalty.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.inventionFair.expiresAtTick,
  });
  addNotification(state, '⚙️ Invention Fair', 'The apprentice requests funding for a public experiment.', 'info');
}

/**
 * Whether `resolveInventionFair` would accept this answer right now: only funding (stage 1) and
 * upgrade (stage 2) charge wood. `reject`, `keep`, and `dismantle` are free.
 */
export function getInventionFairChoiceEligibility(
  state: WorldState,
  choiceId: string,
  eventId?: string,
): { ok: boolean; blockReason?: string } {
  if (state.inventionFair) return getModernInventionFairChoiceEligibility(state, choiceId, eventId);
  const stage1 = STAGE1_CHOICES.has(choiceId);
  const stage2 = STAGE2_CHOICES.has(choiceId);
  if (!stage1 && !stage2) return { ok: false, blockReason: 'Unknown invention fair choice' };
  if (eventId?.startsWith('invention_stage1_') && (!stage1 || storyFlag(state, FLAG_STATUS) !== STATUS.offered)) {
    return { ok: false, blockReason: 'The funding decision has already passed' };
  }
  if (eventId?.startsWith('invention_stage2_') && (!stage2 || storyFlag(state, FLAG_STATUS) !== STATUS.funded)) {
    return { ok: false, blockReason: 'The demonstration is not awaiting that decision' };
  }
  const cost = FUNDING_WOOD_COST[choiceId];
  if (cost !== undefined && state.resources.wood < cost) {
    return { ok: false, blockReason: `Need ${cost}🪵` };
  }
  return { ok: true };
}

export function resolveInventionFair(state: WorldState, choiceId: string, eventId?: string): boolean {
  if (state.inventionFair) return resolveModernInventionFair(state, choiceId, eventId);
  // The chain is answered once; a stale duplicate card must not re-run stage 2.
  if (storyFlag(state, FLAG_RESOLVED) > 0) return true;
  const status = storyFlag(state, FLAG_STATUS);
  if (status === STATUS.offered) {
    if (!STAGE1_CHOICES.has(choiceId)) return false;
    return resolveStage1(state, choiceId as Stage1Choice);
  }
  if (status === STATUS.funded) {
    if (!STAGE2_CHOICES.has(choiceId)) return false;
    return resolveStage2(state, choiceId as Stage2Choice);
  }
  return false;
}

function resolveStage1(state: WorldState, choice: Stage1Choice): boolean {
  const colonyDay = getColonyDay(state);
  let inventionId: string | null = null;
  let cost = 0;
  let riskMode: number = RISK.experimental;

  switch (choice) {
    case 'fund_granary':
      inventionId = 'granary_counter';
      cost = FUNDING_WOOD_COST.fund_granary;
      break;
    case 'fund_gate':
      inventionId = 'polite_gate';
      cost = FUNDING_WOOD_COST.fund_gate;
      break;
    case 'fund_bell':
      inventionId = 'emergency_bell';
      cost = FUNDING_WOOD_COST.fund_bell;
      break;
    case 'safer_redesign': {
      inventionId = 'granary_counter';
      cost = FUNDING_WOOD_COST.safer_redesign;
      riskMode = RISK.safe;
      break;
    }
    case 'reject':
    default: {
      setStoryFlags(state, {
        [FLAG_RESOLVED]: state.tick,
        [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
      });
      addBigNews(state, '⚙️ The proposals are rejected', 'The apprentice packs away the inventions, a little wiser.', 'neutral');
      return true;
    }
  }

  if (state.resources.wood < cost) {
    addNotification(state, 'Not enough wood', `Funding this invention needs ${cost} wood.`, 'warning');
    return false;
  }
  state.resources.wood -= cost;

  setStoryFlags(state, {
    [FLAG_STATUS]: STATUS.funded,
    [FLAG_INVENTION]: hashSalt(`invention-${inventionId}`) % 1000,
    [FLAG_RISK]: riskMode,
    [FLAG_RESOLVE_DAY]: colonyDay + 4 + Math.floor(seededRoll(state.worldMap?.seed ?? 1, hashSalt('invention-demo-delay')) * 3),
  });
  addNotification(state, '⚙️ Experiment funded', 'The apprentice gets to work. The demonstration is in a few days.', 'info');
  return true;
}

export function tickInventionFair(state: WorldState): void {
  if (state.inventionFair) {
    tickModernInventionFairDaily(state);
    return;
  }
  if (storyFlag(state, FLAG_RESOLVED) > 0) return;
  if (storyFlag(state, FLAG_STATUS) !== STATUS.funded) return;
  // One-shot card: a second push would pay out again on every answer.
  if (storyFlag(state, FLAG_DEMO_OFFERED) > 0) return;
  const colonyDay = getColonyDay(state);
  const resolveDay = storyFlag(state, FLAG_RESOLVE_DAY);
  if (resolveDay <= 0 || colonyDay < resolveDay) return;

  const apprenticeId = storyFlag(state, FLAG_APPRENTICE);
  const apprentice = state.entities.find((e) => e.id === apprenticeId);
  const name = apprentice?.name ?? 'the apprentice';
  const safe = storyFlag(state, FLAG_RISK) === RISK.safe;
  const success = seededRoll(state.worldMap?.seed ?? 1, hashSalt(safe ? 'invention-safe-demo' : 'invention-demo')) > (safe ? 0.25 : 0.45);

  const event: StoryEvent = {
    id: `invention_stage2_${state.tick}`,
    emoji: '⚙️',
    storyKey: STORY_KEY,
    title: 'The Demonstration',
    description: success
      ? `${name}'s invention works — mostly. The crowd is amused and impressed.`
      : `${name}'s invention performs exactly as designed, which is the problem. Smoke, confusion, and a few laughs follow.`,
    choices: [
      { id: 'keep', label: 'Keep the invention active', detail: 'A modest lasting effect.' },
      { id: 'improve', label: 'Improve it (8 wood)', detail: 'Bigger benefit, another cost.' },
      { id: 'dismantle', label: 'Dismantle it', detail: 'Refund 4 wood and end the nuisance.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * CARD_DURATION_DAYS,
  };
  setStoryFlags(state, { [FLAG_DEMO_OFFERED]: state.tick });
  pushStoryCard(state, event);
  addNotification(state, '⚙️ Demonstration day', 'The invention has shown its result.', 'info');
}

function resolveStage2(state: WorldState, choice: Stage2Choice): boolean {
  const colonyDay = getColonyDay(state);
  if (choice === 'improve' && state.resources.wood < IMPROVE_WOOD_COST) {
    addNotification(state, 'Not enough wood', `Improving the invention needs ${IMPROVE_WOOD_COST} wood.`, 'warning');
    return false;
  }

  if (choice === 'improve') {
    state.resources.wood -= IMPROVE_WOOD_COST;
    bumpVillageReputation(state, 2);
    addBigNews(state, '⚙️ A useful invention', 'The improved device becomes a small village landmark.', 'positive');
  } else if (choice === 'keep') {
    bumpVillageReputation(state, 1);
    addBigNews(state, '⚙️ The invention stays', 'It works well enough to keep around.', 'positive');
  } else {
    // Recovered timber goes through the capped writer like every other gain; a raw `+=` would
    // push wood past `storageMax`.
    addCappedResource(state, 'wood', 4);
    addBigNews(state, '⚙️ Dismantled', 'The device is taken apart; part of the wood is recovered.', 'neutral');
  }

  setStoryFlags(state, {
    [FLAG_RESOLVED]: state.tick,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
  });
  logEvent(state, 'event', `The Invention Fair resolved (${choice}).`, undefined);
  return true;
}

// One canonical new-event project table; legacy funded events use the original flag-based path above.
export const INVENTION_FAIR_PROJECTS = {
  low_budget: { wood: 10, gold: 0, odds: [0.10, 0.40, 0.50, 0] },
  standard: { wood: 25, gold: 10, odds: [0.20, 0.40, 0.30, 0.10] },
  high_risk: { wood: 50, gold: 25, odds: [0.35, 0.15, 0.20, 0.30] },
} as const satisfies Record<InventionFairProject, { wood: number; gold: number; odds: readonly [number, number, number, number] }>;

const PROJECT_BY_CHOICE: Record<string, InventionFairProject> = {
  fund_low_budget: 'low_budget',
  fund_standard: 'standard',
  fund_high_risk: 'high_risk',
};
const RESOLUTION_CHOICES = new Set(['reward', 'salvage', 'dismantle', 'repair']);
const DEMONSTRATION_PHASE_TICKS = 8 * TICKS_PER_HOUR;
export const INVENTION_FAIR_DEMONSTRATION_TICKS = 3 * DEMONSTRATION_PHASE_TICKS;
const SPECTATOR_LIMIT = 24;

export function rollInventionFairOutcome(project: InventionFairProject, roll: number): InventionFairOutcome {
  const [success, failure, comic] = INVENTION_FAIR_PROJECTS[project].odds;
  if (roll < success) return 'success';
  if (roll < success + failure) return 'failure';
  if (roll < success + failure + comic) return 'malfunction';
  return 'dangerous';
}

function getModernInventionFairChoiceEligibility(
  state: WorldState,
  choiceId: string,
  eventId?: string,
): { ok: boolean; blockReason?: string } {
  const fair = state.inventionFair;
  if (!fair || (eventId && fair.activeEventId !== eventId)) {
    return { ok: false, blockReason: 'This invention fair card is no longer active' };
  }
  if (fair.stage === 'selection') {
    if (choiceId === 'decline') return { ok: true };
    const project = PROJECT_BY_CHOICE[choiceId];
    if (!project) return { ok: false, blockReason: 'This project is not offered' };
    const cost = INVENTION_FAIR_PROJECTS[project];
    if (state.resources.wood < cost.wood) {
      return { ok: false, blockReason: `Requires ${cost.wood} wood (${state.resources.wood} available)` };
    }
    if (state.resources.gold < cost.gold) {
      return { ok: false, blockReason: `Requires ${cost.gold} gold (${state.resources.gold} available)` };
    }
    return { ok: true };
  }
  if (fair.stage !== 'resolution' || !RESOLUTION_CHOICES.has(choiceId)) {
    return { ok: false, blockReason: 'The demonstration has not reached this choice' };
  }
  if (choiceId === 'repair') {
    if (fair.damagedHealth <= 0) return { ok: false, blockReason: 'There is no damage to repair' };
    if (!state.buildings.some((b) => b.id === fair.siteBuildingId && b.completed)) {
      return { ok: false, blockReason: 'The damaged building no longer exists' };
    }
    if (!canAfford(state, { wood: 15, gold: 5 })) {
      return { ok: false, blockReason: 'Requires 15 wood and 5 gold for repairs' };
    }
  }
  if (choiceId === 'reward' && state.resources.gold < 10) {
    return { ok: false, blockReason: `Requires 10 gold (${state.resources.gold} available)` };
  }
  return { ok: true };
}

function endModernInventionFair(state: WorldState, choice: string): void {
  state.inventionFair = null;
  state.pendingStoryEvents = (state.pendingStoryEvents ?? []).filter((e) => e.storyKey !== STORY_KEY);
  setStoryFlags(state, {
    [FLAG_RESOLVED]: Math.max(1, state.tick),
    [AUTHORED_STORY_COOLDOWN_FLAG]: getColonyDay(state) + AUTHORED_STORY_COOLDOWN_DAYS,
  });
  logEvent(state, 'event', `The Invention Fair concluded (${choice}).`);
}

function resolveModernInventionFair(state: WorldState, choiceId: string, eventId?: string): boolean {
  const fair = state.inventionFair;
  if (!fair || !getModernInventionFairChoiceEligibility(state, choiceId, eventId).ok) return false;
  if (fair.stage === 'selection') {
    if (choiceId === 'decline') {
      endModernInventionFair(state, 'declined');
      addBigNews(state, '⚙️ The inventions stay on paper', 'The apprentice accepts the decision and packs away the contraptions.', 'neutral');
      return true;
    }
    const project = PROJECT_BY_CHOICE[choiceId];
    const cost = INVENTION_FAIR_PROJECTS[project];
    if (!consumeResources(state, { wood: cost.wood, gold: cost.gold })) return false;
    fair.project = project;
    fair.stage = 'preparation';
    fair.activeEventId = '';
    fair.expiresAtTick = 0;
    fair.readyDay = getColonyDay(state) + 4
      + Math.floor(seededRoll(state.worldMap?.seed ?? 1, hashSalt('invention-demo-delay')) * 3);
    logEvent(state, 'event', `The apprentice received ${cost.wood} wood and ${cost.gold} gold for the ${project} experiment.`);
    addNotification(state, '⚙️ Experiment funded', 'Preparation takes a few days. The demonstration will run for 24 game hours.', 'info');
    return true;
  }

  if (choiceId === 'reward') {
    if (!consumeResources(state, { gold: 10 })) return false;
    bumpVillageReputation(state, 5);
  } else if (choiceId === 'salvage' || choiceId === 'dismantle') {
    const committed = INVENTION_FAIR_PROJECTS[fair.project!].wood;
    const fraction = choiceId === 'salvage' ? 0.25 : 0.5;
    const recovered = addCappedResource(state, 'wood', Math.floor(committed * fraction));
    logEvent(state, 'event', `The apprentice recovered ${recovered} wood from the apparatus.`);
  } else if (choiceId === 'repair') {
    if (!consumeResources(state, { wood: 15, gold: 5 })) return false;
    const site = state.buildings.find((b) => b.id === fair.siteBuildingId && b.completed);
    if (site) site.health = Math.min(site.maxHealth, site.health + fair.damagedHealth);
  }
  endModernInventionFair(state, choiceId);
  addBigNews(state, '⚙️ Invention Fair concluded', `The council chose to ${choiceId} after the public demonstration.`, 'neutral');
  return true;
}

function tickModernInventionFairDaily(state: WorldState): void {
  const fair = state.inventionFair;
  if (!fair) return;
  if ((fair.stage === 'selection' || fair.stage === 'resolution') && state.tick >= fair.expiresAtTick) {
    if (fair.stage === 'selection') {
      endModernInventionFair(state, 'offer expired');
      return;
    }
    resolveModernInventionFair(state, 'dismantle');
    return;
  }
  if (fair.stage !== 'preparation' || getColonyDay(state) < fair.readyDay) return;
  const site = state.buildings.find((b) => b.id === fair.siteBuildingId && b.completed);
  if (!site) {
    const cost = INVENTION_FAIR_PROJECTS[fair.project!];
    addCappedResource(state, 'wood', cost.wood);
    addCappedResource(state, 'gold', cost.gold);
    endModernInventionFair(state, 'venue lost; funding refunded');
    return;
  }
  const cx = site.x + site.width / 2;
  const cy = site.y + site.height / 2;
  const audience = state.entities.filter((e) =>
    e.alive && isPlayerHuman(e) && e.age >= HUMAN_ADULT_MIN_AGE && !e.raidDeploymentId &&
    e.prisonBuildingId == null && e.id !== fair.apprenticeId
  ).sort((a, b) => a.id - b.id).slice(0, SPECTATOR_LIMIT);
  const occupied: Array<{ x: number; y: number }> = [];
  fair.spectatorSlots = [];
  for (const spectator of audience) {
    for (let slot = 0; slot < 192; slot++) {
      const position = crowdGatherPosition(cx, cy, slot);
      if (!isGroundWalkableAt(position.x, position.y)) continue;
      if (occupied.some((other) => Math.hypot(position.x - other.x, position.y - other.y) < 10)) continue;
      occupied.push(position);
      fair.spectatorSlots.push({ humanId: spectator.id, x: position.x, y: position.y });
      break;
    }
  }
  fair.stage = 'demonstration';
  fair.startedAtTick = state.tick;
  fair.lastPhase = 0;
  logEvent(state, 'event', 'The Invention Fair begins: the apprentice activates the prototype.');
  addNotification(state, '⚙️ Demonstration begins', 'Activation, spin-up and climax will unfold over 24 game hours.', 'event');
}

export function tickInventionFairRealtime(state: WorldState): void {
  const fair = state.inventionFair;
  if (!fair || fair.stage !== 'demonstration' || !fair.project) return;
  const elapsed = state.tick - fair.startedAtTick;
  if (elapsed >= DEMONSTRATION_PHASE_TICKS && fair.lastPhase < 1) {
    fair.lastPhase = 1;
    logEvent(state, 'event', 'The prototype enters spin-up; gears shudder and onlookers brace themselves.');
  }
  if (elapsed >= DEMONSTRATION_PHASE_TICKS * 2 && fair.lastPhase < 2) {
    fair.lastPhase = 2;
    logEvent(state, 'event', 'The apparatus reaches maximum strain before its final test.');
  }
  if (elapsed < INVENTION_FAIR_DEMONSTRATION_TICKS || fair.outcomeApplied) return;
  fair.outcomeApplied = true;
  const outcome = rollInventionFairOutcome(fair.project, getSimRng('invention-fair')());
  fair.outcome = outcome;
  const site = state.buildings.find((b) => b.id === fair.siteBuildingId && b.completed);
  if (outcome === 'success') {
    addCappedResource(state, 'wood', 20);
    addCappedResource(state, 'gold', 15);
    bumpVillageReputation(state, 8);
  } else if (outcome === 'failure') {
    addCappedResource(state, 'wood', 15);
    bumpVillageReputation(state, 3);
  } else if (outcome === 'malfunction') {
    bumpVillageReputation(state, 1);
  } else {
    const lostWood = deductResource(state, 'wood', 25);
    const lostGold = deductResource(state, 'gold', 25);
    if (site) {
      fair.damagedHealth = Math.min(30, Math.max(0, site.health - 1));
      site.health -= fair.damagedHealth;
    }
    for (const slot of fair.spectatorSlots) {
      const spectator = state.entities.find((e) => e.id === slot.humanId && e.alive && isPlayerHuman(e));
      if (spectator && Math.hypot(spectator.x - slot.x, spectator.y - slot.y) <= 24) {
        adjustHumanStaminaFromEnergy(spectator, -25);
      }
    }
    bumpVillageReputation(state, -10);
    logEvent(state, 'event', `The prototype ruptured: ${lostWood} wood and ${lostGold} gold lost, ${fair.damagedHealth} building health damaged.`);
  }
  const reactions = fair.spectatorSlots.reduce((total, slot) =>
    total + Number(personDayRoll(slot.humanId, state.tick, 808) > 0.4), 0);
  logEvent(state, 'event', `Invention Fair outcome: ${outcome}; ${reactions} spectators react with applause or astonishment.`);
  fair.stage = 'resolution';
  fair.activeEventId = `invention_resolution_${state.tick}`;
  fair.expiresAtTick = state.tick + TICKS_PER_DAY * CARD_DURATION_DAYS;
  pushStoryCard(state, {
    id: fair.activeEventId,
    emoji: '⚙️',
    storyKey: STORY_KEY,
    title: 'The Invention Fair: Aftermath',
    description: outcome === 'success'
      ? 'The machine works brilliantly. The crowd applauds a useful technological breakthrough.'
      : outcome === 'failure'
        ? 'The device stalled, but the apprentice salvaged valuable cured timber from the experiment.'
        : outcome === 'malfunction'
          ? 'A cloud of colored soot and flying vegetables turns the failed experiment into a village comedy.'
          : 'The machine has burst apart. Nearby structures are damaged and some spectators were hurt.',
    choices: [
      { id: 'reward', label: 'Reward the apprentice (10 gold)', detail: '+5 village reputation.' },
      { id: 'salvage', label: 'Salvage useful parts', detail: 'Recover one-quarter of the wood invested, subject to storage capacity.' },
      { id: 'dismantle', label: 'Dismantle the apparatus', detail: 'Recover half of the invested wood, subject to storage capacity.' },
      ...(fair.damagedHealth > 0 ? [{ id: 'repair', label: 'Repair the venue (15 wood, 5 gold)', detail: 'Restore the damage caused by the experiment.' }] : []),
    ],
    createdAtTick: state.tick,
    expiresAtTick: fair.expiresAtTick,
  });
  addBigNews(state, '⚙️ The invention fair concludes', `The experiment ended with a ${outcome}.`, outcome === 'dangerous' ? 'negative' : 'neutral');
}
