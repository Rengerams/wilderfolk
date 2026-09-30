import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPreset, MapSize } from '../game/gameTypes';
import type { SidebarTab } from '../game/hotkeys';
import {
  loadFirstNightWarningDismissed,
  loadJuiceEffectsEnabled,
  loadShowFps,
  loadShowSimTick,
  loadTutorialChoice,
  loadTutorialsEnabled,
} from '../game/preferences';

// `SidebarTab` is owned by `hotkeys.ts` (audit C2 "`SidebarTab` union") — this file used to declare
// a second, same-named union that differed by the unreachable `'schedule'` member.
export type { SidebarTab };
// The three sub-tab unions are owned here, next to the state they type, and the panels import them:
// `LogTabPanel`, `ProgressTabPanel` and `MoreTabPanel` each used to re-type their own copy, and
// because the copies were contravariant-compatible a member added here compiled in the panel and was
// simply unreachable — the same drift the `SidebarTab` note above records (2026-09-20 audit, A8).
export type LogSubTab = 'chronicle' | 'combat';
export type ProgressSubTab = 'research' | 'trade' | 'goals';
export type MoreSubTab = 'guide' | 'campaign';
export type MapSetupSource = 'intro' | 'game';
/** Full-screen overview sections (Citizen Overview overlay). */
export type OverviewSection = 'people' | 'world' | 'chronicle' | 'help';
/** Which world panel to surface first when the World section opens. */
export type OverviewWorldFocus = 'frontier' | 'nature' | 'progress';
/** Choosable tabs inside the Valley overview (one rail button opens this menu). */
export type OverviewNavId = 'people' | 'frontier' | 'nature' | 'progress' | 'chronicle' | 'help';

export const TUTORIAL_DONE_STORAGE_KEY = 'wilderfolk-tutorial-done';
export const BUILD_PANEL_STORAGE_KEY = 'wilderfolk-build-panel';

/** Returns the visible tab using insertion-order convention. */
export function getActiveSidebarTab(openTabs: ReadonlySet<SidebarTab>): SidebarTab {
  for (const tab of openTabs) {
    return tab;
  }
  return 'village';
}

/** Opens one focused information view and closes any previously open view. */
export function openSidebarTab(
  _openTabs: ReadonlySet<SidebarTab>,
  tab: SidebarTab,
): Set<SidebarTab> {
  return new Set([tab]);
}

/** Toggles a focused information view; views never stack in the gameplay shell. */
export function toggleSidebarTab(
  openTabs: ReadonlySet<SidebarTab>,
  tab: SidebarTab,
): Set<SidebarTab> {
  return openTabs.has(tab) ? new Set() : new Set([tab]);
}

/**
 * The one route table: which overview section (and world focus) each focused view opens.
 *
 * `mapSidebarTabToOverview`, `mapOverviewNav` and the two rail resyncs inside the hook all read
 * this table. Three places used to encode "which rail id is which section" — the two switches here
 * plus an inline ternary in `selectOverviewNav` — and the inline one was the copy a new nav id would
 * miss, silently desyncing `openTabs` from the section on screen (audit C1 clone 9 / C2
 * "Tab → section mapping").
 */
const OVERVIEW_ROUTES: Record<
  SidebarTab,
  { section: OverviewSection; worldFocus: OverviewWorldFocus | null }
> = {
  village: { section: 'people', worldFocus: null },
  schedule: { section: 'people', worldFocus: null },
  frontier: { section: 'world', worldFocus: 'frontier' },
  nature: { section: 'world', worldFocus: 'nature' },
  progress: { section: 'world', worldFocus: 'progress' },
  log: { section: 'chronicle', worldFocus: null },
  more: { section: 'help', worldFocus: null },
};

/** The rail id each in-overview nav chip stands for. */
const OVERVIEW_NAV_RAIL: Record<OverviewNavId, SidebarTab> = {
  people: 'village',
  frontier: 'frontier',
  nature: 'nature',
  progress: 'progress',
  chronicle: 'log',
  help: 'more',
};

