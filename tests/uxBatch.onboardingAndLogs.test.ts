/**
 * Source guards for the UX batch: each case names the shipped expression it replaces, so reverting a
 * fix fails here instead of silently restoring the defect. The house pattern is a source guard plus an
 * assertion that the guard is non-vacuous (`tests/ui-a11y.contract.test.ts`).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('the taming picker offers every candidate and says why a button is dead', () => {
  const panel = read('src/components/SelectedEntityPanel.tsx');

  it('no longer slices the candidate list to four', () => {
    expect(panel).not.toContain('availableHumans.slice(0, 4)');
    expect(panel).toContain('{availableHumans.map(h => (');
    expect(panel).toContain('{availableHumans.length} available:');
  });

  it('states the taming owner\'s refusal reason beside the disabled buttons', () => {
    expect(panel).toContain('getTameEntityEligibility(state, entity.id, availableHumans[0].id).blockReason');
    expect(panel).toContain('const tameDisabled = tameFoodCost != null && !canAffordTame;');
    expect(panel).toContain('disabled={tameDisabled}');
    expect(panel).toContain('{tameBlockReason && (');
  });
});

describe('the settler card names the person, not the save allocator', () => {
  const panel = read('src/components/SelectedEntityPanel.tsx');

  it('drops the raw entity id from the player-facing label', () => {
    expect(panel).not.toContain('Citizen #{entity.id}');
    expect(panel).toContain('{citizenFullName(entity)}');
  });
});

describe('the collapsed build rail keeps the build hotkey on screen', () => {
  const rail = read('src/components/GameBuildRail.tsx');

  it('renders the key as text instead of a hover-only title', () => {
    expect(rail).not.toContain('title="Build catalog on the left · press B"');
    expect(rail).toContain('<kbd className="rounded bg-stone-800 px-1 text-[10px] font-bold text-stone-400">B</kbd>');
  });
});

describe('the Guide can reach the shortcut sheet it points at', () => {
  const guide = read('src/components/tabPanels/MoreTabPanel.tsx');
  const overview = read('src/components/CitizenOverviewScreen.tsx');
  const app = read('src/App.tsx');

  it('offers a control that opens the sheet, not only the "?" instruction', () => {
    expect(guide).toContain('onOpenShortcuts?: () => void;');
    expect(guide).toContain('Open the shortcut sheet');
    expect(overview).toContain('onOpenShortcuts={onOpenShortcuts}');
    expect(app).toContain('onOpenShortcuts={() => setShowShortcuts(true)}');
  });
});

describe('the chapter title card has no unreachable second slot', () => {
  const hook = read('src/hooks/useTransientGameFeedback.ts');
  const app = read('src/App.tsx');

  it('drops the moment state nothing could set', () => {
    expect(hook).not.toContain('momentCard');
    expect(app).not.toContain('dismissMomentCard');
  });

  it('keeps the chapter card it still renders', () => {
    expect(hook).toContain('activeChapterMoment: pendingChapterCard,');
    expect(app).toContain('<MomentTitleCard moment={activeChapterMoment} onDone={dismissChapterCard} />');
  });
});

describe('clearing a selection keeps the diagnostics drawer', () => {
  const inspector = read('src/components/GameInspector.tsx');

  it('renders the drawer in the nothing-selected branch', () => {
    const nothingSelected = inspector.slice(
      inspector.indexOf('if (!hasSelection)'),
      inspector.indexOf('return (\n    <div className="flex flex-col" aria-label="Inspector">'),
    );
    expect(nothingSelected, 'the nothing-selected branch is gone').not.toBe('');
    expect(nothingSelected).toContain('{diagnostics}');
  });
});

describe('a concern can hand over the log it is about', () => {
  const dashboard = read('src/components/dashboard/GameDashboard.tsx');
  const shell = read('src/hooks/useGameShellState.ts');
  const logPanel = read('src/components/tabPanels/LogTabPanel.tsx');

  it('maps a concern to the log half and its own category', () => {
    expect(dashboard).toContain('raid: { subTab: \'combat\', filter: \'combat\' }');
    expect(dashboard).toContain('howler: { subTab: \'chronicle\', filter: \'event\' }');
    expect(dashboard).toContain('Log →');
  });

  it('opens the Log window on that intent through the shell', () => {
    expect(shell).toContain('setLogFilter(filter);');
    expect(logPanel).toContain('initialFilter={logFilter}');
    expect(logPanel).toContain('onFilterChange={setLogFilter}');
  });
});

describe('the dead sidebar CSS is gone', () => {
  const css = read('src/App.css');

  it('keeps no rule for the removed tab rail', () => {
    expect(css).not.toMatch(/\.sidebar-tab/);
    expect(css).not.toMatch(/sidebar-tabs/);
    expect(css).not.toMatch(/game-view-drawer--dock/);
  });

  it('keeps the build rail rules the catalogue still uses', () => {
    expect(css).toContain('.game-view-drawer--build {');
    expect(css).toContain('.game-view-drawer--rail {');
    expect(css).toContain('.build-panel-toggle');
  });
});

describe('the biodiversity index states its scale', () => {
  const panel = read('src/components/tabPanels/NatureTabPanel.tsx');

  it('shows the score against the index maximum instead of a bare number', () => {
    expect(panel).toContain('BIODIVERSITY_SCALE');
    expect(panel).toContain('of {BIODIVERSITY_SCALE.max.toFixed(2)} max');
  });

  it('names the six species the index counts', () => {
    expect(panel).toContain('const BIODIVERSITY_SPECIES_COUNT = 6;');
    expect(panel).toContain('Math.log(BIODIVERSITY_SPECIES_COUNT)');
  });
});
