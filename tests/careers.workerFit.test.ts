import { describe, expect, it } from 'vitest';
import { evaluateWorkerFit } from '../src/game/careers/workerFit';
import { assignWorkerInPlace } from '../src/game/workforce';
import { JobType, BuildingType } from '../src/game/gameTypes';
import { human, building } from '../src/test/factories';

describe('optional worker fit after stable commute and skill ranking', () => {
  it('does not mutate missing skills while explaining current DNA and worked experience', () => {
    const h = human(1, { traits: ['greenthumb'], skills: undefined,
      careerHistory: { farmer: { days: 10, lastDay: 9 } } });
    const before = structuredClone(h);
    const fit = evaluateWorkerFit(h, JobType.Farmer, true);
    expect(fit.creditedDays).toBe(10);
    expect(fit.traitFactor).toBeGreaterThan(1);
    expect(fit.reasons?.length).toBeGreaterThan(0);
    expect(h).toEqual(before);
  });

  it('may select more experienced worker only on a truly identical commute and skill', () => {
    const site = building(10, BuildingType.Farm);
    const first = human(1, { x: 10, y: 10, skills: { farmer: 30 } });
    const second = human(2, { x: 10, y: 10, skills: { farmer: 30 },
      careerHistory: { farmer: { days: 100, lastDay: 101 } } });
    expect(assignWorkerInPlace(site, [first, second], [site])).toBe(true);
    expect(second.workerBuildingId).toBe(site.id);
    expect(first.workerBuildingId).toBeUndefined();
  });

  it('never moves a closer worker or a settled employee for better DNA/experience', () => {
    const site = building(10, BuildingType.Farm);
    const close = human(1, { x: 10, y: 10, skills: { farmer: 10 } });
    const far = human(2, { x: 40, y: 10, traits: ['greenthumb'], skills: { farmer: 100 },
      careerHistory: { farmer: { days: 1000, lastDay: 1001 } } });
    expect(assignWorkerInPlace(site, [far, close], [site])).toBe(true);
    expect(close.workerBuildingId).toBe(site.id);
    expect(far.workerBuildingId).toBeUndefined();

    const other = building(11, BuildingType.Farm, { occupants: [2] });
    const settled = human(2, { workerBuildingId: 11, job: JobType.Farmer,
      traits: ['greenthumb'], skills: { farmer: 100 } });
    const idle = human(3, { x: 10, y: 10 });
    const vacancy = building(12, BuildingType.Farm);
    expect(assignWorkerInPlace(vacancy, [settled, idle], [other, vacancy])).toBe(true);
    expect(settled.workerBuildingId).toBe(11);
    expect(idle.workerBuildingId).toBe(12);
  });

  it('keeps first encountered candidate when all criteria are equal', () => {
    const site = building(10, BuildingType.Farm);
    const first = human(11, { x: 10, y: 10 });
    const second = human(2, { x: 10, y: 10 });
    expect(assignWorkerInPlace(site, [first, second], [site])).toBe(true);
    expect(first.workerBuildingId).toBe(10);
    expect(second.workerBuildingId).toBeUndefined();
  });
});
