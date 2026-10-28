/**
 * Every profession learns the trade it works, on one shift cadence.
 *
 * Skill paid for **accepted output** freezes a trade when its store is full: `rewardProductionSkills`
 * and the per-occupant `gainSkill` calls in `dailyBuildingEconomy` sit behind `added > 0` / a headroom
 * check, so on a colony whose stores stand at their caps only the trades with a live consumer keep
 * growing. A census of the owner's Year 3 save (all five stores exactly at cap, 1800/1800 iron) read
 * farmer mean 25.3 with 12 settlers at 100, against blacksmith 3.0, hunter 2.0 and teacher 0.4 — and
 * every civic trade at a floor, because a school's harvest can never be refused. None of them reached
 * 40, which is also the master bar `apprenticeships.advanceApprenticeships` needs, so 580 of 608
 * juveniles could never be apprenticed and elections could only ever be won by a farmer.
 *
 * `skills.rewardBuildingWork` pays for the shift instead, at `WORK_SKILL_PER_SHIFT` on the
 * `SKILL_CREDIT_INTERVAL_TICKS` cadence, whether or not `addResource` accepted anything.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { BUILDING_JOB_TYPES, BuildingType, JobType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { PRODUCTION_INTERVAL, TICKS_PER_DAY, isProductionTick } from '../src/game/dayCycle';
import { tickAtDailyPhase } from '../src/game/dayCycleClock';
import { isPlayerHuman } from '../src/game/playerHuman';
import { readSkill, rewardBuildingWork, WORK_SKILL_BUILDING_TYPES, WORK_SKILL_PER_SHIFT } from '../src/game/skills';
import { getScheduleTargetHours } from '../src/game/scheduleFatigue';

const FIXTURE_SEED = 20_261_009;
const SITE_ID = 20_000;
/** With no storage buildings the daily recompute owns the wood cap: `updateStorageCaps` gives 800. */
const WOOD_CAP = 800;

function addBuilding(state: WorldState, type: BuildingType, id = SITE_ID, completed = true): void {
  const cfg = BUILDING_CONFIGS[type];
  state.buildings.push({
    id,
    type,
    x: 10,
    y: 10,
    width: cfg.width,
    height: cfg.height,
    occupants: [],
    level: 1,
    constructionProgress: completed ? 100 : 0,
    completed,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    faction: 'player',
  } as never);
}

/** A colony with one staffed post of `type` for `job`, on the tick its shift is paid on. */
function staffedWorld(
  type: BuildingType,
  job: JobType,
  options: { completed?: boolean; wood?: number } = {},
): { state: WorldState; worker: Entity } {
  const state = initGame({ seed: FIXTURE_SEED });
  addBuilding(state, type, SITE_ID, options.completed ?? true);

  const worker = state.entities.find((e) => e.alive && isPlayerHuman(e));
  expect(worker, 'fixture premise: the colony starts with a settler').toBeTruthy();
  worker!.faction = undefined;
  worker!.workerBuildingId = SITE_ID;
  worker!.job = job;
  // The shift is settled before the daily layer reads attendance, so the fixture states it directly.
  worker!.scheduleLastWorkedHours = getScheduleTargetHours(state);
  state.buildings.find((b) => b.id === SITE_ID)!.occupants = [worker!.id];
  if (options.wood != null) state.resources.wood = options.wood;
  // `gameTick` advances the clock first, so the day boundary (and its daily layer) lands on
  // `TICKS_PER_DAY` from here.
  state.tick = tickAtDailyPhase(1, 'production') - 1;
  return { state, worker: worker! };
}

function skillIn(state: WorldState, id: number, job: JobType): number {
  const human = state.entities.find((e) => e.id === id);
  expect(human, 'fixture premise: the worker is still in the colony').toBeTruthy();
  return readSkill(human!, job);
}

