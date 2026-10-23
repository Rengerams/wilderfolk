/**
 * §12 — a move closer to work or school.
 *
 * A settled household may trade its home for a vacant one that meaningfully shortens the whole
 * household's daily travel (workers' commutes plus children's school trips). The rule is graded:
 * a trivial improvement must not move anyone, and only vacant homes are targets, so the composition
 * rule that prefers an empty home can never trade the household straight back.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity } from '../src/game/gameTypes';
import { createBuilding } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { assignMissingResidences } from '../src/game/residencyReconciliation';
import { pickCommuteRelocation, RELOCATION_MIN_SAVED_HOURS, RELOCATION_MIN_IMPROVEMENT_RATIO } from '../src/game/residencySelection';
import { commuteLeadHoursFor, MAX_ASSIGNABLE_COMMUTE_HOURS } from '../src/game/commuteReach';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { LAYER_ASSIGN_INTERVAL, LAYER_ASSIGN_PHASE_TICK } from '../src/game/tickLayerAssign';

/** Human walk speed the movement owner uses; kept in step with the pickers' default. */
const WALK_SPEED = 6.4;

/** The day's final assignment pulse — the only pulse whose sweep bucket runs the daily commute move. */
const FINAL_DAILY_ASSIGN_PULSE = TICKS_PER_DAY - LAYER_ASSIGN_INTERVAL + LAYER_ASSIGN_PHASE_TICK;
/** Far home: a ~10 h walk to the job placed beside the near home, whose own trip is the one-hour floor. */
const FAR_X = 0;
const NEAR_X = 600;

function house(id: number, x: number, y = 200): Building {
  const building = createBuilding(BuildingType.House, x, y, id);
  building.completed = true;
  return building;
}

function workplace(id: number, x: number, y = 200): Building {
  const building = createBuilding(BuildingType.Farm, x, y, id);
  building.completed = true;
  building.occupants = [1, 2];
  return building;
}

function worker(id: number, homeId: number, workId: number): Entity {
  const human = createEntity(EntityType.Human, 0, 200, id, 200);
  human.alive = true;
  human.isJuvenile = false;
  human.age = 30;
  human.faction = undefined;
  human.childrenIds = [];
  human.residenceBuildingId = homeId;
  human.workerBuildingId = workId;
  return human;
}

function pupil(id: number, homeId: number, schoolId: number): Entity {
  const human = createEntity(EntityType.Human, 0, 200, id, 200);
  human.alive = true;
  human.isJuvenile = true;
  human.age = 8;
  human.faction = undefined;
  human.childrenIds = [];
  human.residenceBuildingId = homeId;
  human.schoolBuildingId = schoolId;
  return human;
}

