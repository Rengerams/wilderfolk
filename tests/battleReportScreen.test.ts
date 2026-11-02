import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BattleReportScreen from '../src/components/BattleReportScreen';
import type { WorldState } from '../src/game/gameTypes';

const pending: NonNullable<WorldState['pendingRaidVictories']>[number] = {
  raidId: 'raid-hillford', rivalId: 'hillford', rivalName: 'Hillford',
  playerDead: 2, enemyDead: 7, enemySurvivors: 5,
  playerCasualties: ['Mara', 'Theo'], enemyCasualties: ['Red cloak'],
};

function render(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(BattleReportScreen, {
    rivalName: 'Hillford',
    dayLabel: 'Autumn · Year 2 · Day 18',
    events: [],
    resolved: true,
    pending,
    liveSoldiers: null,
    progressPercent: 100,
    onClose: () => undefined,
    onFate: () => undefined,
    ...overrides,
  }));
}

describe('raid match report presentation', () => {
  it('shows the scoreline and asks the direct extermination question at full time', () => {
    const html = render();
    expect(html).toContain('text match');
    expect(html).toContain('FULL TIME');
    expect(html).toContain('Hillford');
    expect(html).toContain('Do you want to exterminate this village?');
    expect(html).toContain('All 5 surviving inhabitants are killed');
    expect(html).toContain('No — spare and withdraw');
    expect(html).toContain('Yes — exterminate village');
  });

  it('keeps fate buttons hidden until the commentary has been read', () => {
    const html = render({
      pending: undefined,
      resolved: false,
      events: [
        { id: 1, tick: 1, year: 2, day: 18, type: 'combat', message: 'The lines close.', combatKind: 'defense', combatStage: 'dispatched' },
        { id: 2, tick: 2, year: 2, day: 18, type: 'combat', message: 'A volley answers.', combatKind: 'defense', combatStage: 'dispatched' },
      ],
    });
    expect(html).toContain('LIVE');
    expect(html).toContain('Skip commentary');
    expect(html).not.toContain('Do you want to exterminate this village?');
  });
});