/**
 * What each subject is called, and the glyph that stands for it.
 *
 * One owner for the three surfaces that must agree: the **header icon** that opens the subject, the
 * **window title** it opens (`GameWindow`), and the label the guide and hotkey list use. The old
 * full-screen overlay kept this in its own `navTabs`/`titleByNav` pair, so a new subject was three
 * edits in two files and the header could not name a subject it did not know. `hint` is visible text
 * in the header button's `title` and the window's subtitle, never the only statement of a rule.
 */
export interface OverviewSubjectMeta {
  /** Glyph for the header door and the window's title bar. */
  icon: string;
  /** The subject's name, as the player reads it. */
  label: string;
  /** One line: what the subject answers. */
  hint: string;
}

export const OVERVIEW_SUBJECTS: Record<OverviewNavId, OverviewSubjectMeta> = {
  people: { icon: '👥', label: 'Village', hint: 'Citizens, housing, work hours' },
  frontier: { icon: '🏕️', label: 'Frontier', hint: 'Visitors, rivals, raids' },
  nature: { icon: '🌿', label: 'Nature', hint: 'Ecosystem and wildlife' },
  progress: { icon: '🔬', label: 'Progress', hint: 'Research, trade, goals' },
  chronicle: { icon: '📜', label: 'Log', hint: 'Births, deaths, scandals' },
  help: { icon: '❓', label: 'More', hint: 'Guide and campaign' },
};

/** Map a right-rail tab / hotkey to the wide overview overlay. */
export function mapSidebarTabToOverview(tab: SidebarTab): {
  section: OverviewSection;
  worldFocus: OverviewWorldFocus | null;
} {
  return OVERVIEW_ROUTES[tab];
}

/** The rail id an in-overview nav chip keeps in sync for hotkeys and highlighting. */
export function sidebarTabForOverviewNav(id: OverviewNavId): SidebarTab {
  return OVERVIEW_NAV_RAIL[id];
}

/** Map an in-overview nav chip to section + world focus. */
export function mapOverviewNav(id: OverviewNavId): {
  section: OverviewSection;
  worldFocus: OverviewWorldFocus | null;
} {
  return OVERVIEW_ROUTES[OVERVIEW_NAV_RAIL[id]];
}

export function overviewNavFromState(
  section: OverviewSection,
  worldFocus: OverviewWorldFocus | null,
): OverviewNavId {
  if (section === 'people') return 'people';
  if (section === 'chronicle') return 'chronicle';
  if (section === 'help') return 'help';
  return worldFocus ?? 'frontier';
}

function loadBuildPanelOpen(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(BUILD_PANEL_STORAGE_KEY) === 'open';
  } catch {
    return false;
  }
}

function loadShowTutorial(): boolean {
  if (!loadTutorialsEnabled()) return false;
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(TUTORIAL_DONE_STORAGE_KEY) !== '1';
  } catch {
    return true;
  }
}

/**
 * Owns persistent application-shell presentation state.
 */
