/**
 * W-64 + W-123–W-125: expired authored story cards resolve their owner's chain through the real daily
 * pass — terminal once, no unearned reward, and the guided campaign still reaches its next chapter.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BuildingType, EntityType, Season } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { tickDailyWorldEvents } from '../src/game/dailyWorldEvents';
import { DAYS_PER_YEAR, TICKS_PER_DAY, getCalendarDay } from '../src/game/dayCycle';
import { DAILY_PHASE_HOURS, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { logEvent } from '../src/game/eventLog';
import { isPlayerHuman } from '../src/game/playerHuman';
import {
  createGuidedCampaignState,
  getGuidedCampaignProgress,
  startGuidedCampaign,
} from '../src/game/guidedCampaign';
import {
  maybeOfferChildrenShelter,
  maybeOfferHowlerRumor,
  maybeOfferRangerVisit,
  maybeOfferWolfChoice,
  maybeOfferWinterPrep,
  respondToStoryEvent,
  tickChildrenShelter,
  tickPendingStoryEvents,
  tickWinterFreezeCheck,
} from '../src/game/storyEvents';
import { maybeOfferDeerParliament } from '../src/game/deerParliament';
import { maybeOfferTravelingTheatre } from '../src/game/travelingTheatre';
import { maybeOfferWeddingDiplomacy } from '../src/game/weddingDiplomacy';
import { maybeOfferRumourLedger } from '../src/game/rumourLedger';

function worldAt(dayInYear: number, year = 0): WorldState {
  const world = initGame({ skipTerrain: true, villageName: 'ExpiryVale', seed: 991 });
  world.tick = year * DAYS_PER_YEAR * TICKS_PER_DAY
    + dayInYear * TICKS_PER_DAY
    + DAILY_PHASE_HOURS.worldEvents * TICKS_PER_HOUR;
  world.year = year;
  world.dayInYear = dayInYear;
  world.storyFlags = {};
  // A long festival suppresses the seeded festival roll, so reputation assertions isolate story effects.
  world.festival = { active: true, name: 'Expiry Vale Festival', daysLeft: 300 };
  return world;
}

function tickContext(world: WorldState, alive: Entity[]): TickContext {
  const byType: Partial<Record<EntityType, Entity[]>> = {};
  for (const entity of alive) {
    (byType[entity.type] ??= []).push(entity);
  }
  return {
    width: world.width,
    height: world.height,
    hourOfDay: DAILY_PHASE_HOURS.worldEvents,
    season: Season.Spring,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 1,
    canHeat: true,
    byType: byType as TickContext['byType'],
    aliveEntities: alive,
    newEntities: [],
    updatedBuildings: world.buildings,
    roadBuildings: [],
    playerHumans: alive.filter(isPlayerHuman),
    entityById: new Map(alive.map((entity) => [entity.id, entity])),
    buildingById: new Map(world.buildings.map((building) => [building.id, building])),
    predators: alive.filter((entity) => entity.type === EntityType.Wolf),
  };
}

/** The real daily world-events pass, at the same 18:00 phase the game uses. */
function runDailyTick(world: WorldState): void {
  const alive = world.entities.filter((entity) => entity.alive);
  tickDailyWorldEvents(
    world,
    tickContext(world, alive),
    alive,
    { humans: alive.filter(isPlayerHuman).length } as never,
  );
}

function advanceDay(world: WorldState): void {
  world.tick += TICKS_PER_DAY;
  world.dayInYear = getCalendarDay(world.tick);
  world.year = Math.floor(Math.floor(world.tick / TICKS_PER_DAY) / DAYS_PER_YEAR);
  runDailyTick(world);
}

function card(world: WorldState, storyKey: string) {
  return (world.pendingStoryEvents ?? []).find((event) => event.storyKey === storyKey);
}

/** A second expired card for the same story must hit the owner's already-resolved guard. */
function expireDuplicate(world: WorldState, storyKey: string): void {
  world.pendingStoryEvents ??= [];
  world.pendingStoryEvents.push({
    id: `${storyKey}_duplicate_${world.tick}`,
    emoji: '',
    storyKey: storyKey as never,
    title: 'duplicate',
    description: '',
    choices: [],
    createdAtTick: world.tick,
    expiresAtTick: world.tick,
  });
  tickPendingStoryEvents(world);
}

