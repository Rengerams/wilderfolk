/**
 * Medium-severity simulation-audit findings M3, M4, M15, M16.
 *
 * M3  buildingStaffingActions.ts — the construction-builder picker must use the
 *     same eligibility rules as the assignment it feeds: no pregnant settler is
 *     put on a construction crew, and no "Builder Assigned" is announced when
 *     addToConstructionCrew refuses.
 * M4  buildingStaffingActions.ts — canAssignWorkerToBuilding's unfinished-building
 *     branch must require `!hasWorkAssignment`, or the button is enabled for an
 *     action the assignment path always refuses.
 * M15 humanTick.ts — the throttled off-screen drain must call the single
 *     humanEnergyLoss owner, so exhaustion does not depend on the camera.
 * M16 humanTick.ts — an on-duty Official at a completed Town Hall must reach
 *     officialHandlePetitioners.
 */
import { describe, expect, it } from 'vitest';
import {
  BuildingType,
  EntityType,
  JobType,
  MapSize,
  Season,
  emptyEntityByType,
} from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import {
  assignBuilderToBuilding,
  canAssignWorkerToBuilding,
} from '../src/game/buildingStaffingActions';
import { tickHumans } from '../src/game/humanTick';
import { OFFSCREEN_HUMAN_THROTTLE, type SimulationFocus } from '../src/game/simFocus';
import { personDayRoll, prefersHomeTonightFor } from '../src/game/humanSchedule';
import { DEFAULT_WORK_SCHEDULE } from '../src/game/workSchedule';
import { TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { isPlayerHuman } from '../src/game/playerHuman';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 10,
    y: 10,
    energy: 100,
    maxEnergy: 100,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 80,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    reproductionCooldown: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 0,
    isJuvenile: false,
    job: JobType.Settler,
    ...overrides,
  } as Entity;
}

function building(id: number, type: BuildingType, overrides: Partial<Building> = {}): Building {
  return {
    id,
    type,
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    occupants: [],
    level: 1,
    constructionProgress: 1,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    ...overrides,
  } as Building;
}

function makeWorld(entities: Entity[], buildings: Building[]): WorldState {
  return {
    entities,
    buildings,
    tick: 0,
    notifications: [],
    floatingTexts: [],
    nextFloatingTextId: 1,
  } as unknown as WorldState;
}

function pickId(predicate: (id: number) => boolean): number {
  for (let id = 1; id <= 500; id++) {
    if (predicate(id)) return id;
  }
  throw new Error('no fixture id satisfied the predicate');
}

/** Minimal real TickContext for tickHumans, built from a real initGame state. */
function simContext(
  state: WorldState,
  humans: Entity[],
  hourOfDay: number,
  focus?: SimulationFocus,
): TickContext {
  const byType = emptyEntityByType();
  byType[EntityType.Human] = humans;
  return {
    width: state.width,
    height: state.height,
    hourOfDay,
    season: Season.Summer,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 1,
    canHeat: true,
    byType,
    aliveEntities: humans,
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: humans.filter(isPlayerHuman),
    entityById: new Map(humans.map((h) => [h.id, h])),
    buildingById: new Map(state.buildings.map((b) => [b.id, b])),
    predators: [],
    focus,
    hasWell: false,
    hasHospital: false,
  };
}

const FAR_FOCUS: SimulationFocus = { minX: 5000, maxX: 6000, minY: 5000, maxY: 6000 };

describe('M3 — construction-builder picker matches addToConstructionCrew', () => {
  it('accepts a pregnant settler on a construction crew, as the crew owner does', () => {
    // Pregnancy stopped being an exclusion on 2026-09-17 (owner ruling, `LIVE-FINDINGS-STATUS.md` L4):
    // the crew owner itself never refused it, so the picker was the only side saying no. The picker and
    // the assignment it feeds must agree — here both accept.
    const pregnant = human(1, { pregnant: true });
    const site = building(5, BuildingType.House, { completed: false });
    const world = makeWorld([pregnant], [site]);

    const next = assignBuilderToBuilding(world, 5);

    expect(next.buildings.find((b) => b.id === 5)!.occupants).toEqual([1]);
  });
});