export function useGameShellState() {
  const [selectedMapSize, setSelectedMapSize] = useState<MapSize>(MapSize.Medium);
  const [selectedMapPreset, setSelectedMapPreset] = useState<MapPreset>(MapPreset.Continental);
  const [openTabs, setOpenTabs] = useState<Set<SidebarTab>>(() => new Set());
  const [progressSubTab, setProgressSubTab] = useState<ProgressSubTab>('research');
  const [moreSubTab, setMoreSubTab] = useState<MoreSubTab>('guide');
  const [logSubTab, setLogSubTab] = useState<LogSubTab>('chronicle');
  const [inspectorCollapsed, setInspectorCollapsed] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [tutorialsEnabled, setTutorialsEnabled] = useState(loadTutorialsEnabled);
  const [tutorialChoice, setTutorialChoice] = useState(loadTutorialChoice);
  const [campaignActive, setCampaignActive] = useState(false);
  const [juiceEffectsEnabled, setJuiceEffectsEnabled] = useState(loadJuiceEffectsEnabled);
  const [showSimTick, setShowSimTick] = useState(loadShowSimTick);
  const [showFps, setShowFps] = useState(loadShowFps);
  const [showTutorial, setShowTutorial] = useState(loadShowTutorial);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [showMapSetup, setShowMapSetup] = useState(false);
  const [mapSetupSource, setMapSetupSource] = useState<MapSetupSource>('intro');
  const [buildPanelOpen, setBuildPanelOpen] = useState(loadBuildPanelOpen);
  const [citizenOverviewOpen, setCitizenOverviewOpen] = useState(false);
  const [overviewSection, setOverviewSection] = useState<OverviewSection>('people');
  const [overviewWorldFocus, setOverviewWorldFocus] = useState<OverviewWorldFocus | null>(null);
  const [firstNightWarningDismissed, setFirstNightWarningDismissed] = useState(
    loadFirstNightWarningDismissed,
  );

  const openCitizenOverview = useCallback(() => {
    setOverviewSection('people');
    setOverviewWorldFocus(null);
    setOpenTabs(new Set(['village']));
    setCitizenOverviewOpen(true);
  }, []);

  const closeCitizenOverview = useCallback(() => {
    setCitizenOverviewOpen(false);
    setOpenTabs(new Set());
    setOverviewWorldFocus(null);
  }, []);

  const toggleCitizenOverview = useCallback(() => {
    setCitizenOverviewOpen((previous) => {
      if (previous) {
        setOpenTabs(new Set());
        setOverviewWorldFocus(null);
        return false;
      }
      setOverviewSection('people');
      setOverviewWorldFocus(null);
      setOpenTabs(new Set(['village']));
      return true;
    });
  }, []);

  const activeTab = useMemo(() => getActiveSidebarTab(openTabs), [openTabs]);

  const openTab = useCallback((tab: SidebarTab) => {
    const mapped = mapSidebarTabToOverview(tab);
    setOverviewSection(mapped.section);
    setOverviewWorldFocus(mapped.worldFocus);
    setOpenTabs(openSidebarTab(new Set(), tab));
    setCitizenOverviewOpen(true);
  }, []);

  const selectOverviewNav = useCallback((id: OverviewNavId) => {
    const mapped = mapOverviewNav(id);
    setOverviewSection(mapped.section);
    setOverviewWorldFocus(mapped.worldFocus);
    setOpenTabs(new Set([sidebarTabForOverviewNav(id)]));
  }, []);

  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(BUILD_PANEL_STORAGE_KEY, buildPanelOpen ? 'open' : 'collapsed');
      }
    } catch {
      /* Local preference storage failure gracefully ignored */
    }
  }, [buildPanelOpen]);

  return {
    // Tab Navigation
    activeTab,
    openTab,
    progressSubTab,
    setProgressSubTab,
    moreSubTab,
    setMoreSubTab,
    logSubTab,
    setLogSubTab,

    // Map Setup & Modals
    selectedMapSize,
    setSelectedMapSize,
    selectedMapPreset,
    setSelectedMapPreset,
    showMapSetup,
    setShowMapSetup,
    mapSetupSource,
    setMapSetupSource,
    showIntro,
    setShowIntro,

    // UI Panels & Inspector
    buildPanelOpen,
    setBuildPanelOpen,
    citizenOverviewOpen,
    openCitizenOverview,
    closeCitizenOverview,
    toggleCitizenOverview,
    overviewSection,
    overviewWorldFocus,
    selectOverviewNav,
    inspectorCollapsed,
    setInspectorCollapsed,
    showShortcuts,
    setShowShortcuts,

    // Tutorial & Campaign
    showTutorial,
    setShowTutorial,
    tutorialStep,
    setTutorialStep,
    tutorialChoice,
    setTutorialChoice,
    tutorialsEnabled,
    setTutorialsEnabled,
    campaignActive,
    setCampaignActive,
    firstNightWarningDismissed,
    setFirstNightWarningDismissed,

    // Debug & Juice Preferences
    showFps,
    setShowFps,
    showSimTick,
    setShowSimTick,
    juiceEffectsEnabled,
    setJuiceEffectsEnabled,
  };
}