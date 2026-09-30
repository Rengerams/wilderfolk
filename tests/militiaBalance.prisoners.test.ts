/**
 * A prisoner is not militia.
 *
 * Regression for audit M1 (`docs/private/audits/2026-09-16/sim-economy-leadership-combat.md`,
 * tracked in `LIVE-FINDINGS-STATUS.md`): `isImprisoned` guards every staffing rule and both election
 * paths, but the militia paths counted a prisoner as a full adult — so a jailed settler added
 * militia strength, was drawn as a barricade fighter, and could be killed "defending the village".
 *
 * Five sites now share one predicate, `militiaBalance.canBeMustered`: the adult count that feeds
 * militia strength, the raid fighter pool, the raid casualty pool, the chivalrous bonus, and the
 * combat flash that draws who appears to be fighting.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { EntityType } from '../src/game/gameTypes';
import { canBeMustered, computeMilitiaBreakdown } from '../src/game/militiaBalance';
import { getRaidParticipants } from '../src/game/frontierCombat';
import type { Entity, SettlerTrait, WorldState } from '../src/game/gameTypes';

const FIXTURE_SEED = 20_260_917;
const SETTLER_COUNT = 20;

/** One adult settler; `traits` is written directly so rolled traits cannot skew a fixture. */
function adult(id: number, traits: SettlerTrait[] = [], overrides: Partial<Entity> = {}): Entity {
  const entity = createEntity(EntityType.Human, 300, 300, id, 80, false, { name: `S${id}` });
  entity.alive = true;
  entity.isJuvenile = false;
  entity.traits = traits;
  Object.assign(entity, overrides);
  return entity;
}

/** The state an arrest leaves behind: both links cleared, `prisonBuildingId` stamped. */
function imprison(entity: Entity, prisonId: number): void {
  entity.homeBuildingId = undefined;
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

    const chivalrous = adult(98, ['chivalrous']);
    expect(computeMilitiaBreakdown(state, [...own, chivalrous], { includeStructures: false }).militiaStrength)
      .toBeGreaterThan(base);

    imprison(chivalrous, 9);
    expect(computeMilitiaBreakdown(state, [...own, chivalrous], { includeStructures: false }).militiaStrength)
      .toBe(base);
  });

  it('leaves no bare player-adult filter in the combat pools', () => {
    // The casualty pool and `flashMilitia` are module-private, so this pins them as a source contract
    // rather than by behaviour: after the fix every adult filter in the file goes through
    // `canBeMustered` — the fighter pool, the casualty pool and the combat flash — and the legacy
    // inline shape is gone. Weaker than the tests above, and disclosed as such.
    const src = readFileSync(resolve(process.cwd(), 'src/game/frontierCombat.ts'), 'utf8');
    expect(src.match(/canBeMustered\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(src).not.toMatch(/isPlayerHuman\(e\) && !e\.isJuvenile/);
    expect(src).not.toMatch(/!e\.alive \|\| !isPlayerHuman\(e\)/);
  });
});