describe('M4 — canAssignWorkerToBuilding matches the assignment it gates', () => {
  it('is false for an unfinished building when every adult already holds a job', () => {
    const employed = human(1, { homeBuildingId: 2 });
    const farm = building(2, BuildingType.Farm, { occupants: [1] });
    const site = building(5, BuildingType.House, { completed: false });
    const world = makeWorld([employed], [farm, site]);

    expect(canAssignWorkerToBuilding(world, 5)).toBe(false);

    // The action the button would send agrees: nobody is assigned.
    const next = assignBuilderToBuilding(world, 5);
    expect(next.buildings.find((b) => b.id === 5)!.occupants).toEqual([]);
  });
});

describe('M15 — one energy-drain rule on the throttled path', () => {
  const restingTick = TICKS_PER_DAY + 23 * TICKS_PER_HOUR; // 23:00 on day 1
  const restingHour = 23;
  const settlerId = pickId(
    (id) =>
      prefersHomeTonightFor(DEFAULT_WORK_SCHEDULE, id, restingTick, restingHour)
      && (restingTick + id) % OFFSCREEN_HUMAN_THROTTLE !== 0,
  );

  function restingSettlerWorld(): WorldState {
    const state = initGame({ size: MapSize.Medium, seed: 7 });
    const home = building(900, BuildingType.House, { x: 0, y: 0, width: 46, height: 40, occupants: [settlerId] });
    const settler = human(settlerId, {
      x: home.x + home.width / 2,
      y: home.y + home.height / 2,
      energy: 500,
      maxEnergy: 500,
      residenceBuildingId: 900,
    });
    state.tick = restingTick;
    state.entities = [settler];
    state.buildings = [home];
    state.resources.food = 0;
    return state;
  }

  it('drains the same energy on-screen and off-screen', () => {
    expect(prefersHomeTonightFor(DEFAULT_WORK_SCHEDULE, settlerId, restingTick, restingHour)).toBe(true);

    const onscreen = restingSettlerWorld();
    tickHumans(onscreen, simContext(onscreen, onscreen.entities, restingHour));
    const onscreenEnergy = onscreen.entities.find((e) => e.id === settlerId)!.energy;

    const offscreen = structuredClone(restingSettlerWorld());
    tickHumans(offscreen, simContext(offscreen, offscreen.entities, restingHour, FAR_FOCUS));
    const offscreenEnergy = offscreen.entities.find((e) => e.id === settlerId)!.energy;

    expect(offscreenEnergy).toBeCloseTo(onscreenEnergy, 6);
  });
});

describe('M16 — on-duty official reaches officialHandlePetitioners', () => {
  const dayJobTick = TICKS_PER_DAY + 10 * TICKS_PER_HOUR; // 10:00 on a work day
  const dayJobHour = 10;
  const officialId = pickId(
    (id) => (dayJobTick + id) % 3 !== 0 && personDayRoll(id, dayJobTick, 836) < 0.4,
  );
  const petitionerId = officialId + 500;

  function townHallWorld(): WorldState {
    const state = initGame({ size: MapSize.Medium, seed: 7 });
    const hall = building(900, BuildingType.TownHall, {
      x: 300,
      y: 300,
      width: 60,
      height: 50,
      occupants: [officialId],
    });
    const hx = hall.x + hall.width / 2;
    const hy = hall.y + hall.height * 0.9;
    const official = human(officialId, {
      x: hx,
      y: hy,
      homeBuildingId: 900,
      job: JobType.Official,
      occupation: 'official',
      energy: 500,
      maxEnergy: 500,
      gender: 'male',
    });
    // A grieving settler next to the hall always wants a civic audience.
    const petitioner = human(petitionerId, {
      x: hx + 4,
      y: hy + 4,
      griefUntilTick: dayJobTick + 1000,
      energy: 500,
      maxEnergy: 500,
      gender: 'female',
    });
    state.tick = dayJobTick;
    state.entities = [official, petitioner];
    state.buildings = [hall];
    state.resources.food = 0;
    return state;
  }

  it('runs the hall audience behaviour and greets the petitioner', () => {
    const world = townHallWorld();
    tickHumans(world, simContext(world, world.entities, dayJobHour));

    const official = world.entities.find((e) => e.id === officialId)!;
    expect(official.chatPhrase).toBeTruthy();
  });
});
