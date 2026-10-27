/**
 * Guards for the renderer motion pass: the tick-fraction blend, the teleport threshold and the
 * hover-tint decision that moved out of the tick-keyed layer.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, type Building, type Entity } from '../src/game/gameTypes';
import {
  beginMotionFrame,
  interpolatePosition,
  MAX_INTERPOLATED_STEP_PX,
  presentationPosition,
  resetMotionInterpolation,
} from '../src/game/renderer/motionInterpolation';
import { hoverTintKindFor } from '../src/game/renderer/buildings';

function mover(x: number, y: number): Entity {
  return { id: 1, x, y, alive: true } as unknown as Entity;
}

function building(type: BuildingType, completed: boolean): Building {
  return { type, completed } as unknown as Building;
}

describe('tick-fraction interpolation', () => {
  it('blends between the previous and the current tick position', () => {
    expect(interpolatePosition({ x: 0, y: 0 }, { x: 60, y: 20 }, 0.5)).toEqual({ x: 30, y: 10 });
    expect(interpolatePosition({ x: 10, y: 10 }, { x: 10, y: 10 }, 0.4)).toEqual({ x: 10, y: 10 });
  });

  it('draws the current position for an entity with no previous sample', () => {
    expect(interpolatePosition(null, { x: 7, y: 9 }, 0.5)).toEqual({ x: 7, y: 9 });
  });

  it('clamps the fraction, so a backed-up accumulator cannot overshoot the tick', () => {
    expect(interpolatePosition({ x: 0, y: 0 }, { x: 40, y: 0 }, 4).x).toBe(40);
    expect(interpolatePosition({ x: 0, y: 0 }, { x: 40, y: 0 }, -2).x).toBe(0);
  });

  it('renders the destination alone when the step is a teleport', () => {
    const far = MAX_INTERPOLATED_STEP_PX + 1;
    expect(interpolatePosition({ x: 0, y: 0 }, { x: far, y: 0 }, 0.5)).toEqual({ x: far, y: 0 });
    // At the threshold the step is still ordinary motion and blends.
    expect(interpolatePosition({ x: 0, y: 0 }, { x: MAX_INTERPOLATED_STEP_PX, y: 0 }, 0.5).x)
      .toBe(MAX_INTERPOLATED_STEP_PX / 2);
  });
});

describe('per-frame motion samples', () => {
  it('blends a mover between the ticks the frame samples straddle', () => {
    resetMotionInterpolation();
    const entity = mover(0, 0);
    beginMotionFrame(1, 1, [entity]);
    entity.x = 60;
    beginMotionFrame(2, 0.5, [entity]);

    expect(presentationPosition(entity)).toEqual({ x: 30, y: 0 });
  });

  it('draws the exact tick state at fraction 1, so pausing cannot drift', () => {
    resetMotionInterpolation();
    const entity = mover(0, 0);
    beginMotionFrame(1, 1, [entity]);
    entity.x = 60;
    beginMotionFrame(2, 1, [entity]);

    expect(presentationPosition(entity)).toEqual({ x: 60, y: 0 });
    // A paused frame repeats: same tick, same fraction, same position.
    beginMotionFrame(2, 1, [entity]);
    expect(presentationPosition(entity)).toEqual({ x: 60, y: 0 });
  });

  it('does not smear a mover that teleported between ticks', () => {
    resetMotionInterpolation();
    const entity = mover(0, 0);
    beginMotionFrame(1, 1, [entity]);
    entity.x = 4000;
    beginMotionFrame(2, 0.5, [entity]);

    expect(presentationPosition(entity)).toEqual({ x: 4000, y: 0 });
  });
});

describe('hover tint decision', () => {
  it('assigns a repainted strip to finished roads and wall panels', () => {
    expect(hoverTintKindFor(building(BuildingType.Road, true))).toBe('strip');
    expect(hoverTintKindFor(building(BuildingType.Wall, true))).toBe('strip');
  });

  it('assigns the foundation pad to anything still under construction', () => {
    expect(hoverTintKindFor(building(BuildingType.House, false))).toBe('pad');
    expect(hoverTintKindFor(building(BuildingType.Road, false))).toBe('pad');
  });

  it('assigns no tint to a finished building that has no strip art', () => {
    expect(hoverTintKindFor(building(BuildingType.House, true))).toBeNull();
  });
});
