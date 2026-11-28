/** Real-world fixtures for integrated human decision regressions. */
import { EntityType, JobType, Season, WeatherType } from '../../src/game/gameTypes';
import type { BuildingType, Building, Entity, WorldState } from '../../src/game/gameTypes';
import type { TickContext } from '../../src/game/simulation/simulationTypes';
import { TICKS_PER_DAY, TICKS_PER_HOUR, getHourOfDay } from '../../src/game/dayCycleClock';
import { isPlayerHuman } from '../../src/game/playerHuman';
import { initGame } from '../../src/game/worldGen';

export const HUMAN_SCENARIO_SEED = 20_260_101;

/** A fully-formed settler prototype, so tests do not hand-build a partial Entity. */
let settlerPrototype: Entity | undefined;

function baseSettler(): Entity {
  if (!settlerPrototype) {
    const probe = initGame({ skipTerrain: true, seed: 4242 });
    const found = probe.entities.find((e) => isPlayerHuman(e) && !e.isJuvenile && e.alive);
    if (!found) throw new Error('worldGen produced no settler to use as a test prototype');
    settlerPrototype = found;
  }
  return structuredClone(settlerPrototype);
}

export function scenarioSettler(id: number, overrides: Partial<Entity> = {}): Entity {
  return Object.assign(baseSettler(), {
    id,
    alive: true,
    isJuvenile: false,
    age: 30,
    energy: 90,
    maxEnergy: 100,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    flash: 0,
    faction: undefined,
    occupation: 'settler',
    job: JobType.Settler,
    workerBuildingId: undefined,
    residenceBuildingId: undefined,
    prisonBuildingId: undefined,
    relationshipStatus: 'single',
    partnerId: undefined,
    affairPartnerId: undefined,
    affairProgress: 0,
    prisonSentenceCrime: undefined,
    prisonerUntilTick: undefined,
  }, overrides);
}

export function scenarioBuilding(id: number, type: BuildingType, overrides: Partial<Building> = {}): Building {
  return {
    id,
    type,
    completed: true,
    faction: undefined,
    occupants: [],
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    ...overrides,
  } as unknown as Building;
}

/** Full valid world from worldGen, stripped of its own colony for the scenario. */
export function scenarioWorld(): WorldState {
  const state = initGame({ skipTerrain: true, seed: HUMAN_SCENARIO_SEED });
  state.entities = [];
  state.buildings = [];
  state.pendingRaidEvents = [];
  state.pendingOutgoingRaidEvents = [];
  state.pendingDiplomacyEvents = [];
  state.pendingStoryEvents = [];
  state.electionCeremony = null;
  state.pendingElectionYear = null;
  state.resources.food = 100;
  state.resources.gold = 100;
  state.weather = WeatherType.Clear;
  // Mid-day, away from the new-calendar-day boundary so daily rules stay out of the way.
  state.tick = TICKS_PER_DAY + 12 * TICKS_PER_HOUR;
  return state;
}

export function scenarioContext(state: WorldState, humans: Entity[]): TickContext {
  return {
    width: state.width,
    height: state.height,
    hourOfDay: getHourOfDay(state.tick),
    season: Season.Spring,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 0,
    canHeat: true,
    byType: { [EntityType.Human]: humans } as unknown as TickContext['byType'],
    aliveEntities: humans,
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: humans.filter(isPlayerHuman),
    entityById: new Map(humans.map((h) => [h.id, h])),
    buildingById: new Map(state.buildings.map((b) => [b.id, b])),
    predators: [],
  };
}
