/**
 * S-07/S-08/S-09 — the daily economy and ecology owners:
 * a Bountiful Harvest grant lasts exactly its year, every stored food gain reaches the one ledger,
 * and grass regrows by the day so pasture can actually thin and pressure can respond.
 */
import { rebuildEntityByIdMap } from '../src/game/entityIndex';
import { invalidateCachedEntityByType } from '../src/game/entityTypeCache';
import { getWeatherFarmMultiplier } from '../src/game/worldEvents';
import { getMultiplier } from '../src/game/simHelpers';
import { gameTick } from '../src/game/gameEngine';
import { describe, expect, it } from 'vitest';
import { createBuilding, createEntity, initGame } from '../src/game/worldGen';
import {
  BUILDING_CONFIGS, BuildingType, EntityType, JobType, Season, WeatherType, emptyEntityByType,
} from '../src/game/gameTypes';
import type {
  Building, Entity, RivalSettlement, TradeRoute, WorldState,
} from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { TICKS_PER_HOUR, getAbsoluteCalendarDay, tickAtDailyPhase } from '../src/game/dayCycleClock';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { countLivingPopulation } from '../src/game/entityCounts';
import { isPlayerHuman } from '../src/game/playerHuman';
import { getScheduleTargetHours } from '../src/game/scheduleFatigue';
import { setSimSeed } from '../src/game/simRng';
import { tickDailyWorldEvents, tickYearBoundaryWorldEvents } from '../src/game/dailyWorldEvents';
import { tickBuildingProgress, tickDailyBuildingEconomy } from '../src/game/dailyBuildingEconomy';
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
    state.tick = tickAtDailyPhase(1, 'construction');
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

    // Construction closes at 23:00 in its own owner; the 18:00 economy pass does not advance sites.
    tickBuildingProgress(withCorpse);
    tickBuildingProgress(empty);

    expect(withCorpse.buildings[0].constructionProgress).toBeGreaterThan(10);
    expect(withCorpse.buildings[0].constructionProgress)
      .toBe(empty.buildings[0].constructionProgress);
    // The dead id earns no construction skill either.
    expect(corpse.skills?.[JobType.Builder] ?? 0).toBe(0);
  });
});

/**
 * A controlled village: one adult settler, one completed producer, so the daily economy has
 * exactly one staffed building; day 1 is a workday production tick.
 */
function loneProducerVillage(
  type: BuildingType,
  seed = 4242,
): { state: WorldState; building: Building } {
  const state = initGame({ villageName: 'C1', size: 'medium', seed });
  const building = createBuilding(type, 240, 240, 9001);
  building.completed = true;
  building.constructionProgress = 100;

  const worker = state.entities.find(
    (e) =>
      e.type === EntityType.Human &&
      e.alive &&
      !e.isJuvenile &&
      !e.faction &&
      e.occupation !== 'leader',
  );
  if (!worker) throw new Error('fixture: starter village has no adult settler');

  state.buildings = [building];
  state.entities = [worker];
  rebuildEntityByIdMap(state);
  invalidateCachedEntityByType(state);

  // This isolated producer represents a settler who actually attended their
  // completed workplace during the preceding shift.
  worker.x = building.x + building.width / 2;
  worker.y = building.y + building.height / 2;
  worker.workerBuildingId = building.id;
  worker.job = JobType.Farmer;
  worker.occupation = 'farmer';
  // Production now depends on actual attendance from the previous settled shift.
  // The isolated fixture bypasses the realtime work ticks, so supply their earned hours.
  worker.scheduleLastWorkedHours = 8;
  building.occupants = [worker.id];

  state.resources.food = 0;
  // gameTick advances the clock first, so this lands on day 1 at 18:00 — the production phase.
  state.tick = tickAtDailyPhase(1, 'production') - 1;
  return { state, building };
}

