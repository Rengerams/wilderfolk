import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPreset, MapSize } from '../game/gameTypes';
import {
  loadFirstNightWarningDismissed,
  loadJuiceEffectsEnabled,
  loadShowFps,
  loadShowSimTick,
  loadTutorialChoice,
  loadTutorialsEnabled,
} from '../game/preferences';

export type SidebarTab = 'village' | 'schedule' | 'frontier' | 'nature' | 'progress' | 'log' | 'more';
export type LogSubTab = 'chronicle' | 'combat';
export type ProgressSubTab = 'research' | 'trade' | 'goals';
export type MoreSubTab = 'guide' | 'roadmap' | 'campaign';
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

/** Map a right-rail tab / hotkey to the wide overview overlay. */
export function mapSidebarTabToOverview(tab: SidebarTab): {
  section: OverviewSection;
  worldFocus: OverviewWorldFocus | null;
} {
  switch (tab) {
    case 'village':
    case 'schedule':
      return { section: 'people', worldFocus: null };
    case 'frontier':
      return { section: 'world', worldFocus: 'frontier' };
    case 'nature':
      return { section: 'world', worldFocus: 'nature' };
    case 'progress':
      return { section: 'world', worldFocus: 'progress' };
    case 'log':
      return { section: 'chronicle', worldFocus: null };
    case 'more':
      return { section: 'help', worldFocus: null };
  }
}

/** Map an in-overview nav chip to section + world focus. */
export function mapOverviewNav(id: OverviewNavId): {
  section: OverviewSection;
  worldFocus: OverviewWorldFocus | null;
} {
  switch (id) {
    case 'people':
      return { section: 'people', worldFocus: null };
    case 'frontier':
      return { section: 'world', worldFocus: 'frontier' };
    case 'nature':
      return { section: 'world', worldFocus: 'nature' };
    case 'progress':
      return { section: 'world', worldFocus: 'progress' };
    case 'chronicle':
      return { section: 'chronicle', worldFocus: null };
    case 'help':
      return { section: 'help', worldFocus: null };
  }
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
  const [selectedMapPreset, setSelectedMapPreset] = useState<MapPreset>(MapPreset.Verdant);
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

  const toggleTab = useCallback((tab: SidebarTab) => {
    setOpenTabs((prev) => {
      const closing = citizenOverviewOpen && prev.has(tab);
      if (closing) {
        setCitizenOverviewOpen(false);
        setOverviewWorldFocus(null);
        return new Set();
      }
      const mapped = mapSidebarTabToOverview(tab);
      setOverviewSection(mapped.section);
      setOverviewWorldFocus(mapped.worldFocus);
      setCitizenOverviewOpen(true);
      return openSidebarTab(prev, tab);
    });
  }, [citizenOverviewOpen]);

  const closeSidebarTabs = useCallback(() => {
    setOpenTabs(new Set());
    setCitizenOverviewOpen(false);
    setOverviewWorldFocus(null);
  }, []);

  /** Section nav inside the overlay — keep openTabs in sync for hotkeys/highlight. */
  const selectOverviewSection = useCallback((section: OverviewSection) => {
    setOverviewSection(section);
    if (section !== 'world') setOverviewWorldFocus(null);
    const rail: SidebarTab =
      section === 'people'
        ? 'village'
        : section === 'world'
          ? (overviewWorldFocus ?? 'frontier')
          : section === 'chronicle'
            ? 'log'
            : 'more';
    setOpenTabs(new Set([rail]));
  }, [overviewWorldFocus]);

  const selectOverviewNav = useCallback((id: OverviewNavId) => {
    const mapped = mapOverviewNav(id);
    setOverviewSection(mapped.section);
    setOverviewWorldFocus(mapped.worldFocus);
    const rail: SidebarTab =
      id === 'people'
        ? 'village'
        : id === 'chronicle'
          ? 'log'
          : id === 'help'
            ? 'more'
            : id;
    setOpenTabs(new Set([rail]));
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
    openTabs,
    openTab,
    toggleTab,
    closeSidebarTabs,
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
    setCitizenOverviewOpen,
    openCitizenOverview,
    closeCitizenOverview,
    toggleCitizenOverview,
    overviewSection,
    setOverviewSection: selectOverviewSection,
    overviewWorldFocus,
    setOverviewWorldFocus,
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