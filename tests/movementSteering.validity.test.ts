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

describe('A14 — one owner for "normalise a delta, set velocity, face it"', () => {
  it('steers at the requested pace without overshooting the target', () => {
    const cases: Array<{ tx: number; ty: number; speed: number; factor?: number }> = [
      { tx: 260, ty: 90, speed: 1.4, factor: 0.55 },
      { tx: 40, ty: 210, speed: 0.8, factor: 0.18 },
      { tx: -30, ty: 12, speed: 2.2, factor: 0.42 },
      { tx: 100, ty: 50, speed: 1.1, factor: 0.5 },
      { tx: 100, ty: 50, speed: 1.1 },
      { tx: 380, ty: 320, speed: 0.44, factor: 0.72 },
      // Close target: the requested pace exceeds the remaining distance, so the cap applies.
      { tx: 100.3, ty: 50.2, speed: 2, factor: 0.5 },
    ];
    for (const { tx, ty, speed, factor } of cases) {
      const entity = human(1, { x: 100, y: 50 });
      const dx = tx - entity.x;
      const dy = ty - entity.y;
      const distance = Math.hypot(dx, dy) || 1;
      const approach = factor ?? 1;
      // The owner caps the applied pace at the remaining distance, and keeps the original
      // component-wise multiplication order when uncapped (IEEE-754 multiplication is not associative).
      const requestedSpeed = speed * approach;
      const appliedSpeed = Math.min(Math.max(0, requestedSpeed), distance);
      const uncapped = appliedSpeed === requestedSpeed;
      const expectedVx = uncapped
        ? (dx / distance) * speed * approach
        : (dx / distance) * appliedSpeed;
      const expectedVy = uncapped
        ? (dy / distance) * speed * approach
        : (dy / distance) * appliedSpeed;

      if (factor === undefined) setVelocityToward(entity, tx, ty, speed);
      else steerEntityToward(entity, tx, ty, speed, factor);

      const label = `(${tx}, ${ty}) speed ${speed} factor ${approach}`;
      expect(entity.vx, `vx at ${label}`).toBe(expectedVx);
      expect(entity.vy, `vy at ${label}`).toBe(expectedVy);
      if (factor !== undefined) {
        expect(entity.spriteAngle, `spriteAngle at ${label}`).toBe(
          Math.atan2(entity.vy, entity.vx),
        );
      }
    }
  });

  it('faces the entity along its velocity, including a blended one', () => {
    const entity = human(1, { vx: -3.5, vy: 1.25 });
    faceVelocity(entity);
    expect(entity.spriteAngle).toBe(Math.atan2(1.25, -3.5));
  });
});
