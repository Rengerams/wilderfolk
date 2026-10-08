/**
 * Connecting a new road to an existing one.
 *
 * `snapStripDragEndpoints` moved a drag onto a nearby chain, but its snap points were only an
 * existing strip's two ends and its centre. A road is 66 px long, so the half-tile either side of the
 * centre was further than `STRIP_SNAP_RADIUS` from any point and a drag that started part-way along a
 * road found nothing to attach to — which reads as "hard to connect".
 *
 * These cases pin the reachability of the whole run, and that a connected drag lands flush on the
 * existing road's line rather than a tile out.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createBuilding } from '../src/game/buildingPlacementActions';
import {
  getStripSegmentEndpoints,
  STRIP_SNAP_RADIUS,
  snapStripDragEndpoints,
} from '../src/game/stripTopology';
import { BuildingType, type WorldState } from '../src/game/gameTypes';
import { resetSimRng } from '../src/game/simRng';

let world: WorldState;

beforeEach(() => {
  resetSimRng();
  world = initGame({ seed: 20261006 });
});

afterEach(() => {
  resetSimRng();
});

/** A completed road whose centre is `x, y`, as the placement path would have made it. */
function addRoad(x: number, y: number, id: number) {
  const road = createBuilding(BuildingType.Road, x, y, id);
  road.completed = true;
  road.constructionProgress = 1;
  world.buildings.push(road);
  return road;
}

describe('a drag can connect anywhere along an existing road', () => {
  it('snaps every point of the road run, not just its ends and centre', () => {
    const road = addRoad(600, 400, 9001);
    const [a, c] = getStripSegmentEndpoints(BuildingType.Road, road.x, road.y, 0);
    const span = Math.max(Math.abs(c.x - a.x), Math.abs(c.y - a.y));

    // Walk the whole run: the tenth-of-a-tile bands either side of the centre used to find nothing.
    for (let i = 0; i <= 10; i++) {
      for (const offset of [-6, 0, 6]) {
        const t = i / 10;
        const probeX = a.x + (c.x - a.x) * t;
        const probeY = a.y + (c.y - a.y) * t + offset;
        const snapped = snapStripDragEndpoints(world.buildings, BuildingType.Road, probeX, probeY, probeX, probeY);
        // A probe on the road's own line must land on that road, never stay where it was dropped.
        expect(
          Math.abs(snapped.startY - road.y),
          `probe ${i}/10 offset ${offset} (span ${span})`,
        ).toBeLessThanOrEqual(STRIP_SNAP_RADIUS);
      }
    }
  });

  it('lands a connected drag on the existing road line, not a tile out', () => {
    const road = addRoad(600, 400, 9002);
    const [a] = getStripSegmentEndpoints(BuildingType.Road, road.x, road.y, 0);

    // Start on the existing road near its left end, drag 200 px to the right.
    const snapped = snapStripDragEndpoints(
      world.buildings,
      BuildingType.Road,
      a.x + 8,
      road.y,
      a.x + 208,
      road.y,
    );

    expect(snapped.startY).toBe(road.y);
    expect(snapped.endY).toBe(road.y);
    expect(snapped.startX).toBeLessThanOrEqual(a.x + STRIP_SNAP_RADIUS);
  });

  it('leaves a drag alone when it is nowhere near an existing road', () => {
    addRoad(200, 200, 9003);

    const snapped = snapStripDragEndpoints(world.buildings, BuildingType.Road, 900, 700, 1000, 700);

    expect(snapped).toEqual({ startX: 900, startY: 700, endX: 1000, endY: 700 });
  });

  it('does not snap to a road belonging to a rival camp', () => {
    const rival = createBuilding(BuildingType.Road, 600, 400, 9004);
    rival.completed = true;
    rival.faction = 'rival';
    world.buildings.push(rival);

    const snapped = snapStripDragEndpoints(world.buildings, BuildingType.Road, 610, 402, 700, 402);

    expect(snapped.startX).toBe(610);
    expect(snapped.startY).toBe(402);
  });
});
