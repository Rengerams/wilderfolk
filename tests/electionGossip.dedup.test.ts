/**
 * The daily layer must not roll election gossip while a ceremony runs — the ceremony's own
 * tick gates already drive it, so a second roll would double it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { tickAtDailyPhase } from '../src/game/dayCycleClock';

vi.mock('../src/game/villageLeadership', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/game/villageLeadership')>();
  return { ...actual, tickElectionGossip: vi.fn() };
});

function ceremonyWorld() {
  const world = initGame({ villageName: 'W', size: 'medium' });
  // A ceremony stuck in its gossip phase long enough to survive to tick 72.
  world.electionCeremony = {
    phase: 'gossip',
    phaseTicksLeft: 200,
    gatherX: 100,
    gatherY: 100,
    reason: 'term',
    pendingLeaderId: 0,
    pendingLeaderName: 'X',
    pendingChanged: false,
  } as never;
  return world;
}

/**
 * Run to just before the next day boundary and clear the spy. The colony founds at 08:00, so the
 * boundary is computed from the start tick rather than assumed at tick 0.
 */
function runToDayBoundary(world: ReturnType<typeof initGame>, gameTick: typeof import('../src/game/gameTick').gameTick, tickElectionGossip: typeof import('../src/game/villageLeadership').tickElectionGossip) {
  const boundary = tickAtDailyPhase(Math.max(0, Math.ceil((world.tick - tickAtDailyPhase(0, 'production')) / TICKS_PER_DAY)), 'production');
  const ticksToRun = boundary - world.tick - 1;
  for (let t = 0; t < ticksToRun; t++) world = gameTick(world);
  vi.mocked(tickElectionGossip).mockClear();
  return world;
}

describe('election gossip cadence', () => {
  let gameTick: typeof import('../src/game/gameTick').gameTick;
  let tickElectionGossip: typeof import('../src/game/villageLeadership').tickElectionGossip;
  beforeEach(async () => {
    vi.resetModules();
    ({ gameTick } = await import('../src/game/gameTick'));
    ({ tickElectionGossip } = await import('../src/game/villageLeadership'));
    vi.mocked(tickElectionGossip).mockClear();
  });

  it('daily layer skips gossip while a ceremony is running (ceremony gates cover it)', () => {
    const world = runToDayBoundary(ceremonyWorld(), gameTick, tickElectionGossip);
    gameTick(world); // 12:00 economy pulse, ceremony in gossip phase
    expect(vi.mocked(tickElectionGossip)).toHaveBeenCalledTimes(0);
  });

  it('daily layer still rolls gossip on day boundaries with no ceremony', () => {
    const world = runToDayBoundary(initGame({ villageName: 'W', size: 'medium' }), gameTick, tickElectionGossip);
    gameTick(world); // 12:00 economy pulse, no ceremony
    expect(vi.mocked(tickElectionGossip)).toHaveBeenCalledTimes(1);
  });
});
