/**
 * PR B — the danger consumers: passive militia, hunting and flight.
 *
 * Three claims are pinned:
 * 1. The militia's Chivalrous share keeps its established value and stays a *single* contribution: a
 *    protector who also carries Fierce adds exactly as much as one who does not, so the catalog's
 *    defense entries are not stacked onto the militia total, and the muster guards are unchanged.
 * 2. The free-roam hunt range is the catalog's hunting factor — a brave settler reaches game beyond
 *    an otherwise identical plain one, driven through the real `tickHumanHunting`.
 * 3. The flight speed reads the catalog's escape context, and no longer a raw `timid` literal.
 *    `tickHumans` — the only caller of the flight branch — has no unit harness (it needs a full
 *    `TickContext`, grids included), so this case pins the source wiring and the catalog direction
 *    instead of claiming a driven frame.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { EntityType, JobType } from '../src/game/gameTypes';
import type { Entity, SettlerTrait, WorldState } from '../src/game/gameTypes';
import { SPECIES_CONFIG } from '../src/game/speciesConfig';
import { getHumanHuntRange } from '../src/game/combat';
import { isPlayerHuman } from '../src/game/playerHuman';
import { tickHumanHunting } from '../src/game/humanHuntingBehavior';
import { computeMilitiaBreakdown } from '../src/game/militiaBalance';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { evaluateTraitInfluence } from '../src/game/personality/traitEvaluation';
import { byType } from '../src/test/factories';

const FIXTURE_SEED = 20_260_928;
const HUNTING = { kind: 'danger', activity: 'hunting' } as const;
const ESCAPE = { kind: 'danger', activity: 'escape' } as const;
const DEFENSE = { kind: 'danger', activity: 'defense' } as const;

/** Enough adult soldiers that an 8% militia share rounds to a visible integer. */
const SOLDIER_COUNT = 25;

function soldier(id: number, traits: SettlerTrait[], overrides: Partial<Entity> = {}): Entity {
  const entity = createEntity(EntityType.Human, 300, 300, id, 80, false, { name: `S${id}` });
  entity.alive = true;
  entity.isJuvenile = false;
  entity.job = JobType.Soldier;
  // Written directly so the rolled traits cannot make the fixture non-deterministic.
  entity.traits = traits;
  return Object.assign(entity, overrides);
}

function militia(state: WorldState, entities: Entity[]): number {
  return computeMilitiaBreakdown(state, entities, { includeStructures: false }).militiaStrength;
}

describe('the militia keeps one Chivalrous contribution', () => {
  it('pays for a protector exactly once, whatever else the catalog says about them', () => {
    const state = initGame({ villageName: 'Militia', size: 'medium', seed: FIXTURE_SEED });
    const own = Array.from({ length: SOLDIER_COUNT }, (_, i) => soldier(i + 1, []));
    const base = militia(state, own);

    const protector = soldier(90, ['chivalrous']);
    const withChivalrous = militia(state, [...own, protector]);
    expect(withChivalrous, 'the trait must work at all, or the assertions below pass for free')
      .toBeGreaterThan(base);

    // A second defense entry in the catalog must not be stacked onto the same total.
    expect(militia(state, [...own, soldier(91, ['chivalrous', 'fierce'])])).toBe(withChivalrous);
    expect(evaluateTraitInfluence({ traits: ['fierce'] }, DEFENSE).factor, 'fixture premise')
      .toBeGreaterThan(1);
  });

  it('still refuses a protector who cannot be mustered', () => {
    const state = initGame({ villageName: 'Militia', size: 'medium', seed: FIXTURE_SEED });
    const own = Array.from({ length: SOLDIER_COUNT }, (_, i) => soldier(i + 1, []));
    const base = militia(state, own);

    expect(militia(state, [...own, soldier(92, ['chivalrous'], { faction: 'rival' })])).toBe(base);
    expect(militia(state, [...own, soldier(93, ['chivalrous'], { isJuvenile: true })])).toBe(base);
    expect(militia(state, [...own, soldier(94, ['chivalrous'], { job: JobType.Settler })])).toBe(base);
  });
});

