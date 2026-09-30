/**
 * P3 assignment explanations + P5 movement reason trace — `Roadmap_V0_6.4.1.MD` lines 25 and 27.
 *
 * These tests are about *ownership*: every reason and every stop name must come from the module that
 * owns the rule, so where possible the expectation is the owner's own answer
 * (`getWorkerAssignmentRefusal`) or its own vocabulary (`BUILDING_CONFIGS[...].label`,
 * `pickSocialImpulse`), never a string the projection invented beside it.
 *
 * The world fixtures are the shared factories plus a real tile map (the `tests/pathfinding.test.ts`
 * pattern), so the blocked/rerouting cases exercise the path owner's actual A* rather than a mock.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, JobType, TERRAIN_TILE_SIZE, TerrainType } from '../src/game/gameTypes';
import type { Building, Entity, WorldMap, WorldState } from '../src/game/gameTypes';
import { getWorkerAssignmentRefusal } from '../src/game/buildingStaffingActions';
import { building, human } from '../src/test/factories';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { explainSettlerMovement, explainBuildingStaffing } from '../src/game/dashboardData';
import { isManualStaffingBuilding } from '../src/game/workforce';
import { pickSocialImpulse } from '../src/game/socialLife';
import { isOnWorkScheduleShift } from '../src/game/workSchedule';
import { TICKS_PER_DAY, TICKS_PER_HOUR, getHourOfDay, getWeekday } from '../src/game/dayCycleClock';
import { SETTLER_LABEL_FALLBACK } from '../src/game/citizenId';
import { testWorldMap } from '../src/test/worldMapFixtures';

/** Mirrors tests/pathfinding.test.ts — a real tile map built through the production tile model. */
function makeMap(
  width: number,
  height: number,
  seed: number,
  blocker: (x: number, y: number) => boolean,
): WorldMap {
  return testWorldMap({
    tilesX: width,
    tilesY: height,
    seed,
    tileType: (x, y) => (blocker(x, y) ? TerrainType.River : undefined),
  });
}

function makeWorld(
  entities: Entity[],
  buildings: Building[],
  tick: number,
  map: WorldMap | null,
): WorldState {
  return {
    entities,
    buildings,
    tick,
    worldMap: map,
    workSchedule: { startHour: 7, endHour: 16 },
    resources: { wood: 0, stone: 0, food: 1000, gold: 0, iron: 0 },
    floatingTexts: [],
    notifications: [],
    nextFloatingTextId: 1,
  } as unknown as WorldState;
}

/** A workday tick at `hour`, so `isWorkDay` is true and the clock reads that hour. */
function tickAtHourOnWorkDay(hour: number): number {
  for (let day = 0; day < 14; day++) {
    const tick = day * TICKS_PER_DAY + hour * TICKS_PER_HOUR + 1;
    const weekday = getWeekday(tick);
    if (weekday !== 5 && weekday !== 6) return tick;
  }
  throw new Error('no workday found');
}

/** A settler with a home and a lumber-mill workplace, standing at the house. */
function commuter(millX: number, millY: number) {
  const person = human(1, {
    x: 105,
    y: 105,
    job: JobType.Lumberjack,
    residenceBuildingId: 2,
    homeBuildingId: 3,
  });
  const house = building(2, BuildingType.House, { x: 80, y: 80 });
  const mill = building(3, BuildingType.LumberMill, { x: millX, y: millY, occupants: [1] });
  return { person, house, mill };
}

describe('P3 — building staffing explanation', () => {
  it('reports auto/manual mode, capacity and current workers from their owners', () => {
    const worker = human(1, { homeBuildingId: 5 });
    const church = building(5, BuildingType.Church, { occupants: [1] });
    const farm = building(6, BuildingType.Farm);
    const world = makeWorld([worker], [church, farm], 0, null);

    const churchExplanation = explainBuildingStaffing(world, church.id);
    expect(churchExplanation.mode).toBe('manual');
    expect(churchExplanation.mode).toBe(isManualStaffingBuilding(church) ? 'manual' : 'auto');
    // The cap is the one the staffing command checks (`BUILDING_CONFIGS`), not a panel-side copy.
    expect(churchExplanation.capacity).toBe(BUILDING_CONFIGS[BuildingType.Church].maxOccupants);
    expect(churchExplanation.workerCount).toBe(1);
    expect(churchExplanation.lines.map((line) => line.label)).toContain('Mode');

    const farmExplanation = explainBuildingStaffing(world, farm.id);
    expect(farmExplanation.mode).toBe(isManualStaffingBuilding(farm) ? 'manual' : 'auto');
    expect(farmExplanation.mode).toBe('auto');
    expect(farmExplanation.workerCount).toBe(0);
  });

  it('gives the staffing owner\'s own reason for a settler it refuses', () => {
    const prisoner = human(1, { prisonBuildingId: 9, prisonerUntilTick: 500 });
    const child = human(2, { isJuvenile: true });
    const employed = human(3, { homeBuildingId: 7, job: JobType.Farmer });
    const farm = building(7, BuildingType.Farm, { occupants: [3] });
    const church = building(5, BuildingType.Church);
    const world = makeWorld([prisoner, child, employed], [church, farm], 0, null);

    const explanation = explainBuildingStaffing(world, church.id, [1, 2, 3]);
    const reasons = explanation.refusals.map((refusal) => refusal.reason);

    // The owner's answer, gate for gate — the projection never re-derives it.
    expect(reasons).toEqual([
      getWorkerAssignmentRefusal(world, church.id, 1),
      getWorkerAssignmentRefusal(world, church.id, 2),
      getWorkerAssignmentRefusal(world, church.id, 3),
    ]);
    expect(reasons).toEqual(['imprisoned', 'juvenile', 'already-assigned']);
    // …and the panel gets one line per refused settler, so nothing is silently dropped. The name is the
    // citizenId owner's (`formatCitizenName`), so the expectation is built from the owner's *label*
    // fallback rather than typed here: a nameless settler reads "#1 Settler" — the bare-noun form, not
    // the sentence form "A settler" (2026-09-20 audit, W-1).
    expect(explanation.lines.map((line) => line.label)).toEqual(
      expect.arrayContaining([
        `Cannot assign #1 ${SETTLER_LABEL_FALLBACK}`,
        `Cannot assign #2 ${SETTLER_LABEL_FALLBACK}`,
        `Cannot assign #3 ${SETTLER_LABEL_FALLBACK}`,
      ]),
    );
  });

  it('names a full building as full rather than blaming the settler', () => {
    // Farm capacity is 2; the third settler is refused by the building gate, not by their own state.
    const a = human(1, { homeBuildingId: 8 });
    const b = human(2, { homeBuildingId: 8 });
    const spare = human(3);
    const farm = building(8, BuildingType.Farm, { occupants: [1, 2] });
    const world = makeWorld([a, b, spare], [farm], 0, null);

    const explanation = explainBuildingStaffing(world, farm.id, [3]);
    expect(explanation.capacity).toBe(2);
    expect(explanation.workerCount).toBe(2);
    expect(explanation.refusals).toHaveLength(1);
    expect(explanation.refusals[0]!.reason).toBe('building-full');
    expect(explanation.refusals[0]!.reason).toBe(getWorkerAssignmentRefusal(world, farm.id, 3));
  });
});

