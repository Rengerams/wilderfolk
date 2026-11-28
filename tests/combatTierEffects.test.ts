/**
 * Tiered combat research replaces lower tiers instead of summing them: the strongest
 * researched tier sets counter-attack and predator-block chance.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { createInitialResearchNodes, BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { WorldState, Entity } from '../src/game/gameTypes';
import {
  getCounterAttackChance,
  getArmamentSteps,
  getHumanHuntRange,
  getHuntFoodMultiplier,
  getHumanFleeSpeedMultiplier,
  getPredatorBlockChance,
  resolvePredatorCombatChances,
  rollPredatorCombat,
} from '../src/game/combat';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { SPECIES_CONFIG } from '../src/game/speciesConfig';
import { resolveArmedDuty } from '../src/game/workAbsence';
import { TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { resetSimRng, restoreSimRng, seededRandomForRun, setSimSeed, snapshotSimRng } from '../src/game/simRng';

/** A world with only the fields the combat tech readers touch. */
function makeState(researched: string[], forgeCompleted: Record<string, boolean>): WorldState {
  const researchNodes = createInitialResearchNodes().map((node) =>
    researched.includes(node.id) ? { ...node, unlocked: true, researched: true } : node,
  );
  const cfg = BUILDING_CONFIGS[BuildingType.Blacksmith];
  return {
    tick: 10 * TICKS_PER_HOUR,
    entities: [],
    unlockedTechs: [...researched],
    researchNodes,
    buildings: [
      {
        id: 1,
        type: BuildingType.Blacksmith,
        x: 0,
        y: 0,
        width: cfg.width,
        height: cfg.height,
        occupants: [],
        level: 1,
        constructionProgress: 100,
        completed: true,
        health: 100,
        maxHealth: 100,
        spriteScale: 1,
        buildAnimTimer: 0,
      },
    ],
    villageForge: { activeOrder: null, progress: 0, completed: forgeCompleted },
  } as unknown as WorldState;
}

function defender(id: number, seed = 0): Entity {
  return { id, type: EntityType.Human, alive: true, age: 30, job: JobType.Soldier, raidDeploymentId: 'combat-test', combatRollSeed: seed,
    needs: { stamina: 100, rest: 100, nutrition: 100, severeHungerTicks: 0 } } as Entity;
}
function predator(id: number): Entity {
  const maxEnergy = SPECIES_CONFIG[EntityType.Wolf].maxEnergy;
  return { id, type: EntityType.Wolf, alive: true, energy: maxEnergy, maxEnergy } as Entity;
}

