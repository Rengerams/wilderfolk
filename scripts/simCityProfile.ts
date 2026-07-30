/**
 * City-scale headless profile — dual-layer spatial grid benchmark (v0.5).
 * ~300 player humans + rival/visitor neighbors + grass/wildlife ≈ 1250 alive.
 */
import { EntityType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { createEntity } from '../src/game/worldGen';
import { computeWildlifeCounts } from '../src/game/entityCounts';
import { isPlayerHuman } from '../src/game/groupEvents';

export interface CityProfileTargets {
  playerHumans: number;
  rivalHumans: number;
  visitorHumans: number;
  grass: number;
  rabbits: number;
  deer: number;
  wolves: number;
  foxes: number;
  trees: number;
  wildkin: number;
}

export const DEFAULT_CITY_TARGETS: CityProfileTargets = {
  playerHumans: 300,
  rivalHumans: 24,
  visitorHumans: 7,
  grass: 500,
  rabbits: 120,
  deer: 80,
  wolves: 40,
  foxes: 30,
  trees: 100,
  wildkin: 20,
};

export function countAlive(state: WorldState): number {
  let n = 0;
  for (const e of state.entities) if (e.alive) n++;
  return n;
}

function spawnHuman(
  state: WorldState,
  x: number,
  y: number,
  faction?: 'rival' | 'visitor',
): void {
  const entity = createEntity(EntityType.Human, x, y, state.nextEntityId++, 250);
  if (faction) entity.faction = faction;
  state.entities.push(entity);
}

function spawnType(state: WorldState, type: EntityType, cx: number, cy: number, count: number): void {
  const spread = type === EntityType.Grass ? 55 : 90;
  for (let i = 0; i < count; i++) {
    const x = cx + (Math.random() - 0.5) * state.width * spread / 100;
    const y = cy + (Math.random() - 0.5) * state.height * spread / 100;
    const energy = type === EntityType.Grass ? 80 + Math.random() * 40 : 200;
    state.entities.push(createEntity(type, x, y, state.nextEntityId++, energy));
  }
}

/** Seed city-scale population for spatial grid perf gates. */
export function seedCityScaleProfile(
  state: WorldState,
  targets: CityProfileTargets = DEFAULT_CITY_TARGETS,
): void {
  const cx = state.width / 2;
  const cy = state.height / 2;

  const playerNow = state.entities.filter((e) => e.alive && isPlayerHuman(e)).length;
  for (let i = playerNow; i < targets.playerHumans; i++) {
    spawnHuman(state, cx + (Math.random() - 0.5) * 400, cy + (Math.random() - 0.5) * 300);
  }

  const rivalNow = state.entities.filter((e) => e.alive && e.faction === 'rival').length;
  for (let i = rivalNow; i < targets.rivalHumans; i++) {
    spawnHuman(state, cx + 500 + Math.random() * 200, cy - 300 + Math.random() * 200, 'rival');
  }

  const visitorNow = state.entities.filter((e) => e.alive && e.faction === 'visitor').length;
  for (let i = visitorNow; i < targets.visitorHumans; i++) {
    spawnHuman(state, cx - 450 + Math.random() * 150, cy + 350 + Math.random() * 100, 'visitor');
  }

  const counts = computeWildlifeCounts(state.entities);
  spawnType(state, EntityType.Grass, cx, cy, Math.max(0, targets.grass - counts.grass));
  spawnType(state, EntityType.Rabbit, cx, cy, Math.max(0, targets.rabbits - counts.rabbits));
  spawnType(state, EntityType.Deer, cx, cy, Math.max(0, targets.deer - counts.deer));
  spawnType(state, EntityType.Wolf, cx, cy, Math.max(0, targets.wolves - counts.wolves));
  spawnType(state, EntityType.Fox, cx, cy, Math.max(0, targets.foxes - counts.foxes));
  spawnType(state, EntityType.Tree, cx, cy, Math.max(0, targets.trees - counts.trees));
  spawnType(state, EntityType.Wildkin, cx, cy, Math.max(0, targets.wildkin - counts.wildkin));

  state.humanPopulation = state.entities.filter((e) => e.alive && isPlayerHuman(e)).length;
  state.wildlifeCounts = computeWildlifeCounts(state.entities);
  state.maxHumanPopulation = Math.max(state.maxHumanPopulation, targets.playerHumans);
}

export function expectedCityAlive(targets: CityProfileTargets = DEFAULT_CITY_TARGETS): number {
  return (
    targets.playerHumans
    + targets.rivalHumans
    + targets.visitorHumans
    + targets.grass
    + targets.rabbits
    + targets.deer
    + targets.wolves
    + targets.foxes
    + targets.trees
    + targets.wildkin
  );
}

/** Steady-state city bench — hold ~1250 alive for spatial grid perf gates. */
export const CITY_BENCH_MIN_ALIVE = 1200;

export function maintainCityBenchmarkState(
  state: WorldState,
  minAlive = CITY_BENCH_MIN_ALIVE,
  targets: CityProfileTargets = DEFAULT_CITY_TARGETS,
): void {
  if (countAlive(state) < minAlive) {
    seedCityScaleProfile(state, targets);
  }
}

export function refreshCityBenchmarkResources(state: WorldState, tick: number): void {
  if (tick > 0 && tick % 48 === 0) {
    state.resources.food = Math.max(state.resources.food, 6000);
  }
}