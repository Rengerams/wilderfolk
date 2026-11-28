import { getDefenseStructureBreakdown, getWallSegmentCap } from '../src/game/defenseStructures';
import { human, finishedBuilding } from '../src/test/factories';
/**
 * A prisoner is not militia: the adult count, raid fighter pool, casualty pool, chivalrous bonus
 * and combat flash all share `militiaBalance.canBeMustered`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { BuildingType, EntityType, JobType, MapSize } from '../src/game/gameTypes';
import { canBeMustered, computeMilitiaBreakdown } from '../src/game/militiaBalance';
import { getRaidParticipants } from '../src/game/frontierCombat';
import type { Entity, VillageForgeState, WorldState } from '../src/game/gameTypes';
import { genomeFrom } from './helpers/genome';

const FIXTURE_SEED = 20_260_917;
const SETTLER_COUNT = 20;

/** One adult settler; the genome is written directly so a roll cannot skew a fixture. */
function adult(id: number, overrides: Partial<Entity> = {}): Entity {
  const entity = createEntity(EntityType.Human, 300, 300, id, 80, false, { name: `S${id}`, ageYears: 30 });
  entity.alive = true;
  entity.isJuvenile = false;
  entity.job = JobType.Soldier;
  entity.genomeV2 = genomeFrom();
  Object.assign(entity, overrides);
  return entity;
}

/** The state an arrest leaves behind: both links cleared, `prisonBuildingId` stamped. */
function imprison(entity: Entity, prisonId: number): void {
  entity.workerBuildingId = undefined;
  entity.residenceBuildingId = undefined;
  entity.prisonBuildingId = prisonId;
}

function world(): WorldState {
  return initGame({ villageName: 'Muster', size: 'medium', seed: FIXTURE_SEED });
}

const settlers = (): Entity[] => Array.from({ length: SETTLER_COUNT }, (_, i) => adult(i + 1));

