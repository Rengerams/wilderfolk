/**
 * F13 — purchase trade routes advertised "+0s per round-trip"
 * (`docs/private/audits/2026-09-16/ui-logic.md`, tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * The reward line picked gold **or** stone by hand —
 * `route.resourcesReceived.gold > 0 ? gold + 'g' : stone + 's'` — so every route that pays in wood, food
 * or iron printed "+0s": `trade_8` receives `{ wood: 60 }`, `trade_10` `{ food: 60 }`, `trade_3` `{ iron: 15 }`.
 * The rows a wood-starved colony most needs therefore read as worthless. The owner now formats every
 * non-zero key (`resourceTypes.formatResourceAmounts`, built on `formatResourceAmount` + `RESOURCE_METAS`).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatResourceAmount, formatResourceAmounts } from '../src/game/resourceTypes';
import { initTradeRoutes } from '../src/game/economy';

describe('trade-route rewards are rendered from the owner', () => {
  it('names every non-zero resource, not just gold or stone', () => {
    expect(formatResourceAmounts({ wood: 60, stone: 0, gold: 0 })).toBe(formatResourceAmount('wood', 60));
    expect(formatResourceAmounts({ food: 60, gold: 0 })).toBe(formatResourceAmount('food', 60));
    expect(formatResourceAmounts({ iron: 15 })).toBe(formatResourceAmount('iron', 15));
    expect(formatResourceAmounts({ food: 40, gold: 10 })).toBe(
      `${formatResourceAmount('food', 40)} · ${formatResourceAmount('gold', 10)}`,
    );
    expect(formatResourceAmounts({})).toBe('');
  });

  it('leaves no shipped route advertising a zero reward', () => {
    const routes = initTradeRoutes();
    expect(routes.length, 'fixture premise: the game ships trade routes').toBeGreaterThan(0);
    for (const [index, route] of routes.entries()) {
      const text = formatResourceAmounts(route.resourcesReceived);
      expect(text, `route ${index} advertises nothing`).not.toBe('');
      expect(text, `route ${index} still renders a zero amount`).not.toMatch(/(^|· )0 /);
    }
  });

  it('keeps the panel on the owner', () => {
    const panel = readFileSync(
      resolve(process.cwd(), 'src/components/tabPanels/ProgressTabPanel.tsx'),
      'utf8',
    );
    expect(panel).toContain('formatResourceAmounts(route.resourcesReceived)');
    expect(panel, 'the gold-or-stone ternary is back').not.toMatch(/resourcesReceived\.gold > 0 \?/);
  });
});
