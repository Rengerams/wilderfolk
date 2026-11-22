/**
 * Browser-level Goals regression. Mount the production Overview → Progress → Goals chain,
 * not its projection in isolation: the parent must hand an in-place world update to the live window.
 * Executed by the existing browser-smoke runner with --portrait-regression on a Vite dev server.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import CitizenOverviewScreen, { type CitizenOverviewScreenProps } from '../../src/components/CitizenOverviewScreen';
import { BuildingType, MapSize } from '../../src/game/gameTypes';
import { computeVillageStats } from '../../src/game/uiSimSummary';
import { initGame } from '../../src/game/worldGen';
import { building } from '../../src/test/factories';

function requireElement<T extends Element>(element: T | null | undefined, message: string): T {
  if (!element) throw new Error(message);
  return element;
}

async function waitForPathButton(): Promise<HTMLButtonElement> {
  // ProgressTabPanel is React.lazy: wait for the actual indexed control, not a fixed delay.
  const end = performance.now() + 12_000;
  while (performance.now() < end) {
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((candidate) => candidate.textContent?.includes('Your path (live)'));
    if (button) return button;
    await new Promise<void>((resolve) => { setTimeout(resolve, 50); });
  }
  throw new Error(`Your path button never mounted; visible UI: ${document.body.textContent?.slice(0, 240)}`);
}

function portraitDialog(): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
    .find((dialog) => dialog.querySelector('h2')?.textContent?.includes('Your path (live)')) ?? null;
}

function scoreInDialog(trait: string): number {
  const dialog = requireElement(portraitDialog(), 'Your path window did not open');
  const card = [...dialog.querySelectorAll<HTMLElement>('div.rounded-lg')]
    .find((element) => element.querySelector('span.font-bold')?.textContent?.trim().endsWith(trait));
  if (!card) throw new Error(`Missing displayed ${trait} trait`);
  const displayed = card.querySelector('span.tabular-nums')?.textContent?.trim();
  const score = Number(displayed);
  if (!displayed || !Number.isFinite(score)) throw new Error(`Missing visible score for ${trait}`);
  return score;
}

/** Run inside Chromium. All button clicks and updates pass through React, not raw projection calls. */
export async function runVillagePortraitUI(): Promise<{
  initial: { nature: number; trade: number };
  changed: { nature: number; trade: number };
  reopened: { nature: number; trade: number };
  sameTick: number;
  closedReads: number;
}> {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const world = initGame({ seed: 163, size: MapSize.Medium, width: 320, height: 320, skipTerrain: true });
  world.ecosystemHealth = 90;
  world.buildings = [building(1, BuildingType.WildlifePreserve, { completed: false, constructionProgress: 0 })];
  world.tradeRoutes = [{
    id: 'portrait-test-route',
    targetName: 'Test partner',
    resourcesGiven: { wood: 1, stone: 0, food: 0, gold: 0, iron: 0 },
    resourcesReceived: { wood: 0, stone: 0, food: 0, gold: 1, iron: 0 },
    reputationRequired: 0,
    active: false,
  }];

  const originalTick = world.tick;
  const originalBuildings = world.buildings;
  const originalRoutes = world.tradeRoutes;

  // Only the portrait reads this persistent field. Counting reads proves *no projection* while
  // closed, not merely that a hidden dialog has been removed from the DOM.
  let portraitReads = 0;
  let ecoYears = world.ecoHealthYearsAbove80;
  Object.defineProperty(world, 'ecoHealthYearsAbove80', {
    configurable: true,
    enumerable: true,
    get() { portraitReads++; return ecoYears; },
    set(value: number) { ecoYears = value; },
  });

  const noop = () => {};
  const props: CitizenOverviewScreenProps = {
    state: world,
    villageStats: computeVillageStats(world),
    favoriteEntityId: null,
    pendingRaidCount: 0,
    pendingOutgoingRaidCount: 0,
    pendingDiplomacyCount: 0,
    tradeReadyCount: 0,
    section: 'world',
    worldFocus: 'progress',
    onNavChange: noop,
    progressSubTab: 'goals',
    setProgressSubTab: noop,
    logSubTab: 'chronicle',
    setLogSubTab: noop,
    logFilter: 'all',
    setLogFilter: noop,
    moreSubTab: 'guide',
    setMoreSubTab: noop,
    tutorialsEnabled: false,
    onClose: noop,
    onRecruitSettler: noop,
    onFocusBuilding: noop,
    onFocusCitizen: noop,
    onHintAction: noop,
    onOpenWorkHours: noop,
    onFocusVisitor: noop,
    onFocusRival: noop,
    onLaunchRaid: noop,
    onProvokeRival: noop,
    onRecallRaid: noop,
    onStartResearch: noop,
    onEstablishTradeRoute: noop,
    onReplayTutorial: noop,
    onToggleTutorials: noop,
    onSpawnMoonHowlerDebug: noop,
    onStartSpotlightDebug: noop,
    debugMode: false,
    onStartGuidedCampaign: noop,
  };

  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const renderParent = async () => {
    await act(async () => {
      // A real Overview re-render keeps the *same* world identity, as an in-place tick does.
      root.render(<CitizenOverviewScreen {...props} state={world} />);
    });
  };
  const click = async (element: Element) => {
    await act(async () => { (element as HTMLElement).click(); });
  };
  const scores = () => ({ nature: scoreInDialog('Nature'), trade: scoreInDialog('Trade') });

  try {
    await renderParent();
    if (portraitDialog() || portraitReads !== 0) {
      throw new Error('Closed Your path computed its portrait before the window was opened');
    }
    const launch = await waitForPathButton();
    await click(launch);
    const initial = scores();
    if (portraitReads === 0) throw new Error('Opening Your path did not read the live projection');

    // In-place changes to existing objects: no array-length, world-identity, tick, or hour change.
    world.buildings[0].completed = true;
    world.tradeRoutes[0].active = true;
    await renderParent();
    const changed = scores();
    if (changed.nature <= initial.nature || changed.trade <= initial.trade) {
      throw new Error(`Stale portrait after same-tick update: ${JSON.stringify({ initial, changed })}`);
    }
    if (world.tick !== originalTick || world.buildings !== originalBuildings || world.tradeRoutes !== originalRoutes) {
      throw new Error('Test mutated the clock or replaced a collection instead of changing objects in place');
    }

    const close = requireElement(
      document.querySelector<HTMLButtonElement>('button[aria-label="Close Your path (live)"]'),
      'Your path has no close button',
    );
    await click(close);
    if (portraitDialog()) throw new Error('Your path remains visible after closing');

    const readsWhenClosed = portraitReads;
    world.buildings[0].completed = false;
    world.tradeRoutes[0].active = false;
    await renderParent();
    if (portraitReads !== readsWhenClosed) {
      throw new Error(`Closed Your path recomputed its projection ${portraitReads - readsWhenClosed} time(s)`);
    }

    await click(await waitForPathButton());
    const reopened = scores();
    if (reopened.nature !== initial.nature || reopened.trade !== initial.trade) {
      throw new Error(`Reopened Your path showed stale values: ${JSON.stringify({ initial, reopened })}`);
    }
    return { initial, changed, reopened, sameTick: world.tick, closedReads: readsWhenClosed };
  } finally {
    await act(async () => { root.unmount(); });
    host.remove();
  }
}
