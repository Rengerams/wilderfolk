import { afterEach, describe, expect, it, vi } from 'vitest';
import { SPECIES_CONFIG } from '@/game/gameEngine';
import {
  computeHumanAgeYears,
  getColonyDay,
  HUMAN_MAX_LIFESPAN_YEARS,
} from '@/game/dayCycle';
import { EntityType } from '@/game/gameTypes';
import { freshState } from '@/test/fixtures/gameFixtures';
import {
  rollYearlyWorldEvent,
  spawnRivalSettlement,
  spawnVisitorGroup,
} from '@/game/groupEvents';

describe('createFactionHuman birth calendar', () => {
  it('visitor camp members stay young when the colony is old', () => {
    const state = freshState();
    state.year = 50;
    state.dayInYear = 120;
    const idsBefore = new Set(state.entities.map((e) => e.id));
    const allAlive = [...state.entities.filter((e) => e.alive)];
    const colonyDay = getColonyDay(state);

    spawnVisitorGroup(state, allAlive, state.buildings, 'performers');
    const group = state.visitorGroups[state.visitorGroups.length - 1];
    const visitors = allAlive.filter(
      (e) => e.alive && group.entityIds.includes(e.id) && !idsBefore.has(e.id),
    );

    expect(visitors.length).toBeGreaterThan(0);
    for (const ent of visitors) {
      const age = computeHumanAgeYears(ent, colonyDay);
      expect(age).toBeGreaterThanOrEqual(16);
      expect(age).toBeLessThanOrEqual(35);
      expect(ent.maxAge).toBe(HUMAN_MAX_LIFESPAN_YEARS);
      expect(ent.birthYear).toBeGreaterThan(0);
    }
  });

  it('rival settlers keep proper birth dates at high colony year', () => {
    const state = freshState();
    state.year = 70;
    state.dayInYear = 40;
    const allAlive = [...state.entities.filter((e) => e.alive)];
    const colonyDay = getColonyDay(state);

    spawnRivalSettlement(state, allAlive, state.buildings);
    const rivals = allAlive.filter((e) => e.faction === 'rival' && e.alive);

    expect(rivals.length).toBeGreaterThan(0);
    for (const ent of rivals) {
      const age = computeHumanAgeYears(ent, colonyDay);
      expect(age).toBeGreaterThanOrEqual(16);
      expect(age).toBeLessThanOrEqual(35);
      expect(ent.maxAge).toBe(HUMAN_MAX_LIFESPAN_YEARS);
    }
  });
});

describe('yearly event wildlife spawns', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wolf migration uses SPECIES_CONFIG stats', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = freshState();
    const allAlive = [...state.entities.filter((e) => e.alive)];
    const before = allAlive.length;
    let nextId = state.nextEntityId;

    const { event } = rollYearlyWorldEvent(
      state,
      allAlive,
      state.buildings,
      state.width,
      state.height,
      () => nextId++,
    );

    expect(event?.id).toBe('wolf_migration');
    const wolves = allAlive.slice(before).filter((e) => e.type === EntityType.Wolf);
    expect(wolves).toHaveLength(3);
    const cfg = SPECIES_CONFIG[EntityType.Wolf];
    for (const wolf of wolves) {
      expect(wolf.maxEnergy).toBe(cfg.maxEnergy);
      expect(wolf.maxAge).toBe(cfg.maxAge);
      expect(wolf.size).toBe(cfg.size);
      expect(wolf.energy).toBe(cfg.spawnEnergy);
    }
  });

  it('nature boom uses SPECIES_CONFIG stats for trees and grass', () => {
    // Pool with init visitors: wolf(10)+bountiful(10)+merchant(8)+nature(8)+deer(8) = 44 when min-humans gates pass
    vi.spyOn(Math, 'random').mockReturnValue(29 / 44);
    const state = freshState();
    const allAlive = [...state.entities.filter((e) => e.alive)];
    const treesBefore = allAlive.filter((e) => e.type === EntityType.Tree).length;
    const grassBefore = allAlive.filter((e) => e.type === EntityType.Grass).length;
    let nextId = state.nextEntityId;

    const { event } = rollYearlyWorldEvent(
      state,
      allAlive,
      state.buildings,
      state.width,
      state.height,
      () => nextId++,
    );

    expect(event?.id).toBe('nature_boom');
    const newTrees = allAlive.filter((e) => e.type === EntityType.Tree).slice(treesBefore);
    const newGrass = allAlive.filter((e) => e.type === EntityType.Grass).slice(grassBefore);
    expect(newTrees).toHaveLength(15);
    expect(newGrass).toHaveLength(30);

    const treeCfg = SPECIES_CONFIG[EntityType.Tree];
    const grassCfg = SPECIES_CONFIG[EntityType.Grass];
    for (const tree of newTrees) {
      expect(tree.maxEnergy).toBe(treeCfg.maxEnergy);
      expect(tree.maxAge).toBe(treeCfg.maxAge);
      expect(tree.size).toBe(treeCfg.size);
    }
    for (const grass of newGrass) {
      expect(grass.maxEnergy).toBe(grassCfg.maxEnergy);
      expect(grass.maxAge).toBe(grassCfg.maxAge);
      expect(grass.energy).toBe(grassCfg.spawnEnergy);
    }
  });
});