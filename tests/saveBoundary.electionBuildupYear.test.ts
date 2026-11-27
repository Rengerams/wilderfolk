/**
 * At the load boundary `electionBuildupNotifiedYear` mirrors `pendingElectionYear`: both are legitimately
 * nullable years, and a non-finite payload must be refused like the sibling scalars.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { resetSimRng } from '../src/game/simRng';
import { tickElectionBuildup } from '../src/game/villageLeadership';
import { DAYS_PER_YEAR } from '../src/game/dayCycle';
import { MapSize } from '../src/game/gameTypes';

let cachedPayload: Record<string, unknown> | null = null;

function realPayload(): Record<string, unknown> {
  cachedPayload ??= buildPayload();
  return structuredClone(cachedPayload);
}

function buildPayload(): Record<string, unknown> {
  resetSimRng();
  const world = initGame({ skipTerrain: true, seed: 4242, size: MapSize.Medium });
  return structuredClone(buildSaveData(world, createInitialView(world.width, world.height))) as Record<string, unknown>;
}

beforeEach(() => {
  resetSimRng();
});

afterEach(() => {
  resetSimRng();
});

describe('a leadership scalar the payload omits still loads', () => {
  it('defaults a missing electionBuildupNotifiedYear to null and keeps the notice one-shot', () => {
    const payload = realPayload();
    delete payload.electionBuildupNotifiedYear;

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok, outcome.ok ? '' : outcome.detail).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.world.electionBuildupNotifiedYear).toBeNull();

    // Only the final day before the regular election may announce it, once per target year.
    outcome.world.lastElectionYear = 0;
    expect(tickElectionBuildup(outcome.world, 3, 0)).toBeNull();
    expect(tickElectionBuildup(outcome.world, 3, DAYS_PER_YEAR - 2)).toBeNull();
    outcome.world.pendingElectionYear = null;
    outcome.world.electionCeremony = null;
    outcome.world.electionBuildupNotifiedYear = 3; // legacy early notice must not suppress the real one
    const first = tickElectionBuildup(outcome.world, 3, DAYS_PER_YEAR - 1);
    const second = tickElectionBuildup(outcome.world, 3, DAYS_PER_YEAR - 1);
    expect(outcome.world.electionBuildupNotifiedYear).toBe(4);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });
});

describe('a leadership scalar the payload mistypes is refused by name', () => {
  it('refuses the sibling pendingElectionYear when the year is infinite', () => {
    const payload = realPayload();
    payload.pendingElectionYear = Infinity;

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('unrestorable');
    expect(outcome.detail).toContain('pendingElectionYear');
  });

  it('refuses electionBuildupNotifiedYear when the year is infinite', () => {
    const payload = realPayload();
    payload.electionBuildupNotifiedYear = Infinity;

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('unrestorable');
    expect(outcome.detail).toContain('electionBuildupNotifiedYear');
  });

  it('still accepts the null the writer puts there when there is nothing to notify', () => {
    const payload = realPayload();
    payload.electionBuildupNotifiedYear = null;

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok, outcome.ok ? '' : outcome.detail).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.world.electionBuildupNotifiedYear).toBeNull();
  });
});
