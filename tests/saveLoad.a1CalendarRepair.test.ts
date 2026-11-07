import { describe, expect, it, vi } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { gameTick } from '../src/game/gameTick';
import { repairStaleFestivalOnLoad } from '../src/game/dailyWorldEvents';

vi.mock('../src/game/dailyWorldEvents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/game/dailyWorldEvents')>();
  return { ...actual, repairStaleFestivalOnLoad: vi.fn(actual.repairStaleFestivalOnLoad) };
});

function roundTrip(world: ReturnType<typeof initGame>) {
  const view = createInitialView(world.width, world.height);
  const serialized = JSON.parse(JSON.stringify(buildSaveData(world, view))) as Record<string, unknown>;
  return loadGameFromParsedOutcome(serialized);
}

describe('A1 calendar-owner save and old-election regression', () => {
  it('repairs a stale festival once per real save load (SIM-14)', () => {
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
    vi.mocked(repairStaleFestivalOnLoad).mockClear();

    const loaded = roundTrip(world);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(repairStaleFestivalOnLoad).toHaveBeenCalledTimes(1);
    expect(loaded.world.festival).toBeNull();
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
