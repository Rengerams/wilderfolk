import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { MapSize, BuildingType, EntityType } from '../src/game/gameTypes';
import { isRotatableBuildingType } from '../src/game/buildingRotation';
import {
  WATCHTOWER_DETECTION_RADIUS,
  detectRaidersFromWatchtowers,
} from '../src/game/watchtowerDetection';

function makeRival(id: number, x: number, y: number, groupId: string) {
  return {
    id,
    type: EntityType.Human,
    faction: 'rival',
    groupId,
    x,
    y,
    alive: true,
    hiddenFromPlayer: true,
    detectedByPatrol: false,
  } as never as import('../src/game/gameTypes').Entity;
}

function makeTower(x: number, y: number) {
  return {
    id: 1,
    type: BuildingType.Watchtower,
    x,
    y,
    width: 40,
    height: 40,
    completed: true,
  } as never as import('../src/game/gameTypes').Building;
}

describe('watchtower early raid detection', () => {
  /**
   * Reversed on the owner's call: *"remove it — watch doesn't matter if it can rotate"*.
   *
   * This case used to assert the opposite (that the Watchtower **is** rotatable), and the behaviour it
   * pinned was real but wrong: `BuildingRotation` is `0 | 90` and a 90° turn is applied by rotating the
   * **sprite** (`spriteDrawing.drawSpriteFrame` → `ctx.rotate(Math.PI / 2)`), which means the run axis
   * for a flat strip and "lay this building on its side" for anything drawn with height. A Watchtower at
   * 90 was drawn tipped over, with the `flipX` special case in `renderer/buildings.ts` mirroring the
   * sideways sprite into something plausible. Rotatability was therefore a deliberate feature whose
   * rendering could not work, so the ruling is that the key does nothing for this building.
   */
  it('Watchtower is not rotatable, because a 90 degree turn laid it on its side', () => {
    expect(isRotatableBuildingType(BuildingType.Watchtower)).toBe(false);
  });

  it('reveals marching raiders inside the detection radius', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    state.buildings.push(makeTower(200, 200));
    state.pendingRaidEvents = [{ rivalId: 'G1' } as never];
    const rival = makeRival(900, 300, 300, 'G1');
    state.entities.push(rival);

    detectRaidersFromWatchtowers(state, [rival]);

    expect(rival.hiddenFromPlayer).toBe(false);
    expect(rival.detectedByPatrol).toBe(true);
  });

  it('keeps raiders hidden outside the detection radius', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    state.buildings.push(makeTower(200, 200));
    state.pendingRaidEvents = [{ rivalId: 'G1' } as never];
    const rival = makeRival(900, 200 + WATCHTOWER_DETECTION_RADIUS + 50, 200, 'G1');
    state.entities.push(rival);

    detectRaidersFromWatchtowers(state, [rival]);

    expect(rival.hiddenFromPlayer).toBe(true);
    expect(rival.detectedByPatrol).toBe(false);
  });

  it('does nothing without a completed watchtower', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    state.pendingRaidEvents = [{ rivalId: 'G1' } as never];
    const rival = makeRival(900, 300, 300, 'G1');
    state.entities.push(rival);

    detectRaidersFromWatchtowers(state, [rival]);

    expect(rival.hiddenFromPlayer).toBe(true);
  });
});
