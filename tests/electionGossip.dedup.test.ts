/**
 * BUG-1 (cadence audit 2026-08-15): election gossip ran twice on ceremony day
 * boundaries. The daily layer (tickStaticDaily) rolled tickElectionGossip
 * every day, and the ceremony's own tick gates (tick % 18 / % 24 in
 * tickElectionCeremony) rolled it again — and 72 % 18 === 0 and 72 % 24 === 0,
 * so the day-boundary tick got TWO gossip rolls during a ceremony's gossip or
 * tension phase. Fix: the daily layer skips gossip while a ceremony runs —
 * the ceremony's own gates already drive gossip then. This test pins the
 * daily-layer call (the ceremony's internal call is not observable from here).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { tickElectionGossip } from '../src/game/villageLeadership';

vi.mock('../src/game/villageLeadership', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/game/villageLeadership')>();
  return { ...actual, tickElectionGossip: vi.fn() };
});

function ceremonyWorld() {
  const world = initGame({ villageName: 'W', size: 'small' });
  // A ceremony stuck in its gossip phase long enough to survive to tick 72.
  world.electionCeremony = {
    phase: 'gossip',
    phaseTicksLeft: 200,
    gatherX: 100,
    gatherY: 100,
    reason: 'decennial',
    pendingLeaderId: 0,
    pendingLeaderName: 'X',
    pendingChanged: false,
  } as never;
  return world;
}

/**
 * Run to just before the next day boundary and clear the spy. The colony now
 * founds at 08:00 (initGame starts at tick 24, not midnight), so the boundary
 * is computed relative to the start tick instead of assuming tick 0.
 */
function runToDayBoundary(world: ReturnType<typeof initGame>) {
  const boundary = Math.ceil(world.tick / TICKS_PER_DAY) * TICKS_PER_DAY;
  const ticksToRun = boundary - world.tick - 1;
  for (let t = 0; t < ticksToRun; t++) world = gameTick(world);
  vi.mocked(tickElectionGossip).mockClear();
  return world;
}

describe('election gossip cadence', () => {
  beforeEach(() => {
    vi.mocked(tickElectionGossip).mockClear();
  });

  it('daily layer skips gossip while a ceremony is running (ceremony gates cover it)', () => {
    const world = runToDayBoundary(ceremonyWorld());
    gameTick(world); // tick 72 — day boundary, ceremony in gossip phase
    expect(vi.mocked(tickElectionGossip)).toHaveBeenCalledTimes(0);
  });

  it('daily layer still rolls gossip on day boundaries with no ceremony', () => {
    const world = runToDayBoundary(initGame({ villageName: 'W', size: 'small' }));
    gameTick(world); // tick 72 — day boundary, no ceremony
    expect(vi.mocked(tickElectionGossip)).toHaveBeenCalledTimes(1);
  });
});
