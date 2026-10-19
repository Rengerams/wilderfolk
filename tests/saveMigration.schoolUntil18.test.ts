import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType, JobType } from '../src/game/gameTypes';
import { repairJuvenileAssignmentsOnLoad } from '../src/game/dayCycle';
import { applyEducationGraduation } from '../src/game/education';
import type { Entity } from '../src/game/gameTypes';

describe('older saves: schooling and adulthood begin/end at the correct ages', () => {
  it('repairs Demetrius-like early graduation without touching family or skills', () => {
    const state = initGame({ seed: 4242 });
    const child = {
      id: 90001, type: EntityType.Human, age: 12, alive: true,
      name: 'Demetrius', surname: 'Wilke',
      isJuvenile: false, schoolDays: 24, educated: true,
      schoolTicksToday: 12, skills: { [JobType.Farmer]: 9 },
      motherId: 80, fatherId: 81, friendships: { friend_50: 9 },
      job: JobType.Settler,
    } as Entity;
    state.entities.push(child);
    repairJuvenileAssignmentsOnLoad(state);
    expect(child.isJuvenile).toBe(true);
    expect(child.educated).toBe(false);
    expect(child.schoolDays).toBe(0);
    expect(child.schoolTicksToday).toBe(0);
    expect(child.skills?.[JobType.Farmer]).toBe(9);
    expect(child.fatherId).toBe(81);
    expect(child.motherId).toBe(80);
    expect(child.friendships).toEqual({ friend_50: 9 });
    repairJuvenileAssignmentsOnLoad(state);
    expect(child.schoolDays).toBe(0);
  });

  it('preserves normal school attendance for a child who has not prematurely graduated', () => {
    const state = initGame({ seed: 4242 });
    const child = {
      id: 90002, type: EntityType.Human, age: 10, alive: true,
      isJuvenile: true, schoolDays: 12, educated: false,
      job: JobType.Settler,
    } as Entity;
    state.entities.push(child);
    repairJuvenileAssignmentsOnLoad(state);
    expect(child.schoolDays).toBe(12);
    expect(child.isJuvenile).toBe(true);
  });

  it('clears an underage apprenticeship at load without erasing learned skills', () => {
    const state = initGame({ seed: 4242 });
    const master = { id: 90003, type: EntityType.Human, age: 40, alive: true,
      isJuvenile: false, apprenticeId: 90004, job: JobType.Farmer } as Entity;
    const child = { id: 90004, type: EntityType.Human, age: 10, alive: true,
      isJuvenile: true, apprenticeOfId: 90003,
      job: JobType.Settler, skills: { [JobType.Farmer]: 16 } } as Entity;
    state.entities.push(master, child);
    repairJuvenileAssignmentsOnLoad(state);
    expect(child.apprenticeOfId).toBeUndefined();
    expect(master.apprenticeId).toBeUndefined();
    expect(child.skills?.[JobType.Farmer]).toBe(16);
  });

  it('cannot graduate at 17 even with enough days, but can at 18', () => {
    const state = initGame({ seed: 4242 });
    const pupil = { id: 90005, type: EntityType.Human, age: 17, alive: true,
      isJuvenile: true, schoolDays: 45, skills: {},
      maxEnergy: 100, energy: 100, name: 'Pupil', surname: 'Test' } as Entity;
    state.entities.push(pupil);
    applyEducationGraduation(state, pupil);
    expect(pupil.educated).not.toBe(true);
    pupil.age = 18;
    pupil.isJuvenile = false;
    applyEducationGraduation(state, pupil);
    expect(pupil.educated).toBe(true);
  });
});
