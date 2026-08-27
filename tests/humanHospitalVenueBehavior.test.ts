import { describe, expect, it } from 'vitest';
import type { Entity } from '../src/game/gameTypes';
import { PREGNANCY_TICKS } from '../src/game/dayCycle';
import {
  shouldAttemptHospitalTreatment,
  shouldRoutePregnantSettlerToHospital,
} from '../src/game/humanHospitalBehavior';
import { shouldRunTavernService } from '../src/game/humanVenueBehavior';

function pregnantSettler(progress: number): Entity {
  return {
    id: 1,
    type: 'human' as Entity['type'],
    alive: true,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    speed: 1,
    energy: 40,
    maxEnergy: 100,
    pregnant: true,
    pregnancyProgress: progress,
  } as Entity;
}

describe('human hospital runtime gates', () => {
  it('keeps free-time clinic routing and late-pregnancy work-time routing unchanged', () => {
    const earlyPregnancy = pregnantSettler(PREGNANCY_TICKS * 0.85);
    const latePregnancy = pregnantSettler(PREGNANCY_TICKS * 0.85 + 1);

    expect(shouldRoutePregnantSettlerToHospital(earlyPregnancy, false, true)).toBe(true);
    expect(shouldRoutePregnantSettlerToHospital(earlyPregnancy, true, true)).toBe(false);
    expect(shouldRoutePregnantSettlerToHospital(latePregnancy, true, true)).toBe(true);
    expect(shouldRoutePregnantSettlerToHospital(latePregnancy, false, false)).toBe(false);
  });

  it('requires a staffed hospital for patient treatment', () => {
    const settler = pregnantSettler(PREGNANCY_TICKS * 0.9);

    expect(shouldAttemptHospitalTreatment(settler, true, true)).toBe(true);
    expect(shouldAttemptHospitalTreatment(settler, true, false)).toBe(false);
  });
});

describe('human tavern runtime gate', () => {
  it('runs service only for an on-duty innkeeper outside danger and ceremony', () => {
    expect(shouldRunTavernService(false, false, true, true)).toBe(true);
    expect(shouldRunTavernService(true, false, true, true)).toBe(false);
    expect(shouldRunTavernService(false, true, true, true)).toBe(false);
    expect(shouldRunTavernService(false, false, false, true)).toBe(false);
    expect(shouldRunTavernService(false, false, true, false)).toBe(false);
  });
});
