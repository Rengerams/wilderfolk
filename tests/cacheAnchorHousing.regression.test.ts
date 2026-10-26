import { describe, expect, it } from 'vitest';
import { entityLayerAnchorMoved, paintEntityLayerTo, type EntityLayerCache } from '../src/game/entityLayer';
import { buildHousingUnits } from '../src/game/residencySelection';
import { collectLeaderDescendants, isAdultChildAtHome } from '../src/game/householdComposition';
import type { Camera, Entity } from '../src/game/gameTypes';

const person = (id: number, overrides: Partial<Entity> = {}): Entity => ({
  id, type: 'human', alive: true, faction: undefined,
  age: 28, isJuvenile: false, name: String(id),
  ...overrides,
} as Entity);

describe('centered entity-layer cache anchor', () => {
  const cam = { x: 400, y: 300, zoom: 1 } as Camera;
  const cache = {
    key: 'same-tick', width: 1120, height: 920, dpr: 1,
    anchorX: 400, anchorY: 300, anchorZoom: 1, margin: 160,
    surface: {} as EntityLayerCache['surface'],
  } as EntityLayerCache;

  it('accepts small pans equally in all four directions, rejecting pans outside padding', () => {
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [150, 0], [-150, 0], [0, 150], [0, -150]]) {
      expect(entityLayerAnchorMoved(cache, { ...cam, x: cam.x + dx, y: cam.y + dy }, 800, 600)).toBe(false);
    }
    expect(entityLayerAnchorMoved(cache, { ...cam, x: 561 }, 800, 600)).toBe(true);
    expect(entityLayerAnchorMoved(cache, { ...cam, y: 139 }, 800, 600)).toBe(true);
  });

  it('blits the padded viewport at minus margin with the anchor at current camera', () => {
    const calls: unknown[][] = [];
    const target = { drawImage: (...args: unknown[]) => calls.push(args) } as unknown as CanvasRenderingContext2D;
    paintEntityLayerTo(target, cache, cam);
    expect(calls[0]?.slice(1)).toEqual([-160, -160, 1120, 920]);
  });
});

describe('unambiguous housing units', () => {
  it('recognizes adult adopted children living with adoptive parents', () => {
    const parent = person(1, { residenceBuildingId: 10, childrenIds: [3] });
    const child = person(3, { age: 20, residenceBuildingId: 10, adoptiveMotherId: 1 });
    expect(isAdultChildAtHome(child, [parent, child])).toBe(true);
    expect(isAdultChildAtHome(child, [parent, child], new Map([[1, parent], [3, child]]))).toBe(true);
  });

  it('assigns a shared minor child to exactly one unit after separated parents form households', () => {
    const a = person(1, { childrenIds: [3] });
    const b = person(2, { childrenIds: [3] });
    const child = person(3, { age: 8, isJuvenile: true, motherId: 1, fatherId: 2 });
    const units = buildHousingUnits([a, b, child]);
    expect(units.flat().filter((entry) => entry.id === 3)).toHaveLength(1);
    expect(new Set(units.flat().map((entry) => entry.id)).size).toBe(3);
  });

  it('does not separate an unhoused adult descendant from their minor child for manor entitlement', () => {
    const leader = person(1, { childrenIds: [2] });
    const adult = person(2, { age: 28, motherId: 1, childrenIds: [3] });
    const minor = person(3, { age: 6, isJuvenile: true, motherId: 2 });
    expect(collectLeaderDescendants(leader, [leader, adult, minor]).map((person) => person.id))
      .toEqual([1]);
  });

  it('keeps the leader’s children and their spouses in the manor alongside unmarried minors', () => {
    const leader = person(1, { childrenIds: [2, 3] });
    const adult = person(2, { age: 25, motherId: 1, partnerId: 4 });
    const minor = person(3, { age: 12, isJuvenile: true, motherId: 1 });
    const spouse = person(4, { partnerId: 2 });
    expect(collectLeaderDescendants(leader, [leader, adult, minor, spouse]).map((e) => e.id).sort((a, b) => a - b))
      .toEqual([1, 2, 3, 4]);
  });
});