describe('pickCommuteRelocation', () => {
  it('moves a household to a vacant home that shortens its commute', () => {
    const farHome = house(1, FAR_X);
    const nearHome = house(2, NEAR_X);
    const job = workplace(3, NEAR_X);
    const unit = [worker(20, farHome.id, job.id), worker(21, farHome.id, job.id)];

    const target = pickCommuteRelocation(
      unit,
      unit,
      [farHome, nearHome],
      [farHome, nearHome, job],
      undefined,
      new Map(),
      WALK_SPEED,
    );

    expect(target).toBe(nearHome.id);
  });

  it('refuses a home that would leave a pupil beyond the school reach bound', () => {
    const home = house(1, 0);
    const vacant = house(2, 946);
    const job = workplace(3, 946);
    const school = createBuilding(BuildingType.School, 426, 200, 4);
    school.completed = true;
    const parent = worker(20, home.id, job.id);
    const child = pupil(21, home.id, school.id);

    // Every other guard favours the move: only the child's 520 px school trip holds the household,
    // because it lands past the reach rule the school assignment itself uses.
    const oldTotal = commuteLeadHoursFor(946, WALK_SPEED) + commuteLeadHoursFor(426, WALK_SPEED);
    const newTotal = commuteLeadHoursFor(0, WALK_SPEED) + commuteLeadHoursFor(520, WALK_SPEED);
    expect(commuteLeadHoursFor(520, WALK_SPEED)).toBeGreaterThan(MAX_ASSIGNABLE_COMMUTE_HOURS);
    expect(oldTotal - newTotal).toBeGreaterThan(RELOCATION_MIN_SAVED_HOURS);
    expect(newTotal).toBeLessThan(oldTotal * (1 - RELOCATION_MIN_IMPROVEMENT_RATIO));

    const target = pickCommuteRelocation(
      [parent, child],
      [parent, child],
      [home, vacant],
      [home, vacant, job, school],
      undefined,
      new Map(),
      WALK_SPEED,
    );

    expect(target).toBeUndefined();
  });

  it('stays put when the only vacant home is farther from work', () => {
    const home = house(1, FAR_X);
    const vacant = house(2, NEAR_X);
    const job = workplace(3, FAR_X);
    const unit = [worker(20, home.id, job.id)];

    const target = pickCommuteRelocation(
      unit,
      unit,
      [home, vacant],
      [home, vacant, job],
      undefined,
      new Map(),
      WALK_SPEED,
    );

    expect(target).toBeUndefined();
  });

  it('ignores a trivial improvement so near-equal homes never trade the household', () => {
    const home = house(1, 0);
    const barelyCloser = house(2, 106);
    const job = workplace(3, 402);
    const unit = [worker(20, home.id, job.id)];

    // The 106 px gain saves less than the meaningful threshold while still clearing the ratio guard,
    // so the absolute hours rule is the one that must hold the household in place.
    const homeHours = commuteLeadHoursFor(402, WALK_SPEED);
    const candidateHours = commuteLeadHoursFor(296, WALK_SPEED);
    expect(homeHours - candidateHours).toBeLessThan(RELOCATION_MIN_SAVED_HOURS);
    expect(candidateHours).toBeLessThanOrEqual(homeHours * (1 - RELOCATION_MIN_IMPROVEMENT_RATIO));

    const target = pickCommuteRelocation(
      unit,
      unit,
      [home, barelyCloser],
      [home, barelyCloser, job],
      undefined,
      new Map(),
      WALK_SPEED,
    );

    expect(target).toBeUndefined();
  });

  it('never targets the Leader\u2019s House as a replacement home', () => {
    const home = house(1, FAR_X);
    const manor = createBuilding(BuildingType.LeaderHouse, NEAR_X, 200, 2);
    manor.completed = true;
    const job = workplace(3, NEAR_X);
    const unit = [worker(20, home.id, job.id)];

    const target = pickCommuteRelocation(
      unit,
      unit,
      [home, manor],
      [home, manor, job],
      undefined,
      new Map(),
      WALK_SPEED,
    );

    expect(target).toBeUndefined();
  });
});

describe('assignMissingResidences — the daily commute move', () => {
  it('relocates the whole household once a day and does not trade it back', () => {
    const farHome = house(1, FAR_X);
    const nearHome = house(2, NEAR_X);
    const job = workplace(3, NEAR_X);
    const father = worker(20, farHome.id, job.id);
    const mother = worker(21, farHome.id, job.id);
    father.partnerId = mother.id;
    mother.partnerId = father.id;
    const humans = [father, mother];
    const buildings = [farHome, nearHome, job];

    // The day's final assignment pulse is the only pulse whose bucket relocates.
    assignMissingResidences(humans, buildings, humans, FINAL_DAILY_ASSIGN_PULSE);

    expect(father.residenceBuildingId).toBe(nearHome.id);
    expect(mother.residenceBuildingId).toBe(nearHome.id);

    // A second daily sweep must not trade the household back to the empty far home.
    assignMissingResidences(humans, buildings, humans, FINAL_DAILY_ASSIGN_PULSE);
    expect(father.residenceBuildingId).toBe(nearHome.id);
    expect(mother.residenceBuildingId).toBe(nearHome.id);
  });
});
