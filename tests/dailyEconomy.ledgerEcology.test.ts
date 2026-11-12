/**
 * S-07/S-08/S-09 — the daily economy and ecology owners:
 * a Bountiful Harvest grant lasts exactly its year, every stored food gain reaches the one ledger,
 * and grass regrows by the day so pasture can actually thin and pressure can respond.
 */
import { describe, expect, it } from 'vitest';
import { createEntity, initGame } from '../src/game/worldGen';
import {
  BUILDING_CONFIGS, BuildingType, EntityType, JobType, Season, WeatherType, emptyEntityByType,
} from '../src/game/gameTypes';
import type {
  Building, Entity, RivalSettlement, TradeRoute, VisitorGroup, WorldState,
} from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { TICKS_PER_HOUR, getAbsoluteCalendarDay, tickAtDailyPhase } from '../src/game/dayCycleClock';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { countLivingPopulation } from '../src/game/entityCounts';
import { isPlayerHuman } from '../src/game/playerHuman';
import { getScheduleTargetHours } from '../src/game/scheduleFatigue';
import { setSimSeed } from '../src/game/simRng';
import { tickDailyWorldEvents, tickYearBoundaryWorldEvents } from '../src/game/dailyWorldEvents';
import { tickDailyBuildingEconomy } from '../src/game/dailyBuildingEconomy';
import { tickVisitorGroups } from '../src/game/groupEvents';
import { getTradeHubCenter, tryAdvanceCaravanLeg } from '../src/game/tradeCaravans';
import { respondToDiplomacyEvent } from '../src/game/rivalDiplomacy';
import {
  getRecentFoodFlow, isMeasuredFoodDeficit, rollEconomyLedgerForDay, spendFood,
} from '../src/game/economyLedger';
import { canSupportImmigration } from '../src/game/dailyPopulation';
import { tickGrassDaily } from '../src/game/dailyGrassEcology';
import { getGrazingPressureReport } from '../src/game/ecosystemPressure';
import {
  GRASS_MAX_ENERGY, getGrassGrowthMultiplier,
} from '../src/game/grassEcology';

const FIXTURE_SEED = 20_261_111;

function living(state: WorldState): Entity[] {
  return state.entities.filter((entity) => entity.alive);
}

/** A real tick context over the fixture's own cast, so the owners run as they do in a tick. */
function contextFor(state: WorldState): TickContext {
  const alive = living(state);
  const byType = emptyEntityByType();
  for (const entity of alive) byType[entity.type].push(entity);
  return {
    width: state.width,
    height: state.height,
    hourOfDay: 18,
    season: state.season,
    grassMult: getGrassGrowthMultiplier(state.season, state.weather),
    reproMult: 1,
    winterPenalty: 0,
    canHeat: true,
    byType,
    aliveEntities: alive,
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: alive.filter(isPlayerHuman),
    entityById: new Map(alive.map((entity) => [entity.id, entity])),
    buildingById: new Map(state.buildings.map((building) => [building.id, building])),
    predators: [],
  };
}

function runDailyWorldEvents(state: WorldState): void {
  const alive = living(state);
  tickDailyWorldEvents(state, contextFor(state), alive, countLivingPopulation(alive, []));
}

