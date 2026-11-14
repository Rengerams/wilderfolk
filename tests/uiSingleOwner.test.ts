/**
 * UI single-owner guards: each test names the view-side copy it replaces, and the behavioural tests
 * prove the view follows the owner — change the owner's input and the derived value moves.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDynasty, type Dynasty } from '../src/game/familyLegacy';
import { resourceFillPercent } from '../src/game/dashboardData';
import { citizenGivenName, SETTLER_NAME_FALLBACK } from '../src/game/citizenId';
import { getWallSegmentCap, WALL_SEGMENT_BASE_BONUS, WATCHTOWER_BASE_BONUS, MILITIA_BALANCE } from '../src/game/defenseStructures';
import { PRESERVE_HEALTH_BONUS } from '../src/game/dailyEcology';
import { BUILDING_CONFIGS, BuildingType } from '../src/game/buildings';
import { SMITH_BONUS_PER_WORKER, SMITH_BONUS_CAP } from '../src/game/workforce';
import { MILL_FOOD_PRODUCTION_MULT } from '../src/game/dailyBuildingEconomy';
import { BARN_ADJACENCY_BONUS } from '../src/game/adjacencyIndex';
import { SILO_FOOD_STORAGE, WOOD_STOREHOUSE_STORAGE } from '../src/game/economy';
import { hasManyAdultsIdle } from '../src/game/citizenOverview';
import {
  getVisitorTradePriceMult,
} from '../src/game/groupEvents';
import { REPUTATION_FRIENDLY_MIN, REPUTATION_HARSH_MAX, getReputationBand } from '../src/game/simHelpers';

function read(relativePath: string): string {
  // `UI_SINGLE_OWNER_ROOT` overrides the tree the guards read; unset, they read the working tree.
  const root = process.env.UI_SINGLE_OWNER_ROOT ?? process.cwd();
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('C2 — the view reads the owner instead of re-deriving the rule', () => {
  it('dynasty definition: the panel filters with the chronicle reward gate (familyLegacy.isDynasty)', () => {
    // A two-generation filter is not a dynasty; the panel reads the chronicle predicate.
    const panel = read('src/components/tabPanels/DynastyPanel.tsx');
    expect(panel, 'the two-generation filter is back').not.toContain('generationsAlive >= 2');
    expect(panel, 'the panel no longer reads the owner').toContain('filter(isDynasty)');
    expect(read('src/game/familyLegacy.ts')).toContain('computeDynasties(state).some(isDynasty)');
  });

  it('dynasty definition: a two-generation family is not a dynasty at any member count', () => {
    const twoGenerations: Dynasty = { surname: 'Ash', generationsAlive: 2, members: 9 };
    const threeGenerationsTwoMembers: Dynasty = { surname: 'Birch', generationsAlive: 3, members: 2 };
    const realDynasty: Dynasty = { surname: 'Cedar', generationsAlive: 3, members: 3 };

    expect(isDynasty(twoGenerations)).toBe(false);
    expect(isDynasty(threeGenerationsTwoMembers)).toBe(false);
    expect(isDynasty(realDynasty)).toBe(true);
    // And the chronicle reward gate reads the same predicate, so panel and reward cannot disagree.
    expect(read('src/game/familyLegacy.ts')).toContain('return computeDynasties(state).some(isDynasty);');
  });

  it('ecosystem health: the Nature bar reads getEcosystemHealth, not the raw field', () => {
    // The bar reads `getEcosystemHealth`; rendering the raw field is the regression.
    const panel = read('src/components/tabPanels/NatureTabPanel.tsx');
    expect(panel).toContain('const ecosystemHealth = getEcosystemHealth(state);');
    expect(panel, 'the raw field is back in the bar').not.toContain('Math.round(state.ecosystemHealth)');
  });

  it('research gate: the panel asks canStartResearch, prerequisites included', () => {
    // The panel asks `canStartResearch`; a local cost gate would drop `node.prerequisites`.
    const panel = read('src/components/tabPanels/ProgressTabPanel.tsx');
    expect(panel).toContain('canStartResearch(state, node.id)');
    expect(panel, 'the local wood/stone/gold gate is back').not.toContain('state.resources.wood >= node.cost.wood');
  });

  it('resource fill %: the dashboard bar follows dashboardData.resourceFillPercent', () => {
    // The bar reads `resourceFillPercent`; a local amount/cap formula is the regression.
    const dashboard = read('src/components/dashboard/GameDashboard.tsx');
    expect(dashboard).toContain('resourceFillPercent(r)');
    expect(dashboard, 'the local fill formula is back').not.toContain('(r.amount / r.cap)');
  });

  it('resource fill % follows the owner when the cap changes', () => {
    expect(resourceFillPercent({ amount: 40, cap: 80 })).toBe(50);
    expect(resourceFillPercent({ amount: 40, cap: 160 })).toBe(25);
    expect(resourceFillPercent({ amount: 40, cap: 0 })).toBe(0);
    expect(resourceFillPercent({ amount: 900, cap: 800 })).toBe(100);
  });

  it('toast lifetime: one constant for the sweeper cutoff and the per-toast timer', () => {
    // One lifetime constant feeds both the sweeper cutoff and the per-toast timer.
    const hook = read('src/hooks/useTransientGameFeedback.ts');
    expect(hook, 'the duplicate lifetime constant is back').not.toContain('NOTIFICATION_LIFETIME_MS');
    expect(hook).toContain('const cutoff = now - NOTIFICATION_DISPLAY_MS;');
  });

  it('SidebarTab: one union, owned by hotkeys, imported by the shell hook', () => {
    // `SidebarTab` is declared once in hotkeys; the shell imports it.
    const hotkeys = read('src/game/hotkeys.ts');
    const shell = read('src/hooks/useGameShellState.ts');
    expect(count(hotkeys, 'export type SidebarTab =')).toBe(1);
    expect(shell, 'the shell declares its own union again').not.toContain('export type SidebarTab =');
    expect(shell).toContain("import type { SidebarTab } from '../game/hotkeys';");
  });

  it('overlay focus: one focusable query shared by all three traps', () => {
    // The invariant: the owner (`useModalFocus`) holds the one focusable query, and the overlay
    // reaches it only through the hook while the menu calls it directly.
    const shortcuts = read('src/components/ShortcutsOverlay.tsx');
    const menu = read('src/components/GameMenu.tsx');
    const focus = read('src/hooks/useModalFocus.ts');

    expect(focus).toContain('export function getFocusableElements(container: HTMLElement): HTMLElement[]');
    expect(shortcuts, 'the overlay must reach the query through the shared hook').toContain(
      'useModalFocus<HTMLDivElement>()',
    );
    expect(shortcuts, 'the overlay must not bypass the shared hook').not.toContain('getFocusableElements');
    expect(menu).toContain('getFocusableElements(panelRef.current)');
    for (const view of [shortcuts, menu]) {
      expect(view, 'a private focusable selector is back').not.toContain("querySelectorAll<HTMLElement>(\n      'button");
    }
    expect(shortcuts, 'the disabled-button-admitting selector is back').not.toContain("'button, [href], input, select, textarea");
  });

  it('settler name fallback: every nameless settler reads the citizenId fallback', () => {
    const inspector = read('src/components/SelectedEntityPanel.tsx');

    // The fallback call sits wherever the view prints a given name, so assert the owner is read
    // rather than the variable it happens to be passed; the negative check below is the real guard.
    expect(inspector).toContain('citizenGivenName(');
    expect(inspector, "the 'Unknown' fallback is back").not.toContain("e.name || 'Unknown'");
  });

  it('settler name fallback: one nameless settler shows one name', () => {
    expect(citizenGivenName({ name: undefined })).toBe(SETTLER_NAME_FALLBACK);
    expect(citizenGivenName({ name: '   ' })).toBe(SETTLER_NAME_FALLBACK);
    expect(citizenGivenName({ name: 'Rune' })).toBe('Rune');
    // The owner's own full-name fallback is the same string the panels now render for a bare name.
    expect(read('src/game/citizenId.ts')).toContain("if (!entity.name) return SETTLER_NAME_FALLBACK;");
  });

  it('day length in copy comes from the owner, and the exit-save toggle no longer names a cadence', () => {
    // The clock hint interpolates `TICKS_PER_DAY`; the exit-save toggle names no interval.
    const menu = read('src/components/GameMenu.tsx');
    expect(menu).toContain('${TICKS_PER_DAY} ticks = 1 day');
    expect(menu, 'the hand-typed day length is back').not.toContain('(72 ticks = 1 day)');
    expect(menu, 'the hand-typed auto-save interval is back').not.toContain('Every 30 seconds when enabled');
    // The toggle means "save when you leave", not a periodic cadence.
    expect(menu).toContain('Save on exit');
  });
});

describe('C2 — building output copy is built from the owners, not typed as prose', () => {
  it('wall / watchtower / smith / mill / barn / storage hints read their owners', () => {
    // The hints interpolate their owners: wall cap, watchtower, smith, mill, barn, silo and storehouse.
    const panel = read('src/components/SelectedBuildingPanel.tsx');
    expect(panel).toContain('function ownerOutputHint(building: Building, state: WorldState): string | null {');
    expect(panel).toContain('getWallSegmentCap(state)');
    expect(panel).toContain('SMITH_BONUS_PER_WORKER');
    expect(panel, 'the hardcoded wall cap is back').not.toContain('max +72 from all wall pieces');
    expect(panel, 'the uncapped smith copy is back').not.toContain('+25% per worker');
    expect(panel, 'the hardcoded silo storage is back').not.toContain('+600 food storage');
    expect(panel, 'the hardcoded storehouse storage is back').not.toContain('+800 wood storage');
  });

  it('wall cap follows the forge owner; the base bonuses match the maths they feed', () => {
    // No forge: the base cap; with Wall Plates forged the owner raises it.
    const noForge = { villageForge: undefined };
    const wallPlatesForged = {
      villageForge: { activeOrder: null, progress: 0, completed: { wall_plates: true } },
    };
    expect(getWallSegmentCap(noForge)).toBe(72);
    expect(getWallSegmentCap(wallPlatesForged)).toBe(96);
    expect(WALL_SEGMENT_BASE_BONUS).toBe(8);
    expect(WATCHTOWER_BASE_BONUS).toBe(15);
    expect(MILL_FOOD_PRODUCTION_MULT).toBe(1.25);
    expect(BARN_ADJACENCY_BONUS).toBe(0.35);
    expect(SILO_FOOD_STORAGE).toBe(2000);
    expect(WOOD_STOREHOUSE_STORAGE).toBe(800);
    expect(SMITH_BONUS_PER_WORKER * 4).toBeGreaterThan(SMITH_BONUS_CAP - 1);
  });

  it('the worker-skill line reads the skills owner (Resourceful included)', () => {
    // The skill line reads `getWorkerSkillMultiplier`, so `resourcefulMult` is included.
    const panel = read('src/components/SelectedBuildingPanel.tsx');
    expect(panel).toContain('getWorkerSkillMultiplier(state, building)');
    expect(panel, 'the view-side 0.02 coefficient is back').not.toContain('Math.round(avgSkill * 2)');
  });
});

describe('C1 — mechanical clones de-duplicated in components and hooks', () => {
  it('clone 6: one chart axis block for both dashboard charts', () => {
    const dashboard = read('src/components/dashboard/GameDashboard.tsx');
    expect(count(dashboard, '<ChartGrid max={max} />')).toBe(2);
    expect(count(dashboard, '<ChartXAxis days={')).toBe(2);
    expect(count(dashboard, 'Array.from({ length: 5 }')).toBe(1);
  });

  it('clone 5: one hour picker for Opens and Closes', () => {
    const panel = read('src/components/WorkSchedulePanel.tsx');
    expect(count(panel, '<HourSelect')).toBe(2);
    expect(count(panel, 'Array.from({ length: HOURS_PER_DAY }')).toBe(1);
  });

  it('clone 7: one export header object for both logs', () => {
    const panel = read('src/components/tabPanels/LogTabPanel.tsx');
    expect(count(panel, 'meta={logMeta}')).toBe(2);
    expect(count(panel, 'villageName: state.villageName')).toBe(1);
  });

  it('clone 8: one strip-commit helper for the click and drag-release paths', () => {
    const hook = read('src/hooks/useCanvasInteractions.ts');
    expect(count(hook, "op: 'placeStripChain'")).toBe(1);
    expect(count(hook, 'stripChainCommand(')).toBe(3); // definition + two call sites
  });

  it('clone 3: the header and the menu share one settings-callback contract', () => {
    // Header and menu share one settings-callback contract.
    const header = read('src/components/GameHeader.tsx');
    const menu = read('src/components/GameMenu.tsx');
    expect(menu).toContain('export interface GameMenuSettingsCallbacks {');
    expect(header).toContain('interface Props extends GameMenuSettingsCallbacks {');
    expect(header, 'the restated callback tail is back').not.toContain('onToggleJuiceEffects: () => void;');
    expect(count(menu, 'onToggleJuiceEffects: () => void;')).toBe(1);
  });

  it('clone 4: one raid-choice button block for the single live raid card', () => {
    // Rival settlements are strategic records: the only live raid card is App's; the building
    // inspector's dead rival-camp branch (and its duplicate card) is gone.
    const app = read('src/App.tsx');
    const panel = read('src/components/SelectedBuildingPanel.tsx');
    expect(count(app, 'respondToRaidEvent')).toBe(1);
    expect(count(panel, '<RaidChoiceButtons')).toBe(0);
    expect(count(panel, 'text-[10px] font-bold ${colorClass}')).toBe(0);
  });

  it('clone 2: the frontier wrapper forwards the child contract instead of restating it', () => {
    const wrapper = read('src/components/tabPanels/FrontierTabPanel.tsx');
    const child = read('src/components/FrontierPanel.tsx');
    expect(child).toContain('export interface FrontierPanelProps {');
    expect(wrapper).toContain('export type FrontierTabPanelProps = FrontierPanelProps;');
    expect(wrapper, 'the restated prop list is back').not.toContain('pendingOutgoingRaidCount: number;');
  });

  it('clone 9 / C2 tab mapping: one route table for rail and nav ids', () => {
    const shell = read('src/hooks/useGameShellState.ts');
    expect(shell).toContain('const OVERVIEW_ROUTES: Record<');
    expect(shell).toContain('const OVERVIEW_NAV_RAIL: Record<OverviewNavId, SidebarTab>');
    expect(shell).toContain('return OVERVIEW_ROUTES[tab];');
    expect(shell).toContain('return OVERVIEW_ROUTES[OVERVIEW_NAV_RAIL[id]];');
    // The inline rail ternaries are gone from both nav handlers.
    expect(shell, 'the inline rail mapping is back').not.toContain("? 'village'");
  });
});

describe('C2 — the remaining semantic duplicates read their owners (2026-09-20 sweep)', () => {
  it('settler name fallback: no view re-types its own fallback string', () => {
    // The guard scans every view, not two named expressions: a panel can drift on one site while its
    // family list already uses `citizenGivenName`.
    const views = [
      'src/components/SelectedEntityPanel.tsx',
      'src/components/SelectedBuildingPanel.tsx',
      'src/components/dashboard/GameDashboard.tsx',
      'src/game/PopulationPanel.tsx',
    ];
    for (const view of views) {
      expect(read(view), `${view} re-types a nameless-settler fallback`).not.toMatch(
        /\.name \|\| '(Settler|Unnamed|Unknown)'/,
      );
    }
  });

  it('"many adults idle" is one rule, and the overview screen reads it', () => {
    // The card reads `hasManyAdultsIdle`; a local idle threshold is the regression.
    expect(hasManyAdultsIdle({ idle: 3, adults: 10 })).toBe(false); // 3 > max(2, 3.5)
    expect(hasManyAdultsIdle({ idle: 4, adults: 10 })).toBe(true); // 4 > 3.5
    expect(hasManyAdultsIdle({ idle: 3, adults: 2 })).toBe(true); // 3 > max(2, 0.7)

    const overview = read('src/components/CitizenOverviewScreen.tsx');
    expect(overview).toContain('hasManyAdultsIdle(overview)');
    expect(overview, 'the hand-typed idle threshold is back').not.toContain('overview.adults * 0.35');
  });

  it('the reputation bands that price visitor trade are named once', () => {
    expect(getVisitorTradePriceMult(REPUTATION_FRIENDLY_MIN)).toBeLessThan(1);
    expect(getVisitorTradePriceMult(REPUTATION_HARSH_MAX)).toBeGreaterThan(1);
    expect(getVisitorTradePriceMult(REPUTATION_FRIENDLY_MIN - 1)).toBe(1);
    expect(getVisitorTradePriceMult(REPUTATION_HARSH_MAX + 1)).toBe(1);

    const camp = read('src/components/VisitorCampPanel.tsx');
    // The panel asks for the band, never the price multiplier: pricing stays in the owner, which
    // `tests/visitorTradePanel.eligibility.test.ts` guards separately.
    expect(camp).toContain('getReputationBand(state.villageReputation)');
    expect(camp, 'the hand-written 80/30 band is back').not.toContain('state.villageReputation >= 80');
    // The Village tooltip names the same bands instead of restating the numbers.
    expect(read('src/components/tabPanels/VillageTabPanel.tsx')).toContain('REPUTATION_FRIENDLY_MIN');
  });

  // Two different owners consume the bands — visitor trade prices and `frontierCombat`'s raid odds —
  // so the boundary is pinned at the defining source, not at one consumer.
  it('no module re-hardcodes the reputation band boundaries', () => {
    const owner = read('src/game/simHelpers.ts');
    // Defined exactly once, and the classifier reads those names.
    expect(owner.match(/REPUTATION_FRIENDLY_MIN\s*=\s*80/g) ?? []).toHaveLength(1);
    expect(owner.match(/REPUTATION_HARSH_MAX\s*=\s*30/g) ?? []).toHaveLength(1);

    for (const file of ['src/game/groupEvents.ts', 'src/game/frontierCombat.ts']) {
      const source = read(file);
      expect(source, `${file} re-hardcodes the friendly band`).not.toMatch(/rep\w*\s*>=\s*80\b/);
      expect(source, `${file} re-hardcodes the harsh band`).not.toMatch(/rep\w*\s*<=\s*30\b/);
    }

    // The classifier is the only reader of the boundaries, so the two consumers agree by
    // construction rather than by coincidence.
    expect(getReputationBand(REPUTATION_FRIENDLY_MIN)).toBe('friendly');
    expect(getReputationBand(REPUTATION_FRIENDLY_MIN - 1)).toBe('normal');
    expect(getReputationBand(REPUTATION_HARSH_MAX)).toBe('harsh');
    expect(getReputationBand(REPUTATION_HARSH_MAX + 1)).toBe('normal');
  });

  it('storage headroom comes from its owner, not a local max(0, cap - current)', () => {
    const camp = read('src/components/VisitorCampPanel.tsx');
    expect(camp).toContain("getAvailableStorageHeadroom(state, 'food')");
    expect(camp, 'the local headroom copy is back').not.toContain(
      'state.storageMax.food - state.resources.food',
    );
  });
});

describe('U-2/U-3/U-4 — the 2026-09-20 inspector copy guards (building panel)', () => {
  it('the Mill rule is rendered once, by the owner-derived hint', () => {
    // The mill rule is rendered once, from `MILL_FOOD_PRODUCTION_MULT`.
    const panel = read('src/components/SelectedBuildingPanel.tsx');
    expect(panel).toContain('MILL_FOOD_PRODUCTION_MULT');
    expect(panel, 'the hardcoded mill rule is back beside the owner-derived hint').not.toContain(
      'boosts all food +25%',
    );
  });

  it('the Farm hint counts the workers the build catalogue actually allows', () => {
    // The farm hint counts `getBuildingConfig(type).maxOccupants`, not a typed cap.
    expect(BUILDING_CONFIGS[BuildingType.Farm].maxOccupants).toBe(2);
    const panel = read('src/components/SelectedBuildingPanel.tsx');
    expect(panel).toContain('(up to ${getBuildingConfig(type).maxOccupants})');
    expect(panel, 'the hand-typed farm worker cap is back').not.toContain('up to 3)');
  });

  it('the guard and preserve bonuses are interpolated from their owners', () => {
    expect(MILITIA_BALANCE.guardBonusPerGuard).toBe(14);
    expect(PRESERVE_HEALTH_BONUS).toBe(4);
    const panel = read('src/components/SelectedBuildingPanel.tsx');
    expect(panel).toContain('MILITIA_BALANCE.guardBonusPerGuard');
    expect(panel).toContain('PRESERVE_HEALTH_BONUS');
    expect(panel, 'the typed militia bonus is back').not.toContain('(+14 militia strength)');
    expect(panel, 'the typed preserve bonus is back').not.toContain('ecosystem health +4');
    // The build catalogue cannot import either owner (those imports would close a cycle through
    // `gameTypes`), so its copy carries no number instead of a stale one.
    expect(read('src/game/buildings.ts'), 'the catalogue re-types the guard bonus').not.toContain(
      '+14 militia strength',
    );
    expect(read('src/game/buildings.ts'), 'the catalogue re-types the preserve bonus').not.toContain(
      'ecosystem health +4',
    );
  });

  it('the upgrade ceiling is asked of the upgrade owner, not retyped as a level test', () => {
    // The ceiling belongs to `buildingMaintenanceActions`; a local `level < 3` would let a raised
    // ceiling stay unreachable and offer a button whose command is refused.
    const panel = read('src/components/SelectedBuildingPanel.tsx');
    expect(panel).toContain('getBuildingUpgradeEligibility(state, building.id)');
    expect(panel, 'a local level ceiling is back').not.toMatch(/building\.level\s*<\s*3/);
    expect(panel, 'the Lv.3 ceiling is typed into the housing copy again').not.toContain('at Lv.3');
  });

  it('the guide shows the build version once, from GAME_VERSION', () => {
    // The guide interpolates `GAME_VERSION`; a hand-typed version is the regression.
    const guide = read('src/components/tabPanels/MoreTabPanel.tsx');
    expect(guide).toContain('v{GAME_VERSION}');
    expect(guide, 'a hand-typed version is back in the guide sentence').not.toContain(
      'v0.4 is a playtest',
    );
  });
});

/**
 * No domain rule is computed inside a view: each guard names the owner the view must read and scans
 * every `.tsx`, so a new view cannot opt out by not being listed.
 */