describe('M5 greenhouse food production reaches the economy ledger', () => {
  it('records staffed greenhouse output under its own ledger row', () => {
    const { state } = loneProducerVillage(BuildingType.Greenhouse);
    gameTick(state);

    expect(state.resources.food, 'the greenhouse actually produced food').toBeGreaterThan(0);
    const ledger = state.economyLedger;
    expect(ledger, 'a production day creates a ledger').toMatchObject({ produced: { greenhouse: expect.any(Number) } });
    // The greenhouse row must exist and account for the food that reached storage.
    expect(ledger?.produced.greenhouse ?? 0, 'greenhouse ledger row').toBeGreaterThan(0);
    expect(ledger?.produced.greenhouse ?? 0).toBeGreaterThanOrEqual(state.resources.food);
  });
});

describe('M10 Irrigation drought_resist is consumed by the drought farm penalty', () => {
  it('is read from research state and softens the drought penalty by 1.5x', () => {
    const state = initGame({ villageName: 'C1', size: 'medium', seed: 11 });
    expect(getMultiplier(state, 'drought_resist')).toBe(1);

    const unresearched = getWeatherFarmMultiplier(
      WeatherType.Drought,
      getMultiplier(state, 'drought_resist'),
    );
    expect(unresearched).toBeCloseTo(0.5);

    const node = state.researchNodes.find((n) => n.id === 'agriculture_3');
    expect(node, 'agriculture_3 (Irrigation) node exists').toMatchObject({ id: 'agriculture_3', researched: false });
    node!.researched = true;

    expect(getMultiplier(state, 'drought_resist')).toBeCloseTo(1.5);
    // "Farms work 50% better in drought": 0.5 * 1.5 = 0.75.
    expect(
      getWeatherFarmMultiplier(WeatherType.Drought, getMultiplier(state, 'drought_resist')),
    ).toBeCloseTo(0.75);
    // The resist is drought-only — clear weather is untouched.
    expect(
      getWeatherFarmMultiplier(WeatherType.Clear, getMultiplier(state, 'drought_resist')),
    ).toBeCloseTo(1);
  });

  it('raises real farm output in a drought once Irrigation is researched', () => {
    const plain = loneProducerVillage(BuildingType.Farm);
    plain.state.weather = WeatherType.Drought;
    gameTick(plain.state);

    const irrigated = loneProducerVillage(BuildingType.Farm);
    irrigated.state.weather = WeatherType.Drought;
    irrigated.state.researchNodes.find((n) => n.id === 'agriculture_3')!.researched = true;
    gameTick(irrigated.state);

    expect(plain.state.resources.food, 'the drought farm still produced food').toBeGreaterThan(0);
    // Irrigation must raise the drought harvest above the unresearched farm's.
    expect(irrigated.state.resources.food).toBeGreaterThan(plain.state.resources.food);
  });
});

describe('completed Mill bonus', () => {
  /** A farm with one witnessed shift, standing on the tick before its 18:00 production pass. */
  function farmWorld(mill: 'none' | 'player'): WorldState {
    const state = initGame({ skipTerrain: true, villageName: 'Audit', size: 'medium', seed: 20_261_112 });
    const farm = createBuilding(BuildingType.Farm, 100, 100, 30);
    farm.completed = true;
    farm.constructionProgress = 100;
    farm.occupants = [1];
    const worker = createEntity(EntityType.Human, 100, 100, 1, 400, false,
      { gender: 'male', name: 'Settler1', surname: 'Test', ageYears: 30, colonyDay: 0 });
    worker.workerBuildingId = farm.id;
    worker.scheduleLastWorkedHours = 9;
    state.entities = [worker];
    state.buildings = [farm];
    if (mill !== 'none') {
      const millBuilding = createBuilding(BuildingType.Mill, 200, 100, 31);
      millBuilding.completed = true;
      millBuilding.constructionProgress = 100;
      state.buildings.push(millBuilding);
    }
    state.resources.food = 300;
    state.tick = tickAtDailyPhase(2, 'production') - 1;
    return state;
  }

  function runProductionPass(state: WorldState): number {
    const before = state.resources.food;
    gameTick(state);
    return state.resources.food - before;
  }

  describe('the Mill farm bonus', () => {
    it('raises farm output when a completed Mill stands', () => {
      const none = runProductionPass(farmWorld('none'));
      const player = runProductionPass(farmWorld('player'));

      expect(none, 'the fixture must produce food, or the bonus proves nothing').toBeGreaterThan(0);
      expect(player, 'a completed Mill raises farm output').toBeGreaterThan(none);
    });
  });
});
