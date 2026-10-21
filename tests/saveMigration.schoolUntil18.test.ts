import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType, JobType } from '../src/game/gameTypes';
import { repairJuvenileAssignmentsOnLoad } from '../src/game/dayCycle';
import { applyEducationGraduation } from '../src/game/education';
import { createEntity } from '../src/game/entityFactory';

function human(id: number, age: number, name = 'Settler') {
  const entity = createEntity(EntityType.Human, 100, 100, id, 100, age < 18, { name, ageYears: age });
  entity.age = age;
  return entity;
}

describe('older saves: schooling and adulthood begin/end at the correct ages', () => {
  it('clears legacy child work counters and fatigue without erasing school progress', () => {
    const state = initGame({ seed: 4242 });
    const child = human(90009, 12);
    Object.assign(child, {
      isJuvenile: false, job: JobType.Settler,
      scheduleWorkedTicksToday: 27,
      scheduleLastWorkedHours: 9,
      scheduleFatigue: 40,
      schoolDays: 11, schoolTicksToday: 5, educated: false,
    });
    state.entities.push(child);
    repairJuvenileAssignmentsOnLoad(state);
    expect(child.isJuvenile).toBe(true);
    expect(child.scheduleWorkedTicksToday).toBe(0);
    expect(child.scheduleLastWorkedHours).toBe(0);
    expect(child.scheduleFatigue).toBe(0);
    expect(child.schoolDays).toBe(11);
    expect(child.schoolTicksToday).toBe(5);
  });

  it('repairs Demetrius-like early graduation without touching family or skills', () => {
    const state = initGame({ seed: 4242 });
    const child = human(90001, 12, 'Demetrius');
    Object.assign(child, {
      surname: 'Wilke', isJuvenile: false, schoolDays: 24, educated: true,
      schoolTicksToday: 12, skills: { [JobType.Farmer]: 9 },
      motherId: 80, fatherId: 81, friendships: { friend_50: 9 },
      job: JobType.Settler,
    });
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
    const child = human(90002, 10);
    Object.assign(child, { isJuvenile: true, schoolDays: 12, educated: false, job: JobType.Settler });
    state.entities.push(child);
    repairJuvenileAssignmentsOnLoad(state);
    expect(child.schoolDays).toBe(12);
    expect(child.isJuvenile).toBe(true);
  });

  it('clears an underage apprenticeship at load without erasing learned skills', () => {
    const state = initGame({ seed: 4242 });
    const master = human(90003, 40);
    Object.assign(master, { apprenticeId: 90004, job: JobType.Farmer });
    const child = human(90004, 10);
    Object.assign(child, { apprenticeOfId: 90003, job: JobType.Settler, skills: { [JobType.Farmer]: 16 } });
    state.entities.push(master, child);
    repairJuvenileAssignmentsOnLoad(state);
    expect(child.apprenticeOfId).toBeUndefined();
    expect(master.apprenticeId).toBeUndefined();
    expect(child.skills?.[JobType.Farmer]).toBe(16);
  });

  it('cannot graduate at 17 even with enough days, but can at 18', () => {
    const state = initGame({ seed: 4242 });
    const pupil = human(90005, 17, 'Pupil');
    Object.assign(pupil, { schoolDays: 45, skills: {}, maxEnergy: 100, energy: 100, surname: 'Test' });
    state.entities.push(pupil);
    applyEducationGraduation(state, pupil);
    expect(pupil.educated).not.toBe(true);
    pupil.age = 18;
    pupil.isJuvenile = false;
    applyEducationGraduation(state, pupil);
    expect(pupil.educated).toBe(true);
  });
});