describe('S-07 — a Bountiful Harvest grant lasts exactly its year', () => {
  /** The 18:00 world-events pass of a non-boundary day in year 1, after that odd year granted the flag. */
  function grantedHarvestInItsYear(): WorldState {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    state.year = 1;
    state.lastEventYear = 1;
    state.dayInYear = 40;
    state.tick = tickAtDailyPhase(400, 'production');
    state.bountifulHarvest = true;
    return state;
  }

  it('does not erase an odd-year grant during the year it was rolled for', () => {
    const state = grantedHarvestInItsYear();

    runDailyWorldEvents(state);

    expect(state.bountifulHarvest, 'the odd-year grant was cleared in the same daily pass').toBe(true);
  });

  it('doubles farm output while the grant is active', () => {
    const farmWorld = (bountiful: boolean): WorldState => {
      const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
      const config = BUILDING_CONFIGS[BuildingType.Farm];
      const farm: Building = {
        id: 30_001,
        type: BuildingType.Farm,
        x: 0,
        y: 0,
        width: config.width,
        height: config.height,
        occupants: [],
        level: 1,
        constructionProgress: 100,
        completed: true,
        health: 100,
        maxHealth: 100,
        spriteScale: 1,
        buildAnimTimer: 0,
      };
      state.buildings.push(farm);
      const workers = state.entities.filter((entity) => entity.alive && isPlayerHuman(entity)).slice(0, 2);
      expect(workers.length, 'fixture premise: the colony starts with settlers').toBeGreaterThan(0);
      for (const worker of workers) {
        worker.workerBuildingId = farm.id;
        worker.job = JobType.Farmer;
        worker.scheduleLastWorkedHours = getScheduleTargetHours(state);
      }
      farm.occupants = workers.map((worker) => worker.id);
      state.resources.food = 100;
      state.storageMax.food = 10_000;
      state.bountifulHarvest = bountiful;
      // Day 1 is a workday, so the Farm's one-day production interval fires.
      state.tick = tickAtDailyPhase(1, 'production');
      return state;
    };

    const harvestOf = (state: WorldState): number => {
      setSimSeed(FIXTURE_SEED);
      tickDailyBuildingEconomy(state, contextFor(state), living(state));
      return state.economyLedger?.produced.farms ?? 0;
    };

    const plain = harvestOf(farmWorld(false));
    const granted = harvestOf(farmWorld(true));

    expect(plain, 'fixture premise: the farm harvested').toBeGreaterThan(0);
    // The multiplier is applied before the owner's integer floor, so a doubled harvest is 2x or 2x+1.
    expect(granted).toBeGreaterThanOrEqual(plain * 2);
    expect(granted).toBeLessThanOrEqual(plain * 2 + 1);
  });

  it('clears the previous year’s grant at the midnight year boundary, whatever that year’s parity', () => {
    // Odd-year grant reaching year 2, and even-year grant reaching year 3.
    for (const { year, grantedYear, firstDay } of [
      { year: 2, grantedYear: 1, firstDay: 360 },
      { year: 3, grantedYear: 2, firstDay: 720 },
    ]) {
      const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
      state.year = year;
      state.lastEventYear = grantedYear;
      state.dayInYear = 0;
      state.tick = firstDay * TICKS_PER_DAY;
      state.bountifulHarvest = true;

      tickYearBoundaryWorldEvents(state);

      expect(state.bountifulHarvest, `a year-${grantedYear} grant bled into year ${year}`).toBe(false);
    }
  });
});

