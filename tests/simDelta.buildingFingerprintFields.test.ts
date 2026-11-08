/**
 * The building delta compares a fixed field list instead of a JSON round-trip, so every mutable
 * `Building` field must stay on that list: a missing field would silently stop shipping a change.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/gameEngine';
import { BUILDING_FINGERPRINT_FIELDS, extractSimTickDelta } from '../src/game/simBuffers/simDelta';
import type { WorldState } from '../src/game/gameTypes';
import { BuildingType } from '../src/game/gameTypes';
import { createBuilding } from '../src/game/worldGen';

/** Field names declared by `export interface Building` in the owner module. */
function declaredBuildingFields(): string[] {
  const source = readFileSync(resolve(process.cwd(), 'src/game/buildings.ts'), 'utf8');
  const start = source.indexOf('export interface Building {');
  if (start < 0) throw new Error('Building interface not found in src/game/buildings.ts');
  const body = source.slice(start, source.indexOf('\n}', start));
  return [...body.matchAll(/^\s{2}([A-Za-z_][A-Za-z0-9_]*)\??:/gm)].map((match) => match[1]).sort();
}

function worldWith(buildings: WorldState['buildings']): WorldState {
  const world = initGame({ seed: 77 });
  world.buildings = buildings;
  return world;
}

describe('building delta fingerprint fields', () => {
  it('covers every field the Building interface declares', () => {
    expect([...BUILDING_FINGERPRINT_FIELDS].sort()).toEqual(declaredBuildingFields());
  });

  it('names no field twice', () => {
    expect(new Set(BUILDING_FINGERPRINT_FIELDS).size).toBe(BUILDING_FINGERPRINT_FIELDS.length);
  });

  it('ships a building once, then nothing while it is unchanged, then one changed row', () => {
    const building = createBuilding(BuildingType.House, 400, 400, 501);
    building.completed = true;
    const world = worldWith([building]);

    const first = new Map<number, string>();
    const initial = extractSimTickDelta(world, [], { nextBuildings: first });
    expect(initial.changedBuildings?.map((row) => row.id)).toEqual([building.id]);

    const second = new Map<number, string>();
    const unchanged = extractSimTickDelta(world, [], { prevBuildings: first, nextBuildings: second });
    expect(unchanged.changedBuildings).toEqual([]);

    building.health = building.health - 1;
    const third = new Map<number, string>();
    const changed = extractSimTickDelta(world, [], { prevBuildings: second, nextBuildings: third });
    expect(changed.changedBuildings?.map((row) => row.id)).toEqual([building.id]);
  });
});