describe('personal combat equipment and condition', () => {
  it('cannot arm a civilian, unassigned soldier, off-duty soldier, imprisoned soldier or child through the public combat API', () => {
    const state = makeState(['defense_4', 'defense_8', 'defense_9'], { iron_spears: true, iron_swords: true, scale_mail: true });
    const h: Entity = { ...defender(1), raidDeploymentId: undefined };
    const wolf = predator(2);
    const unarmed = { counter: 0, block: 0.05 };
    const barracks = { ...state.buildings[0], id: 2, type: BuildingType.Barracks, occupants: [h.id] };
    state.buildings.push(barracks);
    const civilian = { ...h, job: JobType.Settler, workerBuildingId: barracks.id };
    for (const person of [civilian, h]) {
      expect(resolvePredatorCombatChances(state, person, wolf)).toEqual(unarmed);
      expect(rollPredatorCombat('counter-attack', state, person, wolf, state.tick)).toBe(false);
    }
    h.workerBuildingId = barracks.id;
    expect(resolvePredatorCombatChances(state, h, wolf).counter).toBeCloseTo(0.55);
    expect(resolvePredatorCombatChances(state, h, wolf).block).toBeGreaterThan(unarmed.block);
    state.tick = 23 * TICKS_PER_HOUR;
    expect(resolvePredatorCombatChances(state, h, wolf)).toEqual(unarmed);
    expect(rollPredatorCombat('counter-attack', state, h, wolf, state.tick)).toBe(false);
    h.raidDeploymentId = 'combat-test';
    expect(resolvePredatorCombatChances(state, h, wolf).counter).toBeCloseTo(0.55);
    h.prisonBuildingId = 99;
    expect(resolvePredatorCombatChances(state, h, wolf)).toEqual(unarmed);
    expect(rollPredatorCombat('counter-attack', state, h, wolf, state.tick)).toBe(false);
    expect(resolvePredatorCombatChances(state, { ...defender(1), age: 0 }, wolf)).toEqual({ counter: 0, block: 0 });
    expect(resolvePredatorCombatChances(state, { ...defender(1), needs: undefined }, wolf)).toEqual({ counter: 0, block: 0 });
  });

  it('only gives hunting weapons to an adult rostered on a completed Hunting Spot during a shift', () => {
    const state = makeState(['defense_4', 'defense_8', 'defense_9'], { iron_spears: true, iron_swords: true, scale_mail: true });
    const hunter: Entity = { ...defender(1), job: JobType.Hunter, raidDeploymentId: undefined };
    const wolf = predator(2);
    const unarmed = { counter: 0, block: 0.05 };
    expect(resolvePredatorCombatChances(state, hunter, wolf)).toEqual(unarmed);
    expect(rollPredatorCombat('counter-attack', state, hunter, wolf, state.tick)).toBe(false);
    const spot = { ...state.buildings[0], id: 2, type: BuildingType.HuntingSpot, occupants: [hunter.id] };
    state.buildings.push(spot);
    hunter.workerBuildingId = spot.id;
    expect(resolvePredatorCombatChances(state, hunter, wolf).counter).toBeCloseTo(0.45);
    expect(resolvePredatorCombatChances(state, hunter, wolf).block).toBeCloseTo(0.05);
    spot.occupants = [];
    expect(resolvePredatorCombatChances(state, hunter, wolf)).toEqual(unarmed);
    spot.occupants = [hunter.id];
    state.tick = 23 * TICKS_PER_HOUR;
    expect(resolvePredatorCombatChances(state, hunter, wolf)).toEqual(unarmed);
  });
  it('makes a full-strength werewolf twice as difficult to block or counter as a wolf', () => {
    const state = makeState(['defense_4', 'defense_8', 'defense_9'], { iron_spears: true, iron_swords: true, scale_mail: true });
    const h = defender(1);
    const wolf = predator(2);
    const maxEnergy = SPECIES_CONFIG[EntityType.Werewolf].maxEnergy;
    const howler = { ...wolf, type: EntityType.Werewolf, energy: maxEnergy, maxEnergy, moonHowlerCursed: true };
    expect(maxEnergy).toBe(wolf.maxEnergy * 2);
    const ordinary = resolvePredatorCombatChances(state, h, wolf);
    const supernatural = resolvePredatorCombatChances(state, h, howler);
    expect(ordinary.counter).toBeGreaterThan(0);
    expect(ordinary.block).toBeGreaterThan(0);
    expect(supernatural.counter).toBeCloseTo(ordinary.counter / 2);
    expect(supernatural.block).toBeCloseTo(ordinary.block / 2);
    expect(resolvePredatorCombatChances(state, { ...h, raidDeploymentId: undefined }, howler).block).toBeCloseTo(0.025);
  });
  it('uses the existing shift and deployment, not the job title alone', () => {
    const state = makeState([], {});
    const h = { ...defender(1), raidDeploymentId: undefined };
    const barracks = { ...state.buildings[0], id: 2, type: BuildingType.Barracks, occupants: [h.id] };
    state.buildings.push(barracks);
    h.workerBuildingId = barracks.id;
    state.tick = 10 * TICKS_PER_HOUR;
    expect(resolveArmedDuty(state, h)).toBe('military');
    state.tick = 23 * TICKS_PER_HOUR;
    expect(resolveArmedDuty(state, h)).toBe('none');
    h.raidDeploymentId = 'raid-test';
    expect(resolveArmedDuty(state, h)).toBe('military');
    h.age = 0;
    expect(resolveArmedDuty(state, h)).toBe('none');
  });
  it('uses both reserves and not human legacy energy', () => {
    const state = makeState(['defense_4'], { iron_spears: true });
    const h = defender(1);
    const wolf = predator(2);
    const full = resolvePredatorCombatChances(state, h, wolf);
    h.energy = 0;
    h.maxEnergy = 900;
    expect(resolvePredatorCombatChances(state, h, wolf)).toEqual(full);
    h.needs!.stamina = 20;
    expect(resolvePredatorCombatChances(state, h, wolf).counter).toBeLessThan(full.counter);
    wolf.energy = 100;
    expect(resolvePredatorCombatChances(state, h, wolf).counter).toBeGreaterThan(full.counter * 0.2);
  });
});

describe('tiered combat research does not stack', () => {
  it('counter-attack uses the strongest researched tier instead of the sum', () => {
    const bothTiers = makeState(['defense_4', 'defense_8'], { iron_spears: true, iron_swords: true });
    expect(getCounterAttackChance(bothTiers)).toBe(0.55);

    const onlySpears = makeState(['defense_4'], { iron_spears: true });
    expect(getCounterAttackChance(onlySpears)).toBe(0.45);
  });

  it('a counter-attack is still a roll, never a guaranteed predator kill', () => {
    const state = makeState(['defense_4', 'defense_8'], { iron_spears: true, iron_swords: true });
    // With chance 1.0 the old code returned true for every input.
    let refused = 0;
    for (let id = 1; id <= 60; id++) {
      if (!rollPredatorCombat('counter-attack', state, defender(id, 0), predator(id + 500), 72)) refused++;
    }
    expect(refused).toBeGreaterThan(0);
  });

  it('predator block uses the strongest tier instead of the capped sum', () => {
    const state = makeState(['defense_3', 'defense_5', 'defense_9'], {});
    // 0.35 + 0.6 + 0.72 would have been 1.67 (capped to 0.85); the scale-mail tier is 0.72.
    expect(getPredatorBlockChance(state)).toBeCloseTo(0.72);
  });
});

