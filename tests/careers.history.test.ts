import { describe, expect, it } from 'vitest';
import { recordCareerWork, MAX_CREDITED_DAYS, normalizeCareerHistory } from '../src/game/careers/careerHistory';
import { getAbsoluteCalendarDay, TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { JobType, BuildingType } from '../src/game/gameTypes';
import { human, building } from '../src/test/factories';
import { recordScheduleWorkTick, resolveDailyScheduleFatigue } from '../src/game/scheduleFatigue';
import { resolveDailyVillageScheduleFatigue } from '../src/game/dailyScheduleFatigue';
import { transformToWerewolfForm } from '../src/game/moonHowler';
import { revertToHumanForm } from '../src/game/moonHowlerForm';
import { EntityType } from '../src/game/gameTypes';
import { TICKS_PER_HOUR } from '../src/game/dayCycle';
import { initGame } from '../src/game/worldGen';
import { tickDailyBuildingEconomy } from '../src/game/dailyBuildingEconomy';
import { rebuildEntityByIdMap } from '../src/game/entityIndex';
import { Season } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import type { Entity } from '../src/game/gameTypes';
import { isPlayerHuman } from '../src/game/playerHuman';

const farm = building(10, BuildingType.Farm, { occupants: [1] });
const worker = () => human(1, {
  workerBuildingId: 10, job: JobType.Farmer,
  scheduleLastWorkedHours: 6, scheduleLastWorkedSiteId: 10,
  scheduleLastWorkedJob: JobType.Farmer,
});

describe('observed career history', () => {
  it('credits only once for a verified site, job and absolute day', () => {
    const h = worker();
    const day = getAbsoluteCalendarDay(TICKS_PER_DAY * 3 + TICKS_PER_HOUR * 12) - 1;
    expect(day).toBe(2);
    expect(recordCareerWork(h, farm, JobType.Farmer, day, 6)).toBe(true);
    expect(recordCareerWork(h, farm, JobType.Farmer, day, 6)).toBe(false);
    expect(h.careerHistory?.farmer).toEqual({ days: 1, lastDay: 2 });
    expect(recordCareerWork(h, farm, JobType.Farmer, day + 1, 6)).toBe(true);
    expect(h.careerHistory?.farmer?.days).toBe(2);
  });

  it('does not fabricate work for absence, unassigned, child, captive, rival or stale sites', () => {
    const base = worker();
    expect(recordCareerWork(base, farm, JobType.Farmer, 0, 0)).toBe(false);
    expect(recordCareerWork({ ...base, workerBuildingId: undefined, scheduleLastWorkedSiteId: -1 }, farm, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork({ ...base, isJuvenile: true, age: 16 }, farm, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork({ ...base, age: 17 }, farm, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork({ ...base, alive: false }, farm, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork({ ...base, faction: 'rival' }, farm, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork({ ...base, faction: 'visitor' }, farm, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork({ ...base, prisonBuildingId: 7 }, farm, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork({ ...base, scheduleLastWorkedSiteId: 11 }, farm, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork({ ...base, scheduleLastWorkedJob: JobType.Hunter }, farm, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork(base, { ...farm, completed: false }, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork(base, { ...farm, faction: 'rival' }, JobType.Farmer, 0, 4)).toBe(false);
    expect(base.careerHistory).toBeUndefined();
  });

  it('credits explicitly player-owned attendance through the same faction rule as the economy', () => {
    const marked = worker();
    // Some loaded/test worlds use a legacy explicit player marker outside the typed faction union.
    marked.faction = 'player' as Entity['faction'];
    expect(isPlayerHuman(marked)).toBe(true);
    marked.scheduleLastWorkedHours = undefined;
    marked.scheduleLastWorkedSiteId = undefined;
    marked.scheduleLastWorkedJob = undefined;
    recordScheduleWorkTick(marked, TICKS_PER_HOUR);
    expect(marked.scheduleWorkedTicksToday).toBe(TICKS_PER_HOUR);
    resolveDailyScheduleFatigue(marked, { workSchedule: { startHour: 8, endHour: 17 } });
    expect(marked.scheduleLastWorkedSiteId).toBe(farm.id);
    expect(marked.scheduleLastWorkedJob).toBe(JobType.Farmer);
    expect(recordCareerWork(marked, farm, JobType.Farmer, 2, marked.scheduleLastWorkedHours!)).toBe(true);
    expect(marked.careerHistory?.farmer).toEqual({ days: 1, lastDay: 2 });

    for (const faction of ['rival', 'visitor', 'trade_caravan'] as const) {
      const foreign = worker();
      foreign.faction = faction;
      recordScheduleWorkTick(foreign, TICKS_PER_HOUR);
      expect(foreign.scheduleWorkedTicksToday).toBeUndefined();
      expect(recordCareerWork(foreign, farm, JobType.Farmer, 2, 1)).toBe(false);
      expect(foreign.careerHistory).toBeUndefined();
    }
  });

  it('credits a witnessed past job even if the person has a different post at noon', () => {
    const h = worker();
    h.job = JobType.Hunter;
    h.workerBuildingId = 99;
    expect(recordCareerWork(h, { ...farm, occupants: [] }, JobType.Farmer, 2, 6)).toBe(true);
    expect(h.careerHistory?.farmer).toEqual({ days: 1, lastDay: 2 });
    expect(h.careerHistory?.hunter).toBeUndefined();
  });

  it('does not attribute mixed-site shifts to the last assigned building', () => {
    const h = worker();
    h.scheduleWorkedTicksToday = undefined;
    recordScheduleWorkTick(h, TICKS_PER_HOUR);
    h.workerBuildingId = 11;
    recordScheduleWorkTick(h, TICKS_PER_HOUR);
    h.workerBuildingId = 10;
    resolveDailyScheduleFatigue(h, { workSchedule: { startHour: 8, endHour: 17 } });
    expect(h.scheduleLastWorkedHours).toBe(2);
    expect(h.scheduleLastWorkedSiteId).toBe(-1);
    expect(recordCareerWork(h, farm, JobType.Farmer, 0, 2)).toBe(false);
    expect(h.careerHistory).toBeUndefined();
  });


  it('does not credit a different profession from the same workplace after a mid-day role change', () => {
    const h = worker();
    h.scheduleWorkedTicksToday = undefined;
    recordScheduleWorkTick(h, TICKS_PER_HOUR);
    h.job = JobType.Hunter;
    recordScheduleWorkTick(h, TICKS_PER_HOUR);
    h.job = JobType.Farmer;
    resolveDailyScheduleFatigue(h, { workSchedule: { startHour: 8, endHour: 17 } });
    expect(h.scheduleLastWorkedSiteId).toBe(10);
    expect(h.scheduleLastWorkedJob).toBeNull();
    expect(recordCareerWork(h, farm, JobType.Farmer, 0, 2)).toBe(false);
  });

  it('keeps full-storage attendance eligible and saturates without redundant records', () => {
    const h = worker();
    h.careerHistory = { farmer: { days: MAX_CREDITED_DAYS - 1, lastDay: 5 } };
    expect(recordCareerWork(h, farm, JobType.Farmer, 6, 3)).toBe(true);
    expect(recordCareerWork(h, farm, JobType.Farmer, 7, 3)).toBe(false);
    expect(h.careerHistory?.farmer?.days).toBe(MAX_CREDITED_DAYS);
  });

  it('rejects malformed jobs, counters and prototype-shaped history', () => {
    expect(normalizeCareerHistory({ farmer: { days: 3, lastDay: 9 } })).toEqual({ farmer: { days: 3, lastDay: 9 } });
    expect(normalizeCareerHistory({ farmer: { days: -2, lastDay: 4 } })).toBeUndefined();
    expect(normalizeCareerHistory({ farmer: { days: '3', lastDay: 4 } })).toBeUndefined();
    expect(normalizeCareerHistory({ farmer: { days: NaN, lastDay: 4 } })).toBeUndefined();
    expect(normalizeCareerHistory({ invalidJob: { days: 4, lastDay: 4 } })).toBeUndefined();
    const cyclic: Record<string, unknown> = {}; cyclic.farmer = cyclic;
    expect(normalizeCareerHistory(cyclic)).toBeUndefined();
  });

  it('reuses actual daily economy attendance on a full store without a second crew pass', () => {
    const world = initGame({ seed: 4242 });
    const h = worker();
    const site = building(10, BuildingType.Farm, { occupants: [h.id] });
    world.entities = [h];
    world.buildings = [site];
    world.tick = TICKS_PER_DAY * 2 + TICKS_PER_HOUR * 12;
    world.dayInYear = 2;
    world.resources.food = world.storageMax.food;
    rebuildEntityByIdMap(world);
    const context: TickContext = {
      width: world.width, height: world.height, hourOfDay: 12, season: Season.Spring,
      grassMult: 1, reproMult: 1, winterPenalty: 1, canHeat: true,
      byType: { human: [h] } as TickContext['byType'],
      aliveEntities: [h], newEntities: [], updatedBuildings: world.buildings,
      roadBuildings: [], playerHumans: [h], entityById: new Map([[h.id, h]]),
      buildingById: new Map([[site.id, site]]), predators: [],
    };
    tickDailyBuildingEconomy(world, context, [h]);
    expect(h.careerHistory?.farmer).toEqual({ days: 1, lastDay: 1 });
    tickDailyBuildingEconomy(world, context, [h]);
    expect(h.careerHistory?.farmer?.days).toBe(1);
  });

  it('settles a full-moon farmer shift at midnight and credits it after dawn, even after job displacement', () => {
    const world = initGame({ seed: 4242 });
    const h = worker();
    const site = building(10, BuildingType.Farm, { occupants: [h.id] });
    world.entities = [h];
    world.buildings = [site];
    h.moonHowlerCursed = true;
    recordScheduleWorkTick(h, 6 * TICKS_PER_HOUR);
    transformToWerewolfForm(h, world.buildings);
    expect(h.type).toBe(EntityType.Werewolf);
    expect(h.workerBuildingId).toBeUndefined();
    // Midnight: the person is a wolf, but the recorded hours belong to yesterday's farmer.
    resolveDailyVillageScheduleFatigue(world, [], [h]);
    expect(h.scheduleLastWorkedHours).toBe(6);
    expect(h.scheduleLastWorkedSiteId).toBe(site.id);
    expect(h.scheduleLastWorkedJob).toBe(JobType.Farmer);
    expect(h.scheduleWorkedTicksToday).toBe(0);
    expect(recordCareerWork(h, site, JobType.Farmer, 1, 6)).toBe(false);

    // Sunrise returns the same person; the old workplace may already be full.
    revertToHumanForm(h, { buildings: world.buildings, humans: [h] });
    expect(h.type).toBe(EntityType.Human);
    h.workerBuildingId = undefined;
    h.job = JobType.Settler;
    site.occupants = [];
    world.tick = 2 * TICKS_PER_DAY + 12 * TICKS_PER_HOUR;
    world.dayInYear = 2;
    rebuildEntityByIdMap(world);
    const context: TickContext = {
      width: world.width, height: world.height, hourOfDay: 12, season: Season.Spring,
      grassMult: 1, reproMult: 1, winterPenalty: 1, canHeat: true,
      byType: { human: [h] } as TickContext['byType'],
      aliveEntities: [h], newEntities: [], updatedBuildings: world.buildings,
      roadBuildings: [], playerHumans: [h], entityById: new Map([[h.id, h]]),
      buildingById: new Map([[site.id, site]]), predators: [],
    };
    tickDailyBuildingEconomy(world, context, [h]);
    expect(h.careerHistory?.farmer).toEqual({ days: 1, lastDay: 1 });
    expect(h.careerHistory?.settler).toBeUndefined();
    tickDailyBuildingEconomy(world, context, [h]);
    expect(h.careerHistory?.farmer?.days).toBe(1);
  });

  it('does not credit an absent worker even at an otherwise complete workplace', () => {
    const h = worker();
    const site = building(10, BuildingType.Farm, { occupants: [h.id] });
    h.scheduleLastWorkedHours = 0;
    expect(recordCareerWork(h, site, JobType.Farmer, 2, 0)).toBe(false);
    expect(h.careerHistory).toBeUndefined();
  });

});
