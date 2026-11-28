import { describe, expect, it } from 'vitest';
import { BuildingType, JobType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { PROFILE_REVISION, revisionOf } from '../src/game/entityRevision';
import { human, building } from '../src/test/factories';
import {
  MAX_SKILL, SKILL_IDLE_DECAY_PER_DAY, readSkill, increaseEntitySkill,
  decayIdleSkills, gainSkill, getWorkerSkillMultiplier, ensureEntitySkills,
} from '../src/game/skills';
import {
  recordScheduleWorkTick, recordPresentWorkTick,
  getWorkdayAttendance, getPracticedJobForCompletedDay,
} from '../src/game/scheduleFatigue';

describe('skills have one writer and a pure reader', () => {
  it('reading a missing trade is read-only', () => {
    const settler = human(1);
    expect(readSkill(settler, JobType.Farmer)).toBe(0);
    expect(settler.skills).toBeUndefined();
    expect(revisionOf(settler, PROFILE_REVISION)).toBe(0);
  });

  it('rejects unemployment skill awards and removes only the obsolete saved score', () => {
    const settler = human(1, { job: JobType.Settler, skills: { [JobType.Settler]: 15, [JobType.Miner]: 53 } });
    expect(readSkill(settler, JobType.Settler)).toBe(0);
    expect(settler.skills?.[JobType.Settler]).toBe(15);
    increaseEntitySkill(settler, JobType.Settler, 10);
    expect(revisionOf(settler, PROFILE_REVISION)).toBe(0);
    expect(ensureEntitySkills(settler)).toEqual({ [JobType.Miner]: 53 });
    increaseEntitySkill(settler, JobType.Settler, 10);
    expect(settler.skills).toEqual({ [JobType.Miner]: 53 });
    increaseEntitySkill(settler, JobType.Miner, 1);
    expect(readSkill(settler, JobType.Miner)).toBe(54);
  });

  it('ignores non-positive and invalid awards without dirtying saturated skills', () => {
    const settler = human(1, { skills: { [JobType.Builder]: MAX_SKILL - 0.1 } });
    increaseEntitySkill(settler, JobType.Builder, 1);
    expect(readSkill(settler, JobType.Builder)).toBe(MAX_SKILL);
    expect(revisionOf(settler, PROFILE_REVISION)).toBe(1);
    for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1]) {
      increaseEntitySkill(settler, JobType.Builder, amount);
    }
    expect(revisionOf(settler, PROFILE_REVISION)).toBe(1);
  });

  it('idle decay only changes unused skills and bumps once per changed profile', () => {
    const empty = human(1);
    decayIdleSkills(empty);
    expect(empty.skills).toBeUndefined();
    expect(revisionOf(empty, PROFILE_REVISION)).toBe(0);
    const worker = human(2, { skills: { [JobType.Builder]: 50, [JobType.Miner]: 20 } });
    decayIdleSkills(worker, JobType.Builder);
    expect(readSkill(worker, JobType.Builder)).toBe(50);
    expect(readSkill(worker, JobType.Miner)).toBeCloseTo(20 - SKILL_IDLE_DECAY_PER_DAY, 8);
    expect(revisionOf(worker, PROFILE_REVISION)).toBe(1);
  });

  it('does not scan the world when an authoritative index omits an id', () => {
    const settler = human(1, { skills: {} });
    const state = { entities: [settler] } as unknown as WorldState;
    gainSkill(state, 1, JobType.Builder, 0.2, new Map());
    expect(readSkill(settler, JobType.Builder)).toBe(0);
    gainSkill(state, 1, JobType.Builder, 0.2, new Map([[1, settler]]));
    expect(readSkill(settler, JobType.Builder)).toBeCloseTo(0.2, 8);
  });
});

describe('one witnessed-work rule for construction and idle decay', () => {
  it('attributes the job and site even though a builder has no regular job pointer', () => {
    const builder = human(1, { skills: { [JobType.Builder]: 50, [JobType.Miner]: 20 } });
    expect(builder.workerBuildingId).toBeUndefined();
    recordScheduleWorkTick(builder, 24, 77, JobType.Builder);
    recordPresentWorkTick(builder, 24, 77);
    expect(getWorkdayAttendance(builder)).toEqual({ ticks: 24, siteId: 77 });
    expect(getPracticedJobForCompletedDay(builder)).toBe(JobType.Builder);
    decayIdleSkills(builder, getPracticedJobForCompletedDay(builder));
    expect(readSkill(builder, JobType.Builder)).toBe(50);
    expect(readSkill(builder, JobType.Miner)).toBeCloseTo(20 - SKILL_IDLE_DECAY_PER_DAY, 8);
  });

  it('does not exempt an absent employee or an ambiguous mixed-site shift', () => {
    const absent = human(1, { job: JobType.Farmer, skills: { [JobType.Farmer]: 40 } });
    recordScheduleWorkTick(absent, 12, 77, JobType.Farmer);
    expect(getPracticedJobForCompletedDay(absent)).toBeUndefined();
    decayIdleSkills(absent, getPracticedJobForCompletedDay(absent));
    expect(readSkill(absent, JobType.Farmer)).toBeCloseTo(40 - SKILL_IDLE_DECAY_PER_DAY, 8);
    const moved = human(2, { job: JobType.Farmer });
    recordScheduleWorkTick(moved, 12, 77, JobType.Farmer);
    recordPresentWorkTick(moved, 12, 77);
    recordScheduleWorkTick(moved, 12, 88, JobType.Farmer);
    recordPresentWorkTick(moved, 12, 88);
    expect(getPracticedJobForCompletedDay(moved)).toBeUndefined();
  });

  it('ignores dead, stale and duplicate occupants in crew skill/DNA averages', () => {
    const worker = human(1, { job: JobType.Farmer, skills: { [JobType.Farmer]: 50 } });
    const dead = human(2, { alive: false, skills: { [JobType.Farmer]: 100 } });
    const site = building(77, BuildingType.Farm, { occupants: [1, 1, 2, 999] });
    const world = { entities: [worker, dead] } as unknown as WorldState;
    expect(getWorkerSkillMultiplier(world, site, new Map([[1, worker], [2, dead]])))
      .toBeCloseTo(2, 8);
    expect(getWorkerSkillMultiplier(world, site, new Map())).toBe(1);
  });
});