describe('P5 — movement reason trace', () => {
  it('lists the day\'s stops in order with the current leg for a worker with a home and a workplace', () => {
    const { person, house, mill } = commuter(400, 100);
    const world = makeWorld([person], [house, mill], tickAtHourOnWorkDay(8), makeMap(60, 40, 7301, () => false));

    const movement = explainSettlerMovement(world, person.id);

    expect(movement.stops.map((stop) => stop.kind)).toEqual(['home', 'workplace', 'home']);
    expect(movement.stops.map((stop) => stop.label)).toEqual(['House', 'Lumber Mill', 'House']);
    expect(movement.stops[1]!.buildingId).toBe(mill.id);
    expect(movement.legLabel).toBe('House → Lumber Mill');
  });

  it('adds the free-time venue the social owner names to the route', () => {
    const { person, house, mill } = commuter(400, 100);
    const tavern = building(4, BuildingType.Tavern, { x: 500, y: 100 });
    const world = makeWorld([person], [house, mill, tavern], 0, makeMap(60, 40, 7302, () => false));
    // The factory settler's `birthDay` is 0, and the birthday impulse is the social owner's only
    // route to a Tavern, so the calendar day has to agree with it.
    world.dayInYear = 0;

    // The venue is the social owner's answer for this hour, so ask it rather than assume an hour.
    let venueTick: number | null = null;
    for (let day = 0; day < 60 && venueTick == null; day++) {
      for (const hour of [12, 17, 18, 19, 20, 21]) {
        const tick = day * TICKS_PER_DAY + hour * TICKS_PER_HOUR + 1;
        world.tick = tick;
        if (isOnWorkScheduleShift(world, getHourOfDay(tick))) continue;
        if (pickSocialImpulse(person, world, world.buildings, [], []).building?.id === tavern.id) {
          venueTick = tick;
          break;
        }
      }
    }
    if (venueTick == null) throw new Error('no tick where the social owner names the Tavern');
    world.tick = venueTick;

    const movement = explainSettlerMovement(world, person.id);

    expect(movement.stops.map((stop) => stop.kind)).toEqual(['home', 'workplace', 'venue', 'home']);
    expect(movement.stops.map((stop) => stop.label)).toEqual(['House', 'Lumber Mill', 'Tavern', 'House']);
  });

  it('surfaces the path owner\'s rerouting and blocked verdicts', () => {
    const { person, house, mill } = commuter(400, 100);
    const tick = tickAtHourOnWorkDay(8);

    // Vertical river at tile column 25 with one gap at row 2: a detour exists.
    const detour = makeWorld(
      [person],
      [house, mill],
      tick,
      makeMap(60, 40, 7303, (x, y) => x === 25 && y !== 2),
    );
    expect(explainSettlerMovement(detour, person.id).status).toBe('rerouting');

    // The same river with no gap: no route at all.
    const blocked = makeWorld(
      [person],
      [house, mill],
      tick,
      makeMap(60, 40, 7304, (x) => x === 25),
    );
    const blockedExplanation = explainSettlerMovement(blocked, person.id);
    expect(blockedExplanation.status).toBe('blocked');
    expect(blockedExplanation.lines.some((line) => /blocked/i.test(line.value))).toBe(true);
  });

  it('reports a clear leg for an ordinary commuter (negative control)', () => {
    const { person, house, mill } = commuter(400, 100);
    const world = makeWorld([person], [house, mill], tickAtHourOnWorkDay(8), makeMap(60, 40, 7305, () => false));

    const movement = explainSettlerMovement(world, person.id);

    expect(movement.legLabel).toBe('House → Lumber Mill');
    expect(movement.status).toBe('clear');
    expect(movement.lines.some((line) => /blocked|rerout/i.test(line.value))).toBe(false);
  });
});