describe('a worked shift teaches its trade', () => {
  it('credits the lumberjack into a full wood store, where output was refused', () => {
    const { state, worker } = staffedWorld(BuildingType.LumberMill, JobType.Lumberjack, { wood: WOOD_CAP });
    expect(isProductionTick(TICKS_PER_DAY, PRODUCTION_INTERVAL.lumber), 'fixture premise').toBe(true);

    gameTick(state);

    expect(state.resources.wood, 'fixture premise: the store was full, so nothing was accepted').toBe(WOOD_CAP);
    expect(
      skillIn(state, worker.id, JobType.Lumberjack),
      'a worker who spent the day at the mill learned nothing because the store was full',
    ).toBeCloseTo(WORK_SKILL_PER_SHIFT, 6);
  });

  it('pays the shift in both cases, with the output bonus only where the goods were accepted', () => {
    const full = staffedWorld(BuildingType.LumberMill, JobType.Lumberjack, { wood: WOOD_CAP });
    gameTick(full.state);
    const empty = staffedWorld(BuildingType.LumberMill, JobType.Lumberjack, { wood: 0 });
    gameTick(empty.state);

    const fullSkill = skillIn(full.state, full.worker.id, JobType.Lumberjack);
    const emptySkill = skillIn(empty.state, empty.worker.id, JobType.Lumberjack);
    expect(fullSkill, 'the refused output cost the worker the shift itself').toBeCloseTo(WORK_SKILL_PER_SHIFT, 6);
    // An accepted load still pays its own bonus on top (`rewardProductionSkills`), so an idle store
    // out-earns a full one rather than a full one out-earning nothing.
    expect(emptySkill).toBeGreaterThan(fullSkill);
    expect(emptySkill).toBeLessThanOrEqual(2 * WORK_SKILL_PER_SHIFT + 1e-9);
  });

  it('credits a civic post, whose trade has no output to refuse', () => {
    const teacher = staffedWorld(BuildingType.School, JobType.Teacher);
    gameTick(teacher.state);
    expect(
      skillIn(teacher.state, teacher.worker.id, JobType.Teacher),
      'a teacher gained nothing for a day of teaching',
    ).toBeCloseTo(WORK_SKILL_PER_SHIFT, 6);

    const guard = staffedWorld(BuildingType.Prison, JobType.PrisonGuard);
    gameTick(guard.state);
    expect(
      skillIn(guard.state, guard.worker.id, JobType.PrisonGuard),
      'a prison guard gained nothing for a day on the watch',
    ).toBeCloseTo(WORK_SKILL_PER_SHIFT, 6);

    const priest = staffedWorld(BuildingType.Church, JobType.Priest);
    gameTick(priest.state);
    expect(
      skillIn(priest.state, priest.worker.id, JobType.Priest),
      'a priest gained nothing for a day of service',
    ).toBeCloseTo(WORK_SKILL_PER_SHIFT, 6);
  });

  it('credits the hunter at the post as well as the kill', () => {
    const { state, worker } = staffedWorld(BuildingType.HuntingSpot, JobType.Hunter);
    expect(isProductionTick(TICKS_PER_DAY, PRODUCTION_INTERVAL.huntingSpot), 'fixture premise').toBe(true);

    gameTick(state);

    // No prey is in reach in this fixture, so the whole credit is the shift itself.
    expect(
      skillIn(state, worker.id, JobType.Hunter),
      'a hunter who spent the day at the post learned nothing without a kill',
    ).toBeCloseTo(WORK_SKILL_PER_SHIFT, 6);
  });

  it('credits the builder who worked the site', () => {
    const { state, worker } = staffedWorld(BuildingType.House, JobType.Builder, { completed: false });

    gameTick(state);

    // The site pays its own progress credit and the standard shift; the day's idle decay then shaves
    // the reassigned Builder, so the assertion is the floor a shift guarantees, not a fixed total.
    expect(
      skillIn(state, worker.id, JobType.Builder),
      'a builder raised a house all day and learned nothing',
    ).toBeGreaterThanOrEqual(WORK_SKILL_PER_SHIFT - 1e-9);
  });

  it('keeps the trade set derived from the staffing table, so no post is dropped', () => {
    for (const [building, job] of Object.entries(BUILDING_JOB_TYPES)) {
      expect(
        WORK_SKILL_BUILDING_TYPES.has(building as BuildingType),
        `${building} staffs a ${String(job)} but its shift pays no trade skill`,
      ).toBe(true);
    }
  });
});

describe('a supplied crew index is authoritative for the shift credit', () => {
  it('leaves a worker the index does not name without a credit, never scanning the world', () => {
    const { state, worker } = staffedWorld(BuildingType.LumberMill, JobType.Lumberjack);
    const site = state.buildings.find((b) => b.id === SITE_ID)!;
    const before = skillIn(state, worker.id, JobType.Lumberjack);

    // The worker exists in the world but not in the index: that is a stale crew slot.
    rewardBuildingWork(state, site, 1, WORK_SKILL_PER_SHIFT, new Map());

    expect(skillIn(state, worker.id, JobType.Lumberjack)).toBe(before);
  });

  it('credits the same worker through an index that names them', () => {
    const { state, worker } = staffedWorld(BuildingType.LumberMill, JobType.Lumberjack);
    const site = state.buildings.find((b) => b.id === SITE_ID)!;

    rewardBuildingWork(state, site, 1, WORK_SKILL_PER_SHIFT, new Map([[worker.id, worker]]));

    expect(skillIn(state, worker.id, JobType.Lumberjack)).toBeCloseTo(WORK_SKILL_PER_SHIFT, 6);
  });
});