function addHuntingSpot(world: WorldState): void {
  world.buildings.push({
    id: world.nextBuildingId++,
    type: BuildingType.HuntingSpot,
    x: 300,
    y: 300,
    width: 46,
    height: 40,
    completed: true,
    faction: 'player',
    occupants: [],
    level: 1,
  } as never);
}

function addRival(world: WorldState): void {
  world.rivalSettlements.push({
    id: 'rival-expiry',
    name: 'Ashbrook Clan',
    campX: 700,
    campY: 500,
    population: 8,
    entityIds: [],
    relationship: 'neutral',
    foundedYear: 0,
    daysUntilAction: 200,
    raidCooldownDays: 200,
    peaceTreatyDays: 0,
  });
}

describe('deer parliament offer expiry', () => {
  it('resolves the chapter, advances the campaign, and cannot resolve twice', () => {
    const world = worldAt(50, 1);
    for (let i = 0; i < 6; i++) {
      world.entities.push({ id: world.nextEntityId++, type: EntityType.Deer, x: 400 + i, y: 400 + i, alive: true } as never);
    }
    addHuntingSpot(world);
    world.guidedCampaign = createGuidedCampaignState();
    startGuidedCampaign(world);

    maybeOfferDeerParliament(world);
    const offered = card(world, 'deer_parliament');
    expect(offered).toBeDefined();

    while (world.tick < offered!.expiresAtTick) advanceDay(world);

    expect(card(world, 'deer_parliament')).toBeUndefined();
    expect(world.storyFlags?.deer_parliament_resolved).toBeGreaterThan(0);
    expect(world.guidedCampaign?.completedChapterIds).toContain('deer_parliament');
    expect(getGuidedCampaignProgress(world).current?.id).toBe('traveling_theatre');

    // A second expired card for the same story must not replay the fate.
    const resolvedAt = world.storyFlags?.deer_parliament_resolved;
    const ecoAt = world.ecosystemHealth;
    expireDuplicate(world, 'deer_parliament');
    expect(world.storyFlags?.deer_parliament_resolved).toBe(resolvedAt);
    expect(world.ecosystemHealth).toBe(ecoAt);
  });
});

describe('traveling theatre offer expiry', () => {
  function theatreWorld(): WorldState {
    const world = worldAt(70, 1);
    logEvent(world, 'season', 'Spring began in the village');
    world.visitorGroups.push({
      id: 'troupe',
      name: 'The Lantern Troupe',
      kind: 'performers',
      campX: 500,
      campY: 500,
      daysLeft: 20,
      entityIds: [],
      giftsGiven: 0,
      tradesCompleted: 0,
      refugeeResolved: false,
      leaderTalked: false,
    } as never);
    world.guidedCampaign = createGuidedCampaignState();
    world.storyFlags = { guided_deer_parliament_resolved: 1 };
    startGuidedCampaign(world);
    return world;
  }

  it('ends the visit and advances the campaign without paying a reward', () => {
    const world = theatreWorld();
    const repBefore = world.villageReputation;
    maybeOfferTravelingTheatre(world);
    const offered = card(world, 'traveling_theatre');
    expect(offered).toBeDefined();

    while (world.tick < offered!.expiresAtTick) advanceDay(world);

    expect(card(world, 'traveling_theatre')).toBeUndefined();
    expect(world.storyFlags?.theatre_story_resolved).toBeGreaterThan(0);
    expect(world.villageReputation).toBe(repBefore);
    const resolvedAt = world.storyFlags?.theatre_story_resolved;
    expireDuplicate(world, 'traveling_theatre');
    expect(world.storyFlags?.theatre_story_resolved).toBe(resolvedAt);
    expect(world.villageReputation).toBe(repBefore);
    expect(world.guidedCampaign?.completedChapterIds).toContain('traveling_theatre');
    expect(getGuidedCampaignProgress(world).current?.id).toBe('wedding_diplomacy');
  });

  it('keeps opening night moving when the support card lapses and resolves it once when it expires', () => {
    const world = theatreWorld();
    maybeOfferTravelingTheatre(world);
    const stage1 = card(world, 'traveling_theatre')!;
    const answered = respondToStoryEvent(world, stage1.id, 'first_winter');
    expect(answered.storyFlags?.traveling_theatre_company_status).toBe(2);

    const stage2Card = () => answered.pendingStoryEvents?.find((event) => event.id.startsWith('theatre_stage2_'));
    expect(stage2Card()).toBeDefined();
    for (let day = 0; day < 10 && stage2Card(); day++) advanceDay(answered);
    expect(answered.storyFlags?.theatre_story_resolved ?? 0).toBe(0);
    expect(answered.storyFlags?.traveling_theatre_company_support).toBe(3);

    // Opening night arrives; let that card lapse too.
    const stage3Card = () => answered.pendingStoryEvents?.find((event) => event.id.startsWith('theatre_stage3_'));
    for (let day = 0; day < 10 && !stage3Card(); day++) advanceDay(answered);
    expect(stage3Card()).toBeDefined();
    for (let day = 0; day < 10 && stage3Card(); day++) advanceDay(answered);

    expect(answered.storyFlags?.theatre_story_resolved).toBeGreaterThan(0);
    const resolvedAt = answered.storyFlags?.theatre_story_resolved;
    expireDuplicate(answered, 'traveling_theatre');
    expect(answered.storyFlags?.theatre_story_resolved).toBe(resolvedAt);
  });
});

