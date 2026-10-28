/**
 * PR B — the danger consumers: passive militia, hunting and flight.
 *
 * Three claims are pinned:
 * 1. The militia prices each already-mustered soldier with that soldier's own bounded DNA factor, so
 *    one protector cannot raise the whole army and the retired flat +8 % global bonus is gone. The
 *    muster guards are unchanged.
 * 2. The free-roam hunt range is the catalog's hunting factor — a brave settler reaches game beyond
 *    an otherwise identical plain one, driven through the real `tickHumanHunting`.
 * 3. The flight speed reads the catalog's escape context: in a driven `tickHumans` frame the catalog
 *    factor is the whole difference between two otherwise identical settlers.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { EntityType, JobType, Season } from '../src/game/gameTypes';
import type { Entity, SettlerTrait, WorldState } from '../src/game/gameTypes';
import { tickHumans } from '../src/game/humanTick';
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
const PURSUIT = { kind: 'danger', activity: 'pursuit' } as const;
const ESCAPE = { kind: 'danger', activity: 'escape' } as const;
const DEFENSE = { kind: 'danger', activity: 'defense' } as const;

/** Enough adult soldiers that a single soldier's share clears the integer rounding. */
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

function militiaWorld(): { state: WorldState; own: Entity[]; base: number } {
  const state = initGame({ villageName: 'Militia', size: 'medium', seed: FIXTURE_SEED });
  const own = Array.from({ length: SOLDIER_COUNT }, (_, i) => soldier(i + 1, []));
  return { state, own, base: militia(state, own) };
}