describe('a prisoner is never mustered', () => {
  it('canBeMustered excludes the settler only once they are jailed', () => {
    const settler = adult(1);
    expect(canBeMustered(settler)).toBe(true);

    imprison(settler, 9);

    expect(canBeMustered(settler)).toBe(false);
  });

  it('permits an elected civilian commander using the same eligibility safeguards', () => {
    const leader = adult(88, { job: JobType.Farmer });
    expect(canBeMustered(leader)).toBe(false);
    expect(canBeMustered(leader, { allowNonSoldier: true })).toBe(true);
    // The exception does not affect the soldier-only militia-strength calculation.
    expect(computeMilitiaBreakdown(world(), [leader], { includeStructures: false }).adultCount).toBe(0);

    const jailed = adult(89, { job: JobType.Farmer, prisonBuildingId: 9 });
    const deployed = adult(90, { job: JobType.Farmer, raidDeploymentId: 'other_raid' });
    const dead = adult(91, { job: JobType.Farmer, alive: false });
    const juvenile = adult(92, { job: JobType.Farmer, age: 16 });
    for (const unavailable of [jailed, deployed, dead, juvenile]) {
      expect(canBeMustered(unavailable, { allowNonSoldier: true })).toBe(false);
    }
  });

  it('excludes civilians from combat strength and casualties even when armed', () => {
    const state = world();
    const soldier = adult(1);
    const farmer = adult(2, { job: JobType.Farmer });
    expect(canBeMustered(soldier)).toBe(true);
    expect(canBeMustered(farmer)).toBe(false);
    const breakdown = computeMilitiaBreakdown(state, [soldier, farmer], { includeStructures: false });
    expect(breakdown.adultCount).toBe(1);
    expect(getRaidParticipants(state, [soldier, farmer], 'barricade').map((person) => person.id)).toEqual([soldier.id]);
    expect(getRaidParticipants(state, [soldier, farmer], 'outgoing').some((person) => person.id === farmer.id)).toBe(false);
  });

  it('adds no militia strength and no adult to the breakdown', () => {
    const state = world();
    const own = settlers();
    const before = computeMilitiaBreakdown(state, own, { includeStructures: false });

    const prisoner = adult(99);
    imprison(prisoner, 9);
    const after = computeMilitiaBreakdown(state, [...own, prisoner], { includeStructures: false });

    expect(after.adultCount).toBe(before.adultCount);
    expect(after.militiaStrength).toBe(before.militiaStrength);
  });

  it('is drawn in neither the barricade nor the militia fighter pool', () => {
    const state = world();
    const prisoner = adult(99);
    imprison(prisoner, 9);
    const entities = [...settlers(), prisoner];

    const barricade = getRaidParticipants(state, entities, 'barricade').map((e) => e.id);
    // The 20 jail-free adults are all drawn: proof the exclusion below is the prison link and not an
    // entity the pool silently rejects anyway.
    expect(barricade).toHaveLength(SETTLER_COUNT);
    expect(barricade).not.toContain(prisoner.id);

    // Militia mode additionally requires village weapons, which this fresh world has none of, so it is
    // empty for an unrelated reason — assert only the exclusion and the subset relation.
    const militia = getRaidParticipants(state, entities, 'militia').map((e) => e.id);
    expect(militia).not.toContain(prisoner.id);
    expect(militia.every((id) => barricade.includes(id))).toBe(true);
  });

  it('grants no chivalrous bonus while jailed', () => {
    const state = world();
    const own = settlers();
    const base = computeMilitiaBreakdown(state, own, { includeStructures: false }).militiaStrength;

    const chivalrous = adult(98, { genomeV2: genomeFrom({ composure: 95, riskTaking: 90 }) });
    expect(computeMilitiaBreakdown(state, [...own, chivalrous], { includeStructures: false }).militiaStrength)
      .toBeGreaterThan(base);

    imprison(chivalrous, 9);
    expect(computeMilitiaBreakdown(state, [...own, chivalrous], { includeStructures: false }).militiaStrength)
      .toBe(base);
  });

  it('leaves no bare player-adult filter in the combat pools', () => {
    // The casualty pool and `flashMilitia` are module-private, so this pins the source contract:
    // every adult filter in the file goes through `canBeMustered`, with no inline legacy shape.
    const src = readFileSync(resolve(process.cwd(), 'src/game/frontierCombat.ts'), 'utf8');
    expect(src.match(/canBeMustered\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(src).not.toMatch(/isPlayerHuman\(e\) && !e\.isJuvenile/);
    expect(src).not.toMatch(/!e\.alive \|\| !isPlayerHuman\(e\)/);
  });
});

describe('L47 wall-cap label', () => {
  function militiaWorld(forge: VillageForgeState | undefined): WorldState {
    const state = initGame({ villageName: 'MilitiaCap', size: MapSize.Medium, seed: 11 });
    state.buildings = Array.from({ length: 10 }, (_, i) =>
      finishedBuilding(100 + i, BuildingType.Wall, { x: i * 20 }),
    );
    state.entities = [human(1, { x: 100, y: 100, job: JobType.Soldier })];
    state.villageForge = forge;
    return state;
  }

  it('reports the cap the forge actually grants (+72 plain, +96 with wall plates)', () => {
    const plainState = militiaWorld(undefined);
    const plain = computeMilitiaBreakdown(plainState, plainState.entities);
    expect(plain.lines.some((line) => line.includes('max +72'))).toBe(true);
    expect(plain.lines.some((line) => line.includes('max +96'))).toBe(false);

    const platedState = militiaWorld({
      activeOrder: null,
      progress: 0,
      completed: { wall_plates: true },
    } as VillageForgeState);
    const plated = computeMilitiaBreakdown(platedState, platedState.entities);
    expect(plated.lines.some((line) => line.includes('max +96'))).toBe(true);
    // The label must not understate the bonus the same state actually grants.
    expect(plated.barricadeStrength).toBeGreaterThan(plain.barricadeStrength);
  });

  it('reports the same cap in the defense-structure break-down (the L47 twin)', () => {
    const plainState = militiaWorld(undefined);
    expect(getWallSegmentCap(plainState)).toBe(72);
    expect(
      getDefenseStructureBreakdown(plainState, plainState.buildings).some((line) =>
        line.includes('max +72'),
      ),
    ).toBe(true);

    const platedState = militiaWorld({
      activeOrder: null,
      progress: 0,
      completed: { wall_plates: true },
    } as VillageForgeState);
    expect(getWallSegmentCap(platedState)).toBe(96);
    const lines = getDefenseStructureBreakdown(platedState, platedState.buildings);
    expect(lines.some((line) => line.includes('max +96'))).toBe(true);
    expect(lines.some((line) => line.includes('max +72'))).toBe(false);
  });
});
