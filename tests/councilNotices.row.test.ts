/**
 * F24 — the council "Notices" row could never render
 * (`docs/private/audits/2026-09-16/ui-logic.md`, tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * `collectDashboard`'s council loop read `(e as { title?: string }).title` while `GameEventLog` carries
 * **`message`** (`eventLog.ts` is the only writer) — the cast silenced the compiler, so the "Notices" row
 * pushed below it was dead code and the last three things that happened never reached the panel.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initGame } from '../src/game/worldGen';
import { logEvent } from '../src/game/eventLog';
import { collectDashboard } from '../src/game/dashboardData';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

const FIXTURE_SEED = 20_260_917;

describe('the council notices row', () => {
  it('lists the last events of the day by their message', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    // The row reads the *previous* day's window (`[prevStart, day × TICKS_PER_DAY)`), so the events are
    // logged while the clock is inside it and the snapshot is taken once the day has rolled over.
    state.tick = TICKS_PER_DAY + 10;
    logEvent(state, 'building', 'The Lumber Mill was completed');
    logEvent(state, 'event', 'A caravan arrived from the east');
    state.tick = TICKS_PER_DAY * 2 + 5;

    const notices = collectDashboard(state).council.find((line) => line.label === 'Notices');
    expect(notices, 'the Notices row never rendered').toBeTruthy();
    expect(notices?.value).toContain('A caravan arrived from the east');
    expect(notices?.value).toContain('The Lumber Mill was completed');
  });

  it('stays absent on a quiet day, and reads the field the log actually writes', () => {
    const quiet = initGame({ seed: FIXTURE_SEED });
    quiet.tick = TICKS_PER_DAY * 2 + 5;
    expect(collectDashboard(quiet).council.find((line) => line.label === 'Notices')).toBeUndefined();

    const source = readFileSync(resolve(process.cwd(), 'src/game/dashboardData.ts'), 'utf8');
    expect(source, 'the dead `title` cast is back').not.toMatch(/as \{ title\?: string \}\)\.title/);
    expect(source).toContain('latest.push(e.message)');
  });
});
