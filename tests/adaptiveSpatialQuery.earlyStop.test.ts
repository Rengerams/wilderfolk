import { describe, expect, it } from 'vitest';
import { EntitySpatialGrid } from '../src/game/spatialGrid';
import {
  forEachAdaptiveInRadius,
  forEachInArrayRadius,
  SOCIAL_FRIENDSHIP_RADIUS,
  socialAdaptiveOptions,
} from '../src/game/adaptiveSpatialQuery';
import type { Entity } from '../src/game/gameTypes';

const WORLD = 1000;

function row(count: number): Entity[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    alive: true,
    x: 500 + index,
    y: 500,
  }) as unknown as Entity);
}

function options(population: number) {
  return socialAdaptiveOptions('social', population, WORLD, WORLD);
}

describe('radial queries stop when the callback returns false', () => {
  it('stops the grid walk', () => {
    const entities = row(50);
    const grid = new EntitySpatialGrid(WORLD, WORLD, 64);
    grid.rebuild(entities);
    const visited: number[] = [];

    forEachAdaptiveInRadius(
      grid,
      entities,
      500,
      500,
      SOCIAL_FRIENDSHIP_RADIUS,
      (entity) => { visited.push(entity.id); return visited.length < 5 ? undefined : false; },
      options(entities.length),
    );

    expect(visited).toHaveLength(5);
  });

  it('stops the array walk', () => {
    const entities = row(50);
    const visited: number[] = [];

    forEachAdaptiveInRadius(
      undefined,
      entities,
      500,
      500,
      SOCIAL_FRIENDSHIP_RADIUS,
      (entity) => { visited.push(entity.id); return visited.length < 5 ? undefined : false; },
      options(entities.length),
    );

    expect(visited).toHaveLength(5);
  });

  it('still walks the whole radius when nothing asks it to stop', () => {
    const entities = row(50);
    let visited = 0;

    forEachInArrayRadius(entities, 500, 500, SOCIAL_FRIENDSHIP_RADIUS, () => { visited++; });

    expect(visited).toBe(50);
  });
});