describe('wedding diplomacy offer expiry', () => {
  it('declines an unanswered invitation, resolves the later stage, and advances the campaign', () => {
    const world = worldAt(50, 1);
    world.buildings.push(
      {
        id: world.nextBuildingId++, type: BuildingType.House, x: 100, y: 100,
        width: 46, height: 40, occupants: [], level: 1, constructionProgress: 100,
        completed: true, health: 100, maxHealth: 100,
      } as never,
      {
        id: world.nextBuildingId++, type: BuildingType.Farm, x: 200, y: 100,
        width: 80, height: 60, occupants: [1], level: 1, constructionProgress: 100,
        completed: true, health: 100, maxHealth: 100,
      } as never,
    );
    addRival(world);
    world.guidedCampaign = createGuidedCampaignState();
    world.storyFlags = { guided_deer_parliament_resolved: 1, guided_traveling_theatre_resolved: 1 };
    startGuidedCampaign(world);
    const foodBefore = world.resources.food;
    const woodBefore = world.resources.wood;
    const goldBefore = world.resources.gold;

    maybeOfferWeddingDiplomacy(world);
    expect(card(world, 'wedding_diplomacy')).toBeDefined();

    for (let day = 0; day < 20 && (world.storyFlags?.wedding_diplomacy_resolved ?? 0) === 0; day++) {
      advanceDay(world);
    }

    expect(world.storyFlags?.wedding_diplomacy_resolved).toBeGreaterThan(0);
    expect(world.resources.food).toBe(foodBefore);
    expect(world.resources.wood).toBe(woodBefore);
    expect(world.resources.gold).toBe(goldBefore);
    const resolvedAt = world.storyFlags?.wedding_diplomacy_resolved;
    expireDuplicate(world, 'wedding_diplomacy');
    expect(world.storyFlags?.wedding_diplomacy_resolved).toBe(resolvedAt);
    expect(world.resources.food).toBe(foodBefore);
    expect(world.guidedCampaign?.completedChapterIds).toContain('wedding_diplomacy');
    expect(getGuidedCampaignProgress(world).current?.id).toBe('apprentice_invention');
  });
});

