/**
 * What the persisted leadership scalars must be at the load boundary.
 *
 * `electionBuildupNotifiedYear` mirrors `pendingElectionYear`: both are a year that is legitimately
 * `null` ("nothing scheduled" / "nothing to notify"), so both need the same rule. The other three
 * leadership scalars are plain finite numbers. A payload carrying `1e999` — which parses to
 * `Infinity` — was refused for every sibling and loaded unchanged for this one.
 *
 * The fixture is a **real** payload from `buildSaveData` with one field changed, so a green case
 * proves the rule refuses the corruption without refusing what the game writes.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { resetSimRng } from '../src/game/simRng';
import { tickElectionBuildup } from '../src/game/villageLeadership';

function realPayload(): Record<string, unknown> {
  resetSimRng();
  const world = initGame({ seed: 4242 });
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

    // `until === 1` for year 3 with the last election at year 0; the notice must fire once, not
    // on every buildup tick — the guard the loaded value feeds.
    outcome.world.lastElectionYear = 0;
    const first = tickElectionBuildup(outcome.world, 3, true);
    const second = tickElectionBuildup(outcome.world, 3, true);
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
