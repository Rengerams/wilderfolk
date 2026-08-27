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
const BUILD_PANEL_STORAGE_KEY = 'wilderfolk-build-panel';

/** Returns the visible tab using the existing insertion-order convention. */
export function getActiveSidebarTab(openTabs: ReadonlySet<SidebarTab>): SidebarTab {
  const tabs = Array.from(openTabs);
  return tabs[tabs.length - 1] ?? 'village';
}

/** Opens a sidebar tab without reordering a tab that is already open. */
export function openSidebarTab(
  openTabs: ReadonlySet<SidebarTab>,
  tab: SidebarTab,
): Set<SidebarTab> {
  return new Set(openTabs).add(tab);
}

/** Toggles one sidebar tab while preserving the original tab-order behavior. */
export function toggleSidebarTab(
  openTabs: ReadonlySet<SidebarTab>,
  tab: SidebarTab,
): Set<SidebarTab> {
  const next = new Set(openTabs);
  if (next.has(tab)) next.delete(tab);
  else next.add(tab);
  return next;
}

function loadBuildPanelOpen(): boolean {
  try {
    return localStorage.getItem(BUILD_PANEL_STORAGE_KEY) === 'open';
  } catch {
    return false;
  }
}

function loadShowTutorial(): boolean {
  if (!loadTutorialsEnabled()) return false;
  try {
    return localStorage.getItem(TUTORIAL_DONE_STORAGE_KEY) !== '1';
  } catch {
    return true;
  }
}

/**
 * Owns persistent application-shell presentation state. It deliberately does not
 * create simulation, session, persistence, or transient-feedback mutation paths.
 */
export function useGameShellState() {
  const [selectedMapSize, setSelectedMapSize] = useState<MapSize>(MapSize.Medium);
  const [selectedMapPreset, setSelectedMapPreset] = useState<MapPreset>(MapPreset.Verdant);
  const [openTabs, setOpenTabs] = useState<Set<SidebarTab>>(() => new Set(['village']));
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
  const [firstNightWarningDismissed, setFirstNightWarningDismissed] = useState(
    loadFirstNightWarningDismissed,
  );

  const activeTab = useMemo(() => getActiveSidebarTab(openTabs), [openTabs]);
  const openTab = useCallback((tab: SidebarTab) => {
    setOpenTabs((previous) => openSidebarTab(previous, tab));
  }, []);
  const toggleTab = useCallback((tab: SidebarTab) => {
    setOpenTabs((previous) => toggleSidebarTab(previous, tab));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(BUILD_PANEL_STORAGE_KEY, buildPanelOpen ? 'open' : 'collapsed');
    } catch {
      /* local preference storage is optional */
    }
  }, [buildPanelOpen]);

  return {
    activeTab,
    buildPanelOpen,
    campaignActive,
    firstNightWarningDismissed,
    logSubTab,
    mapSetupSource,
    moreSubTab,
    openTab,
    openTabs,
    progressSubTab,
    selectedMapPreset,
    selectedMapSize,
    setBuildPanelOpen,
    setCampaignActive,
    setFirstNightWarningDismissed,
    setInspectorCollapsed,
    setLogSubTab,
    setMapSetupSource,
    setMoreSubTab,
    setProgressSubTab,
    setSelectedMapPreset,
    setSelectedMapSize,
    setShowFps,
    setShowIntro,
    setShowMapSetup,
    setShowShortcuts,
    setShowSimTick,
    setShowTutorial,
    setTutorialChoice,
    setTutorialStep,
    setTutorialsEnabled,
    setJuiceEffectsEnabled,
    showFps,
    showIntro,
    showMapSetup,
    showShortcuts,
    showSimTick,
    showTutorial,
    toggleTab,
    tutorialChoice,
    tutorialsEnabled,
    tutorialStep,
    juiceEffectsEnabled,
    inspectorCollapsed,
  };
}