describe('rumour ledger offer expiry', () => {
  it('takes the unanswered ignore path, resolves the ledger, and completes the campaign', () => {
    const world = worldAt(70, 1);
    world.buildings.push({
      id: world.nextBuildingId++, type: BuildingType.TownHall, x: 300, y: 300,
      width: 63, height: 53, occupants: [], level: 1, constructionProgress: 100,
      completed: true, health: 100, maxHealth: 100,
    } as never);
    logEvent(world, 'birth', 'A child was born in the village');
    world.guidedCampaign = createGuidedCampaignState();
    world.storyFlags = {
      guided_deer_parliament_resolved: 1,
      guided_traveling_theatre_resolved: 1,
      guided_wedding_diplomacy_resolved: 1,
      guided_apprentice_invention_resolved: 1,
    };
    startGuidedCampaign(world);

    maybeOfferRumourLedger(world);
    const offered = card(world, 'rumour_ledger');
    expect(offered).toBeDefined();

    while (world.tick < offered!.expiresAtTick) advanceDay(world);
    expect(card(world, 'rumour_ledger')).toBeUndefined();
    expect(world.storyFlags?.rumour_ledger_response).toBe(3);

    for (let day = 0; day < 10 && (world.storyFlags?.rumour_ledger_resolved ?? 0) === 0; day++) {
      advanceDay(world);
    }
    expect(world.storyFlags?.rumour_ledger_resolved).toBeGreaterThan(0);
    const resolvedAt = world.storyFlags?.rumour_ledger_resolved;
    expireDuplicate(world, 'rumour_ledger');
    expect(world.storyFlags?.rumour_ledger_resolved).toBe(resolvedAt);
    expect(world.guidedCampaign?.completed).toBe(true);
  });
});

describe('winter prep expiry', () => {
  it('records the lapse and fails visibly at the first freeze, once', () => {
    const world = worldAt(210, 0);
    maybeOfferWinterPrep(world);
    const offered = card(world, 'winter_prep');
    expect(offered).toBeDefined();

    while (world.tick < offered!.expiresAtTick) advanceDay(world);
    expect(card(world, 'winter_prep')).toBeUndefined();
    expect(world.storyFlags?.winter_prep_lapsed).toBeGreaterThan(0);
    expect(world.storyFlags?.winter_resolved ?? 0).toBe(0);
    const lapsedAt = world.storyFlags?.winter_prep_lapsed;
    expireDuplicate(world, 'winter_prep');
    expect(world.storyFlags?.winter_prep_lapsed).toBe(lapsedAt);

    world.tick = 270 * TICKS_PER_DAY + DAILY_PHASE_HOURS.worldEvents * TICKS_PER_HOUR;
    world.dayInYear = 270;
    world.year = 0;
    const repBefore = world.villageReputation;
    tickWinterFreezeCheck(world);
    expect(world.storyFlags?.winter_resolved).toBeGreaterThan(0);
    expect(world.villageReputation).toBe(repBefore);
    expect(world.eventLog.some((entry) => entry.message.includes('winter test go unanswered'))).toBe(true);

    const resolvedAt = world.storyFlags?.winter_resolved;
    tickWinterFreezeCheck(world);
    expect(world.storyFlags?.winter_resolved).toBe(resolvedAt);
  });
});

describe('children shelter offer expiry', () => {
  it('starts the refusal chain and resolves to the rival consequence once', () => {
    const world = worldAt(10, 0);
    addRival(world);
    world.buildings.push({
      id: world.nextBuildingId++, type: BuildingType.House, x: 100, y: 100,
      width: 46, height: 40, occupants: [], level: 1, constructionProgress: 100,
      completed: true, health: 100, maxHealth: 100,
    } as never);
    maybeOfferChildrenShelter(world);
    const offered = card(world, 'children_shelter');
    expect(offered).toBeDefined();

    while (world.tick < offered!.expiresAtTick) advanceDay(world);

    expect(card(world, 'children_shelter')).toBeUndefined();
    expect(world.storyFlags?.children_shelter_started).toBeGreaterThan(0);
    expect(world.storyFlags?.children_shelter_helped).toBe(0);
    expect(world.storyFlags?.children_shelter_resolved ?? 0).toBe(0);
    expect(world.rivalSettlements[0].relationship).toBe('neutral');
    const startedAt = world.storyFlags?.children_shelter_started;
    const untilAt = world.storyFlags?.children_shelter_until;
    expireDuplicate(world, 'children_shelter');
    expect(world.storyFlags?.children_shelter_started).toBe(startedAt);
    expect(world.storyFlags?.children_shelter_until).toBe(untilAt);

    for (let day = 0; day < 6 && (world.storyFlags?.children_shelter_resolved ?? 0) === 0; day++) {
      advanceDay(world);
    }
    expect(world.storyFlags?.children_shelter_resolved).toBeGreaterThan(0);
    expect(world.rivalSettlements[0].relationship).toBe('tense');

    const resolvedAt = world.storyFlags?.children_shelter_resolved;
    tickChildrenShelter(world);
    expect(world.storyFlags?.children_shelter_resolved).toBe(resolvedAt);
    expect(world.rivalSettlements[0].relationship).toBe('tense');
  });
});