describe('the militia prices each defender\'s own DNA', () => {
  it('adds one soldier\'s bounded share, not a fraction of the whole army', () => {
    const { state, own, base } = militiaWorld();
    // Same roster size: one of the existing soldiers carries the trait, so only its own share moves.
    const roster = own.map((entity, index) => soldier(entity.id, index === 0 ? ['chivalrous'] : []));
    const withProtector = militia(state, roster);
    const delta = withProtector - base;

    expect(delta, 'the trait must work at all, or the assertions below pass for free').toBeGreaterThan(0);
    // The retired rule added 8 % of the entire militia; one soldier's own share stays far below it.
    expect(delta).toBeLessThan(base * 0.06);
  });

  it('scales with the number of protectors, one share each', () => {
    const { state, own, base } = militiaWorld();
    const one = militia(state, [...own, soldier(90, ['chivalrous'])]);
    const two = militia(state, [...own, soldier(90, ['chivalrous']), soldier(91, ['chivalrous'])]);
    const firstShare = one - base;

    expect(two).toBeGreaterThan(one);
    expect(Math.abs((two - one) - firstShare), 'a second protector earns the same own share')
      .toBeLessThanOrEqual(1);
  });

  it('prices Fierce as its own defender factor instead of a second Chivalrous branch', () => {
    const { state, own, base } = militiaWorld();
    const chivalrous = evaluateTraitInfluence({ traits: ['chivalrous'] }, DEFENSE).factor;
    const mixed = evaluateTraitInfluence({ traits: ['chivalrous', 'fierce'] }, DEFENSE).factor;
    expect(mixed, 'fixture premise: Fierce adds its own defense resolve').toBeGreaterThan(chivalrous);

    const crew = (startId: number, traits: SettlerTrait[]): Entity[] =>
      [...own, ...Array.from({ length: 5 }, (_, i) => soldier(startId + i, traits))];

    expect(militia(state, crew(95, ['fierce']))).toBeGreaterThan(base);
    expect(militia(state, crew(96, ['chivalrous', 'fierce'])))
      .toBeGreaterThan(militia(state, crew(96, ['chivalrous'])));
  });

  it('keeps every soldier factor bounded inside the new-effect cap', () => {
    for (const traits of [['chivalrous'], ['fierce'], ['chivalrous', 'fierce']] as SettlerTrait[][]) {
      const factor = evaluateTraitInfluence({ traits }, DEFENSE).factor;
      expect(factor, JSON.stringify(traits)).toBeGreaterThan(1);
      expect(factor, JSON.stringify(traits)).toBeLessThanOrEqual(1.15);
    }
  });

  it('still refuses a protector who cannot be mustered', () => {
    const { state, own, base } = militiaWorld();

    expect(militia(state, [...own, soldier(92, ['chivalrous'], { faction: 'rival' })])).toBe(base);
    expect(militia(state, [...own, soldier(93, ['chivalrous'], { faction: 'visitor' })])).toBe(base);
    expect(militia(state, [...own, soldier(94, ['chivalrous'], { isJuvenile: true })])).toBe(base);
    expect(militia(state, [...own, soldier(95, ['chivalrous'], { job: JobType.Settler })])).toBe(base);
    expect(militia(state, [...own, soldier(96, ['chivalrous'], { prisonBuildingId: 9 })])).toBe(base);
  });

  it('states the per-soldier DNA term and no retired global percentage', () => {
    const { state, own } = militiaWorld();
    const lines = computeMilitiaBreakdown(state, [...own, soldier(99, ['chivalrous'])], {
      includeStructures: false,
    }).lines;
    const line = lines.find((entry) => entry.includes('defender traits'));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/8%/);
    expect(line).toMatch(/per-soldier DNA/);

    const plainLines = computeMilitiaBreakdown(state, own, { includeStructures: false }).lines;
    expect(plainLines.some((entry) => entry.includes('defender traits'))).toBe(false);
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
  const config = SPECIES_CONFIG[EntityType.Human];
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

  it('applies the catalog factor once at each danger site, with no raw legacy literal', () => {
    const huntingSource = readFileSync(resolve(process.cwd(), 'src/game/humanHuntingBehavior.ts'), 'utf8');
    for (const factor of [
      evaluateTraitInfluence({ traits: ['brave'] }, HUNTING).factor,
      evaluateTraitInfluence({ traits: ['brave'] }, PURSUIT).factor,
    ]) {
      expect(factor).toBeGreaterThan(1);
      expect(factor).toBeLessThanOrEqual(1.15);
    }
    expect(huntingSource).toMatch(/evaluateTraitInfluence\(entity, HUNT_CONTEXT\)\.factor/);
    expect(huntingSource).toMatch(/evaluateTraitInfluence\(entity, PURSUIT_CONTEXT\)\.factor/);
    expect(huntingSource).not.toMatch(/traitMultiplier\(entity, 'brave'/);
  });

  it('leaves a settler whose traits say nothing about hunting at the neutral range', () => {
    const plain = huntWorld([], 0);
    const stoic = huntWorld(['stoic'], 0);
    expect(huntRangeFor(stoic.state, stoic.hunter)).toBe(huntRangeFor(plain.state, plain.hunter));
  });
});

/** One settler facing an active Moon Howler 40 px away, ticked once through the real `tickHumans`. */
function fleeFromHowler(traits: SettlerTrait[]): { speed: number } {
  const state = initGame({ seed: FIXTURE_SEED });
  const found = state.entities.find((e) => e.alive && isPlayerHuman(e) && !e.isJuvenile);
  expect(found, 'fixture premise: the colony starts with a settler').toBeTruthy();
  const runner = found!;
  runner.job = JobType.Settler;
  runner.traits = traits;
  runner.workerBuildingId = undefined;
  runner.residenceBuildingId = undefined;
  runner.vx = 0;
  runner.vy = 0;

  const howler = createEntity(EntityType.Werewolf, runner.x + 40, runner.y, 9_001, 80, false, { name: 'Howler' });
  howler.alive = true;
  howler.moonHowlerCursed = true;
  state.entities.push(howler);

  const humans = [runner];
  const byType = {
    [EntityType.Human]: humans,
    [EntityType.Werewolf]: [howler],
  } as unknown as TickContext['byType'];
  tickHumans(state, {
    width: state.width,
    height: state.height,
    hourOfDay: 12,
    season: Season.Spring,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 0,
    canHeat: true,
    byType,
    aliveEntities: [runner, howler],
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: humans,
    entityById: new Map<number, Entity>([[runner.id, runner], [howler.id, howler]]),
    buildingById: new Map(state.buildings.map((b) => [b.id, b])),
    predators: [],
  } as TickContext);

  return { speed: Math.hypot(runner.vx, runner.vy) };
}

describe('flight reads the catalog escape context', () => {
  it('makes the catalog factor the whole speed difference in a driven frame', () => {
    const plain = fleeFromHowler([]);
    expect(plain.speed, 'fixture premise: the settler actually fled the howler').toBeGreaterThan(0);

    for (const traits of [['timid'], ['brave'], ['lucky']] as SettlerTrait[][]) {
      const factor = evaluateTraitInfluence({ traits }, ESCAPE).factor;
      expect(factor, JSON.stringify(traits)).not.toBe(1);
      const fled = fleeFromHowler(traits);
      expect(fled.speed / plain.speed, JSON.stringify(traits)).toBeCloseTo(factor, 6);
    }
  });

  it('keeps a risk-aware settler faster and a reckless one slower, as the catalog states', () => {
    const timid = fleeFromHowler(['timid']);
    const plain = fleeFromHowler([]);
    const brave = fleeFromHowler(['brave']);

    expect(timid.speed).toBeGreaterThan(plain.speed);
    expect(brave.speed).toBeLessThan(plain.speed);
  });

  it('leaves a settler whose traits say nothing about flight at the plain speed', () => {
    expect(fleeFromHowler(['stoic']).speed).toBeCloseTo(fleeFromHowler([]).speed, 6);
  });
});