/**
 * Combat rolls are seeded decisions: they follow the run seed, and a snapshot/restore replays them
 * exactly (the bespoke tick/id hash could do neither).
 */
describe('combat rolls draw from the run-seeded stream', () => {
  const rollsFor = (seed: number): boolean[] => {
    const state = makeState(['defense_3', 'defense_4', 'defense_8'], { iron_spears: true, iron_swords: true });
    resetSimRng();
    setSimSeed(seed);
    const rolls: boolean[] = [];
    for (let id = 1; id <= 80; id++) {
      // Both defender and attacker decisions, across ticks and per-entity seeds.
      rolls.push(rollPredatorCombat('predator-block', state, defender(id, id * 7919), predator(id + 500), 100 + id));
      rolls.push(rollPredatorCombat('counter-attack', state, defender(id, id * 104_729), predator(id + 500), 100 + id));
    }
    return rolls;
  };

  afterEach(() => {
    resetSimRng();
  });

  it('preserves each verdict threshold and its original run-seeded identity', () => {
    const state = makeState(['defense_3', 'defense_4', 'defense_8'], { iron_spears: true, iron_swords: true });
    setSimSeed(4242);
    for (let id = 1; id <= 40; id++) {
      const human = defender(id, id * 7919);
      const tick = 100 + id;
      for (const wolf of [predator(id + 500), predator(id + 900)]) {
        const { block, counter } = resolvePredatorCombatChances(state, human, wolf);
        expect(rollPredatorCombat('predator-block', state, human, wolf, tick))
          .toBe(block > 0 && seededRandomForRun(`combat:predator-block:${id}:${tick}:${human.combatRollSeed}`) < block);
        expect(rollPredatorCombat('counter-attack', state, human, wolf, tick))
          .toBe(counter > 0 && seededRandomForRun(`combat:counter-attack:${id}:${wolf.id}:${tick}:${human.combatRollSeed}`) < counter);
      }
    }
    const child = { ...defender(1), age: 0 };
    expect(rollPredatorCombat('predator-block', state, child, predator(2), 100)).toBe(false);
    expect(rollPredatorCombat('counter-attack', state, child, predator(2), 100)).toBe(false);
  });

  it('two run seeds resolve the same combat differently', () => {
    expect(rollsFor(1)).not.toEqual(rollsFor(2));
  });

  it('snapshot then restore replays the same rolls', () => {
    const state = makeState(['defense_3', 'defense_4', 'defense_8'], { iron_spears: true, iron_swords: true });
    resetSimRng();
    setSimSeed(4242);
    const snapshot = snapshotSimRng();
    const draw = (): boolean[] => {
      const rolls: boolean[] = [];
      for (let id = 1; id <= 40; id++) {
        rolls.push(rollPredatorCombat('predator-block', state, defender(id, id * 7919), predator(id + 500), 300 + id));
        rolls.push(rollPredatorCombat('counter-attack', state, defender(id, id * 104_729), predator(id + 900), 300 + id));
      }
      return rolls;
    };
    const before = draw();

    // Move the realm on, then resume the snapshot as a rollback would.
    setSimSeed(777);
    expect(restoreSimRng(snapshot)).toBe(true);

    expect(draw()).toEqual(before);
  });
});
describe('independent combat effect and armament contracts', () => {
  it('keeps hunt range, food yield and flee speed as independent research targets', () => {
    const state = makeState(['defense_4'], { iron_spears: true });
    expect(getHumanHuntRange(state, 100)).toBeCloseTo(140);
    expect(getHuntFoodMultiplier(state)).toBeCloseTo(1.3);
    expect(getHumanFleeSpeedMultiplier(state)).toBe(1);
  });

  it('does not let a completed ballista order unlock other armaments', () => {
    const state = makeState(['defense_10'], { tower_ballistae: true });
    const steps = getArmamentSteps(state);
    expect(steps.find(step => step.id === 'tower_ballistae')?.done).toBe(true);
    for (const id of ['iron_spears', 'iron_shields', 'iron_swords', 'scale_mail']) {
      expect(steps.find(step => step.id === id)?.done).toBe(false);
    }
  });
});
