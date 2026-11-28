import { describe, expect, it } from 'vitest';
import { evaluateWorkerFit } from '../src/game/careers/workerFit';
import { assignWorkerInPlace } from '../src/game/workforce';
import { JobType, BuildingType } from '../src/game/gameTypes';
import { human, building } from '../src/test/factories';
import { genomeFrom } from './helpers/genome';

describe('optional worker fit after stable commute and skill ranking', () => {
  it('does not mutate missing skills while explaining current aptitudes and worked experience', () => {
    const h = human(1, { genomeV2: genomeFrom({ discipline: 90 }), skills: undefined,
      careerHistory: { farmer: { days: 10, lastDay: 9 } } });
    const before = structuredClone(h);
    const fit = evaluateWorkerFit(h, JobType.Farmer, true);
    expect(fit.creditedDays).toBe(10);
    expect(fit.aptitudeFactor).toBeGreaterThan(1);
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
    const far = human(2, { x: 40, y: 10, genomeV2: genomeFrom({ discipline: 90 }), skills: { farmer: 100 },
      careerHistory: { farmer: { days: 1000, lastDay: 1001 } } });
    expect(assignWorkerInPlace(site, [far, close], [site])).toBe(true);
    expect(close.workerBuildingId).toBe(site.id);
    expect(far.workerBuildingId).toBeUndefined();

    const other = building(11, BuildingType.Farm, { occupants: [2] });
    const settled = human(2, { workerBuildingId: 11, job: JobType.Farmer,
      genomeV2: genomeFrom({ discipline: 90 }), skills: { farmer: 100 } });
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


it('ranks distinct vocational talents rather than one routine factor for every job', () => {
  const person = human(1, { genomeV2: genomeFrom({ sociability: 95, cooperation: 90, flexibility: 90, discipline: 10, persistence: 10 }) });
  expect(evaluateWorkerFit(person, JobType.Hotelier).aptitudeFactor).toBeGreaterThan(1);
  expect(evaluateWorkerFit(person, JobType.Miner).aptitudeFactor).toBeLessThan(1);
  expect(evaluateWorkerFit(person, JobType.Settler).aptitudeFactor).toBe(1);
});

it('uses aptitude for a vacancy even when nearby candidates have different earned skills', () => {
  const site = building(10, BuildingType.Farm);
  const neutral = human(1, { x: 10, y: 10, skills: { farmer: 1 }, genomeV2: genomeFrom() });
  const talented = human(2, { x: 10, y: 10, skills: {}, genomeV2: genomeFrom({ discipline: 95, persistence: 95, sociability: 5 }) });
  expect(evaluateWorkerFit(talented, JobType.Farmer).selectionScore).toBeGreaterThan(1);
  expect(assignWorkerInPlace(site, [neutral, talented], [site])).toBe(true);
  expect(talented.workerBuildingId).toBe(site.id);
  expect(talented.skills?.farmer ?? 0).toBe(0);
});
