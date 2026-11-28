import { describe, it, expect, vi } from 'vitest';
import * as commuteReach from '../src/game/commuteReach';
import { initGame } from '../src/game/worldGen';
import { BuildingType, JobType, type Building } from '../src/game/gameTypes';
import { advanceApprenticeships, getApprenticeTrainingSite } from '../src/game/apprenticeships';
import { addToConstructionCrew, assignWorkerInPlace, assignWorkerTransition, staffConstructionCrews } from '../src/game/workforce';
import { SCHOOL_GRADUATION_DAYS, SCHOOL_FULL_EDUCATION_DAYS } from '../src/game/education';
import { addGeneratedSocialHuman } from '../src/test/factories';
import { genomeFrom } from './helpers/genome';

describe('apprenticeships', () => {
  it('guarantees Tier 3 scholars a place under an available grandmaster, even after age 24', () => {
    const w = initGame({ villageName: 'P7', size: 'medium' });
    w.entities = [];
    w.buildings = [];
    const master = addGeneratedSocialHuman(w, { id: 1, job: JobType.Farmer });
    master.skills = { [JobType.Farmer]: 75 };
    const scholar = addGeneratedSocialHuman(w, { id: 2 });
    scholar.age = 26;
    scholar.schoolDays = SCHOOL_FULL_EDUCATION_DAYS;
    scholar.educated = true;
    w.buildings.push({
      id: 10, type: BuildingType.Farm, x: 300, y: 300, width: 60, height: 60,
      occupants: [master.id], level: 1, constructionProgress: 100,
      completed: true, health: 100, maxHealth: 100,
      spriteScale: 1, buildAnimTimer: 0, } as never);
    advanceApprenticeships(w, w.entities);
    expect(scholar.apprenticeOfId).toBeUndefined();
    expect(scholar.grandmasterApprenticeshipCompleted).not.toBe(true);

    master.skills[JobType.Farmer] = 85;
    advanceApprenticeships(w, w.entities);
    expect(scholar.apprenticeOfId).toBe(master.id);

    scholar.skills = { [JobType.Farmer]: 49.5 };
    scholar.schedulePresentSiteIdToday = 10;
    scholar.schedulePresentTicksToday = 108;
    master.schedulePresentSiteIdToday = 10;
    master.schedulePresentTicksToday = 108;
    advanceApprenticeships(w, w.entities);
    expect(scholar.grandmasterApprenticeshipCompleted).toBe(true);
    expect(scholar.skills[JobType.Farmer]).toBeGreaterThanOrEqual(70);
    expect(scholar.skills?.[JobType.Teacher]).toBeUndefined();
    expect(scholar.careerMilestones?.farmer?.trainedAtDay).toBe(0);
    expect(scholar.careerHistory).toBeUndefined();
    expect(scholar.apprenticeOfId).toBeUndefined();
    expect(master.apprenticeId).toBeUndefined();

    advanceApprenticeships(w, w.entities);
    expect(scholar.apprenticeOfId).toBeUndefined();
  });

  it('gives a Tier 3 scholar priority over an ordinary apprentice', () => {
    const w = initGame({ villageName: 'P7', size: 'medium' });
    w.entities = [];
    w.buildings = [];
    const master = addGeneratedSocialHuman(w, { id: 1, job: JobType.Farmer });
    master.skills = { [JobType.Farmer]: 90 };
    const scholar = addGeneratedSocialHuman(w, { id: 2 });
    scholar.schoolDays = SCHOOL_FULL_EDUCATION_DAYS;
    scholar.educated = true;
    const ordinary = addGeneratedSocialHuman(w, { id: 3 });
    ordinary.schoolDays = SCHOOL_GRADUATION_DAYS;
    ordinary.educated = true;
    w.buildings.push({
      id: 10, type: BuildingType.Farm, x: 300, y: 300, width: 60, height: 60,
      occupants: [master.id], level: 1, constructionProgress: 100,
      completed: true, health: 100, maxHealth: 100,
      spriteScale: 1, buildAnimTimer: 0, } as never);
    advanceApprenticeships(w, w.entities);
    expect(master.apprenticeId).toBe(scholar.id);
    expect(ordinary.apprenticeOfId).toBeUndefined();
  });

  it('does not let a busy ordinary master block an available grandmaster at the same workplace', () => {
    const w = initGame({ villageName: 'P7', size: 'medium' });
    w.entities = [];
    w.buildings = [];
    const master = addGeneratedSocialHuman(w, { id: 1, job: JobType.Farmer });
    master.skills = { [JobType.Farmer]: 60 };
    const grandmaster = addGeneratedSocialHuman(w, { id: 5, job: JobType.Farmer });
    grandmaster.skills = { [JobType.Farmer]: 90 };
    const ordinary = addGeneratedSocialHuman(w, { id: 3 });
    ordinary.schoolDays = SCHOOL_GRADUATION_DAYS;
    ordinary.educated = true;
    ordinary.apprenticeOfId = master.id;
    master.apprenticeId = ordinary.id;
    const scholar = addGeneratedSocialHuman(w, { id: 2 });
    scholar.schoolDays = SCHOOL_FULL_EDUCATION_DAYS;
    scholar.educated = true;
    w.buildings.push({
      id: 10, type: BuildingType.Farm, x: 300, y: 300, width: 60, height: 60,
      occupants: [master.id, grandmaster.id], level: 1,
      constructionProgress: 100, completed: true,
      health: 100, maxHealth: 100, spriteScale: 1,
      buildAnimTimer: 0, } as never);
    advanceApprenticeships(w, w.entities);
    expect(ordinary.apprenticeOfId).toBe(master.id);
    expect(scholar.apprenticeOfId).toBe(grandmaster.id);
  });

  it('releases an employed scholar from another workplace so she can attend her master', () => {
    const world = initGame({ villageName: 'P7', size: 'medium' });
    world.entities = [];
    world.buildings = [];
    const master = addGeneratedSocialHuman(world, { id: 1, job: JobType.Farmer });
    master.skills = { [JobType.Farmer]: 90 };
    master.workerBuildingId = 10;
    const scholar = addGeneratedSocialHuman(world, { id: 2, workerBuildingId: 20, job: JobType.Lumberjack });
    scholar.age = 26;
    scholar.schoolDays = SCHOOL_FULL_EDUCATION_DAYS;
    scholar.educated = true;
    scholar.skills = { [JobType.Farmer]: 10, [JobType.Lumberjack]: 30 };
    const farm = {
      id: 10, type: BuildingType.Farm, x: 300, y: 300, width: 60, height: 60,
      occupants: [master.id], completed: true,
    } as Building;
    const lumber = {
      id: 20, type: BuildingType.LumberMill, x: 500, y: 300, width: 60, height: 60,
      occupants: [scholar.id], completed: true,
    } as Building;
    world.buildings.push(farm, lumber);

    advanceApprenticeships(world, world.entities);
    expect(master.apprenticeId).toBe(scholar.id);
    expect(scholar.apprenticeOfId).toBe(master.id);
    expect(scholar.workerBuildingId).toBeUndefined();
    expect(scholar.job).toBe(JobType.Settler);
    expect(lumber.occupants).not.toContain(scholar.id);
    expect(getApprenticeTrainingSite(scholar,
      new Map(world.entities.map((person) => [person.id, person])),
      new Map(world.buildings.map((site) => [site.id, site])),
    )).toBe(farm);

    // A normal paid job cannot silently replace a valid apprenticeship.
    expect(assignWorkerTransition(scholar, lumber)).toBe(false);
    expect(assignWorkerInPlace(lumber, world.entities, world.buildings)).toBe(false);
    scholar.schedulePresentTicksToday = 108;
    scholar.schedulePresentSiteIdToday = farm.id;
    master.schedulePresentTicksToday = 108;
    master.schedulePresentSiteIdToday = farm.id;
    advanceApprenticeships(world, world.entities);
    expect(scholar.skills?.[JobType.Farmer]).toBeGreaterThan(10);
    expect(scholar.workerBuildingId).toBeUndefined();
  });

  it('keeps apprentices out of automatic construction crews', () => {
    const world = initGame({ villageName: 'P7', size: 'medium' });
    world.entities = [];
    world.buildings = [];
    const apprentice = addGeneratedSocialHuman(world, { id: 2 });
    apprentice.apprenticeOfId = 1;
    const unfinished = {
      id: 30, type: BuildingType.House, x: 300, y: 300, width: 60, height: 60,
      occupants: [], completed: false, level: 1, constructionProgress: 0,
      health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
    } as Building;
    world.buildings.push(unfinished);
    expect(addToConstructionCrew(apprentice, unfinished)).toBe(false);
    staffConstructionCrews(world.entities, world.buildings);
    expect(unfinished.occupants).not.toContain(apprentice.id);
  });

  it('repairs a previously bonded apprentice who was given a competing job', () => {
    const world = initGame({ villageName: 'P7', size: 'medium' });
    world.entities = [];
    world.buildings = [];
    const master = addGeneratedSocialHuman(world, { id: 1, job: JobType.Farmer });
    master.skills = { [JobType.Farmer]: 90 };
    const apprentice = addGeneratedSocialHuman(world, { id: 2, workerBuildingId: 20, job: JobType.Lumberjack });
    apprentice.schoolDays = SCHOOL_FULL_EDUCATION_DAYS;
    apprentice.educated = true;
    master.apprenticeId = apprentice.id;
    apprentice.apprenticeOfId = master.id;
    const farm = {
      id: 10, type: BuildingType.Farm, x: 300, y: 300,
      occupants: [master.id], completed: true,
    } as Building;
    const competing = {
      id: 20, type: BuildingType.LumberMill, x: 450, y: 300,
      occupants: [apprentice.id], completed: true,
    } as Building;
    world.buildings.push(farm, competing);
    advanceApprenticeships(world, world.entities);
    expect(apprentice.workerBuildingId).toBeUndefined();
    expect(competing.occupants).not.toContain(apprentice.id);
    expect(apprentice.apprenticeOfId).toBe(master.id);
    expect(master.apprenticeId).toBe(apprentice.id);
  });

  it('a master may train a qualified adult after school', () => {
    const w = initGame({ villageName: 'P7', size: 'medium' });
    // Isolate this apprenticeship from generated founders and workplaces: they may
    // reuse fixture ids or claim apprentices before the farm under test.
    w.entities = [];
    w.buildings = [];
    const master = addGeneratedSocialHuman(w, { id: 1, x: 300, y: 300, job: JobType.Farmer });
    master.skills = { [JobType.Farmer]: 60 };
    const kid = addGeneratedSocialHuman(w, { id: 3, x: 310, y: 310, isJuvenile: false });
    kid.age = 18;
    kid.schoolDays = SCHOOL_GRADUATION_DAYS;
    kid.educated = true;
    w.buildings.push({
      id: 1,
      type: BuildingType.Farm,
      x: 300,
      y: 300,
      width: 60,
      height: 60,
      occupants: [master.id],
      level: 1,
      constructionProgress: 100,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
    } as never);

    advanceApprenticeships(w, w.entities);
    expect(master.apprenticeId).toBe(kid.id);
    expect(kid.apprenticeOfId).toBe(master.id);

    // Teaching requires presence from both apprentice and mentor at this exact workplace.
    kid.schedulePresentSiteIdToday = 1;
    kid.schedulePresentTicksToday = 108;
    master.schedulePresentSiteIdToday = 1;
    master.schedulePresentTicksToday = 108;
    const before = kid.skills?.[JobType.Farmer] ?? 0;
    advanceApprenticeships(w, w.entities);
    expect((kid.skills?.[JobType.Farmer] ?? 0)).toBeGreaterThan(before);
  });

  it('only teaches after both apprentice and mentor attend the same production site', () => {
    const w = initGame({ villageName: 'P7', size: 'medium' });
    w.entities = [];
    w.buildings = [];
    const master = addGeneratedSocialHuman(w, { id: 1, job: JobType.Farmer });
    master.skills = { [JobType.Farmer]: 90 };
    const apprentice = addGeneratedSocialHuman(w, { id: 2, x: 310, y: 310 });
    apprentice.skills = { [JobType.Farmer]: 10 };
    const farm = {
      id: 80, type: BuildingType.Farm, x: 300, y: 300, width: 60, height: 60,
      occupants: [master.id], level: 1, constructionProgress: 100,
      completed: true, health: 100, maxHealth: 100,
      spriteScale: 1, buildAnimTimer: 0,
    } as never;
    w.buildings.push(farm);
    master.apprenticeId = apprentice.id;
    apprentice.apprenticeOfId = master.id;
    const peopleById = new Map(w.entities.map((person) => [person.id, person]));
    const sitesById = new Map(w.buildings.map((site) => [site.id, site]));
    expect(getApprenticeTrainingSite(apprentice, peopleById, sitesById)).toBe(farm);

    advanceApprenticeships(w, w.entities);
    expect(apprentice.skills?.[JobType.Farmer]).toBe(10);
    apprentice.schedulePresentSiteIdToday = 80;
    apprentice.schedulePresentTicksToday = 108;
    advanceApprenticeships(w, w.entities);
    expect(apprentice.skills?.[JobType.Farmer]).toBe(10);
    master.schedulePresentSiteIdToday = 80;
    master.schedulePresentTicksToday = 108;
    advanceApprenticeships(w, w.entities);
    expect(apprentice.skills?.[JobType.Farmer]).toBeGreaterThan(10);
    expect(apprentice.apprenticeOfId).toBe(master.id);
  });

  it('will not route a juvenile into an adult apprenticeship even with an old saved bond', () => {
    const w = initGame({ villageName: 'P7', size: 'medium' });
    w.entities = [];
    w.buildings = [];
    const master = addGeneratedSocialHuman(w, { id: 10, job: JobType.Farmer });
    const child = addGeneratedSocialHuman(w, { id: 11, isJuvenile: true });
    master.skills = { [JobType.Farmer]: 95 };
    master.apprenticeId = child.id;
    child.apprenticeOfId = master.id;
    const farm = {
      id: 81, type: BuildingType.Farm, x: 300, y: 300, width: 60, height: 60,
      occupants: [master.id], completed: true,
    } as never;
    w.buildings.push(farm);
    expect(getApprenticeTrainingSite(
      child, new Map(w.entities.map((person) => [person.id, person])),
      new Map(w.buildings.map((site) => [site.id, site])),
    )).toBeNull();
    advanceApprenticeships(w, w.entities);
    expect(child.apprenticeOfId).toBeUndefined();
    expect(master.apprenticeId).toBeUndefined();
  });

  it('an apprentice graduates at skill 50 and both bonds clear', () => {
    const w = initGame({ villageName: 'P7', size: 'medium' });
    // Isolate this apprenticeship from generated founders and workplaces: they may
    // reuse fixture ids or claim apprentices before the farm under test.
    w.entities = [];
    w.buildings = [];
    const master = addGeneratedSocialHuman(w, { id: 1, x: 300, y: 300, job: JobType.Farmer });
    master.skills = { [JobType.Farmer]: 100 };
    const kid = addGeneratedSocialHuman(w, { id: 3, x: 310, y: 310, isJuvenile: false });
    kid.age = 18;
    kid.schoolDays = SCHOOL_GRADUATION_DAYS;
    kid.educated = true;
    kid.skills = { [JobType.Farmer]: 49.6 }; // one strong lesson → ≥ 50
    w.buildings.push({
      id: 1,
      type: BuildingType.Farm,
      x: 300,
      y: 300,
      width: 60,
      height: 60,
      occupants: [master.id],
      level: 1,
      constructionProgress: 100,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
    } as never);
    master.apprenticeId = kid.id;
    kid.apprenticeOfId = master.id;
    kid.schedulePresentSiteIdToday = 1;
    kid.schedulePresentTicksToday = 108;
    master.schedulePresentSiteIdToday = 1;
    master.schedulePresentTicksToday = 108;

    advanceApprenticeships(w, w.entities);
    expect((kid.skills?.[JobType.Farmer] ?? 0)).toBeGreaterThanOrEqual(55);
    expect(kid.skills?.[JobType.Teacher]).toBeUndefined();
    expect(master.apprenticeId).toBeUndefined();
    expect(kid.apprenticeOfId).toBeUndefined();
  });
});

