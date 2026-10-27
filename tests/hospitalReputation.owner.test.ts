/**
 * A15 — the hospital reputation rule has one owner and one description
 * (`docs/private/audits/2026-09-16/duplication-deadcode.md`, tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * The grant used to be issued twice from two owners: a flat `addReputation(state, 2)` in
 * `dailyBuildingEconomy.tickDailyBuildingEconomy` (on the 5-day production interval) and the ward
 * round's `addReputation(state, 1 + Math.min(2, treated))` in `hospitalCare.tickHospitalDailyCare`.
 * Two UI copies described it, and they had already drifted from the rule and from each other:
 * `SelectedBuildingPanel` promised an unquantified amount, `MoreTabPanel` promised `+2` while the
 * sim paid 3–5 per interval.
 *
 * The rule now lives in `hospitalCare`: `grantHospitalIntervalReputation` pays the flat grant and
 * runs the ward round, and `describeHospitalReputation` is the single description both UI sites
 * render. The kept wording is the guide's (`MoreTabPanel`) — it names the amount and the interval —
 * extended with the ward-round half it was missing, and every number in it comes from the owner's
 * constants.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { BuildingType, EntityType, Season, WeatherType } from '../src/game/gameTypes';
import { PRODUCTION_INTERVAL, TICKS_PER_DAY } from '../src/game/dayCycle';
import {
  HOSPITAL_REPUTATION_INTERVAL_DAYS,
  HOSPITAL_REPUTATION_PER_INTERVAL,
  HOSPITAL_TREATMENT_REPUTATION_MAX,
  describeHospitalReputation,
  grantHospitalIntervalReputation,
} from '../src/game/hospitalCare';

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 0,
    y: 0,
    energy: 50,
    maxEnergy: 100,
    age: 30,
    alive: true,
    isJuvenile: false,
    ...overrides,
  } as unknown as Entity;
}

function world(entities: Entity[]): WorldState {
  return {
    entities,
    tick: 0,
    width: 400,
    height: 300,
    year: 0,
    dayInYear: 0,
    season: Season.Spring,
    weather: WeatherType.Clear,
    resources: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
    notifications: [],
    bigNews: [],
    floatingTexts: [],
    deathParticles: [],
    nextFloatingTextId: 1,
    nextEntityId: 100,
    eventLog: [],
    villageReputation: 50,
    buildings: [],
    paused: false,
    speed: 1,
  } as unknown as WorldState;
}

/** The ward centre is (120, 120): 100 + 40/2. */
function hospital(occupantIds: number[]): Building {
  return {
    id: 7,
    type: BuildingType.Hospital,
    completed: true,
    occupants: occupantIds,
    x: 100,
    y: 100,
    width: 40,
    height: 40,
  } as unknown as Building;
}

/** Reputation one 5-day interval pays a staffed hospital, with the patient standing in the ward. */
function intervalGrant(patients: Entity[]): number {
  const doctor = human(2, { x: 120, y: 120, energy: 100 });
  const state = world([...patients, doctor]);
  const ward = hospital([2]);

  const before = state.villageReputation;
  grantHospitalIntervalReputation(state, ward, patients);
  return state.villageReputation - before;
}

describe('A15 — the hospital reputation rule has one owner', () => {
  it('states the flat amount, the interval and the ward-round half in one description', () => {
    const text = describeHospitalReputation();

    expect(HOSPITAL_REPUTATION_PER_INTERVAL).toBe(2);
    expect(HOSPITAL_REPUTATION_INTERVAL_DAYS).toBe(PRODUCTION_INTERVAL.hospital / TICKS_PER_DAY);
    expect(text).toContain(
      `+${HOSPITAL_REPUTATION_PER_INTERVAL} reputation every ${HOSPITAL_REPUTATION_INTERVAL_DAYS} days`,
    );
    expect(text).toContain(`+${HOSPITAL_TREATMENT_REPUTATION_MAX} more when patients are treated`);
    expect(text).toContain('lowers energy drain');
  });

  it('pays the advertised interval from one entry point: the flat grant, plus the ward round', () => {
    const idleWard = intervalGrant([]);
    expect(idleWard, 'a staffed ward with nobody to treat still pays the flat grant').toBe(
      HOSPITAL_REPUTATION_PER_INTERVAL,
    );

    const patient = human(1, { x: 120, y: 120, energy: 0 });
    const treatingWard = intervalGrant([patient]);
    expect(treatingWard).toBeGreaterThanOrEqual(HOSPITAL_REPUTATION_PER_INTERVAL);
    expect(treatingWard).toBeLessThanOrEqual(
      HOSPITAL_REPUTATION_PER_INTERVAL + HOSPITAL_TREATMENT_REPUTATION_MAX,
    );
    expect(patient.energy, 'fixture premise: the ward round actually treated the patient').toBeGreaterThan(0);
  });

  it('leaves both UI sites on the owner and neither restating the amount', () => {
    const sites = [
      'src/components/SelectedBuildingPanel.tsx',
      'src/components/tabPanels/MoreTabPanel.tsx',
    ];
    for (const site of sites) {
      const source = readFileSync(resolve(process.cwd(), site), 'utf8');
      expect(source, `${site} does not render the owner's description`).toMatch(/describeHospitalReputation\(\)/);
      expect(source, `${site} restates the interval amount`).not.toMatch(/reputation every 5 days/);
    }

    const economy = readFileSync(resolve(process.cwd(), 'src/game/dailyBuildingEconomy.ts'), 'utf8');
    expect(economy, 'dailyBuildingEconomy still issues the hospital grant').not.toMatch(/addReputation\(state, 2\)/);
    expect(economy, 'dailyBuildingEconomy does not call the owner').toMatch(/grantHospitalIntervalReputation\(/);
  });
});