describe('S-08 — every stored food gain reaches the daily ledger', () => {
  const ROUTE_FOOD = 100;
  const MEALS_PER_DAY = 60;

  function tradeRoute(): TradeRoute {
    return {
      id: 'route-ledger',
      targetName: 'Millbrook',
      resourcesGiven: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
      resourcesReceived: { wood: 0, stone: 0, food: ROUTE_FOOD, gold: 0, iron: 0 },
      reputationRequired: 0,
      active: true,
      partnerX: 100,
      partnerY: 100,
    };
  }

  it('records caravan imports as produced food, so a trade-fed larder can admit settlers', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    const route = tradeRoute();
    state.tradeRoutes = [route];
    state.resources.food = 5_000; // a full larder the deficit check would otherwise ignore
    state.storageMax.food = 20_000;
    let imported = 0;

    for (let day = 1; day <= 7; day++) {
      state.tick = day * TICKS_PER_DAY + 8 * TICKS_PER_HOUR;
      const hub = getTradeHubCenter(state);
      const carrier = createEntity(EntityType.Human, hub.x, hub.y, state.nextEntityId++, 300, false, {
        name: 'Millbrook trader',
        faction: 'trade_caravan',
      });
      carrier.groupId = route.id;
      route.caravanLeg = 'inbound';
      route.caravanCarrierId = carrier.id;

      const before = state.resources.food;
      tryAdvanceCaravanLeg(state, carrier);
      const gained = state.resources.food - before;
      expect(gained, `day ${day} caravan delivered no food`).toBeGreaterThan(0);
      expect(state.economyLedger?.produced.trade, `day ${day} import missing from the ledger`).toBe(gained);
      imported += gained;

      spendFood(state, 'meals', MEALS_PER_DAY);
    }

    // Close day 7 so the seven-day window reads completed days only.
    state.tick = 8 * TICKS_PER_DAY;
    rollEconomyLedgerForDay(state);

    const flow = getRecentFoodFlow(state, 7, 'meals');
    expect(flow?.days).toBe(7);
    expect(flow?.producedPerDay).toBeCloseTo(imported / 7, 5);
    expect(isMeasuredFoodDeficit(state, 0.05)).toBe(false);
    expect(canSupportImmigration(state, 20, 1), 'a larder fed by recorded trade cannot admit').toBe(true);
  });

  it('records a visitor group’s daily food gift under the gift source', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    state.tick = 100 * TICKS_PER_DAY;
    state.resources.food = 100;
    state.storageMax.food = 10_000;
    const group: VisitorGroup = {
      id: 'visitor-gift',
      name: 'The Brass Kettle Caravan',
      kind: 'traders',
      campX: state.width / 2,
      campY: state.height / 2,
      daysLeft: 5,
      entityIds: [],
      giftsGiven: 0,
      tradesCompleted: 0,
      gold: 80,
      refugeeResolved: false,
      leaderTalked: false,
      spawnedAtCalendarDay: getAbsoluteCalendarDay(state.tick) - 1,
    };
    state.visitorGroups = [group];

    const before = state.resources.food;
    tickVisitorGroups(state, living(state));
    const gained = state.resources.food - before;

    expect(gained, 'fixture premise: the traders gifted food').toBeGreaterThan(0);
    expect(state.economyLedger?.produced.gift).toBe(gained);
  });

  it('records a rival’s peace tribute under the tribute source', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    state.resources.food = 100;
    state.storageMax.food = 10_000;
    const rival: RivalSettlement = {
      id: 'rival-tribute',
      name: 'Hollow Ridge',
      campX: 300,
      campY: 300,
      population: 10,
      entityIds: [],
      relationship: 'competitive',
      foundedYear: 0,
      daysUntilAction: 10,
      raidCooldownDays: 0,
      peaceTreatyDays: 0,
    };
    state.rivalSettlements = [rival];
    state.pendingDiplomacyEvents = [{
      id: 'diplomacy-tribute',
      rivalId: rival.id,
      rivalName: rival.name,
      kind: 'peace_treaty',
      title: 'Peace offered',
      description: 'Hollow Ridge offers a truce.',
      emoji: '🕊️',
      choices: [],
      createdAtTick: state.tick,
    }];

    const before = state.resources.food;
    const next = respondToDiplomacyEvent(state, 'diplomacy-tribute', 'tribute');
    const gained = next.resources.food - before;

    expect(gained, 'fixture premise: the tribute paid food').toBeGreaterThan(0);
    expect(next.economyLedger?.produced.tribute).toBe(gained);
  });
});

