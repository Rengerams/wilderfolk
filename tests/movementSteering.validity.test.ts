import { describe, expect, it } from 'vitest';
import { human } from '../src/test/factories';
import { faceVelocity, setVelocityToward, steerEntityToward } from '../src/game/simulation/movementSteering';

describe('single velocity steering owner input and arrival safety', () => {
  it('keeps a stopped walker facing the direction it last moved', () => {
    const walker = human(8301, { x: 10, y: 10 });
    walker.spriteAngle = 1.25;
    walker.vx = 0;
    walker.vy = 0;
    faceVelocity(walker);
    expect(walker.spriteAngle).toBe(1.25);
    steerEntityToward(walker, 10, 10, 5);
    expect(walker.spriteAngle).toBe(1.25);
  });

  it('does not overshoot an adjacent target', () => {
    const walker = human(8302, { x: 10, y: 10 });
    setVelocityToward(walker, 12, 10, 20);
    expect(walker.vx).toBe(2);
    expect(walker.vy).toBe(0);
  });

  it('never leaks non-finite velocity from invalid targets or speed', () => {
    const walker = human(8303, { x: 10, y: 10 });
    setVelocityToward(walker, Infinity, 10, 5);
    expect([walker.vx, walker.vy]).toEqual([0, 0]);
    setVelocityToward(walker, 100, 10, Infinity);
    expect([walker.vx, walker.vy]).toEqual([0, 0]);
  });
});
