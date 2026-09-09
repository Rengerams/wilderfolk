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
  const [firstNightWarningDismissed, setFirstNightWarningDismissed] = useState(
    loadFirstNightWarningDismissed,
  );

  const openCitizenOverview = useCallback(() => {
    setCitizenOverviewOpen(true);
    setOpenTabs(new Set());
  }, []);

  const closeCitizenOverview = useCallback(() => {
    setCitizenOverviewOpen(false);
  }, []);

  const toggleCitizenOverview = useCallback(() => {
    setCitizenOverviewOpen((previous) => {
      if (!previous) setOpenTabs(new Set());
      return !previous;
    });
  }, []);

  const activeTab = useMemo(() => getActiveSidebarTab(openTabs), [openTabs]);

  const openTab = useCallback((tab: SidebarTab) => {
    setOpenTabs((previous) => openSidebarTab(previous, tab));
  }, []);

  const toggleTab = useCallback((tab: SidebarTab) => {
    setOpenTabs((previous) => toggleSidebarTab(previous, tab));
  }, []);

  const closeSidebarTabs = useCallback(() => {
    setOpenTabs(new Set());
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