describe('S-09 — grass regrows by the day, and grazing pressure sees it', () => {
  function grassWorld(season: Season, weather: WeatherType): { state: WorldState; blades: Entity[] } {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    state.season = season;
    state.weather = weather;
    const blades = state.entities.filter((entity) => entity.alive && entity.type === EntityType.Grass);
    for (const blade of blades) blade.energy = 0;
    return { state, blades };
  }

  it('regrows winter and drought pasture by less than one blade cap in a day', () => {
    // No growth value is asserted: the rule is "below the cap, and slower than summer".
    const caseFor = (season: Season, weather: WeatherType): number => {
      const { state, blades } = grassWorld(season, weather);
      expect(blades.length, 'fixture premise: the map has grass').toBeGreaterThan(0);
      tickGrassDaily(state, contextFor(state), []);
      return blades[0].energy;
    };
    const summer = caseFor(Season.Summer, WeatherType.Clear);
    const winter = caseFor(Season.Winter, WeatherType.Clear);
    const drought = caseFor(Season.Summer, WeatherType.Drought);

    for (const [label, gain] of [['winter', winter], ['drought', drought]] as const) {
      expect(gain, `${label} regrew nothing`).toBeGreaterThan(0);
      expect(gain, `${label} refilled the whole blade in one day`).toBeLessThan(GRASS_MAX_ENERGY);
      expect(gain, `${label} regrew as fast as summer`).toBeLessThan(summer);
    }
  });

  it('reports lower recovery and higher pressure in winter and drought than in summer', () => {
    const PASTURE = 30;
    function report(season: Season, weather: WeatherType) {
      const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
      state.season = season;
      state.weather = weather;
      // One herd and one pasture for every reading, so only season/weather can move the verdict.
      state.entities = [];
      state.wildlifeCounts = {
        grass: PASTURE, rabbits: 2, deer: 3, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0, trees: 0,
      };
      for (let i = 0; i < PASTURE; i++) {
        state.entities.push(createEntity(EntityType.Grass, 10 + i, 10, state.nextEntityId++, 50));
      }
      return getGrazingPressureReport(state);
    }

    const summer = report(Season.Summer, WeatherType.Clear);
    const winter = report(Season.Winter, WeatherType.Clear);
    const drought = report(Season.Summer, WeatherType.Drought);

    expect(summer.level).toBe('stable');
    expect(winter.grassRecoveryPerDay).toBeLessThan(summer.grassRecoveryPerDay);
    expect(winter.pressureRatio).toBeGreaterThan(summer.pressureRatio);
    expect(winter.level).toBe('critical');
    expect(drought.grassRecoveryPerDay).toBeLessThan(summer.grassRecoveryPerDay);
    expect(drought.pressureRatio).toBeGreaterThan(summer.pressureRatio);
    expect(drought.level).not.toBe('stable');
  });
});

describe('W-90 — a dead crew id neither speeds construction nor earns skill', () => {
  /** An unfinished House site with the given roster; a House is a passive build with no crew slots. */
  function siteWorld(occupantIds: number[]): WorldState {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    const config = BUILDING_CONFIGS[BuildingType.House];
    state.season = Season.Spring;
    state.tick = tickAtDailyPhase(1, 'production');
    state.entities = [];
    state.buildings = [{
      id: 9_001,
      type: BuildingType.House,
      x: 400,
      y: 400,
      width: config.width,
      height: config.height,
      occupants: occupantIds,
      level: 1,
      constructionProgress: 10,
      completed: false,
      health: 100,
      maxHealth: 100,
      spriteScale: 0,
      buildAnimTimer: 0,
    }];
    return state;
  }

  it('advances at the same pace with a corpse in the roster as with an empty one', () => {
    const corpse = createEntity(EntityType.Human, 420, 420, 77);
    corpse.alive = false;
    const withCorpse = siteWorld([corpse.id]);
    withCorpse.entities = [corpse];
    const empty = siteWorld([]);
    empty.entities = [];

    tickDailyBuildingEconomy(withCorpse, contextFor(withCorpse), living(withCorpse));
    tickDailyBuildingEconomy(empty, contextFor(empty), living(empty));

    expect(withCorpse.buildings[0].constructionProgress).toBeGreaterThan(10);
    expect(withCorpse.buildings[0].constructionProgress)
      .toBe(empty.buildings[0].constructionProgress);
    // The dead id earns no construction skill either.
    expect(corpse.skills?.[JobType.Builder] ?? 0).toBe(0);
  });
});