/** One settler out on a famine hunt, with the colony's small game parked far out of reach. */
function huntWorld(traits: SettlerTrait[], preyDistance: number): { state: WorldState; hunter: Entity; prey: Entity } {
  const state = initGame({ seed: FIXTURE_SEED });
  const hunter = state.entities.find((e) => e.alive && isPlayerHuman(e));
  expect(hunter, 'fixture premise: the colony starts with a settler').toBeTruthy();
  hunter!.job = JobType.Settler;
  hunter!.isJuvenile = false;
  hunter!.traits = traits;
  hunter!.x = 200;
  hunter!.y = 200;
  if (hunter!.needs) hunter!.needs.nutrition = 40;
  state.resources.food = 0;

  const prey = state.entities.filter((e) => e.type === EntityType.Deer)[0];
  expect(prey, 'fixture premise: the valley holds deer').toBeTruthy();
  for (const game of state.entities) {
    if (game.type === EntityType.Deer || game.type === EntityType.Rabbit) {
      game.x = 60;
      game.y = 830;
      game.tamedBy = undefined;
      game.alive = true;
    }
  }
  prey!.x = hunter!.x + preyDistance;
  prey!.y = hunter!.y;
  return { state, hunter: hunter!, prey: prey! };
}

/** The range the hunt path itself would grant this settler on this world. */
function huntRangeFor(state: WorldState, hunter: Entity): number {
  const config = SPECIES_CONFIG[EntityType.Human];
  const jobMult = hunter.job === JobType.Hunter ? 1.2 : 0.75;
  return getHumanHuntRange(state, config.huntRange * jobMult * evaluateTraitInfluence(hunter, HUNTING).factor);
}

function standAndHunt(state: WorldState, hunter: Entity, prey: Entity): Entity {
  const entityById = new Map(state.entities.map((entity) => [entity.id, entity]));
  const buckets = byType(state.entities);
  const ctx = {
    entityById,
    updatedBuildings: state.buildings,
    byType: buckets,
    huntTargetByPreyId: new Map<number, Set<number>>(),
  } as unknown as TickContext;
  const config = (SPECIES_CONFIG as Record<EntityType, typeof SPECIES_CONFIG[EntityType.Human]>)[EntityType.Human];
  tickHumanHunting(
    state, ctx, hunter, config,
    false, true, false, false,
    buckets, undefined, entityById, false,
  );
  return prey;
}

describe('the free-roam hunt range is the catalog hunting factor', () => {
  it('lets a brave settler target game the plain settler never sees', () => {
    const plain = huntWorld([], 0);
    const brave = huntWorld(['brave'], 0);
    const plainRange = huntRangeFor(plain.state, plain.hunter);
    const braveRange = huntRangeFor(brave.state, brave.hunter);
    expect(braveRange).toBeGreaterThan(plainRange);

    // Just beyond the plain settler's reach, and well inside the brave one's.
    const distance = (plainRange + braveRange) / 2;
    const plainHunt = huntWorld([], distance);
    const braveHunt = huntWorld(['brave'], distance);

    standAndHunt(plainHunt.state, plainHunt.hunter, plainHunt.prey);
    standAndHunt(braveHunt.state, braveHunt.hunter, braveHunt.prey);

    // Both settlers stand the same distance from the same deer: only the reach differs.
    expect(plainHunt.hunter.huntTargetId).toBeUndefined();
    expect(braveHunt.hunter.huntTargetId).toBe(braveHunt.prey.id);
    expect(braveHunt.prey.alive, 'the deer is pursued, not shot — the distance is the point').toBe(true);
  });

  it('leaves a settler whose traits say nothing about hunting at the neutral range', () => {
    const plain = huntWorld([], 0);
    const stoic = huntWorld(['stoic'], 0);
    expect(huntRangeFor(stoic.state, stoic.hunter)).toBe(huntRangeFor(plain.state, plain.hunter));
  });
});

describe('flight reads the catalog escape context', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/game/humanTick.ts'), 'utf8');

  it('no longer multiplies a raw timid literal into the flee speed', () => {
    expect(source).not.toMatch(/traitMultiplier\(entity, 'timid', 1\.35\)/);
    expect(source).toMatch(/evaluateTraitInfluence\(entity, ESCAPE_CONTEXT\)/);
  });

  it('keeps a risk-aware settler faster and a reckless one slower, as the catalog states', () => {
    expect(evaluateTraitInfluence({ traits: ['timid'] }, ESCAPE).factor).toBeGreaterThan(1);
    expect(evaluateTraitInfluence({ traits: ['brave'] }, ESCAPE).factor).toBeLessThan(1);
    expect(evaluateTraitInfluence({ traits: ['lucky'] }, ESCAPE).factor).toBeLessThan(1);
    expect(evaluateTraitInfluence({ traits: ['stoic'] }, ESCAPE)).toEqual({ factor: 1, tendency: 0 });
  });
});
