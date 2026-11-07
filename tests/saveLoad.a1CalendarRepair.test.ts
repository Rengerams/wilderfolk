import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { gameTick } from '../src/game/gameTick';
function roundTrip(world: ReturnType<typeof initGame>) {
  const view = createInitialView(world.width, world.height);
  const serialized = JSON.parse(JSON.stringify(buildSaveData(world, view))) as Record<string, unknown>;
  return loadGameFromParsedOutcome(serialized);
}

describe('A1 calendar-owner save and old-election regression', () => {
  it('removes a provably stale festival after real save and load (SIM-14)', () => {
    const world = initGame({ skipTerrain: true, seed: 20_261_107 });
    world.tick = 41 * TICKS_PER_DAY;
    world.year = 0;
    world.dayInYear = 41;
    world.festival = { active: true, name: 'Old Revel', daysLeft: 2 };
    world.eventLog.push({
      id: 999,
      tick: 0,
      year: 0,
      day: 0,
      type: 'event',
      message: 'Old Revel festival began in the village',
    });
    const loaded = roundTrip(world);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.world.festival).toBeNull();
  });

  it('preserves a still-running festival after real save and load (SIM-14)', () => {
    const world = initGame({ skipTerrain: true, seed: 20_261_109 });
    world.tick = 41 * TICKS_PER_DAY;
    world.year = 0;
    world.dayInYear = 41;
    world.festival = { active: true, name: 'Current Revel', daysLeft: 2 };
    world.eventLog.push({
      id: 1000,
      tick: 40 * TICKS_PER_DAY,
      year: 0,
      day: 40,
      type: 'event',
      message: 'Current Revel festival began in the village',
    });

    const loaded = roundTrip(world);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.world.festival).toEqual({ active: true, name: 'Current Revel', daysLeft: 2 });
  });

  it('preserves a real Year-0 election stamp instead of treating it as founding sentinel (GAME-05)', () => {
    const world = initGame({ skipTerrain: true, seed: 20_261_108 });
    world.tick = 30 * TICKS_PER_DAY + 8 * TICKS_PER_HOUR;
    world.year = 0;
    world.dayInYear = 30;
    world.villageLeaderId = null;
    world.lastElectionYear = 0;
    world.pendingElectionYear = null;
    world.electionCeremony = null;

    const loaded = roundTrip(world);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.world.lastElectionYear).toBe(0);
    expect(loaded.world.villageLeaderId).toBeNull();
    expect(loaded.world.electionCeremony).toBeNull();
    expect(loaded.world.pendingElectionYear).not.toBeNull();
    expect(loaded.world.pendingElectionYear!).toBeGreaterThan(0);

    gameTick(loaded.world);
    expect(loaded.world.electionCeremony).toBeNull();
  });
});