describe('ranger / howler ordering', () => {
  it('an expired ranger card does not become the ranger\'s tale; a traveller carries the warning', () => {
    const world = worldAt(10, 0);
    world.storyFlags = { wolf_choice: 1, wolf_resolved: 2, wolf_resolvedTick: 0 };
    const repBefore = world.villageReputation;
    maybeOfferRangerVisit(world);
    const offered = card(world, 'ranger_visit');
    expect(offered).toBeDefined();

    while (world.tick < offered!.expiresAtTick) advanceDay(world);
    expect(card(world, 'ranger_visit')).toBeUndefined();
    expect(world.storyFlags?.ranger_visit_lapsed).toBeGreaterThan(0);
    expect(world.storyFlags?.ranger_visit_resolved ?? 0).toBe(0);
    expect(world.villageReputation).toBe(repBefore);
    const lapsedAt = world.storyFlags?.ranger_visit_lapsed;
    expireDuplicate(world, 'ranger_visit');
    expect(world.storyFlags?.ranger_visit_lapsed).toBe(lapsedAt);

    world.tick = 200 * TICKS_PER_DAY + DAILY_PHASE_HOURS.worldEvents * TICKS_PER_HOUR;
    world.dayInYear = 200;
    maybeOfferHowlerRumor(world);
    const howler = card(world, 'howler_rumor');
    expect(howler).toBeDefined();
    expect(world.storyFlags?.howler_rumor_variant).toBe(2);
    expect(howler!.title).toBe("A traveller's tale");
    expect(howler!.description).not.toMatch(/ranger/i);
  });

  it('a pending ranger card holds the howler tale until the ranger is answered', () => {
    const world = worldAt(180, 0);
    world.storyFlags = { wolf_choice: 1, wolf_resolved: 2, wolf_resolvedTick: 0 };
    maybeOfferRangerVisit(world);
    const ranger = card(world, 'ranger_visit');
    expect(ranger).toBeDefined();

    maybeOfferHowlerRumor(world);
    expect(card(world, 'howler_rumor')).toBeUndefined();

    const answered = respondToStoryEvent(world, ranger!.id, 'acknowledge');
    expect(answered.storyFlags?.ranger_visit_resolved).toBeGreaterThan(0);
    maybeOfferHowlerRumor(answered);
    const howler = card(answered, 'howler_rumor');
    expect(howler).toBeDefined();
    expect(answered.storyFlags?.howler_rumor_variant).toBe(1);
    expect(howler!.title).toBe("The ranger's tale");
  });

  it('an expired wolf choice records an undecided fate and leaves the warning to a traveller', () => {
    const world = worldAt(60, 0);
    maybeOfferWolfChoice(world);
    const offered = card(world, 'wolf_choice');
    expect(offered).toBeDefined();
    while (world.tick < offered!.expiresAtTick) advanceDay(world);

    expect(card(world, 'wolf_choice')).toBeUndefined();
    expect(world.storyFlags?.wolf_resolved).toBe(3);
    const wolfResolvedAt = world.storyFlags?.wolf_resolvedTick;
    expireDuplicate(world, 'wolf_choice');
    expect(world.storyFlags?.wolf_resolved).toBe(3);
    expect(world.storyFlags?.wolf_resolvedTick).toBe(wolfResolvedAt);
    world.tick = 200 * TICKS_PER_DAY + DAILY_PHASE_HOURS.worldEvents * TICKS_PER_HOUR;
    world.dayInYear = 200;
    maybeOfferRangerVisit(world);
    expect(card(world, 'ranger_visit')).toBeUndefined();
    maybeOfferHowlerRumor(world);
    expect(card(world, 'howler_rumor')).toBeDefined();
    expect(world.storyFlags?.howler_rumor_variant).toBe(2);
  });
});
