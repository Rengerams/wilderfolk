/**
 * A colony at zero stone with a Quarry nobody works must dig itself out with no player command.
 *
 * The health-verdict suite asserts the virtual player *warns* about the unmanned Quarry; this suite
 * asserts the outcome, because the recovery does not depend on the bot: `workforce.assignMissingWorkers`
 * runs from the assign tick layer four times a colony day and crews an empty producer on its own.
 *
 * Three shapes: an idle hand, hands that are all at work, and the bot left to play the colony alone.
 */
import { describe, expect, it } from 'vitest';
import { gameTick, initGame } from '../src/game/gameEngine';
import { BUILDING_CONFIGS, BuildingType, JobType, MapSize } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { countWorkersAtBuilding } from '../src/game/workforce';
import { getPlayerCampCenter } from '../src/game/villageAnchor';
import { getPlaceBuildingFailureReason, startBuilding } from '../src/game/buildingPlacementActions';
import { applyWorkerCommand } from '../src/game/simWorker/commands';
import { decideVirtualPlayerAction } from '../src/game/virtualPlayer';
import { isPlayerHuman } from '../src/game/playerHuman';

const COLONY_SEED = 4242;
const DAYS_RUN = 6;
const AUTOPLAY_DAYS = 30;
const SPOT_SEARCH_RINGS = 8;
const SPOT_SEARCH_STEP = 32;
const TEST_TIMEOUT_MS = 120_000;

function adults(world: WorldState): Entity[] {
  return world.entities.filter((entity) => isPlayerHuman(entity) && entity.alive && !entity.isJuvenile);
}

/** `initGame` with the owner's number: an empty stone shelf, so every stone has to be dug. */
function zeroStoneColony(): WorldState {
  const world = initGame({ size: MapSize.Medium, seed: COLONY_SEED });
  world.resources.stone = 0;
  return world;
}

/** A finished producer on the first footprint the placement owner accepts, as a fixture. */
function placeCompletedProducer(world: WorldState, type: BuildingType): { world: WorldState; building: Building } {
  const camp = getPlayerCampCenter(world, world.buildings);
  if (!camp) throw new Error('fixture needs a camp to build beside');
  const before = new Set(world.buildings.map((building) => building.id));

  for (let ring = 1; ring <= SPOT_SEARCH_RINGS; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = Math.round(camp.x + dx * SPOT_SEARCH_STEP);
        const y = Math.round(camp.y + dy * SPOT_SEARCH_STEP);
        if (getPlaceBuildingFailureReason(world, type, x, y, 0) !== null) continue;

        const next = startBuilding(world, type, x, y, 0);
        const building = next.buildings.find((candidate) => !before.has(candidate.id));
        if (!building) continue;
        building.completed = true;
        building.constructionProgress = 100;
        building.occupants = [];
        return { world: next, building };
      }
    }
  }

  throw new Error(`fixture found no legal spot for ${BUILDING_CONFIGS[type].label}`);
}

function runDays(world: WorldState, days: number): WorldState {
  let next = world;
  for (let tick = 0; tick < days * TICKS_PER_DAY; tick++) next = gameTick(next);
  return next;
}

/** The app's own autoplay cadence: one ladder decision per in-game hour, dispatched like a click. */
function runAutoplay(world: WorldState, days: number, quarryId: number): {
  world: WorldState; peakStone: number; peakQuarryWorkers: number;
} {
  let next = world;
  let peakStone = next.resources.stone;
  let peakQuarryWorkers = countWorkersAtBuilding(next.entities, quarryId);
  for (let tick = 0; tick < days * TICKS_PER_DAY; tick++) {
    if (next.tick % TICKS_PER_HOUR === 0) {
      const decision = decideVirtualPlayerAction(next);
      if (decision) next = applyWorkerCommand(next, decision.command);
    }
    next = gameTick(next);
    // A functioning Quarry can refill stone that the bot spends on the next build.
    // Track the recovered stock before later purchases use it up again.
    peakStone = Math.max(peakStone, next.resources.stone);
    peakQuarryWorkers = Math.max(peakQuarryWorkers, countWorkersAtBuilding(next.entities, quarryId));
  }
  return { world: next, peakStone, peakQuarryWorkers };
}

describe('zero stone with an unmanned Quarry', () => {
  it('crews it from an idle hand and digs stone from zero, with no command at all', () => {
    const placed = placeCompletedProducer(zeroStoneColony(), BuildingType.Quarry);
    const quarryId = placed.building.id;
    let world = placed.world;
    for (const settler of adults(world)) {
      settler.workerBuildingId = undefined;
      settler.job = JobType.Settler;
    }
    expect(adults(world).length, 'fixture needs settlers').toBeGreaterThan(0);

    world = runDays(world, DAYS_RUN);

    expect(countWorkersAtBuilding(world.entities, quarryId), 'a hand must work the Quarry').toBeGreaterThan(0);
    expect(Math.floor(world.resources.stone), 'the Quarry must make stone').toBeGreaterThan(0);
  }, TEST_TIMEOUT_MS);

  it('transfers excess lumberjacks to an empty Quarry without leaving the mill unstaffed', () => {
    const quarry = placeCompletedProducer(zeroStoneColony(), BuildingType.Quarry);
    const quarryId = quarry.building.id;
    let world = quarry.world;
    // A Lumber Mill can donate one hand while keeping production alive.
    // A Farm with two workers cannot donate without risking the food supply.
    world.resources.stone = BUILDING_CONFIGS[BuildingType.LumberMill].cost.stone ?? 0;
    const mill = placeCompletedProducer(world, BuildingType.LumberMill);
    world = mill.world;
    world.resources.stone = 0;
    for (const settler of adults(world)) {
      settler.workerBuildingId = mill.building.id;
      settler.job = JobType.Lumberjack;
      settler.lastAutoJobTransferTick = undefined;
    }
    expect(
      countWorkersAtBuilding(world.entities, mill.building.id),
      'a normal producer must have surplus staff',
    ).toBeGreaterThanOrEqual(2);

    world = runDays(world, DAYS_RUN);

    expect(countWorkersAtBuilding(world.entities, quarryId), 'a rebalanced hand must work the Quarry').toBeGreaterThan(0);
    expect(countWorkersAtBuilding(world.entities, mill.building.id), 'the mill must keep one worker').toBeGreaterThan(0);
    expect(Math.floor(world.resources.stone), 'the Quarry must make stone').toBeGreaterThan(0);
  }, TEST_TIMEOUT_MS);

  it('recovers under autoplay alone, with no player command', () => {
    const placed = placeCompletedProducer(zeroStoneColony(), BuildingType.Quarry);
    const quarryId = placed.building.id;
    let world = placed.world;
    for (const settler of adults(world)) {
      settler.workerBuildingId = undefined;
      settler.job = JobType.Settler;
    }

    const result = runAutoplay(world, AUTOPLAY_DAYS, quarryId);
    world = result.world;

    // The bot's build program can use every stone it mines. Final inventory is not
    // cumulative production: a zero ending stock does not mean the Quarry never recovered.
    // A real Quarry can recover stone before a later food crisis legitimately borrows its workers.
    expect(result.peakQuarryWorkers, 'a hand must have worked the Quarry').toBeGreaterThan(0);
    expect(Math.floor(result.peakStone), 'the Quarry must replenish stone during autoplay').toBeGreaterThan(0);
  }, TEST_TIMEOUT_MS);
});
