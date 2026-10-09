/**
 * A settler learns the trade they actually worked, even when the store is full.
 *
 * Skill is paid for the shift, not for the goods: `rewardProductionSkills` and the per-occupant
 * `gainSkill` calls in `dailyBuildingEconomy` sit behind `added > 0` / a headroom check, so on a
 * colony whose stores stand at their caps the only trades that keep growing are the ones with a
 * consumer — food, and wood when it is being burned. Every other trade freezes at its entry skill:
 * a census of the owner's Year 3 save (all five stores exactly at cap, 1800/1800 iron) read
 * farmer mean 25.3 with 12 settlers at 100, against blacksmith 3.0, hunter 2.0 and teacher 0.4,
 * none of them above 40 — which is also the master bar `apprenticeships.advanceApprenticeships`
 * needs, so 580 of 608 juveniles could never be apprenticed.
 *
 * `skills.rewardBuildingWork` pays by the day's attendance share instead, so a shift is credited
 * whether or not `addResource` accepted anything.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { BuildingType, JobType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { PRODUCTION_INTERVAL, TICKS_PER_DAY, isProductionTick } from '../src/game/dayCycle';
import { isPlayerHuman } from '../src/game/playerHuman';
import { readSkill, WORK_SKILL_PER_SHIFT } from '../src/game/skills';
import { getScheduleTargetHours } from '../src/game/scheduleFatigue';

const FIXTURE_SEED = 20_261_009;
const MILL_ID = 20_000;
/** With no storage buildings the daily recompute owns the wood cap: `updateStorageCaps` gives 800. */
const WOOD_CAP = 800;

function addBuilding(state: WorldState, id: number, type: BuildingType): void {
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
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    faction: 'player',
  } as never);
}

/** A colony with a *staffed* Lumber Mill on its production day and a wood store at the cap. */
function cappedMillWorld(): { state: WorldState; workerId: number } {
  const state = initGame({ seed: FIXTURE_SEED });
  expect(state.storageMax.wood, 'fixture premise: no storage buildings, so the base cap applies').toBe(WOOD_CAP);

  addBuilding(state, MILL_ID, BuildingType.LumberMill);
  const worker = state.entities.find((e) => e.alive && isPlayerHuman(e));
  expect(worker, 'fixture premise: the colony starts with a settler').toBeTruthy();
  worker!.faction = undefined;
  worker!.homeBuildingId = MILL_ID;
  worker!.job = JobType.Lumberjack;
  // The shift runs before the daily layer reads it, so the fixture states the attendance directly:
  // a settler who turned up for the whole window. `presenceMult` then scales nothing away.
  worker!.scheduleLastWorkedHours = getScheduleTargetHours(state);

  state.buildings.find((b) => b.id === MILL_ID)!.occupants = [worker!.id];
  state.resources.wood = WOOD_CAP;
  // `gameTick` advances the clock first, so the day boundary (and its daily layer) lands on
  // `TICKS_PER_DAY` from here.
  state.tick = TICKS_PER_DAY - 1;
  expect(isProductionTick(TICKS_PER_DAY, PRODUCTION_INTERVAL.lumber), 'fixture premise: the mill produces today').toBe(true);
  return { state, workerId: worker!.id };
}

function skillOf(state: WorldState, id: number): number {
  const human = state.entities.find((e) => e.id === id);
  expect(human, 'fixture premise: the worker is still in the colony').toBeTruthy();
  return readSkill(human!, JobType.Lumberjack);
}

describe('worked shifts teach a trade even when the store refuses the output', () => {
  it('credits the lumberjack a shift of skill into a full wood store', () => {
    const { state, workerId } = cappedMillWorld();

    gameTick(state);

    expect(state.resources.wood, 'fixture premise: the store was full, so nothing was accepted').toBe(WOOD_CAP);
    expect(
      skillOf(state, workerId),
      'a worker who spent the day at the mill learned nothing because the store was full',
    ).toBeCloseTo(WORK_SKILL_PER_SHIFT, 6);
  });

  it('pays the shift in both cases, with the output bonus only where the goods were accepted', () => {
    const full = cappedMillWorld();
    gameTick(full.state);
    const empty = cappedMillWorld();
    empty.state.resources.wood = 0;
    gameTick(empty.state);

    const fullSkill = skillOf(full.state, full.workerId);
    const emptySkill = skillOf(empty.state, empty.workerId);
    expect(fullSkill, 'the refused output cost the worker the shift itself').toBeCloseTo(WORK_SKILL_PER_SHIFT, 6);
    // An accepted load still pays its own bonus on top (`rewardProductionSkills`), so an idle store
    // out-earns a full one rather than a full one out-earning nothing.
    expect(emptySkill).toBeGreaterThan(fullSkill);
    expect(emptySkill).toBeLessThanOrEqual(2 * WORK_SKILL_PER_SHIFT + 1e-9);
  });

  it('leaves the hunter on the per-kill reward the hunting spot already owns', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    addBuilding(state, MILL_ID, BuildingType.HuntingSpot);
    const hunter = state.entities.find((e) => e.alive && isPlayerHuman(e))!;
    hunter.faction = undefined;
    hunter.homeBuildingId = MILL_ID;
    hunter.job = JobType.Hunter;
    hunter.scheduleLastWorkedHours = getScheduleTargetHours(state);
    state.buildings.find((b) => b.id === MILL_ID)!.occupants = [hunter.id];
    state.tick = TICKS_PER_DAY - 1;

    gameTick(state);

    expect(readSkill(hunter, JobType.Hunter), 'a shot must be earned, not granted for standing there').toBe(0);
  });
});
