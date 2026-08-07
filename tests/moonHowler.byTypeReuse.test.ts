/**
 * Regression: tickMoonHowlerCycle must reuse the caller's byType index instead
 * of rebuilding it every tick (perf — one full O(n) bucket rebuild per tick
 * was wasted when nothing transformed).
 *
 * Bug: `buildEntityByType(aliveEntities)` ran unconditionally at the top of
 * every tick, even on ordinary days with no moon-form changes. gameTick
 * already built the identical index and passed it via ctx.byType.
 */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { tickMoonHowlerCycle } from '../src/game/moonHowler';
import { buildEntityByType } from '../src/game/simFocus';
import { EntityType } from '../src/game/gameTypes';

describe('tickMoonHowlerCycle byType reuse', () => {
  it('returns the same byType object when no form changes occur', () => {
    const state = initGame();
    const alive = state.entities.filter((e) => e.alive);
    const byType = buildEntityByType(alive);

    // Daytime (hour 12) with the initial settlers — no transform/revert fires.
    const result = tickMoonHowlerCycle(
      state,
      alive,
      state.buildings,
      1, // colonyDay
      12, // hourOfDay — not a transform/revert boundary
      new Map(alive.map((e) => [e.id, e])),
      byType,
    );

    // Optimization holds: same object identity, no rebuild on a quiet tick.
    expect(result.byType).toBe(byType);
    expect(result.changed).toBe(false);
  });

  it('rebuilds and reports change when a form actually transforms', () => {
    const state = initGame();
    const alive = state.entities.filter((e) => e.alive);
    const byType = buildEntityByType(alive);
    const humans = byType[EntityType.Human];
    expect(humans.length).toBeGreaterThan(0);

    // Force a moon-form transform: mark one settler cursed and use a full-moon
    // nightfall hour so syncMoonHowlerForms converts them.
    const victim = humans[0];
    victim.moonHowlerCursed = true;
    // Full moon nightfall (hour 22) — transform window.
    const result = tickMoonHowlerCycle(
      state,
      alive,
      state.buildings,
      14, // colonyDay — a full-moon day (14 ≡ 0 mod 14-ish window)
      22, // nightfall — transform hour
      new Map(alive.map((e) => [e.id, e])),
      byType,
    );

    expect(result.changed).toBe(true);
    // Rebuilt index must reflect the new form (settler no longer a plain Human).
    const humansAfter = result.byType[EntityType.Human];
    expect(humansAfter.includes(victim)).toBe(false);
  });
});