describe('O — no domain rule is computed inside a view', () => {
  function viewSources(): string[] {
    const found: string[] = [];
    const walk = (relativeDir: string) => {
      for (const entry of readdirSync(resolve(process.cwd(), relativeDir), { withFileTypes: true })) {
        const relative = `${relativeDir}/${entry.name}`;
        if (entry.isDirectory()) walk(relative);
        else if (relative.endsWith('.tsx')) found.push(relative);
      }
    };
    walk('src');
    return found.sort();
  }

  /** Every `.tsx` that matches `pattern`, with a message naming the owner that should be read instead. */
  function viewsMatching(pattern: RegExp, owner: string): string[] {
    return viewSources().filter((file) => pattern.test(read(file)))
      .map((file) => `${file} — read ${owner}`);
  }

  it('O-4: no view converts ticks to days by hand (dayCycle.daysUntilTick)', () => {
    expect(viewsMatching(/\/\s*TICKS_PER_DAY/, 'dayCycle.daysUntilTick / getAbsoluteCalendarDay')).toEqual([]);
  });

  it('O-8: no view re-derives a fill percentage (dashboardData.resourceFillPercent)', () => {
    // `IntroScreen`'s reveal progress is presentation timing over a constant, not a capped resource or
    // progress reading, so it is the one legitimate `Math.min(100, …)` in a view.
    const offenders = viewsMatching(/Math\.min\(100,/, 'dashboardData.resourceFillPercent')
      .filter((entry) => !entry.startsWith('src/game/IntroScreen.tsx'));
    expect(offenders).toEqual([]);
  });

  it('O-7: no view reads the raw happiness field (citizenOverview.computeCitizenOverview)', () => {
    expect(viewsMatching(/villageHappiness/, 'citizenOverview.computeCitizenOverview')).toEqual([]);
  });

  it('O-5: no view re-tests the unique-building gate (buildingPlacementActions)', () => {
    expect(viewsMatching(/config\.unique/, 'isUniqueBuildingAlreadyBuilt / PLACEMENT_FAILURE_LABELS')).toEqual([]);
  });

  it('W-2: no view joins a surname by hand (citizenId.citizenFullName/humanDisplayName)', () => {
    expect(viewsMatching(/\.surname \?/, 'citizenId.citizenFullName / humanDisplayName')).toEqual([]);
  });

  it('O-2: the header reads the population owner instead of its own near-cap band', () => {
    const header = read('src/components/GameHeader.tsx');
    expect(header).toContain('isPopulationNearCap(world)');
    expect(header, 'the hand-typed 90 % band is back').not.toContain('>= 0.9');
    // The band and the cap it divides are named once, in the growth owner.
    const growth = read('src/game/populationGrowth.ts');
    expect(growth).toContain('export const POPULATION_NEAR_CAP_RATIO = 0.9;');
    expect(growth).toContain('export function resolvePopulationCap(');
  });

  it('O-6: the Church card asks the moonHowler owner for the priest count and its odds', () => {
    const panel = read('src/components/SelectedBuildingPanel.tsx');
    expect(panel).toContain('countStaffedPriests(state.buildings, ensureEntityByIdMap(state))');
    expect(panel, 'the one-priest clamp is back, promising odds the rite cannot produce').not.toContain(
      'Math.max(1, priestCount)',
    );
  });

  it('O-8: the work-schedule panel reads the fatigue owner, bands included', () => {
    const panel = read('src/components/WorkSchedulePanel.tsx');
    expect(panel).toContain('readVillageFatigue(state)');
    expect(panel, 'the view-side fatigue bands are back').not.toMatch(/averageFatigue >= \d/);
    expect(read('src/game/dailyScheduleFatigue.ts')).toContain('export const FATIGUE_BANDS');
  });

  it('O-1: the cockpit cannot count idle workers it was not given by the staffing owner', () => {
    // The cockpit's idle count comes from the staffing owner, with all its gates.
    expect(read('src/App.tsx'), 'the local idle-worker count is back').not.toContain(
      'selectedBuildingIdleWorkerCount',
    );
    expect(read('src/components/SelectedBuildingPanel.tsx'), 'the panel takes a count again').not.toContain(
      'idleWorkers',
    );
  });

  it('W-3: both browser-slot entry points load through one path', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('const loadFromSlot = useCallback(');
    // Two callers, one refusal block: the `unrestorable → hasSave()` rule appears once.
    expect(count(app, "outcome.reason === 'unrestorable' ? hasSave() : false")).toBe(1);
  });

  it('W-1: both nameless-settler strings are the owner\'s, not typed by a formatter', () => {
    const owner = read('src/game/citizenId.ts');
    // Two grammars, two named strings, one module: the sentence form and the `#id` label form.
    expect(owner).toContain("export const SETTLER_NAME_FALLBACK = 'A settler';");
    expect(owner).toContain("export const SETTLER_LABEL_FALLBACK = 'Settler';");
    expect(owner, 'formatCitizenName typed its own fallback again').not.toMatch(
      /entity\.name \|\| '(Settler|Unnamed|Unknown|A settler)'/,
    );
    expect(owner, 'the label form lost the owner constant').toContain('SETTLER_LABEL_FALLBACK');
  });

  it('the terminal export goes through the authoritative save owner, not the display shadow', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('onExport={() => { void persistCurrentGame(');
    expect(app, 'the display shadow is written directly again').not.toMatch(
      /onExport=\{\(\) => \{ saveGame\(/,
    );
  });
});
