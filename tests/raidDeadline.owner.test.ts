/**
 * A16 — `formatRaidDeadlineSafe` was a divergent wrapper around the owner's own legacy fallback
 * (`docs/private/audits/2026-09-16/duplication-deadcode.md`, tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * The owner `frontierCombat.formatRaidDeadline` already resolves a missing `expiresAtTick` through
 * `getRaidExpiresAtTick`'s legacy window. The wrapper re-checked both fields by hand and printed
 * `'deadline unknown'` for exactly the case the owner handles — so a legacy raid showed "deadline
 * unknown" on the outgoing card (`App.tsx`) and "N days left" on the incoming one, in the same frame.
 *
 * Both cards now call the owner, and the genuinely-unknown case (no `createdAtTick` and no
 * `expiresAtTick`) is expressed *inside* the owner, so the two cards cannot disagree again.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatRaidDeadline, getRaidExpiresAtTick } from '../src/game/frontierCombat';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import type { RaidEvent } from '../src/game/gameTypes';

function readSrc(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), 'utf8');
}

/** Legacy save shape: the tick fields the owner's fallback exists for are absent. */
function legacyRaid(createdAtTick: number | undefined, expiresAtTick: number | undefined): RaidEvent {
  return { id: 'raid', createdAtTick, expiresAtTick } as unknown as RaidEvent;
}

describe('A16 — one raid-deadline renderer for both cards', () => {
  it('renders a legacy event from the owner’s own fallback window', () => {
    const legacy = legacyRaid(100, undefined);
    // 3 in-game days from the creation tick — the owner's `getRaidExpireTicksLegacy`.
    expect(getRaidExpiresAtTick(legacy)).toBe(100 + 3 * TICKS_PER_DAY);
    expect(formatRaidDeadline(legacy, 100)).toBe('3 days left');
  });

  it('expresses the genuinely unknown deadline inside the owner', () => {
    const undated = legacyRaid(undefined, undefined);
    expect(Number.isFinite(getRaidExpiresAtTick(undated))).toBe(false);
    // Pre-fix this path printed `NaN days left` while the wrapper printed `deadline unknown`.
    expect(formatRaidDeadline(undated, 0)).toBe('deadline unknown');
  });

  it('leaves both raid cards on the owner, with no wrapper module left', () => {
    const app = readSrc('src/App.tsx');
    const panel = readSrc('src/components/SelectedBuildingPanel.tsx');
    expect(app, 'the outgoing raid card still uses the divergent wrapper').not.toContain('formatRaidDeadlineSafe');
    expect(panel, 'the building panel still uses the divergent wrapper').not.toContain('formatRaidDeadlineSafe');
    expect(app).toContain('formatRaidDeadline(evt, world.tick)');
    expect(panel).toContain('formatRaidDeadline(evt, state.tick)');
    expect(
      existsSync(resolve(process.cwd(), 'src/game/raidUtils.ts')),
      'the raidUtils wrapper module still exists',
    ).toBe(false);
  });
});