describe('apprenticeship eligibility reconciliation', () => {
  it('opens a fresh bounded commute pass before matching', () => {
    const w = initGame({ villageName: 'P7', size: 'medium' });
    w.entities = [];
    w.buildings = [];
    const master = addGeneratedSocialHuman(w, { id: 1, job: JobType.Farmer });
    master.skills = { [JobType.Farmer]: 90 };
    const student = addGeneratedSocialHuman(w, { id: 2 });
    student.educated = true;
    student.schoolDays = SCHOOL_FULL_EDUCATION_DAYS;
    w.buildings.push({ id: 10, type: BuildingType.Farm, x: 300, y: 300,
      width: 60, height: 60, occupants: [master.id], completed: true } as Building);
    let fresh = false;
    const begin = vi.spyOn(commuteReach, 'beginCommuteRoutePass').mockImplementation(() => { fresh = true; });
    const quote = vi.spyOn(commuteReach, 'isWithinAssignableCommute').mockImplementation(() => fresh);
    try {
      advanceApprenticeships(w, w.entities);
      expect(begin).toHaveBeenCalledTimes(1);
      expect(quote).toHaveBeenCalled();
      expect(student.apprenticeOfId).toBe(master.id);
    } finally {
      begin.mockRestore();
      quote.mockRestore();
    }
  });

  it('skips already-skilled and imprisoned scholars and trains an eligible scholar instead', () => {
    const w = initGame({ villageName: 'P7', size: 'medium' });
    w.entities = [];
    w.buildings = [];
    const master = addGeneratedSocialHuman(w, { id: 1, job: JobType.Farmer });
    master.skills = { [JobType.Farmer]: 90 };
    const skilled = addGeneratedSocialHuman(w, { id: 2 });
    const prisoner = addGeneratedSocialHuman(w, { id: 4 });
    const eligible = addGeneratedSocialHuman(w, { id: 6 });
    for (const person of [skilled, prisoner, eligible]) {
      person.educated = true;
      person.schoolDays = SCHOOL_FULL_EDUCATION_DAYS;
    }
    skilled.skills = { [JobType.Farmer]: 50 };
    prisoner.prisonBuildingId = 99;
    w.buildings.push({
      id: 10, type: BuildingType.Farm, x: 300, y: 300, width: 60, height: 60,
      occupants: [master.id], completed: true,
    } as Building);
    advanceApprenticeships(w, w.entities);
    expect(master.apprenticeId).toBe(eligible.id);
    expect(skilled.apprenticeOfId).toBeUndefined();
    expect(prisoner.apprenticeOfId).toBeUndefined();
  });

  it('awards the intermediate diploma bonus only to the trained trade', () => {
    const w = initGame({ villageName: 'P7', size: 'medium' });
    w.entities = [];
    w.buildings = [];
    const master = addGeneratedSocialHuman(w, { id: 1, job: JobType.Farmer });
    master.skills = { [JobType.Farmer]: 90 };
    const student = addGeneratedSocialHuman(w, { id: 3 });
    student.educated = true;
    student.schoolDays = 135;
    student.skills = { [JobType.Farmer]: 49.9 };
    master.apprenticeId = student.id;
    student.apprenticeOfId = master.id;
    for (const person of [master, student]) {
      person.schedulePresentSiteIdToday = 10;
      person.schedulePresentTicksToday = 108;
    }
    w.buildings.push({
      id: 10, type: BuildingType.Farm, x: 300, y: 300, width: 60, height: 60,
      occupants: [master.id], completed: true,
    } as Building);
    advanceApprenticeships(w, w.entities);
    expect(student.skills?.[JobType.Farmer]).toBeGreaterThanOrEqual(58);
    expect(student.skills?.[JobType.Farmer]).toBeLessThan(59);
    expect(student.skills?.[JobType.Teacher]).toBeUndefined();
    expect(student.apprenticeOfId).toBeUndefined();
  });
});

