/**
 * Rendered guards for the panels whose copy or gating must follow an owner, not a local rule:
 * the forge's village-wide staffing test, the active-event card's accessible name, the longest-life
 * unit, the banner widths, and the intro call-to-action's reachability before the ready beat.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ActiveEventBanner from '../src/components/ActiveEventBanner';
import BigNewsBanner from '../src/components/BigNewsBanner';
import BlacksmithForgePanel from '../src/components/BlacksmithForgePanel';
import IntroScreen from '../src/game/IntroScreen';
import StatisticsPanel from '../src/game/StatisticsPanel';
import { BuildingType, type Building, type GameState, type WorldState } from '../src/game/gameTypes';
import { FORGE_ORDERS, createInitialForgeState } from '../src/game/forge';
import { createEmptyLifetimeStats } from '../src/game/stats';
import { countEligibleVoters } from '../src/game/villageLeadership';
import { building, human } from '../src/test/factories';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

function forgeWorld(selected: Building, staffed: Building): WorldState {
  return {
    villageForge: createInitialForgeState(),
    buildings: [selected, staffed],
    entities: [],
    resources: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
    unlockedTechs: FORGE_ORDERS.map((order) => order.techId),
    researchNodes: FORGE_ORDERS.map((order) => ({ id: order.techId, name: order.label })),
  } as unknown as WorldState;
}

describe('the forge warns only when the village has no staffed Blacksmith', () => {
  const selected = building(1, BuildingType.Blacksmith);
  const staffed = building(2, BuildingType.Blacksmith, { occupants: [7] });

  it('stays quiet when another completed Blacksmith is staffed', () => {
    const html = renderToStaticMarkup(
      createElement(BlacksmithForgePanel, {
        state: forgeWorld(selected, staffed),
        onQueueForge: () => {},
      }),
    );
    expect(html).not.toContain('forge pauses when unstaffed');
  });

  it('warns when no completed Blacksmith has an occupant', () => {
    const html = renderToStaticMarkup(
      createElement(BlacksmithForgePanel, {
        state: forgeWorld(selected, building(2, BuildingType.Blacksmith)),
        onQueueForge: () => {},
      }),
    );
    expect(html).toContain('forge pauses when unstaffed');
  });
});

describe('the active-event card is dismissible without losing the event', () => {
  const event = {
    emoji: '🌙',
    title: 'Event Title',
    description: 'Event Description',
    effect: 'Event Effect',
    type: 'negative' as const,
  };

  it('names the event in the button, with the dismiss verb in the accessible name', () => {
    const html = renderToStaticMarkup(createElement(ActiveEventBanner, { event, onDismiss: () => {} }));
    expect(html).toContain('Dismiss event: ');
    expect(html).toContain('Event Title');
    expect(html).toContain('Event Description');
    expect(html).toContain('Event Effect');
    expect(html).not.toMatch(/aria-label="Dismiss event"/);
  });

  it('uses a width expression Tailwind can parse', () => {
    const activeEvent = renderToStaticMarkup(createElement(ActiveEventBanner, { event, onDismiss: () => {} }));
    const news = renderToStaticMarkup(createElement(BigNewsBanner, {
      news: [{ id: 'n1', title: 'News', message: 'Body', type: 'positive' }],
      onDismiss: () => {},
    }));
    expect(activeEvent).toContain('w-[min(100%_-_1.5rem,20rem)]');
    expect(news).toContain('w-[min(100%_-_1.5rem,22rem)]');
    for (const html of [activeEvent, news]) expect(html).not.toContain('100%-1.5rem');
  });
});

describe('the longest-life record states the unit it stores', () => {
  it('prints the stored age as years', () => {
    const lifetime = createEmptyLifetimeStats();
    lifetime.longestLivingHuman = { name: 'Elder Unique', age: 34 };
    const state = {
      lifetimeStats: lifetime,
      humanPopulation: 1,
      villageReputation: 10,
      totalBuildingsCompleted: 1,
      year: 1,
      resources: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
    } as unknown as GameState;
    const html = renderToStaticMarkup(createElement(StatisticsPanel, { state }));
    expect(html).toContain('(34 years)');
    expect(html).not.toContain('(34 days)');
  });
});

describe('the intro call to action is unreachable until it is visible', () => {
  it('marks the zero-height CTA wrapper inert while the opening beats run', () => {
    const html = renderToStaticMarkup(createElement(IntroScreen, { onContinue: () => {} }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('inert=""');
    expect(html).toContain('Choose your land');
  });
});

describe('panels that render a reused world object stay unmemoised', () => {
  const panels = [
    'src/components/ChallengesPanel.tsx',
    'src/components/StrategicWorldMap.tsx',
    'src/components/tabPanels/VillageTabPanel.tsx',
  ];

  it('does not gate a world-reading panel on a reference-equal prop', () => {
    for (const file of panels) {
      const source = read(file);
      expect(source, `${file} wraps a reused-world panel in memo`).not.toMatch(/export default memo\(/);
      expect(source, `${file} memoises a world-taking village section`).not.toMatch(
        /const (HousingDiagnostics|FoodLedger|SchoolingBreakdown) = memo\(/,
      );
    }
  });
});

describe('the turnout copy shares the election owner electorate', () => {
  it('counts living adult player settlers only', () => {
    const state = {
      entities: [
        human(1, { age: 33 }),
        human(2, { age: 9, isJuvenile: true }),
        human(3, { age: 40, alive: false }),
        human(4, { age: 40, faction: 'rival' }),
      ],
    } as unknown as WorldState;
    expect(countEligibleVoters(state)).toBe(1);
  });

  it('does not keep the panel predicate', () => {
    const source = read('src/game/VillageLeadershipPanel.tsx');
    expect(source).toContain('countEligibleVoters(state)');
    expect(source).not.toContain('!person.faction');
  });
});

describe('the intro particle field is seeded once', () => {
  it('does not restart the scene effect when the aurora beat flips', () => {
    const source = read('src/game/IntroScreen.tsx');
    const particleEffect = source.slice(
      source.indexOf('// Ambient particles'),
      source.indexOf('const subtitleTyping'),
    );
    expect(particleEffect).toContain('auroraVisibleRef.current ? 0.35 : 0.12');
    expect(particleEffect).toContain('}, []);');
    expect(particleEffect).not.toContain('[auroraVisible]');
    expect(source).toContain('particlesRef.current = [];');
  });
});

describe('the prisoner dialog reads its row state from the live world', () => {
  it('does not memoise the captive list on a world mutated in place', () => {
    expect(read('src/components/WarfareStatus.tsx')).not.toContain('useMemo');
  });
});

describe('the overview work ratio shares one denominator', () => {
  it('shows working over the workforce owner field', () => {
    const source = read('src/components/CitizenOverviewScreen.tsx');
    expect(source).toContain('${villageStats.working}/${villageStats.workforce || 0}');
    expect(source).not.toContain('${overview.working}/${overview.adults');
  });
});