it.each([false, true])('preserves scholar age priority and ascending ID on equal fit (reverse=%s)', reverse => {
  const world = initGame({ villageName: 'Scholar ranking', size: 'medium' });
  world.entities = [];
  world.buildings = [];
  const master = addGeneratedSocialHuman(world, { id: 1, job: JobType.Farmer, x: 300, y: 300 });
  master.skills = { farmer: 90 };
  const lower = addGeneratedSocialHuman(world, { id: 2, x: 300, y: 300 });
  const higher = addGeneratedSocialHuman(world, { id: 3, x: 300, y: 300 });
  const younger = addGeneratedSocialHuman(world, { id: 4, x: 300, y: 300 });
  for (const scholar of [lower, higher, younger]) {
    scholar.age = scholar === younger ? 24 : 25;
    scholar.educated = true;
    scholar.schoolDays = SCHOOL_FULL_EDUCATION_DAYS;
    scholar.genomeV2 = genomeFrom();
    scholar.skills = {};
  }
  younger.skills = { farmer: 30 };
  world.buildings.push({
    id: 10, type: BuildingType.Farm, x: 300, y: 300, width: 60, height: 60,
    occupants: [master.id], level: 1, constructionProgress: 100, completed: true,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  } as Building);
  advanceApprenticeships(world, reverse ? [master, younger, higher, lower] : [master, lower, higher, younger]);
  expect(master.apprenticeId).toBe(lower.id);
});
