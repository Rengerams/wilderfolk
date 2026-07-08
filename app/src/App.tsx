import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, memo, type RefObject } from 'react';
import {
  initGame, canPlaceBuilding, canAssignWorkerToBuilding,
  buildStripPreview, isStripBuildType, inferStripRotation,
  listAssignableWorkersForBuilding,
  initTradeRoutes,
  EntityType, BuildingType, Season,
  BUILDING_CONFIGS, BUILDING_JOB_TYPES, WORKSHOP_RECIPES, getWorkshopRecipe, formatRecipeInputs,
  GAME_TITLE, GAME_VERSION, GAME_PHASE, GAME_SUBTITLE,
  SPECIES_CONFIG, WeatherType, ResearchType,

  saveGame, loadGame, hasSave, deleteSave,
  getTerrainEfficiencyMultiplier, getAdjacencyMultiplier, getBuildingUpgradeCost, getTameFoodCost,
  isRivalAtPeace,
  getDiplomacyChoiceEligibility, getVisitorLeaderTalkMeta,
  hitTestCamp, ensureFullTradeRoutes,
  getRivalRaidStrength, getCombatPreview,
  canLaunchRaidOnRival,
  getOutgoingRaidActionLabel,
  getOutgoingRaidFoodCostForRival, formatCampDistance, getCampDistancePixels,
  formatRaidDeadline, formatRaidLootSummary, raidEventLoot,
  isVillageLeader,
  getGrazingPressureReport, getEcosystemBreakdown, getArmamentSteps,
  formatRivalPopulationLabel,
  getHumanArmamentLabel, hasIronSpears, hasStoneSpears,
  estimateWorkshopGold, getAgeInYears,
} from './game/gameEngine';
import { getForgeOrder } from './game/forge';
import { MapSize, MapPreset } from './game/gameTypes';
import {
  isResidenceBuildingType, isResidenceBuilding,
  hasResidenceAssignment, hasWorkAssignment, isImprisoned, getResidenceCapacity, getResidenceUpgradeSlotGain,
  canMoveOutOfFamilyHome, isAdultChildAtHome, HUMAN_MOVE_OUT_MIN_AGE,
  NIGHT_START, PREGNANCY_TICKS, TICKS_PER_DAY, getBirthDateString,
} from './game/dayCycle';
import type { WorldState, Entity, Building } from './game/gameEngine';
import type { VisitorGroup } from './game/gameTypes';
import type { VisitorTradeAction, RefugeeChoice } from './game/groupEvents';
import {
  canHostTownFestival,
  describeTownHallPerks,
  TOWN_HALL_FESTIVAL_COST,
  TOWN_HALL_FESTIVAL_DAYS,
} from './game/townHall';
import { screenToWorld } from './game/renderer';
import { GameLoop } from './game/gameLoop';
import type { WorkerCommand } from './game/simWorker/commands';
import type { EntityCatalog } from './game/entityCatalog';
import { resolveAliveHumans } from './game/entityCatalog';
import { computeVillageStats, type VillageStatsSummary } from './game/uiSimSummary';
import { isFoodAlert } from './game/resourceUtils';
import {
  createInitialView,
  moveCameraView,
  zoomCameraViewAt,
  focusCameraOn,
  CAMERA_ZOOM_DEFAULT,
  CAMERA_ZOOM_STEP_IN,
  CAMERA_ZOOM_STEP_OUT,
  clampCameraZoom,
  nudgeCameraToward,
  clampCameraTarget,
  resolveEntity,
  resolveBuilding,
  type ViewState,
} from './game/viewState';
import { isRotatableBuildingType, snapBuildingCenter, toggleBuildingRotation } from './game/buildingRotation';
import { isProductionBuildingType } from './game/buildCatalog';
import { preloadAllSprites } from './game/spriteLoader';
import { getHumanVariantLabel, getHumanSelectionBounds } from './game/humanSprites';
import { isPlayerHuman } from './game/groupEvents';
import { loadNames, fixDefaultNames } from './game/nameLoader';
import IntroScreen from './game/IntroScreen';
import MapSetupScreen from './game/MapSetupScreen';
import StatisticsPanel from './game/StatisticsPanel';
import EventLogPanel from './game/EventLogPanel';
import CombatLogPanel from './components/CombatLogPanel';
import FocusPanel from './game/FocusPanel';
import PopulationPanel from './game/PopulationPanel';

import VillageLeadershipPanel from './game/VillageLeadershipPanel';
import RoadmapPanel from './game/RoadmapPanel';
import CombatPreviewPanel from './game/CombatPreviewPanel';

import { downloadChronicleLog, loadExportChronicleOnSave } from './game/eventLogExport';
import { beginAudio, primeAudioUnlock, playClickSound } from './audio';
import { useGameAudio } from './hooks/useGameAudio';
import { useContextualTutorial } from './hooks/useContextualTutorial';
import ContextualTutorialCard from './components/ContextualTutorialCard';
import { ACTIVE_VICTORY_PATHS, COMING_SOON_VICTORY_PATHS } from './game/victory';
// COMING_SOON_VICTORY_PATHS kept for Goals tab when new paths are deferred
import {
  loadTutorialsEnabled,
  loadJuiceEffectsEnabled,
  loadFirstNightWarningDismissed,
  saveAutoSavePreference,
  saveTutorialsEnabled,
  saveJuiceEffectsEnabled,
  saveFirstNightWarningDismissed,
} from './game/preferences';
import CollapsibleSection from './components/CollapsibleSection';
import ChallengesPanel from './components/ChallengesPanel';
import FrontierPanel from './components/FrontierPanel';
import AlertBar from './components/AlertBar';
import GameHeader from './components/GameHeader';
import BuildCatalogPanel from './components/BuildCatalogPanel';
import BlacksmithForgePanel from './components/BlacksmithForgePanel';
import { getPriorityAlerts, type PriorityAlert } from './game/priorityAlerts';
import type { FocusHintAction } from './game/focusHints';
import './App.css';

const SPEED_OPTIONS = [0.5, 1, 2, 3, 5, 10];

type SidebarTab = 'village' | 'frontier' | 'nature' | 'progress' | 'log' | 'more';
type LogSubTab = 'chronicle' | 'combat';

const TAB_HOTKEYS: Record<string, SidebarTab> = {
  v: 'village',
  f: 'frontier',
  n: 'nature',
  p: 'progress',
  l: 'log',
  m: 'more',
};

const TAB_HOTKEY_CODES: Record<string, SidebarTab> = {
  KeyV: 'village',
  KeyF: 'frontier',
  KeyN: 'nature',
  KeyP: 'progress',
  KeyL: 'log',
  KeyM: 'more',
};

function isEditableTarget(target: EventTarget | null): boolean {
  const el = (target instanceof HTMLElement ? target : null)
    ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return el.getAttribute('role') === 'textbox' || el.getAttribute('role') === 'combobox';
}

function resolveSidebarTabFromKey(e: KeyboardEvent): SidebarTab | null {
  return TAB_HOTKEYS[e.key.toLowerCase()] ?? TAB_HOTKEY_CODES[e.code] ?? null;
}
type ProgressSubTab = 'research' | 'trade' | 'goals';
type MoreSubTab = 'guide' | 'roadmap';

const SIDEBAR_TABS: { id: SidebarTab; icon: string; label: string; hint: string }[] = [
  { id: 'village', icon: '🏘️', label: 'Village', hint: 'People, leadership, armament' },
  { id: 'frontier', icon: '🏕️', label: 'Frontier', hint: 'Visitors, rivals, raids' },
  { id: 'nature', icon: '🌿', label: 'Nature', hint: 'Ecosystem & wildlife' },
  { id: 'progress', icon: '📊', label: 'Progress', hint: 'Research · Trade · Goals — press P' },
  { id: 'log', icon: '📜', label: 'Log', hint: 'Village chronicle' },
  { id: 'more', icon: '⋯', label: 'More', hint: 'Guide & roadmap' },
];

const HOTKEY_BUILDINGS: Record<string, BuildingType> = {
  '1': BuildingType.House,
  '2': BuildingType.Farm,
  '3': BuildingType.LumberMill,
  '4': BuildingType.Quarry,
  '5': BuildingType.Barn,
  '6': BuildingType.Well,
  '7': BuildingType.Store,
  '8': BuildingType.Road,
  '9': BuildingType.Workshop,
};

const QUICK_START_STEPS = [
  { icon: '🏠', title: 'Build a House before night', detail: `Press B to open Build, pick Housing → House (or press 1), click the map, then assign workers. Night starts at tick ${NIGHT_START} on day one.` },
  { icon: '👆', title: 'Click the map to manage', detail: 'Select people, buildings, or visitor camps — actions appear in the right panel. Assign workers with + Worker on finished buildings.' },
  { icon: '💡', title: 'Tips appear as you play', detail: 'When something new happens — traders, rivals, winter, raids — a tip card appears on the map. Alerts under the header jump to urgent issues. Press ? for shortcuts.' },
];

const TUTORIAL_DONE_KEY = 'wilderfolk-tutorial-done';

const SEASON_ICONS: Record<Season, string> = {
  [Season.Spring]: '🌸', [Season.Summer]: '☀️', [Season.Fall]: '🍂', [Season.Winter]: '❄️',
};

const WEATHER_ICONS: Record<WeatherType, string> = {
  [WeatherType.Clear]: '', [WeatherType.Rain]: '🌧️', [WeatherType.Snow]: '❄️',
  [WeatherType.Storm]: '⛈️', [WeatherType.Fog]: '🌫️', [WeatherType.Drought]: '🌵',
};

const RESEARCH_COLORS: Record<ResearchType, string> = {
  [ResearchType.Agriculture]: '#22c55e', [ResearchType.Mining]: '#6b7280',
  [ResearchType.Forestry]: '#92400e', [ResearchType.Architecture]: '#3b82f6',
  [ResearchType.Medicine]: '#ec4899', [ResearchType.Trade]: '#f59e0b',
  [ResearchType.Education]: '#8b5cf6', [ResearchType.Defense]: '#ef4444',
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [world, setWorld] = useState<WorldState>(() => {
    const s = initGame();
    s.tradeRoutes = ensureFullTradeRoutes(initTradeRoutes());
    return s;
  });
  const [view, setView] = useState<ViewState>(() => createInitialView(world.width, world.height));
  const [villageStats, setVillageStats] = useState<VillageStatsSummary>(() =>
    computeVillageStats(world),
  );
  const [catalog, setCatalog] = useState<EntityCatalog | null>(null);
  const [hasPlacedHouse, setHasPlacedHouse] = useState(
    () => world.buildings.some(
      (b) => b.type === BuildingType.House && (b.completed || b.constructionProgress > 0),
    ),
  );
  const [selectedMapSize, setSelectedMapSize] = useState<MapSize>(MapSize.Medium);
  const [selectedMapPreset, setSelectedMapPreset] = useState<MapPreset>(MapPreset.Verdant);
  const [selectedBuildingType, setSelectedBuildingType] = useState<BuildingType | null>(null);

  const [saveToast, setSaveToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [spritesLoaded, setSpritesLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>('village');
  const [progressSubTab, setProgressSubTab] = useState<ProgressSubTab>('research');
  const [moreSubTab, setMoreSubTab] = useState<MoreSubTab>('guide');
  const [logSubTab, setLogSubTab] = useState<LogSubTab>('chronicle');
  const [inspectorCollapsed, setInspectorCollapsed] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [tutorialsEnabled, setTutorialsEnabled] = useState(() => loadTutorialsEnabled());
  const [juiceEffectsEnabled, setJuiceEffectsEnabled] = useState(() => loadJuiceEffectsEnabled());
  const [showTutorial, setShowTutorial] = useState(() => {
    if (!loadTutorialsEnabled()) return false;
    try {
      return localStorage.getItem(TUTORIAL_DONE_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [tutorialStep, setTutorialStep] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [showMapSetup, setShowMapSetup] = useState(false);
  const [mapSetupSource, setMapSetupSource] = useState<'intro' | 'game'>('intro');
  const [hasSavedGame, setHasSavedGame] = useState(hasSave());
  const gameplayActive = !showIntro && !showMapSetup && spritesLoaded;
  const { muted, volumePreset, toggleMute: handleToggleMute, setVolumePreset: handleVolumePreset } = useGameAudio(world, gameplayActive);

  useEffect(() => {
    if (!gameplayActive) return;
    void beginAudio();
  }, [gameplayActive]);
  const { active: contextualTip, dismissActive: dismissContextualTip } = useContextualTutorial(
    world,
    gameplayActive && tutorialsEnabled && !showTutorial,
  );
  const [buildPanelOpen, setBuildPanelOpen] = useState(() => {
    try {
      return localStorage.getItem('wilderfolk-build-panel') === 'open';
    } catch {
      return false;
    }
  });
  const [firstNightWarningDismissed, setFirstNightWarningDismissed] = useState(loadFirstNightWarningDismissed);

  const worldRef = useRef(world);
  const viewRef = useRef(view);
  const loopRef = useRef<GameLoop | null>(null);
  const catalogRef = useRef<EntityCatalog | null>(null);

  useEffect(() => {
    worldRef.current = world;
    viewRef.current = view;
  });

  useEffect(() => {
    try {
      localStorage.setItem('wilderfolk-build-panel', buildPanelOpen ? 'open' : 'collapsed');
    } catch { /* ignore */ }
  }, [buildPanelOpen]);
  const isDraggingRef = useRef(false);
  const cameraDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const clickOriginRef = useRef<{ x: number; y: number } | null>(null);
  const selectedBuildingTypeRef = useRef(selectedBuildingType);
  const stripDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const cameraVelRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<Set<string>>(new Set());
  const sidebarContentRef = useRef<HTMLDivElement>(null);
  const gameplayActiveRef = useRef(gameplayActive);
  const persistCurrentGameRef = useRef<
    (options?: { chronicle?: boolean; feedback?: boolean }) => Promise<boolean>
  >(async () => false);

  useLayoutEffect(() => {
    selectedBuildingTypeRef.current = selectedBuildingType;
    gameplayActiveRef.current = gameplayActive;
  }, [selectedBuildingType, gameplayActive]);

  // Preload sprites and names
  useEffect(() => {
    Promise.all([preloadAllSprites(), loadNames()])
      .then(() => {
        fixDefaultNames(world);
        setSpritesLoaded(true);
      })
      .catch((err) => {
        console.error('Sprite preload failed — continuing with fallbacks', err);
        setSpritesLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!saveToast) return;
    const timer = setTimeout(() => setSaveToast(null), 4000);
    return () => clearTimeout(timer);
  }, [saveToast]);

  const persistCurrentGame = useCallback(async (options?: {
    chronicle?: boolean;
    feedback?: boolean;
  }) => {
    const chronicle = options?.chronicle ?? false;
    const feedback = options?.feedback ?? true;
    const loop = loopRef.current;
    const view = loop?.getView() ?? viewRef.current;
    let worldToSave = worldRef.current;
    if (loop) {
      worldToSave = await loop.exportAuthoritativeWorld();
    }
    const result = saveGame(worldToSave, view);
    if (!result.success) {
      if (feedback) setSaveToast({ message: result.error, type: 'error' });
      return false;
    }
    if (chronicle && loadExportChronicleOnSave()) {
      try {
        downloadChronicleLog(worldToSave.eventLog, {
          villageName: worldToSave.villageName,
          year: worldToSave.year,
          day: worldToSave.dayInYear,
          tick: worldToSave.tick,
          population: worldToSave.humanPopulation,
        });
      } catch {
        /* localStorage save succeeded */
      }
    }
    setHasSavedGame(true);
    if (feedback) {
      loopRef.current?.mutateWorld((prev) => {
        const id = prev.nextFloatingTextId++;
        prev.floatingTexts.push({
          id,
          x: prev.width / 2,
          y: prev.height / 2 - 50,
          text: 'Game Saved! 💾',
          color: '#22c55e',
          life: 60,
          maxLife: 60,
          scale: 1.5,
        });
      });
      setSaveToast({
        message: chronicle && loadExportChronicleOnSave()
          ? 'Game saved · chronicle .txt downloaded'
          : 'Game saved successfully',
        type: 'success',
      });
    }
    return true;
  }, []);

  useLayoutEffect(() => {
    persistCurrentGameRef.current = persistCurrentGame;
  }, [persistCurrentGame]);

  // Auto-save every 30 seconds (stable interval via ref)
  useEffect(() => {
    const interval = setInterval(() => {
      const loop = loopRef.current;
      if (!loop) return;
      const snapshot = loop.getWorld();
      if (!snapshot.autoSave) return;
      void persistCurrentGame({ chronicle: false, feedback: false }).then((ok) => {
        if (!ok) {
          setSaveToast({ message: 'Auto-save failed — try manual save from the menu', type: 'error' });
        }
      });
    }, 30000);
    return () => clearInterval(interval);
  }, [persistCurrentGame]);

  // Auto-dismiss big news after ~15s (360 ticks) — interval must not reset every sim tick
  useEffect(() => {
    if (world.bigNews.length === 0) return;
    const timer = setInterval(() => {
      loopRef.current?.mutateWorld((prev) => {
        const now = prev.tick;
        const updated = prev.bigNews
          .map(n => ({ ...n, dismissed: n.dismissed || now - n.createdAt > 360 }))
          .filter(n => !n.dismissed || now - n.createdAt < 600);
        if (updated.length !== prev.bigNews.length) prev.bigNews = updated;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [world.bigNews.length]);

  // Keep the sim frozen while Quick Start or map setup is open
  useEffect(() => {
    if (!spritesLoaded || showIntro || showMapSetup || !showTutorial) return;
    loopRef.current?.mutateWorld((w) => { w.paused = true; });
  }, [showTutorial, spritesLoaded, showIntro, showMapSetup]);

  const isFirstGameDay = world.tick < TICKS_PER_DAY;

  // First-night shelter reminder until a House is placed (or player dismisses)
  const showFirstNightWarning =
    !firstNightWarningDismissed && !hasPlacedHouse && world.tick < TICKS_PER_DAY * 2;

  const firstNightWarningMessage = isFirstGameDay && world.tick < NIGHT_START
    ? `Tick ${world.tick} — night begins at tick ${NIGHT_START} (8pm). Place a House on the map and assign workers!`
    : `Night has fallen — place a House and assign workers so your pioneers have somewhere to sleep.`;

  // Simulation + render loop (decoupled from React render cycle)
  useEffect(() => {
    if (!spritesLoaded || showIntro || showMapSetup) {
      loopRef.current?.stop();
      loopRef.current = null;
      return;
    }
    const loop = new GameLoop(worldRef.current, viewRef.current, () => canvasRef.current);
    loopRef.current = loop;
    const unsub = loop.subscribe((nextWorld, nextView, changed, nextCatalog) => {
      worldRef.current = nextWorld;
      viewRef.current = nextView;
      catalogRef.current = nextCatalog;
      setCatalog(nextCatalog);
      setVillageStats(computeVillageStats(nextWorld, nextCatalog));
      setHasPlacedHouse((prev) => prev || nextWorld.buildings.some(
        (b) => b.type === BuildingType.House && (b.completed || b.constructionProgress > 0),
      ));
      if (changed) setWorld(nextWorld);
      setView(nextView);
    });
    loop.start();
    return () => {
      unsub();
      loop.stop();
      loopRef.current = null;
    };
  }, [spritesLoaded, showIntro, showMapSetup]);

  const togglePause = useCallback(() => {
    loopRef.current?.mutateWorld((w) => { w.paused = !w.paused; });
  }, []);

  const resumeAfterTutorialOverlay = useCallback(() => {
    primeAudioUnlock();
    void beginAudio();
    const loop = loopRef.current;
    if (!loop) return;
    const w = loop.getWorld();
    const settlers = catalogRef.current?.getPlayerHumans()
      ?? w.entities.filter((ent) => ent.alive && isPlayerHuman(ent));
    if (settlers.length > 0) {
      const cx = settlers.reduce((sum, ent) => sum + ent.x, 0) / settlers.length;
      const cy = settlers.reduce((sum, ent) => sum + ent.y, 0) / settlers.length;
      const nextView = focusCameraOn(loop.getView(), cx, cy, 1.5);
      clampCameraTarget(nextView.camera, w.width, w.height);
      loop.patchView(nextView);
    }
    loop.mutateWorld((session) => { session.paused = false; });
  }, []);

  const acknowledgeContextualTip = useCallback(() => {
    if (!contextualTip) return;
    const tipId = contextualTip.id;
    dismissContextualTip();
    loopRef.current?.mutateWorld((w) => {
      w.tutorialSeen = [...new Set([...(w.tutorialSeen ?? []), tipId])];
    });
  }, [contextualTip, dismissContextualTip]);

  const disableAllTutorials = useCallback(() => {
    saveTutorialsEnabled(false);
    setTutorialsEnabled(false);
    try {
      localStorage.setItem(TUTORIAL_DONE_KEY, '1');
    } catch { /* ignore */ }
    setShowTutorial(false);
    setTutorialStep(0);
    dismissContextualTip();
    resumeAfterTutorialOverlay();
  }, [dismissContextualTip, resumeAfterTutorialOverlay]);

  const handleToggleJuiceEffects = useCallback(() => {
    const next = !juiceEffectsEnabled;
    saveJuiceEffectsEnabled(next);
    setJuiceEffectsEnabled(next);
  }, [juiceEffectsEnabled]);

  const handleToggleTutorials = useCallback(() => {
    const next = !tutorialsEnabled;
    saveTutorialsEnabled(next);
    setTutorialsEnabled(next);
    if (!next) {
      try {
        localStorage.setItem(TUTORIAL_DONE_KEY, '1');
      } catch { /* ignore */ }
      setShowTutorial(false);
      dismissContextualTip();
    }
  }, [tutorialsEnabled, dismissContextualTip]);

  const finishTutorial = useCallback(() => {
    try {
      localStorage.setItem(TUTORIAL_DONE_KEY, '1');
    } catch { /* ignore */ }
    setShowTutorial(false);
    setTutorialStep(0);
    resumeAfterTutorialOverlay();
  }, [resumeAfterTutorialOverlay]);

  const toggleGrid = useCallback(() => {
    const loop = loopRef.current;
    if (!loop) return;
    const next = !loop.getView().showGrid;
    loop.patchView({ showGrid: next });
  }, []);

  const cancelBuildMode = useCallback(() => {
    setSelectedBuildingType(null);
    stripDragStartRef.current = null;
    loopRef.current?.patchView({ buildMode: null, buildGhost: null, buildStripPreview: null, buildRotation: 0 });
  }, []);

  const rotateBuildPlacement = useCallback(() => {
    const loop = loopRef.current;
    if (!loop || !selectedBuildingType || !isRotatableBuildingType(selectedBuildingType)) return;
    const view = loop.getView();
    const nextRotation = toggleBuildingRotation(view.buildRotation);
    const ghost = view.buildGhost;
    loop.patchView({
      buildRotation: nextRotation,
      ...(ghost
        ? {
            buildGhost: {
              ...ghost,
              valid: canPlaceBuilding(loop.getWorld(), selectedBuildingType, ghost.x, ghost.y, nextRotation),
            },
          }
        : {}),
    });
  }, [selectedBuildingType]);

  const clearSelection = useCallback(() => {
    loopRef.current?.patchView({
      selectedEntityId: null,
      selectedBuildingId: null,
      highlightedCampKey: null,
      selectedCampKey: null,
    });
  }, []);

  const focusCampOnMap = useCallback((kind: 'rival' | 'visitor', id: string, x: number, y: number, buildingId?: number | null) => {
    const loop = loopRef.current;
    if (!loop) return;
    const campKey = `${kind}:${id}`;
    const nextView = focusCameraOn(loop.getView(), x, y, 1.5);
    loop.patchView({
      ...nextView,
      selectedEntityId: null,
      selectedBuildingId: kind === 'rival' ? (buildingId ?? null) : null,
      highlightedCampKey: campKey,
      selectedCampKey: kind === 'visitor' ? campKey : null,
    });
    setInspectorCollapsed(false);
  }, []);

  const focusBuildingOnMap = useCallback((buildingId: number, x: number, y: number) => {
    const loop = loopRef.current;
    if (!loop) return;
    const nextView = focusCameraOn(loop.getView(), x, y, 1.5);
    loop.patchView({
      ...nextView,
      selectedEntityId: null,
      selectedBuildingId: buildingId,
      highlightedCampKey: null,
      selectedCampKey: null,
    });
    setInspectorCollapsed(false);
  }, []);

  const focusCitizenOnMap = useCallback((entity: import('./game/gameTypes').Entity) => {
    const loop = loopRef.current;
    if (!loop) return;
    const nextView = focusCameraOn(loop.getView(), entity.x, entity.y, 1.5);
    loop.patchView({
      ...nextView,
      selectedEntityId: entity.id,
      selectedBuildingId: null,
      highlightedCampKey: null,
      selectedCampKey: null,
    });
    setInspectorCollapsed(false);
  }, []);

  const selectBuildingType = useCallback((type: BuildingType) => {
    clearSelection();
    setSelectedBuildingType((prev) => {
      const next = prev === type ? null : type;
      stripDragStartRef.current = null;
      loopRef.current?.patchView({
        buildMode: next,
        buildGhost: null,
        buildStripPreview: null,
        buildRotation: 0,
        ...(next ? { showGrid: true } : {}),
      });
      return next;
    });
  }, [clearSelection]);

  const handleHintAction = useCallback((action: FocusHintAction) => {
    playClickSound();
    switch (action.id) {
      case 'open_goals':
        setActiveTab('progress');
        setProgressSubTab('goals');
        break;
      case 'open_frontier':
        setActiveTab('frontier');
        break;
      case 'open_trade':
        setActiveTab('progress');
        setProgressSubTab('trade');
        break;
      case 'open_research':
        setActiveTab('progress');
        setProgressSubTab('research');
        break;
      case 'open_village':
        setActiveTab('village');
        break;
      case 'open_nature':
        setActiveTab('nature');
        break;
      case 'open_log':
        setActiveTab('log');
        break;
      case 'build_house':
        selectBuildingType(BuildingType.House);
        setBuildPanelOpen(true);
        break;
      case 'build_farm':
        selectBuildingType(BuildingType.Farm);
        setBuildPanelOpen(true);
        break;
      case 'focus_visitor':
        if (action.visitorId != null && action.visitorX != null && action.visitorY != null) {
          setActiveTab('frontier');
          focusCampOnMap('visitor', action.visitorId, action.visitorX, action.visitorY);
          setInspectorCollapsed(false);
        }
        break;
      case 'focus_rival':
        if (action.rivalId != null && action.rivalX != null && action.rivalY != null) {
          setActiveTab('frontier');
          focusCampOnMap('rival', action.rivalId, action.rivalX, action.rivalY, action.rivalBuildingId);
          setInspectorCollapsed(false);
        }
        break;
      case 'focus_blacksmith':
        if (action.buildingId != null && action.buildingX != null && action.buildingY != null) {
          setActiveTab('village');
          focusBuildingOnMap(action.buildingId, action.buildingX, action.buildingY);
        }
        break;
      case 'build_blacksmith':
        selectBuildingType(BuildingType.Blacksmith);
        setBuildPanelOpen(true);
        break;
    }
  }, [selectBuildingType, focusCampOnMap, focusBuildingOnMap]);

  const handlePriorityAlert = useCallback((alert: PriorityAlert) => {
    playClickSound();
    const action = alert.action;
    switch (action.type) {
      case 'tab':
        setActiveTab(action.tab);
        if (action.progressSub) setProgressSubTab(action.progressSub);
        break;
      case 'build':
        selectBuildingType(action.building);
        setBuildPanelOpen(true);
        break;
      case 'focus_rival':
        setActiveTab('frontier');
        focusCampOnMap('rival', action.rivalId, action.x, action.y, action.buildingId);
        setInspectorCollapsed(false);
        break;
      case 'focus_visitor':
        setActiveTab('frontier');
        focusCampOnMap('visitor', action.groupId, action.x, action.y);
        setInspectorCollapsed(false);
        break;
      case 'focus_building':
        focusBuildingOnMap(action.buildingId, action.x, action.y);
        break;
    }
  }, [selectBuildingType, focusCampOnMap, focusBuildingOnMap]);

  const applyGameAction = useCallback((action: WorkerCommand | ((w: WorldState) => WorldState)) => {
    if (typeof action === 'function') {
      loopRef.current?.applyAction(action);
    } else {
      loopRef.current?.applyCommand(action);
    }
  }, []);

  const getViewCamera = useCallback(() => {
    return loopRef.current?.getView().camera ?? viewRef.current.camera;
  }, []);

  const BUILDING_HOTKEYS = useMemo((): Partial<Record<BuildingType, string>> => {
    const map: Partial<Record<BuildingType, string>> = {};
    for (const [key, val] of Object.entries(HOTKEY_BUILDINGS)) {
      map[val] = key;
    }
    return map;
  }, []);

  useEffect(() => {
    sidebarContentRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  const togglePauseRef = useRef(togglePause);
  const selectBuildingTypeRef = useRef(selectBuildingType);
  const cancelBuildModeRef = useRef(cancelBuildMode);
  const toggleGridRef = useRef(toggleGrid);
  const rotateBuildPlacementRef = useRef(rotateBuildPlacement);
  const showShortcutsRef = useRef(showShortcuts);

  const applyZoom = useCallback((factor: number, screenX?: number, screenY?: number) => {
    const loop = loopRef.current;
    const canvas = canvasRef.current;
    if (!loop || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;
    if (cw <= 0 || ch <= 0) return;
    const sx = screenX ?? cw / 2;
    const sy = screenY ?? ch / 2;
    const world = loop.getWorld();
    const next = zoomCameraViewAt(loop.getView(), factor, sx, sy, cw, ch);
    clampCameraTarget(next.camera, world.width, world.height);
    loop.patchView(next);
  }, []);

  const applyZoomRef = useRef(applyZoom);

  const resetZoom = useCallback(() => {
    const loop = loopRef.current;
    if (!loop) return;
    const world = loop.getWorld();
    const cam = loop.getView().camera;
    const next = focusCameraOn(loop.getView(), cam.targetX, cam.targetY, CAMERA_ZOOM_DEFAULT);
    clampCameraTarget(next.camera, world.width, world.height);
    loop.patchView(next);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const factor = e.deltaY > 0 ? CAMERA_ZOOM_STEP_OUT : CAMERA_ZOOM_STEP_IN;
    applyZoom(factor, e.clientX - rect.left, e.clientY - rect.top);
  }, [applyZoom]);

  useLayoutEffect(() => {
    togglePauseRef.current = togglePause;
    selectBuildingTypeRef.current = selectBuildingType;
    cancelBuildModeRef.current = cancelBuildMode;
    toggleGridRef.current = toggleGrid;
    rotateBuildPlacementRef.current = rotateBuildPlacement;
    showShortcutsRef.current = showShortcuts;
    applyZoomRef.current = applyZoom;
  }, [togglePause, selectBuildingType, cancelBuildMode, toggleGrid, rotateBuildPlacement, showShortcuts, applyZoom]);

  // Keyboard controls with WASD + momentum — stable listeners (refs, not build mode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const inFormControl = isEditableTarget(e.target);

      if (!inFormControl) {
        keysRef.current.add(e.key.toLowerCase());
      }

      if (
        !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat
        && gameplayActiveRef.current
        && !showShortcutsRef.current
      ) {
        const tab = resolveSidebarTabFromKey(e);
        if (tab) {
          e.preventDefault();
          if (inFormControl) {
            (document.activeElement as HTMLElement | null)?.blur();
          }
          if (tab === 'progress') setProgressSubTab('research');
          setActiveTab(tab);
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void persistCurrentGameRef.current({ chronicle: true, feedback: true });
        return;
      }

      if (inFormControl) return;

      if (e.key === ' ') { e.preventDefault(); togglePauseRef.current(); }
      if (e.key === 'Escape') {
        if (showShortcutsRef.current) {
          setShowShortcuts(false);
        } else if (selectedBuildingTypeRef.current) {
          cancelBuildModeRef.current();
        } else {
          loopRef.current?.patchView({ selectedEntityId: null, selectedBuildingId: null });
        }
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowShortcuts((open) => !open);
      }
      if (e.key === '+' || e.key === '=') {
        applyZoomRef.current(CAMERA_ZOOM_STEP_IN);
      }
      if (e.key === '-') {
        applyZoomRef.current(CAMERA_ZOOM_STEP_OUT);
      }
      // Building hotkeys
      if (HOTKEY_BUILDINGS[e.key]) {
        selectBuildingTypeRef.current(HOTKEY_BUILDINGS[e.key]);
        setBuildPanelOpen(true);
      }
      if (e.key === 'b' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setBuildPanelOpen((open) => !open);
      }
      if (e.key === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        toggleGridRef.current();
      }
      if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const buildType = selectedBuildingTypeRef.current;
        if (buildType && isRotatableBuildingType(buildType)) {
          e.preventDefault();
          rotateBuildPlacementRef.current();
        }
      }
      if (e.key === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const loop = loopRef.current;
        if (loop) {
          const world = loop.getWorld();
          const settlers = catalogRef.current?.getPlayerHumans()
            ?? world.entities.filter((ent) => ent.alive && isPlayerHuman(ent));
          if (settlers.length > 0) {
            const cx = settlers.reduce((sum, ent) => sum + ent.x, 0) / settlers.length;
            const cy = settlers.reduce((sum, ent) => sum + ent.y, 0) / settlers.length;
            const nextView = focusCameraOn(loop.getView(), cx, cy, 1.5);
            clampCameraTarget(nextView.camera, world.width, world.height);
            loop.patchView(nextView);
          }
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp);

    // Camera momentum loop
    let animId: number;
    const cameraLoop = () => {
      const keys = keysRef.current;
      const speed = 6;
      let dx = 0, dy = 0;
      if (keys.has('w') || keys.has('arrowup')) dy -= speed;
      if (keys.has('s') || keys.has('arrowdown')) dy += speed;
      if (keys.has('a') || keys.has('arrowleft')) dx -= speed;
      if (keys.has('d') || keys.has('arrowright')) dx += speed;

      if (dx !== 0 || dy !== 0) {
        cameraVelRef.current.x += dx * 0.3;
        cameraVelRef.current.y += dy * 0.3;
      }

      // Apply momentum with friction
      if (Math.abs(cameraVelRef.current.x) > 0.1 || Math.abs(cameraVelRef.current.y) > 0.1) {
        const loop = loopRef.current;
        if (loop) {
          const view = loop.getView();
          const cam = { ...view.camera };
          cam.targetX += cameraVelRef.current.x / cam.zoom;
          cam.targetY += cameraVelRef.current.y / cam.zoom;
          clampCameraTarget(cam, loop.getWorld().width, loop.getWorld().height);
          loop.patchView({ camera: cam }, true);
        }
        cameraVelRef.current.x *= 0.85;
        cameraVelRef.current.y *= 0.85;
      } else {
        cameraVelRef.current.x = 0;
        cameraVelRef.current.y = 0;
      }

      animId = requestAnimationFrame(cameraLoop);
    };
    animId = requestAnimationFrame(cameraLoop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(animId);
    };
  }, []);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (clickOriginRef.current) {
      const dx = e.clientX - clickOriginRef.current.x;
      const dy = e.clientY - clickOriginRef.current.y;
      clickOriginRef.current = null;
      if (dx * dx + dy * dy > 16) return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const world = worldRef.current;
    const rect = canvas.getBoundingClientRect();
    const canvasW = canvas.offsetWidth;
    const canvasH = canvas.offsetHeight;
    const scaleX = canvasW / rect.width;
    const scaleY = canvasH / rect.height;
    const screenX = (e.clientX - rect.left) * scaleX;
    const screenY = (e.clientY - rect.top) * scaleY;
    const [worldX, worldY] = screenToWorld(screenX, screenY, getViewCamera(), canvasW, canvasH);

    if (selectedBuildingType) {
      if (isStripBuildType(selectedBuildingType)) return;
      const rotation = loopRef.current?.getView().buildRotation ?? 0;
      const { x: snapX, y: snapY } = snapBuildingCenter(selectedBuildingType, worldX, worldY, rotation);
      playClickSound();
      applyGameAction({ proto: 1, op: 'startBuilding', type: selectedBuildingType, x: snapX, y: snapY, rotation });
      return;
    }

    // Check building selection first so scenery inside the footprint doesn't steal clicks
    let clickedBuilding: Building | null = null;
    for (const b of world.buildings) {
      if (worldX >= b.x - b.width / 2 && worldX <= b.x + b.width / 2 &&
          worldY >= b.y - b.height / 2 && worldY <= b.y + b.height / 2) {
        clickedBuilding = b;
        break;
      }
    }

    // Check entity selection (humans still win over buildings; trees/grass do not)
    const camera = getViewCamera();
    const clickEntities = catalogRef.current?.getAlive() ?? world.entities.filter((ent) => ent.alive);
    let clickedEntity: Entity | null = null;
    for (const ent of clickEntities) {
      if (clickedBuilding && (ent.type === EntityType.Tree || ent.type === EntityType.Grass)) {
        continue;
      }
      if (ent.type === EntityType.Human) {
        // Human sprites are much taller than their collision size, so use the rendered bounds.
        const bounds = getHumanSelectionBounds(ent, camera.zoom);
        const dx = worldX - bounds.cx;
        const dy = worldY - bounds.cy;
        if ((dx / bounds.rx) ** 2 + (dy / bounds.ry) ** 2 <= 1) {
          clickedEntity = ent;
          break;
        }
        continue;
      }
      const dx = ent.x - worldX;
      const dy = ent.y - worldY;
      if (dx * dx + dy * dy <= (ent.size * 1.2 + 6) ** 2) {
        clickedEntity = ent;
        break;
      }
    }

    const campHit = hitTestCamp(world, worldX, worldY);
    if (campHit && !clickedEntity) {
      const campKey = `${campHit.kind}:${campHit.id}`;
      const loop = loopRef.current;
      if (loop) {
        const nextView = focusCameraOn(loop.getView(), campHit.x, campHit.y, 1.5);
        loop.patchView({
          ...nextView,
          selectedEntityId: null,
          selectedBuildingId: campHit.kind === 'rival' ? campHit.buildingId : null,
          highlightedCampKey: campKey,
          selectedCampKey: campKey,
        });
        setInspectorCollapsed(false);
      }
      return;
    }

    if (clickedEntity || clickedBuilding) {
      const loop = loopRef.current;
      const focusX = clickedEntity?.x ?? clickedBuilding!.x;
      const focusY = clickedEntity?.y ?? clickedBuilding!.y;
      if (loop) {
        const viewPatch = juiceEffectsEnabled
          ? nudgeCameraToward(loop.getView(), loop.getWorld(), focusX, focusY)
          : loop.getView();
        loop.patchView({
          ...viewPatch,
          selectedEntityId: clickedEntity?.id ?? null,
          selectedBuildingId: clickedBuilding?.id ?? null,
          highlightedCampKey: clickedEntity?.faction === 'rival' && clickedEntity.groupId
            ? `rival:${clickedEntity.groupId}`
            : clickedEntity?.faction === 'visitor' && clickedEntity.groupId
              ? `visitor:${clickedEntity.groupId}`
              : clickedBuilding?.faction === 'rival' && clickedBuilding.groupId
                ? `rival:${clickedBuilding.groupId}`
                : null,
          selectedCampKey: null,
        });
      }
      setInspectorCollapsed(false);
    } else {
      loopRef.current?.patchView({
        selectedEntityId: null,
        selectedBuildingId: null,
        highlightedCampKey: null,
        selectedCampKey: null,
      });
    }
  }, [selectedBuildingType, juiceEffectsEnabled, getViewCamera, applyGameAction]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const world = worldRef.current;
    const rect = canvas.getBoundingClientRect();
    const canvasW = canvas.offsetWidth;
    const canvasH = canvas.offsetHeight;
    const screenX = (e.clientX - rect.left) * (canvasW / rect.width);
    const screenY = (e.clientY - rect.top) * (canvasH / rect.height);
    const [worldX, worldY] = screenToWorld(screenX, screenY, getViewCamera(), canvasW, canvasH);

    if (isDraggingRef.current && cameraDragStartRef.current) {
      const dx = e.clientX - cameraDragStartRef.current.x;
      const dy = e.clientY - cameraDragStartRef.current.y;
      const loop = loopRef.current;
        if (loop) {
          loop.patchView(moveCameraView(loop.getView(), loop.getWorld(), -dx / loop.getView().camera.zoom, -dy / loop.getView().camera.zoom), true);
        }
      cameraDragStartRef.current = { x: e.clientX, y: e.clientY };
    }

    // Track hovered building for visual highlight
    let hovered: Building | null = null;
    if (!selectedBuildingType && !isDraggingRef.current) {
      for (const b of world.buildings) {
        if (worldX >= b.x - b.width / 2 && worldX <= b.x + b.width / 2 &&
            worldY >= b.y - b.height / 2 && worldY <= b.y + b.height / 2) {
          hovered = b;
          break;
        }
      }
    }

    if (selectedBuildingType) {
      const loop = loopRef.current;
      const liveWorld = loop?.getWorld() ?? world;
      if (isStripBuildType(selectedBuildingType) && stripDragStartRef.current) {
        const start = stripDragStartRef.current;
        const rotation = inferStripRotation(start.x, start.y, worldX, worldY);
        const preview = buildStripPreview(
          liveWorld,
          selectedBuildingType,
          start.x,
          start.y,
          worldX,
          worldY,
          rotation,
        );
        loop?.patchView({
          buildStripPreview: preview,
          buildRotation: rotation,
          buildGhost: null,
          hoveredBuildingId: hovered?.id ?? null,
        }, true);
      } else if (!isStripBuildType(selectedBuildingType)) {
        const rotation = loop?.getView().buildRotation ?? 0;
        const { x: snapX, y: snapY } = snapBuildingCenter(selectedBuildingType, worldX, worldY, rotation);
        const valid = canPlaceBuilding(liveWorld, selectedBuildingType, snapX, snapY, rotation);
        loop?.patchView({
          buildGhost: { x: snapX, y: snapY, valid },
          buildStripPreview: null,
          hoveredBuildingId: hovered?.id ?? null,
        }, true);
      } else {
        loop?.patchView({ hoveredBuildingId: hovered?.id ?? null }, true);
      }
    } else {
      loopRef.current?.patchView({ hoveredBuildingId: hovered?.id ?? null }, true);
    }
  }, [selectedBuildingType, getViewCamera]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (gameplayActive && e.button === 0) {
      primeAudioUnlock();
      void beginAudio();
    }
    if (e.button === 2 && selectedBuildingType) {
      cancelBuildMode();
      return;
    }
    if (e.button === 0 && selectedBuildingType && isStripBuildType(selectedBuildingType)) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const canvasW = canvas.offsetWidth;
      const canvasH = canvas.offsetHeight;
      const screenX = (e.clientX - rect.left) * (canvasW / rect.width);
      const screenY = (e.clientY - rect.top) * (canvasH / rect.height);
      const [worldX, worldY] = screenToWorld(screenX, screenY, getViewCamera(), canvasW, canvasH);
      stripDragStartRef.current = { x: worldX, y: worldY };
      return;
    }
    if (e.button === 1 || e.button === 2 || (e.button === 0 && !selectedBuildingType)) {
      isDraggingRef.current = true;
      cameraDragStartRef.current = { x: e.clientX, y: e.clientY };
      clickOriginRef.current = { x: e.clientX, y: e.clientY };
    }
  }, [gameplayActive, selectedBuildingType, cancelBuildMode, getViewCamera]);

  const handleMouseUp = useCallback(() => {
    if (stripDragStartRef.current && selectedBuildingType && isStripBuildType(selectedBuildingType)) {
      const start = stripDragStartRef.current;
      stripDragStartRef.current = null;
      const loop = loopRef.current;
      const preview = loop?.getView().buildStripPreview
        ?? buildStripPreview(
          loop?.getWorld() ?? worldRef.current,
          selectedBuildingType,
          start.x,
          start.y,
          start.x,
          start.y,
          loop?.getView().buildRotation ?? 0,
        );
      if (preview.segments.length > 0) {
        playClickSound();
        applyGameAction({ proto: 1, op: 'placeStripChain', type: selectedBuildingType, segments: preview.segments, rotation: preview.rotation });
      }
      loop?.patchView({ buildStripPreview: null });
    }
    isDraggingRef.current = false;
    cameraDragStartRef.current = null;
  }, [selectedBuildingType, applyGameAction]);

  const handleMouseLeave = useCallback(() => {
    stripDragStartRef.current = null;
    isDraggingRef.current = false;
    cameraDragStartRef.current = null;
    clickOriginRef.current = null;
    loopRef.current?.patchView({ hoveredBuildingId: null, buildStripPreview: null }, true);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const setSpeed = (speed: number) => loopRef.current?.mutateWorld((w) => { w.speed = speed; });
  const beginNewGameSession = useCallback((villageName: string) => {
    deleteSave();
    const s = initGame({ size: selectedMapSize, preset: selectedMapPreset, villageName });
    s.paused = true;
    s.tradeRoutes = ensureFullTradeRoutes(initTradeRoutes());
    const nextView = createInitialView(s.width, s.height);
    worldRef.current = s;
    viewRef.current = nextView;
    setWorld(s);
    setView(nextView);
    loopRef.current?.setSession(s, nextView);
    setSelectedBuildingType(null);
    setHasSavedGame(false);
    setFirstNightWarningDismissed(false);
    saveFirstNightWarningDismissed(false);
    setShowTutorial(tutorialsEnabled);
    setTutorialStep(0);
    setShowMapSetup(false);
  }, [selectedMapSize, selectedMapPreset, tutorialsEnabled]);

  const startNewGame = useCallback(() => {
    setMapSetupSource('game');
    setShowMapSetup(true);
  }, []);

  const toggleAutoSave = () => {
    loopRef.current?.mutateWorld((w) => {
      w.autoSave = !w.autoSave;
      saveAutoSavePreference(w.autoSave);
    });
  };

  const handleSave = useCallback(() => {
    void persistCurrentGame({ chronicle: true, feedback: true });
  }, [persistCurrentGame]);

  const applyLoadedSession = useCallback((loaded: { world: WorldState; view: ViewState }) => {
    loaded.world.tradeRoutes = ensureFullTradeRoutes(
      loaded.world.tradeRoutes.length > 0 ? loaded.world.tradeRoutes : initTradeRoutes(),
    );
    fixDefaultNames(loaded.world);
    worldRef.current = loaded.world;
    viewRef.current = loaded.view;
    setWorld(loaded.world);
    setView(loaded.view);
    loopRef.current?.setSession(loaded.world, loaded.view);
    setHasSavedGame(true);
  }, []);

  const handleLoad = useCallback(() => {
    const loaded = loadGame();
    if (loaded) {
      applyLoadedSession(loaded);
      setSaveToast({ message: 'Game loaded', type: 'success' });
    } else {
      setHasSavedGame(hasSave());
      setSaveToast({
        message: hasSave()
          ? 'Could not load save — file may be corrupted'
          : 'No saved game found — use Save game first',
        type: 'error',
      });
    }
  }, [applyLoadedSession]);

  const handleLoadFromSetup = useCallback(() => {
    const loaded = loadGame();
    if (loaded) {
      applyLoadedSession(loaded);
      setShowMapSetup(false);
    } else {
      setHasSavedGame(hasSave());
    }
  }, [applyLoadedSession]);

  const activeBigNews = useMemo(
    () => world.bigNews.filter((n) => !n.dismissed),
    [world.bigNews],
  );

  const priorityAlerts = useMemo(() => getPriorityAlerts(world), [world]);
  const tradeReadyCount = useMemo(
    () => world.tradeRoutes.filter((r) => !r.active && world.villageReputation >= r.reputationRequired).length,
    [world.tradeRoutes, world.villageReputation],
  );
  const progressTabAlert = world.activeResearch != null || tradeReadyCount > 0;
  const foodAlert = isFoodAlert(world);
  const ecoBreakdown = useMemo(() => getEcosystemBreakdown(world), [world]);

  if (showIntro) {
    return (
      <IntroScreen
        onContinue={() => {
          setShowIntro(false);
          setMapSetupSource('intro');
          setShowMapSetup(true);
        }}
      />
    );
  }

  if (showMapSetup) {
    return (
      <MapSetupScreen
        selectedSize={selectedMapSize}
        selectedPreset={selectedMapPreset}
        onSizeChange={setSelectedMapSize}
        onPresetChange={setSelectedMapPreset}
        onBack={() => {
          setShowMapSetup(false);
          if (mapSetupSource === 'intro') setShowIntro(true);
        }}
        backLabel={mapSetupSource === 'game' ? '← Back to game' : '← Back to intro'}
        onStart={(villageName) => {
          primeAudioUnlock();
          void beginAudio();
          beginNewGameSession(villageName);
        }}
        onLoad={() => {
          primeAudioUnlock();
          void beginAudio();
          handleLoadFromSetup();
        }}
        hasSave={hasSavedGame || hasSave()}
      />
    );
  }

  if (!spritesLoaded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-stone-900">
        <div className="text-center">
          <img src="/logo.png" alt="Wilderfolk" className="mx-auto mb-4 h-32 w-32 animate-pulse" style={{ filter: 'drop-shadow(0 0 30px rgba(34,197,94,0.4))' }} />
          <h1 className="mb-2 text-2xl font-bold text-white">{GAME_TITLE}</h1>
          <p className="mb-4 text-stone-400">Loading pixel art assets...</p>
          <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-stone-700">
            <div className="h-full animate-pulse rounded-full bg-emerald-500" style={{ width: '60%' }} />
          </div>
        </div>
      </div>
    );
  }

  const selectedEntity = catalog?.get(view.selectedEntityId)
    ?? resolveEntity(world, view.selectedEntityId);
  const selectedBuilding = resolveBuilding(world, view.selectedBuildingId);
  const selectedBuildingIdleWorkerCount = selectedBuilding
    ? (() => {
        const humans = resolveAliveHumans(world, catalog ?? undefined);
        if (!selectedBuilding.completed) {
          return humans.filter((human) => {
            if (human.isJuvenile || human.faction) return false;
            return !world.buildings.some(
              (building) => !building.completed && building.occupants.includes(human.id),
            );
          }).length;
        }
        return humans.filter(
          (human) => !human.isJuvenile && human.homeBuildingId == null && !human.faction,
        ).length;
      })()
    : 0;
  const grazingPressure = getGrazingPressureReport(world);
  const pendingDiplomacy = world.pendingDiplomacyEvents ?? [];
  const pendingRaids = world.pendingRaidEvents ?? [];
  const pendingOutgoingRaids = world.pendingOutgoingRaidEvents ?? [];
  const frontierAlertCount = pendingRaids.length + pendingOutgoingRaids.length + pendingDiplomacy.length;
  const selectedVisitorCamp = view.selectedCampKey?.startsWith('visitor:')
    ? world.visitorGroups.find((g) => g.id === view.selectedCampKey!.slice(8)) ?? null
    : null;
  const hasInspectorSelection = !!(selectedEntity || selectedBuilding || selectedVisitorCamp);
  const canvasCursor = selectedBuildingType
    ? 'crosshair'
    : view.hoveredBuildingId
      ? 'pointer'
      : 'default';

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-stone-900 text-stone-100">
      <GameHeader
        world={world}
        population={villageStats.total}
        gameTitle={GAME_TITLE}
        gameVersion={GAME_VERSION}
        gamePhase={GAME_PHASE}
        gameSubtitle={GAME_SUBTITLE}
        foodAlert={foodAlert}
        muted={muted}
        volumePreset={volumePreset}
        hasSavedGame={hasSavedGame || hasSave()}
        speedOptions={SPEED_OPTIONS}
        onTogglePause={togglePause}
        onSetSpeed={setSpeed}
        onOpenTrade={() => {
          setActiveTab('progress');
          setProgressSubTab('trade');
        }}
        onSave={handleSave}
        onLoad={handleLoad}
        tutorialsEnabled={tutorialsEnabled}
        juiceEffectsEnabled={juiceEffectsEnabled}
        onToggleAutoSave={toggleAutoSave}
        onToggleTutorials={handleToggleTutorials}
        onToggleJuiceEffects={handleToggleJuiceEffects}
        onToggleMute={handleToggleMute}
        onVolumePreset={handleVolumePreset}
        onOpenGuide={() => {
          setActiveTab('more');
          setMoreSubTab('guide');
        }}
        onStartNewGame={startNewGame}
      />

      <AlertBar alerts={priorityAlerts} onAlert={handlePriorityAlert} />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — collapsible construction panel */}
        <aside
          className={`build-panel relative flex shrink-0 flex-col border-r border-stone-700 bg-stone-800/90 backdrop-blur transition-[width] duration-300 ease-in-out ${
            buildPanelOpen ? 'w-[15.5rem]' : 'w-12'
          }`}
        >
          <button
            onClick={() => setBuildPanelOpen((open) => !open)}
            className="build-panel-toggle absolute -right-3 top-5 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-stone-600 bg-stone-800 text-xs font-bold text-stone-300 shadow-lg transition-all hover:border-emerald-500/50 hover:bg-stone-700 hover:text-emerald-300"
            title={buildPanelOpen ? 'Collapse build panel (B)' : 'Expand build panel (B)'}
          >
            {buildPanelOpen ? '‹' : '›'}
          </button>

          {buildPanelOpen ? (
            <BuildCatalogPanel
              world={world}
              selected={selectedBuildingType}
              buildRotation={view.buildRotation}
              showGrid={view.showGrid}
              hotkeys={BUILDING_HOTKEYS}
              onSelect={selectBuildingType}
              onLocked={(type) => applyGameAction({ proto: 1, op: 'notifyBuildingLocked', type })}
              onCancel={cancelBuildMode}
              onToggleGrid={toggleGrid}
            />
          ) : (
            <div className="flex h-full flex-col items-center gap-2 py-3">
              <span
                className="text-base"
                title="Build catalog on the left · press B"
              >
                🏗️
              </span>

              <button
                onClick={toggleGrid}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition-all ${
                  view.showGrid
                    ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                    : 'border-stone-700 bg-stone-800/80 text-stone-500 hover:border-stone-600 hover:text-stone-300'
                }`}
                title="Toggle grid (G)"
              >
                ⊞
              </button>

              {selectedBuildingType && (
                <>
                  <div className="my-0.5 h-px w-7 bg-stone-700" />
                  <button
                    onClick={cancelBuildMode}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-800/50 bg-rose-950/40 text-[10px] text-rose-300 hover:bg-rose-900/50"
                    title={`Cancel ${BUILDING_CONFIGS[selectedBuildingType].label} (ESC)`}
                  >
                    ✕
                  </button>
                </>
              )}

              <button
                onClick={() => setBuildPanelOpen(true)}
                className="mt-auto flex h-8 w-8 items-center justify-center rounded-lg border border-stone-700 bg-stone-800/80 text-stone-400 hover:border-emerald-500/40 hover:text-emerald-300"
                title="Full build catalog (B)"
              >
                »
              </button>
            </div>
          )}
        </aside>

        {/* Center - Canvas */}
        <main className="relative bg-stone-900" style={{ flex: '1 1 0%', minHeight: 0, minWidth: 0 }}>
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
            onContextMenu={handleContextMenu}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', imageRendering: 'pixelated', cursor: canvasCursor, display: 'block' }}
          />

          {/* Build mode banner */}
          {selectedBuildingType && (
            <div className="pointer-events-none absolute bottom-20 left-1/2 z-20 -translate-x-1/2">
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/90 px-5 py-2.5 text-center shadow-2xl backdrop-blur">
                <p className="text-sm font-bold text-emerald-200">
                  Placing {BUILDING_CONFIGS[selectedBuildingType].label}
                </p>
                <p className="text-[10px] text-stone-400">
                  {isStripBuildType(selectedBuildingType)
                    ? selectedBuildingType === BuildingType.Road
                      ? <>Drag to draw — snaps to existing roads · ESC cancel</>
                      : <>Drag to draw — auto-corners at junctions · green = enclosed · ESC cancel</>
                    : <>Click to place · ESC to cancel</>}
                  {isRotatableBuildingType(selectedBuildingType) && !isStripBuildType(selectedBuildingType) && (
                    <> · <span className="text-emerald-400">R</span> rotate ({view.buildRotation === 90 ? '↕' : '↔'})</>
                  )}
                  {isStripBuildType(selectedBuildingType) && (
                    <> · drag sets ↔/↕ · <span className="text-emerald-400">R</span> locks axis</>
                  )}
                </p>
              </div>
            </div>
          )}
          
          {/* Floating notifications */}
          <div className="absolute left-4 top-4 flex max-w-xs flex-col gap-1">
            {world.notifications.slice(-3).map(n => (
              <div key={n.id} className={`rounded-lg border px-3 py-1.5 text-xs shadow-lg backdrop-blur transition-all animate-in slide-in-from-left ${
                n.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-200' :
                n.type === 'warning' ? 'border-amber-500/30 bg-amber-500/20 text-amber-200' :
                n.type === 'event' ? 'border-amber-500/30 bg-amber-500/20 text-amber-200' :
                'border-stone-600 bg-stone-800/90 text-stone-200'
              }`}>
                <strong>{n.title}</strong> {n.message}
              </div>
            ))}
          </div>

          {/* Raid defense — respond before march deadline (distance-scaled) */}
          {pendingOutgoingRaids.length > 0 && (
            <div className={`absolute left-1/2 ${pendingRaids.length > 0 ? 'top-44' : 'top-4'} z-20 w-full max-w-lg -translate-x-1/2 animate-in fade-in slide-in-from-top`}>
              {pendingOutgoingRaids.slice(0, 2).map((evt) => (
                <div key={evt.id} className="mb-2 rounded-xl border border-orange-500/50 bg-orange-950/95 p-3 shadow-xl backdrop-blur">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{evt.emoji}</span>
                    <div className="flex-1">
                      <h3 className="font-bold text-orange-100">{evt.title}</h3>
                      <p className="text-xs text-stone-300">{evt.description}</p>
                      <p className="mt-1 text-[9px] text-orange-300/90">
                        {evt.rivalResponse === 'payoff_offer'
                          ? `Offer: ${formatRaidLootSummary(raidEventLoot(evt))}`
                          : 'They chose to fight'}
                        {' · '}
                        <strong>{formatRaidDeadline(
                          { createdAtTick: evt.createdAtTick, expiresAtTick: evt.expiresAtTick } as import('./game/frontierCombat').RaidEvent,
                          world.tick,
                        )}</strong>
                        {evt.marchDistanceTiles > 0 && (
                          <span> · {evt.marchDistanceTiles} tiles march</span>
                        )}
                      </p>
                      <div className="mt-2 grid grid-cols-1 gap-1">
                        {evt.choices.map((choice) => (
                          <button
                            key={choice.id}
                            type="button"
                            onClick={() => {
                              playClickSound();
                              applyGameAction({
                                proto: 1,
                                op: 'respondToOutgoingRaidEvent',
                                eventId: evt.id,
                                choiceId: choice.id,
                              });
                            }}
                            className="rounded-lg bg-stone-900/80 px-2 py-1.5 text-left text-[10px] font-semibold text-stone-100 hover:bg-stone-800"
                            title={choice.hint}
                          >
                            {choice.label}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const rival = world.rivalSettlements.find((r) => r.id === evt.rivalId);
                          if (rival) focusCampOnMap('rival', rival.id, rival.campX, rival.campY, rival.buildingIds[0]);
                        }}
                        className="mt-1.5 text-[9px] font-semibold text-cyan-400 hover:text-cyan-300"
                      >
                        📍 Open rival camp
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {pendingRaids.length > 0 && (
            <div className="absolute left-1/2 top-4 z-20 w-full max-w-lg -translate-x-1/2 animate-in fade-in slide-in-from-top">
              {pendingRaids.slice(0, 2).map((evt) => {
                const raidRival = world.rivalSettlements.find((r) => r.id === evt.rivalId);
                const raidPreview = getCombatPreview(world, {
                  rival: raidRival,
                  attackerStrength: evt.attackerStrength,
                  incomingPayoffFood: evt.lootFood,
                });
                return (
                <div key={evt.id} className="mb-2 rounded-xl border border-rose-500/50 bg-rose-950/95 p-3 shadow-xl backdrop-blur">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{evt.emoji}</span>
                    <div className="flex-1">
                      <h3 className="font-bold text-rose-100">{evt.title}</h3>
                      <p className="text-xs text-stone-300">{evt.description}</p>
                      <p className="mt-1 text-[9px] text-rose-300/90">
                        At risk: {formatRaidLootSummary(raidEventLoot(evt)) || `${evt.lootFood}🍖`}
                        {' · '}
                        <strong>{formatRaidDeadline(evt, world.tick)}</strong>
                        {evt.marchDistanceTiles > 0 && (
                          <span> · {evt.marchDistanceTiles} tiles march</span>
                        )}
                      </p>
                      <div className="mt-2">
                        <CombatPreviewPanel
                          compact
                          preview={raidPreview}
                          title="If they raid you — defend or barricade"
                        />
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-1">
                        {evt.choices.map((choice) => {
                          const payoffBlocked = choice.id === 'payoff' && world.resources.food < evt.lootFood;
                          const barricadeBlocked = choice.id === 'barricade'
                            && (world.resources.wood < 20 || world.resources.stone < 10);
                          const defendBlocked = choice.id === 'defend'
                            && (!hasIronSpears(world) && !hasStoneSpears(world) || raidPreview.militiaStrength <= 0);
                          const blocked = payoffBlocked || barricadeBlocked || defendBlocked;
                          const blockReason = payoffBlocked
                            ? `Need ${evt.lootFood}🍖`
                            : barricadeBlocked
                              ? 'Need 20🪵 + 10🪨'
                              : defendBlocked
                                ? (!hasIronSpears(world) && !hasStoneSpears(world)
                                    ? 'Stone or iron spears required'
                                    : 'No militia strength')
                                : undefined;
                          return (
                          <button
                            key={choice.id}
                            type="button"
                            disabled={blocked}
                            onClick={() => {
                              if (blocked) return;
                              playClickSound();
                              applyGameAction({ proto: 1, op: 'respondToRaidEvent', eventId: evt.id, choiceId: choice.id });
                            }}
                            className="rounded-lg bg-stone-900/80 px-2 py-1.5 text-left text-[10px] font-semibold text-stone-100 hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
                            title={blockReason ?? choice.hint}
                          >
                            {choice.label}
                          </button>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const rival = world.rivalSettlements.find((r) => r.id === evt.rivalId);
                          if (rival) focusCampOnMap('rival', rival.id, rival.campX, rival.campY, rival.buildingIds[0]);
                        }}
                        className="mt-1.5 text-[9px] font-semibold text-cyan-400 hover:text-cyan-300"
                      >
                        📍 Watch war-band on map
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* Diplomacy event cards — player must respond */}
          {pendingDiplomacy.length > 0 && (
            <div className={`absolute left-1/2 ${pendingRaids.length > 0 || pendingOutgoingRaids.length > 0 ? 'top-44' : 'top-4'} z-10 w-full max-w-lg -translate-x-1/2 animate-in fade-in slide-in-from-top`}>
              {pendingDiplomacy.slice(0, 2).map((evt) => (
                <div key={evt.id} className="mb-2 rounded-xl border border-amber-500/40 bg-amber-950/90 p-3 shadow-xl backdrop-blur">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{evt.emoji}</span>
                    <div className="flex-1">
                      <h3 className="font-bold text-amber-100">{evt.title}</h3>
                      <p className="text-xs text-stone-300">{evt.description}</p>
                      <div className="mt-2 grid grid-cols-1 gap-1">
                        {evt.choices.map((choice) => {
                          const eligibility = getDiplomacyChoiceEligibility(world, evt, choice.id);
                          return (
                          <button
                            key={choice.id}
                            type="button"
                            disabled={!eligibility.ok}
                            onClick={() => {
                              if (!eligibility.ok) return;
                              playClickSound();
                              applyGameAction({ proto: 1, op: 'respondToDiplomacyEvent', eventId: evt.id, choiceId: choice.id });
                            }}
                            className="rounded-lg bg-stone-800/80 px-2 py-1.5 text-left text-[10px] font-semibold text-stone-100 hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
                            title={eligibility.blockReason ?? choice.hint}
                          >
                            {choice.label}
                          </button>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const rival = world.rivalSettlements.find((r) => r.id === evt.rivalId);
                          if (rival) focusCampOnMap('rival', rival.id, rival.campX, rival.campY, rival.buildingIds[0]);
                        }}
                        className="mt-1.5 text-[9px] font-semibold text-cyan-400 hover:text-cyan-300"
                      >
                        📍 Show camp on map
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Active event banner */}
          {world.activeEvent && pendingDiplomacy.length === 0 && pendingRaids.length === 0 && (
            <div className="absolute left-1/2 top-4 w-full max-w-md -translate-x-1/2 animate-in fade-in slide-in-from-top">
              <div className={`rounded-xl border p-3 shadow-xl backdrop-blur ${
                world.activeEvent.type === 'positive' ? 'border-emerald-500/30 bg-emerald-900/80' :
                world.activeEvent.type === 'negative' ? 'border-rose-500/30 bg-rose-900/80' :
                'border-stone-500/30 bg-stone-800/90'
              }`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{world.activeEvent.emoji}</span>
                  <div>
                    <h3 className="font-bold text-white">{world.activeEvent.title}</h3>
                    <p className="text-xs text-stone-300">{world.activeEvent.description}</p>
                    <p className={`mt-1 text-xs font-bold ${
                      world.activeEvent.type === 'positive' ? 'text-emerald-400' :
                      world.activeEvent.type === 'negative' ? 'text-rose-400' : 'text-amber-400'
                    }`}>{world.activeEvent.effect}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* First-night shelter warning */}
          {showFirstNightWarning && (
            <div className="absolute left-1/2 top-16 z-20 w-full max-w-md -translate-x-1/2 animate-in fade-in slide-in-from-top">
              <div className="rounded-xl border border-amber-500/40 bg-amber-950/90 p-3 shadow-xl backdrop-blur">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{isFirstGameDay && world.tick < NIGHT_START ? '🌅' : '🌙'}</span>
                  <div className="flex-1">
                    <h3 className="font-bold text-amber-200">
                      {isFirstGameDay && world.tick < NIGHT_START ? 'Sunset is approaching' : 'Your pioneers need shelter'}
                    </h3>
                    <p className="text-xs text-stone-300">
                      {firstNightWarningMessage}
                    </p>
                    <button
                      onClick={() => {
                        setFirstNightWarningDismissed(true);
                        saveFirstNightWarningDismissed(true);
                      }}
                      className="mt-2 rounded-lg bg-amber-700/60 px-3 py-1 text-[10px] font-semibold text-amber-100 hover:bg-amber-600/60"
                    >
                      Got it
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Big News banner */}
          {activeBigNews.length > 0 && (
            <BigNewsBanner
              news={activeBigNews}
              onDismiss={() => loopRef.current?.mutateWorld((prev) => {
                prev.bigNews = prev.bigNews.map(n => ({ ...n, dismissed: true }));
              })}
            />
          )}

          {contextualTip && tutorialsEnabled && !showTutorial && (
            <ContextualTutorialCard
              tip={contextualTip}
              onDismiss={acknowledgeContextualTip}
              onDisableAll={disableAllTutorials}
              onAction={(action) => {
                acknowledgeContextualTip();
                handleHintAction(action);
              }}
            />
          )}

          {/* Minimap */}
          <MiniMap worldRef={worldRef} viewRef={viewRef} />

          {/* Zoom controls */}
          <div className="absolute bottom-4 right-4 z-20 flex flex-col items-stretch gap-0.5 rounded-lg border border-stone-600 bg-stone-800/85 p-1 shadow-xl backdrop-blur">
            <button
              type="button"
              onClick={() => applyZoom(CAMERA_ZOOM_STEP_IN)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-lg font-bold text-stone-200 hover:bg-stone-700/80 hover:text-white"
              title="Zoom in (+)"
              aria-label="Zoom in"
            >
              +
            </button>
            <div
              className="px-1 text-center text-[9px] font-semibold tabular-nums text-stone-400"
              title="Current zoom"
            >
              {Math.round(clampCameraZoom(view.camera.targetZoom) * 100)}%
            </div>
            <button
              type="button"
              onClick={() => applyZoom(CAMERA_ZOOM_STEP_OUT)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-lg font-bold text-stone-200 hover:bg-stone-700/80 hover:text-white"
              title="Zoom out (-)"
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              onClick={resetZoom}
              className="flex h-7 w-8 items-center justify-center rounded-md text-[11px] text-stone-400 hover:bg-stone-700/80 hover:text-stone-200"
              title="Reset zoom"
              aria-label="Reset zoom"
            >
              ⟲
            </button>
          </div>

          {/* Save toast */}
          {saveToast && (
            <div className={`absolute bottom-16 left-1/2 z-30 -translate-x-1/2 rounded-lg border px-4 py-2 text-sm font-semibold shadow-2xl backdrop-blur ${
              saveToast.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-200'
                : 'border-rose-500/40 bg-rose-950/90 text-rose-200'
            }`}>
              {saveToast.type === 'success' ? '💾 ' : '⚠️ '}{saveToast.message}
            </div>
          )}

          {/* Pause HUD — map stays clickable for inspect/build while frozen */}
          {world.paused && !showTutorial && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-amber-500/40 bg-stone-900/85 px-4 py-1 text-[11px] font-bold text-amber-200 shadow-lg backdrop-blur">
              ⏸ Paused — Space to resume · ☰ menu to save
            </div>
          )}

          {/* Quick-start tutorial */}
          {showTutorial && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 backdrop-blur-sm">
              <div className="mx-4 w-full max-w-sm rounded-2xl border border-stone-600 bg-stone-800 p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-white">Quick start</h2>
                    <p className="text-[11px] text-stone-400">Step {tutorialStep + 1} of {QUICK_START_STEPS.length}</p>
                  </div>
                  <button
                    type="button"
                    onClick={finishTutorial}
                    className="shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold text-stone-400 hover:bg-stone-700 hover:text-stone-200"
                  >
                    Skip →
                  </button>
                </div>

                <div className="mb-4 rounded-xl bg-stone-900/60 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-2xl">{QUICK_START_STEPS[tutorialStep].icon}</span>
                    <h3 className="text-base font-bold text-emerald-300">{QUICK_START_STEPS[tutorialStep].title}</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-stone-300">{QUICK_START_STEPS[tutorialStep].detail}</p>
                </div>

                <div className="mb-4 flex justify-center gap-1.5">
                  {QUICK_START_STEPS.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 rounded-full transition-all ${i === tutorialStep ? 'w-6 bg-emerald-500' : 'w-1.5 bg-stone-600'}`}
                    />
                  ))}
                </div>

                <div className="flex gap-2">
                  {tutorialStep > 0 && (
                    <button
                      onClick={() => setTutorialStep((s) => s - 1)}
                      className="flex-1 rounded-lg border border-stone-600 py-2.5 text-sm font-semibold text-stone-300 hover:border-stone-500"
                    >
                      Back
                    </button>
                  )}
                  {tutorialStep < QUICK_START_STEPS.length - 1 ? (
                    <button
                      onClick={() => setTutorialStep((s) => s + 1)}
                      className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
                    >
                      Next →
                    </button>
                  ) : (
                    <button
                      onClick={finishTutorial}
                      className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
                    >
                      Start playing
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={disableAllTutorials}
                  className="mt-3 w-full text-center text-[10px] font-semibold text-stone-500 hover:text-stone-300"
                >
                  Don&apos;t show tutorials again
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Right sidebar */}
        <aside className="flex w-[18.5rem] flex-col border-l border-stone-700 bg-stone-800/80 backdrop-blur">
          {hasInspectorSelection && (
          <div className="shrink-0 border-b border-stone-700 bg-stone-900/50">
            <div className="flex items-center justify-between px-3 py-1.5">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Selected</h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={clearSelection}
                  className="rounded px-1.5 py-0.5 text-[10px] text-stone-500 hover:bg-stone-700 hover:text-stone-200"
                  title="Clear selection (ESC)"
                >
                  ✕
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorCollapsed((v) => !v)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-stone-500 hover:bg-stone-700 hover:text-stone-200"
                  title={inspectorCollapsed ? 'Expand' : 'Collapse'}
                >
                  {inspectorCollapsed ? '▾' : '▴'}
                </button>
              </div>
            </div>
            {!inspectorCollapsed && (
            <div className="inspector-panel px-3 pb-3">
            {selectedVisitorCamp ? (
              <VisitorCampPanel
                group={selectedVisitorCamp}
                state={world}
                talkMeta={getVisitorLeaderTalkMeta(selectedVisitorCamp)}
                onTalkLeader={() => {
                  playClickSound();
                  applyGameAction({ proto: 1, op: 'talkToVisitorLeader', groupId: selectedVisitorCamp.id });
                }}
                onTrade={(action) => {
                  playClickSound();
                  applyGameAction({ proto: 1, op: 'tradeWithVisitors', groupId: selectedVisitorCamp.id, action });
                }}
                onRefugeeChoice={(choice) => {
                  playClickSound();
                  applyGameAction({ proto: 1, op: 'negotiateRefugees', groupId: selectedVisitorCamp.id, choice });
                }}
                onFocusCamp={() => focusCampOnMap('visitor', selectedVisitorCamp.id, selectedVisitorCamp.campX, selectedVisitorCamp.campY)}
              />
            ) : selectedEntity ? (
              <SelectedEntityPanel
                entity={selectedEntity}
                allEntities={catalog?.getAlive() ?? world.entities}
                state={world}
                onMoveOut={() => {
                  playClickSound();
                  const entityId = selectedEntity.id;
                  applyGameAction({ proto: 1, op: 'moveOutOfFamilyHome', humanId: entityId });
                }}
                onTame={(humanId: number) => {
                  playClickSound();
                  const entityId = selectedEntity.id;
                  applyGameAction({ proto: 1, op: 'tameEntity', entityId, humanId });
                }}
                onOpenVisitorCamp={(group) => focusCampOnMap('visitor', group.id, group.campX, group.campY)}
              />
            ) : selectedBuilding ? (
              <SelectedBuildingPanel
                building={selectedBuilding}
                state={world}
                onAssign={() => applyGameAction({ proto: 1, op: 'assignWorker', buildingId: selectedBuilding.id })}
                onAssignWorker={(humanId: number) => {
                  playClickSound();
                  applyGameAction({ proto: 1, op: 'assignWorker', buildingId: selectedBuilding.id, humanId });
                }}
                assignableWorkers={listAssignableWorkersForBuilding(world, selectedBuilding.id)}
                onRemove={(humanId: number) => applyGameAction({ proto: 1, op: 'removeWorker', buildingId: selectedBuilding.id, humanId })}
                onRepair={() => applyGameAction({ proto: 1, op: 'repairBuilding', buildingId: selectedBuilding.id })}
                onUpgrade={() => applyGameAction({ proto: 1, op: 'upgradeBuilding', buildingId: selectedBuilding.id })}
                onDemolish={() => applyGameAction({ proto: 1, op: 'demolishBuilding', buildingId: selectedBuilding.id })}
                onSetWorkshopRecipe={(recipeId: string) => {
                  playClickSound();
                  applyGameAction({ proto: 1, op: 'setWorkshopRecipe', buildingId: selectedBuilding.id, recipeId });
                }}
                onQueueForge={(orderId) => {
                  playClickSound();
                  applyGameAction({ proto: 1, op: 'queueForgeOrder', buildingId: selectedBuilding.id, orderId });
                }}
                onTownHallAction={(cmd) => {
                  playClickSound();
                  applyGameAction(cmd);
                }}
                idleWorkers={selectedBuildingIdleWorkerCount}
                canAssignWorker={canAssignWorkerToBuilding(world, selectedBuilding.id)}
                onDiplomacyAction={(cmd) => {
                  playClickSound();
                  applyGameAction(cmd);
                }}
                onFocusCamp={(rival) => focusCampOnMap('rival', rival.id, rival.campX, rival.campY, rival.buildingIds[0])}
              />
            ) : null}
            </div>
            )}
            {inspectorCollapsed && (
              <p className="truncate px-3 pb-2 text-[9px] text-stone-500">
                {selectedVisitorCamp?.name ?? selectedBuilding?.type ?? selectedEntity?.name ?? 'Selected'}
              </p>
            )}
          </div>
          )}

          {/* Tabs */}
          <div className="sidebar-tabs shrink-0">
            {SIDEBAR_TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`sidebar-tab relative ${activeTab === tab.id ? 'sidebar-tab--active text-emerald-400' : 'text-stone-500 hover:text-stone-300'}`}
                title={tab.hint}
              >
                <span className="text-lg leading-none">{tab.icon}</span>
                <span className="text-[10px] font-bold leading-tight sm:text-[11px]">{tab.label}</span>
                {tab.id === 'frontier' && frontierAlertCount > 0 && (
                  <span className="sidebar-tab-badge">{frontierAlertCount}</span>
                )}
                {tab.id === 'progress' && progressTabAlert && (
                  tradeReadyCount > 0
                    ? <span className="sidebar-tab-badge">{tradeReadyCount}</span>
                    : <span className="sidebar-tab-dot" title="Research in progress" />
                )}
              </button>
            ))}
          </div>

          <div ref={sidebarContentRef} className="flex-1 overflow-y-auto p-3">
            {/* Village Tab */}
            {activeTab === 'village' && (
              <div className="space-y-2.5">
                <FocusPanel
                  state={world}
                  buildings={world.buildings}
                  onOpenGoals={() => { setActiveTab('progress'); setProgressSubTab('goals'); }}
                  onHintAction={handleHintAction}
                />
                <CollapsibleSection
                  icon="👥"
                  title="Population"
                  subtitle={`${villageStats.total}/${world.maxHumanPopulation} cap · 🛏️ ${villageStats.beds} beds · ${villageStats.working} working · ⭐${world.villageReputation}`}
                  accent="emerald"
                  defaultOpen={false}
                >
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex items-end justify-between gap-1">
                        <p className="text-2xl font-black leading-none text-emerald-300">
                          {villageStats.total}
                          <span className="text-sm font-bold text-stone-500"> / {world.maxHumanPopulation}</span>
                        </p>
                        <p className="text-[9px] text-stone-500">immigration cap</p>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-600">
                        <div className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${Math.min(100, (villageStats.total / Math.max(1, world.maxHumanPopulation)) * 100)}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-end justify-between gap-1">
                        <p className="text-2xl font-black leading-none text-sky-300">
                          {villageStats.beds}
                          <span className="text-sm font-bold text-stone-500"> beds</span>
                        </p>
                        <p className="text-[9px] text-stone-500" title="Empty housing slots for assignment">
                          {villageStats.openBeds} open
                        </p>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-600">
                        <div className="h-full rounded-full bg-sky-500 transition-all"
                          style={{ width: `${Math.min(100, (villageStats.total / Math.max(1, villageStats.beds)) * 100)}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="mb-2 grid grid-cols-4 gap-1 text-[9px]">
                    <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
                      <div className="font-bold text-sky-300">{villageStats.working}</div>
                      <div className="text-stone-500">working</div>
                    </div>
                    <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
                      <div className="font-bold text-amber-300">{villageStats.idle}</div>
                      <div className="text-stone-500">idle</div>
                    </div>
                    <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
                      <div className="font-bold text-slate-300">{villageStats.imprisoned}</div>
                      <div className="text-stone-500">jailed</div>
                    </div>
                    <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
                      <div className="font-bold text-pink-300">{villageStats.children}</div>
                      <div className="text-stone-500">children</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                    <StatBadge label="Adults" value={villageStats.adults} icon="👤" />
                    <StatBadge label="Reputation" value={world.villageReputation} icon="⭐" />
                    <StatBadge label="Buildings" value={world.buildings.filter(b => b.completed).length} icon="🏗️" />
                    <StatBadge label="Techs" value={world.unlockedTechs.length} icon="🔬" />
                  </div>
                  <button
                    onClick={() => applyGameAction({ proto: 1, op: 'recruitSettler' })}
                    disabled={villageStats.total >= world.maxHumanPopulation || world.resources.food < 30 || world.resources.gold < 20}
                    title={
                      villageStats.total >= world.maxHumanPopulation
                        ? 'Build more houses to increase population cap'
                        : world.resources.food < 30 || world.resources.gold < 20
                          ? 'Need 30 food and 20 gold'
                          : 'Recruit a new settler'
                    }
                    className="mt-2 w-full rounded-lg bg-emerald-600 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-stone-600 transition-all"
                  >
                    📯 Recruit Settler (30🍖 20💰)
                  </button>
                </CollapsibleSection>

                <CollapsibleSection icon="👑" title="Village leadership" accent="amber" defaultOpen={false}>
                  <VillageLeadershipPanel state={world} />
                </CollapsibleSection>

                <CollapsibleSection
                  icon="👨‍👩‍👧"
                  title="Families"
                  subtitle="Household units"
                  accent="stone"
                  defaultOpen={false}
                >
                  <PopulationPanel state={world} onFocusCitizen={focusCitizenOnMap} />
                </CollapsibleSection>

                <CollapsibleSection
                  icon="⚔️"
                  title="Armament"
                  subtitle={getHumanArmamentLabel(world) ?? 'Research Defense tech'}
                  accent="orange"
                  defaultOpen={false}
                >
                  <p className="mb-2 text-[9px] leading-relaxed text-stone-500">
                    Stone/wood gear unlocks from Defense research. Iron needs research <strong className="text-stone-400">and</strong> a forge run at a staffed Blacksmith.
                  </p>
                  {world.villageForge.activeOrder && (
                    <p className="mb-2 rounded bg-orange-950/40 px-2 py-1 text-[9px] text-orange-200">
                      🔨 Forging {getForgeOrder(world.villageForge.activeOrder)?.label ?? 'gear'} — {Math.round(world.villageForge.progress)}%
                    </p>
                  )}
                  <div className="space-y-1">
                    {getArmamentSteps(world).map((step) => {
                      const smith = world.buildings.find(
                        (b) => b.completed && b.type === BuildingType.Blacksmith,
                      );
                      const showForgeGo = !step.done
                        && ['iron_spears', 'iron_shields', 'guard_halberds', 'wall_plates', 'iron_pickaxes'].includes(step.id)
                        && smith;
                      return (
                        <div key={step.id} className={`rounded px-2 py-1 text-[9px] ${step.done ? 'bg-emerald-900/30 text-emerald-300' : 'bg-stone-800/50 text-stone-400'}`}>
                          <span>{step.done ? '✓' : '○'} {step.label}</span>
                          {!step.done && <p className="mt-0.5 text-[8px] text-stone-500">{step.detail}</p>}
                          {showForgeGo && (
                            <button
                              type="button"
                              onClick={() => focusBuildingOnMap(
                                smith.id,
                                smith.x + smith.width / 2,
                                smith.y + smith.height / 2,
                              )}
                              className="mt-1 rounded bg-orange-900/50 px-1.5 py-0.5 text-[8px] font-bold text-orange-200 hover:bg-orange-800/60"
                            >
                              Open Blacksmith →
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleSection>

                <details className="rounded-xl border border-stone-600/40 bg-stone-800/30 px-3 py-2">
                  <summary className="cursor-pointer text-[10px] font-semibold text-stone-400 hover:text-stone-300">
                    ⭐ How reputation grows
                  </summary>
                  <p className="mt-2 text-[9px] leading-relaxed text-stone-500">
                    Buildings (+2), festivals (+10), research (+3), staffed Hospital (+2) &amp; Town Hall (+3),
                    {' '}
                    {world.unlockedTechs.includes('architecture_2') || world.researchNodes.some((n) => n.id === 'architecture_2' && n.researched)
                      ? 'completed roads (+rep with Urban Planning)'
                      : 'roads (+rep after Urban Planning research)'}
                    .
                  </p>
                </details>
              </div>
            )}

            {activeTab === 'frontier' && (
              <FrontierPanel
                state={world}
                pendingRaidCount={pendingRaids.length}
                pendingOutgoingRaidCount={pendingOutgoingRaids.length}
                pendingDiplomacyCount={pendingDiplomacy.length}
                onFocusVisitor={(id, x, y) => focusCampOnMap('visitor', id, x, y)}
                onFocusRival={(id, x, y, buildingId) => focusCampOnMap('rival', id, x, y, buildingId)}
                onLaunchRaid={(rivalId) => {
                  playClickSound();
                  applyGameAction({ proto: 1, op: 'launchRaidOnRival', rivalId });
                }}
              />
            )}

            {/* Nature Tab */}
            {activeTab === 'nature' && (
              <div className="space-y-3">
                {grazingPressure.level !== 'stable' && (
                  <div className={`rounded-xl border p-3 ${
                    grazingPressure.level === 'critical'
                      ? 'border-rose-500/40 bg-rose-950/40'
                      : 'border-amber-500/40 bg-amber-950/30'
                  }`}>
                    <h3 className={`mb-1 text-xs font-bold ${
                      grazingPressure.level === 'critical' ? 'text-rose-300' : 'text-amber-300'
                    }`}>
                      {grazingPressure.level === 'critical' ? '⚠️ Overgrazing warning' : '🦌 Grazing pressure rising'}
                    </h3>
                    <p className="text-[10px] leading-relaxed text-stone-300">{grazingPressure.headline}</p>
                    <p className="mt-1.5 text-[9px] text-stone-400">{grazingPressure.advice}</p>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-[9px] text-stone-500">
                      <span>🦌 Deer: {grazingPressure.deerCount}</span>
                      <span>🌿 Grass: {grazingPressure.grassCount}</span>
                      <span>Demand/day: {grazingPressure.grazingDemandPerDay}</span>
                      <span>Recovery/day: {grazingPressure.grassRecoveryPerDay}</span>
                    </div>
                  </div>
                )}

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-3 text-xs font-bold text-stone-300">Ecosystem Health</h3>
                  
                  <div className="mb-3 space-y-2">
                    <div>
                      <div className="mb-1 flex justify-between text-[10px]">
                        <span className="text-stone-400">Health</span>
                        <strong className={world.ecosystemHealth > 60 ? 'text-emerald-400' : world.ecosystemHealth > 30 ? 'text-amber-400' : 'text-rose-400'}>
                          {Math.round(world.ecosystemHealth)}%
                        </strong>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-stone-600">
                        <div className={`h-full rounded-full transition-all ${
                          world.ecosystemHealth > 60 ? 'bg-emerald-500' : world.ecosystemHealth > 30 ? 'bg-amber-500' : 'bg-rose-500'
                        }`} style={{ width: `${Math.max(0, world.ecosystemHealth)}%` }} />
                      </div>
                    </div>
                    
                    <div>
                      <div className="mb-1 flex justify-between text-[10px]">
                        <span className="text-stone-400">Pollution</span>
                        <strong className="text-rose-400">{Math.round(world.pollutionLevel)}%</strong>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-stone-600">
                        <div className="h-full rounded-full bg-rose-500 transition-all" style={{ width: `${Math.max(0, world.pollutionLevel)}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded bg-stone-600/30 p-2">
                      <div className="text-stone-500">Biodiversity</div>
                      <strong className="text-lg text-white">{world.biodiversityIndex.toFixed(2)}</strong>
                    </div>
                    <div className="rounded bg-stone-600/30 p-2">
                      <div className="text-stone-500">Weather</div>
                      <strong className="text-lg text-white">{world.weather}</strong>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-stone-600/40 bg-stone-800/40 p-2.5">
                    <h4 className="mb-1 text-[9px] font-bold uppercase tracking-wider text-stone-400">Why this score</h4>
                    <p className="mb-2 text-[9px] leading-relaxed text-stone-400">{ecoBreakdown.summary}</p>
                    <div className="space-y-1 text-[9px]">
                      {ecoBreakdown.lines.map((line) => (
                        <div key={line.label} className="flex items-start justify-between gap-2">
                          <span className="text-stone-500">{line.label}</span>
                          <span className="text-right">
                            <strong className={line.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {line.delta >= 0 ? '+' : ''}{Math.round(line.delta)}
                            </strong>
                            <span className="block text-[8px] text-stone-600">{line.detail}</span>
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t border-stone-700/60 pt-1 font-bold">
                        <span className="text-stone-400">Health</span>
                        <span className="text-stone-200">{Math.round(ecoBreakdown.health)}%</span>
                      </div>
                    </div>
                    <p className="mt-2 text-[8px] text-stone-600">
                      Growing towns shed pristine wilderness — there is no player tree planting yet. Early food-chain balance still matters for hunting.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-stone-300">Season Effects</h3>
                  <div className="space-y-1 text-[10px] text-stone-400">
                    <p>{SEASON_ICONS[world.season]} <strong className="text-stone-200 capitalize">{world.season}</strong> — Grass growth: {world.season === Season.Spring ? 'Fast' : world.season === Season.Winter ? 'Minimal' : 'Normal'}</p>
                    <p>🌡️ Reproduction: {world.season === Season.Spring ? 'High' : world.season === Season.Winter ? 'Low' : 'Normal'}</p>
                    {world.weather !== WeatherType.Clear && (
                      <p>{WEATHER_ICONS[world.weather]} <strong className="text-stone-200">{world.weather}</strong> — Affects farming and movement</p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-stone-300">Wildlife Populations</h3>
                  <p className="mb-2 text-[9px] text-stone-500">Healthy numbers keep the food chain balanced.</p>
                  <div className="space-y-1 text-[10px]">
                    <WildlifeBar label="Rabbits" count={world.wildlifeCounts.rabbits} max={120} color="bg-amber-600" icon="🐰" />
                    <WildlifeBar label="Deer" count={world.wildlifeCounts.deer} max={60} color="bg-orange-700" icon="🦌" />
                    <WildlifeBar label="Wolves" count={world.wildlifeCounts.wolves} max={25} color="bg-stone-500" icon="🐺" />
                    <WildlifeBar label="Foxes" count={world.wildlifeCounts.foxes} max={35} color="bg-orange-600" icon="🦊" />
                    <WildlifeBar label="Moon Howlers" count={world.wildlifeCounts.werewolves} max={10} color="bg-violet-700" icon="🌝" />
                    <WildlifeBar label="Wildkin" count={world.wildlifeCounts.wildkin} max={15} color="bg-lime-700" icon="🦌" />
                    <WildlifeBar label="Trees" count={world.wildlifeCounts.trees} max={200} color="bg-green-700" icon="🌲" />
                    <WildlifeBar label="Grass" count={world.wildlifeCounts.grass} max={500} color="bg-green-500" icon="🌿" />
                  </div>
                </div>

                {world.disasters.length > 0 && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-900/30 p-3">
                    <h3 className="mb-2 text-xs font-bold text-rose-400">Active Disasters</h3>
                    {world.disasters.map((d, i) => (
                      <div key={i} className="mb-1 text-[10px] text-rose-300">
                        ⚠️ {d.type.charAt(0).toUpperCase() + d.type.slice(1)} — {Math.round((1 - d.progress / d.duration) * 100)}% remaining
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Progress — research, trade, goals */}
            {activeTab === 'progress' && (
              <div className="space-y-3">
                <div className="progress-subnav">
                  {(['research', 'trade', 'goals'] as ProgressSubTab[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="relative"
                      data-active={progressSubTab === id}
                      onClick={() => setProgressSubTab(id)}
                    >
                      {id === 'research' ? '🔬 Research' : id === 'trade' ? '🤝 Trade' : '🎯 Goals'}
                      {id === 'research' && world.activeResearch && (
                        <span className="progress-subnav-dot" title="Research in progress" />
                      )}
                      {id === 'trade' && tradeReadyCount > 0 && (
                        <span className="progress-subnav-badge">{tradeReadyCount}</span>
                      )}
                    </button>
                  ))}
                </div>

            {progressSubTab === 'research' && (
              <div className="space-y-3">
                {world.activeResearch && (
                  <div className="rounded-xl border border-amber-600/30 bg-amber-900/30 p-3">
                    <h3 className="mb-1 text-xs font-bold text-amber-400">Researching</h3>
                    {(() => {
                      const node = world.researchNodes.find(n => n.id === world.activeResearch);
                      return node ? (
                        <div>
                          <div className="text-sm font-bold text-white">{node.name}</div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-600">
                            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${world.researchProgress}%` }} />
                          </div>
                          <div className="mt-1 text-[10px] text-amber-300">{Math.round(world.researchProgress)}% complete</div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}

                {Object.values(ResearchType).map(rType => {
                  const nodes = world.researchNodes.filter(n => n.type === rType);
                  if (nodes.length === 0) return null;
                  const color = RESEARCH_COLORS[rType as ResearchType];
                  
                  return (
                    <div key={rType} className="rounded-xl bg-stone-700/50 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                        <h3 className="text-xs font-bold capitalize" style={{ color }}>{rType}</h3>
                      </div>
                      <div className="space-y-1.5">
                        {nodes.map(node => {
                          const canResearch = node.unlocked && !node.researched && !world.activeResearch &&
                            world.resources.wood >= node.cost.wood &&
                            world.resources.stone >= node.cost.stone &&
                            world.resources.gold >= node.cost.gold;
                          
                          return (
                            <div key={node.id} className={`rounded-lg border p-2 text-[10px] ${
                              node.researched ? 'border-emerald-500/30 bg-emerald-500/10' :
                              node.unlocked ? 'border-stone-600 bg-stone-600/20' :
                              'border-stone-700 bg-stone-800 opacity-50'
                            }`}>
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-stone-200">{node.name}</span>
                                <span className="text-[8px] text-stone-500">T{node.tier}</span>
                              </div>
                              <p className="mt-0.5 text-stone-400">{node.description}</p>
                              {!node.researched && (
                                <>
                                  <div className="mt-1 text-stone-500">
                                    Cost: {node.cost.wood > 0 && `${node.cost.wood}w `}
                                    {node.cost.stone > 0 && `${node.cost.stone}s `}
                                    {node.cost.gold > 0 && `${node.cost.gold}g`}
                                  </div>
                                  {node.unlocked && (
                                    <button onClick={() => applyGameAction({ proto: 1, op: 'startResearch', researchId: node.id })}
                                      disabled={!canResearch}
                                      className={`mt-1 w-full rounded py-1 text-[9px] font-bold transition-all ${
                                        canResearch ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-stone-600 text-stone-400 cursor-not-allowed'
                                      }`}>
                                      {world.activeResearch === node.id ? 'Researching...' : 'Research'}
                                    </button>
                                  )}
                                </>
                              )}
                              {node.researched && <span className="text-emerald-400">✓ Researched</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {progressSubTab === 'trade' && (
              <div className="space-y-3">
                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-stone-300">Trade Routes</h3>
                  <p className="mb-2 text-[10px] text-stone-400">Reputation: <strong className="text-emerald-400">{world.villageReputation}</strong> / 100</p>
                  
                  <div className="space-y-2">
                    {world.tradeRoutes.map(route => (
                      <div key={route.id} className={`rounded-lg border p-2 text-[10px] ${
                        route.active ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-stone-600 bg-stone-600/20'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-stone-200">{route.targetName}</span>
                          <span className={route.active ? 'text-emerald-400' : 'text-stone-500'}>
                            {route.active ? 'Active' : `Need ${route.reputationRequired} rep`}
                          </span>
                        </div>
                        <p className="text-stone-400">Receive: +{route.resourcesReceived.gold > 0 ? `${route.resourcesReceived.gold}g` : `${route.resourcesReceived.stone}s`} / cycle</p>
                        {!route.active && (
                          <button onClick={() => applyGameAction({ proto: 1, op: 'establishTradeRoute', routeId: route.id })}
                            disabled={world.villageReputation < route.reputationRequired}
                            className={`mt-1 w-full rounded py-1 text-[9px] font-bold transition-all ${
                              world.villageReputation >= route.reputationRequired ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-stone-600 text-stone-400 cursor-not-allowed'
                            }`}>
                            Establish Route
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {progressSubTab === 'goals' && (
              <div className="space-y-3">
                {world.victoryAchieved && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-center">
                    <span className="text-2xl">🏆</span>
                    <h3 className="text-sm font-bold text-amber-300">Victory Achieved!</h3>
                    <p className="text-[10px] text-amber-200/80">
                      {world.victories.find(v => v.path === world.victoryAchieved)?.label}
                    </p>
                  </div>
                )}
                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-stone-300">Victory Paths</h3>
                  <p className="mb-3 text-[10px] text-stone-400 leading-relaxed">
                    Pursue any of four victory legacies — eco, city, trade, or harmony with the wild.
                  </p>
                  <div className="space-y-2">
                    {world.victories.filter((v) => ACTIVE_VICTORY_PATHS.includes(v.path as typeof ACTIVE_VICTORY_PATHS[number])).map(v => (
                      <div key={v.path} className={`rounded-lg border p-2 ${
                        v.achieved ? 'border-amber-500/40 bg-amber-500/10' : 'border-stone-600 bg-stone-600/20'
                      }`}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-stone-200">{v.label}</span>
                          <span className={`text-[9px] font-bold ${v.achieved ? 'text-amber-400' : 'text-stone-500'}`}>
                            {v.achieved ? '✓ Won' : `${v.progress}%`}
                          </span>
                        </div>
                        <p className="mb-1.5 text-[9px] text-stone-400">{v.description}</p>
                        <div className="h-1.5 overflow-hidden rounded-full bg-stone-700">
                          <div
                            className={`h-full rounded-full transition-all ${v.achieved ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${v.progress}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {COMING_SOON_VICTORY_PATHS.length > 0 && (
                    <details className="mt-3 rounded-lg border border-stone-600/60 bg-stone-800/40">
                      <summary className="cursor-pointer px-2 py-1.5 text-[10px] font-semibold text-stone-400 hover:text-stone-300">
                        Coming later
                      </summary>
                      <div className="space-y-2 border-t border-stone-600/40 p-2">
                        {world.victories.filter((v) => COMING_SOON_VICTORY_PATHS.includes(v.path as typeof COMING_SOON_VICTORY_PATHS[number])).map(v => (
                          <div key={v.path} className="rounded-lg border border-stone-700 bg-stone-700/20 p-2 opacity-70">
                            <div className="mb-1 flex items-center justify-between">
                              <span className="text-[10px] font-bold text-stone-300">{v.label}</span>
                              <span className="text-[9px] font-bold text-stone-500">Soon</span>
                            </div>
                            <p className="text-[9px] text-stone-500">{v.description}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
                <CollapsibleSection icon="🏆" title="Challenges" accent="amber" defaultOpen>
                  <ChallengesPanel state={world} />
                </CollapsibleSection>
                <StatisticsPanel state={world} />
              </div>
            )}
              </div>
            )}

            {/* Log Tab */}
            {activeTab === 'log' && (
              <div>
                <div className="progress-subnav mb-2">
                  {(['chronicle', 'combat'] as LogSubTab[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      data-active={logSubTab === id}
                      onClick={() => setLogSubTab(id)}
                    >
                      {id === 'chronicle' ? '📜 Chronicle' : '⚔️ Combat'}
                    </button>
                  ))}
                </div>
                {logSubTab === 'chronicle' ? (
                  <>
                    <h3 className="mb-2 text-xs font-bold text-amber-300">Village Chronicle</h3>
                    <p className="mb-2 text-[9px] leading-relaxed text-stone-500">
                      Full history of your settlement — births, marriages, scandals, research, disasters, and more.
                      Scroll to read older entries, filter by type, or <strong className="text-stone-400">Copy log</strong> to save it in a note. Saved with your game.
                    </p>
                    <EventLogPanel
                      events={world.eventLog}
                      meta={{
                        villageName: world.villageName,
                        year: world.year,
                        day: world.dayInYear,
                        tick: world.tick,
                        population: world.humanPopulation,
                      }}
                    />
                  </>
                ) : (
                  <>
                    <h3 className="mb-2 text-xs font-bold text-rose-300">Combat Chronicle</h3>
                    <p className="mb-2 text-[9px] leading-relaxed text-stone-500">
                      Incoming raids, proactive strikes, counter-raids, militia battles, and barricades — dedicated combat log with export.
                    </p>
                    <CombatLogPanel
                      events={world.eventLog}
                      meta={{
                        villageName: world.villageName,
                        year: world.year,
                        day: world.dayInYear,
                        tick: world.tick,
                        population: world.humanPopulation,
                      }}
                    />
                  </>
                )}
              </div>
            )}

            {/* More — guide & roadmap */}
            {activeTab === 'more' && (
              <div className="space-y-3">
                <div className="progress-subnav">
                  {(['guide', 'roadmap'] as MoreSubTab[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      data-active={moreSubTab === id}
                      onClick={() => setMoreSubTab(id)}
                    >
                      {id === 'guide' ? '❓ Guide' : '🗺️ Roadmap'}
                    </button>
                  ))}
                </div>

            {moreSubTab === 'roadmap' && <RoadmapPanel />}

            {moreSubTab === 'guide' && (
              <div className="space-y-3 text-[10px] text-stone-300">
                <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-3">
                  <h3 className="mb-1 text-xs font-bold text-amber-300">⚠️ {GAME_PHASE} · v{GAME_VERSION}</h3>
                  <p className="text-stone-400">Playtest build — expect bugs, rough edges, and features that change. Saves may break between updates. Feedback helps shape the real release.</p>
                  <button
                    type="button"
                    onClick={() => setMoreSubTab('roadmap')}
                    className="mt-2 w-full rounded-lg border border-indigo-600/40 bg-indigo-950/40 px-3 py-2 text-[10px] font-bold text-indigo-200 hover:bg-indigo-900/50"
                  >
                    🗺️ View development roadmap
                  </button>
                </div>

                <div className="rounded-xl border border-violet-700/30 bg-violet-950/20 p-3">
                  <h3 className="mb-2 text-xs font-bold text-violet-300">Why play? (honest answer)</h3>
                  <div className="space-y-1.5 text-stone-400">
                    <p>This is a <strong className="text-stone-200">sandbox frontier sim</strong>, not a campaign with one quest giver. Purpose comes from layers you choose:</p>
                    <p>• <strong className="text-stone-200">Challenges</strong> (Progress → Goals) — stepped goals with resource rewards.</p>
                    <p>• <strong className="text-stone-200">Victory paths</strong> (Progress → Goals) — Eco-Utopia, Great City, Trade Empire, or Harmony with the wild.</p>
                    <p>• <strong className="text-stone-200">Living drama</strong> — marriages, scandals, babies, moon howlers (Log / .txt chronicle).</p>
                    <p>• <strong className="text-stone-200">The wider world</strong> — pilgrims, performers, rival camps appear as you grow.</p>
                    <p>• <strong className="text-stone-200">Trade &amp; reputation</strong> — become a known township, link routes, unlock gold.</p>
                    <p className="text-stone-500 italic">v0.4 is a playtest — more scripted story and rivals are planned. For now, pick one legacy and watch your chronicle unfold.</p>
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-700/30 bg-emerald-950/20 p-3">
                  <h3 className="mb-2 text-xs font-bold text-emerald-300">Getting Started</h3>
                  <p className="mb-2 text-stone-400">
                    {tutorialsEnabled
                      ? 'Tips pop up the first time traders, rivals, winter, raids, and other mechanics appear. Replay quick start anytime.'
                      : 'Tutorials are off. Turn them back on from the ☰ menu or below.'}
                  </p>
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={!tutorialsEnabled}
                      onClick={() => { setTutorialStep(0); setShowTutorial(true); }}
                      className="w-full rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-500"
                    >
                      ↺ Replay Quick Start
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleTutorials}
                      className="w-full rounded-lg border border-stone-600 px-3 py-2 text-[10px] font-semibold text-stone-300 hover:border-stone-500 hover:text-white"
                    >
                      {tutorialsEnabled ? 'Turn off all tutorials' : 'Turn tutorials back on'}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-blue-300">Interface Overview</h3>
                  <div className="space-y-1 text-stone-400">
                    <p><strong className="text-stone-200">Alert strip</strong> — Under the header. Click raids, diplomacy, low food, or ready trade routes to jump there.</p>
                    <p><strong className="text-stone-200">Build panel (left)</strong> — Press <strong className="text-stone-200">B</strong> to open. Pick a category, then a building. Keys <strong className="text-stone-200">1–9</strong> quick-select common types.</p>
                    <p><strong className="text-stone-200">Grid</strong> — Press <strong className="text-stone-200">G</strong> to toggle the placement grid (auto-on when building).</p>
                    <p><strong className="text-stone-200">Inspector</strong> — Top of the right panel; collapsible, auto-opens when you click the map.</p>
                    <p><strong className="text-stone-200">Village</strong> — Focus hints with <strong className="text-stone-200">Go →</strong>, population, leadership, armament.</p>
                    <p><strong className="text-stone-200">Frontier</strong> — Visitors, rivals, raids, diplomacy (badge when action needed).</p>
                    <p><strong className="text-stone-200">Nature</strong> — Ecosystem health and wildlife counts.</p>
                    <p><strong className="text-stone-200">Progress</strong> — Research · Trade · Goals (challenges + victory paths). Sub-tabs show badges when researching or trade is ready.</p>
                    <p><strong className="text-stone-200">More</strong> — Guide (this page) and Roadmap.</p>
                    <p><strong className="text-stone-200">Tab hotkeys</strong> — <strong className="text-stone-200">V</strong> Village · <strong className="text-stone-200">F</strong> Frontier · <strong className="text-stone-200">N</strong> Nature · <strong className="text-stone-200">P</strong> Progress · <strong className="text-stone-200">L</strong> Log · <strong className="text-stone-200">M</strong> More.</p>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-cyan-300">🧳 Visitors & Rival Settlements</h3>
                  <div className="space-y-1 text-stone-400">
                    <p>• <strong className="text-cyan-200">Traveling groups</strong> camp near your village — traders, pilgrims, scholars, performers, and more. They bring gifts and leave after a while.</p>
                    <p>• <strong className="text-amber-200">Rival settlements</strong> can appear on the same map with their own camp, people, and buildings (indigo markers).</p>
                    <p>• Relationships vary: <em>friendly</em> neighbors trade, <em>competitive</em> ones hunt your deer, <em>tense</em> ones grumble about borders.</p>
                    <p>• Check the <strong className="text-stone-200">Frontier tab</strong> to see who's currently on the map.</p>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-emerald-300">🌍 Why Animals & Humans?</h3>
                  <p className="mb-2 text-stone-400 leading-relaxed">
                    This world is a living ecosystem. Humans cannot survive alone — they are part of the food chain.
                  </p>
                  <div className="space-y-1.5 rounded bg-stone-800/60 p-2">
                    <p><strong className="text-emerald-300">🌿 Producers:</strong> Grass and trees create food from sunlight.</p>
                    <p><strong className="text-amber-300">🐰 Prey:</strong> Rabbits and deer eat grass. They are the bridge between plants and predators.</p>
                    <p><strong className="text-rose-300">🐺 Predators:</strong> Wolves and foxes hunt prey to keep populations balanced.</p>
                    <p><strong className="text-cyan-300">👨 Humans:</strong> Hunt animals for food AND build farms. But overbuilding pollutes and destroys habitat.</p>
                  </div>
                  <p className="mt-2 text-stone-500 italic">
                    If wolves die out, deer overpopulate, eat all grass, rabbits starve, and humans have nothing to hunt. Balance is everything.
                  </p>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-amber-300">👨‍👩‍👧 Family & Relationships</h3>
                  <div className="space-y-1 text-stone-400">
                    <p>• Every human has a <strong className="text-amber-200">name and surname</strong> passed down generations.</p>
                    <p>• Single adults will <strong className="text-pink-300">court</strong> nearby singles (💕 hearts appear).</p>
                    <p>• At 100% courtship, they <strong className="text-yellow-300">marry</strong> (💍 golden ring connects them).</p>
                    <p>• Married couples can have <strong className="text-pink-300">babies</strong> (🤰 pregnant indicator).</p>
                    <p>• Settlers may pursue <strong className="text-rose-300">secret affairs</strong> in the evenings — spouses can catch them; a <strong className="text-violet-300">Church</strong> makes gossip travel faster.</p>
                    <p>• <strong className="text-violet-300">Bastards</strong> are born when the father isn't the mother's spouse — they take the mother's surname and village gossip spreads.</p>
                    <p>• Legitimate children inherit their <strong className="text-amber-200">father's surname</strong>.</p>
                    <p>• Click any person to see their <strong className="text-amber-200">full family tree</strong>.</p>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-rose-300">⚔️ Hunting & Combat</h3>
                  <div className="space-y-1 text-stone-400">
                    <p>• <strong className="text-orange-300">Food chain:</strong> Grass → rabbits/deer → foxes/wolves → humans. Everyone hunts someone.</p>
                    <p>• <strong className="text-cyan-300">Settlers hunt</strong> deer and rabbits when hungry and off-duty. Watch for orange <strong className="text-orange-300">🏹 chase lines</strong> and floating <em>Hunted!</em> text.</p>
                    <p>• <strong className="text-stone-300">Wolves & foxes</strong> chase prey with grey dashed lines. Prey flees when predators get close.</p>
                    <p>• <strong className="text-violet-300">Moon Howlers</strong> hunt settlers on full-moon nights — settlers flee home.</p>
                    <p>• <strong className="text-amber-300">Weapons:</strong> Stone/wood gear unlocks from Defense research. <strong className="text-stone-200">Iron Spears & Shields</strong> need research <strong className="text-stone-200">and</strong> a forge order at a staffed Blacksmith (click the building → Village forge).</p>
                    <p>• Click a settler to see <strong className="text-stone-200">Village gear</strong> once research (and Blacksmith for iron) is done.</p>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-cyan-300">🏕️ Other tribes</h3>
                  <div className="space-y-1 text-stone-400">
                    <p>• <strong className="text-stone-200">Visitors</strong> camp nearby (traders, pilgrims, refugees…) — passive bonuses while they stay.</p>
                    <p>• <strong className="text-stone-200">Rival settlements</strong> appear from ~6 population / yearly events — another camp on the map with its own houses.</p>
                    <p>• <strong className="text-stone-200">Diplomacy</strong> — click a rival camp for gifts, pacts, peace treaties (🕊️), militia, raids, and event responses.</p>
                    <p>• <strong className="text-stone-200">Visitor camps</strong> — talk to the caravan leader (once per visit), trade goods, or negotiate refugees.</p>
                    <p className="text-stone-500 italic">Full raids & wars are not in v0.4 yet — relations affect gold gifts, hunting competition, and reputation.</p>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-violet-300">🌝 Moon Howlers</h3>
                  <p className="text-stone-400 leading-relaxed">
                    Sometimes a grown settler is <strong className="text-violet-200">cursed as a Moon Howler</strong>.
                    Cursed settlers stay <strong className="text-violet-200">normal humans most nights</strong>. Only on a
                    <strong className="text-violet-200"> full moon</strong> (about every 2 weeks) do they transform and
                    <strong className="text-rose-300"> hunt settlers</strong>. Build a
                    <strong className="text-indigo-200"> Church</strong> nearby to break the curse.
                  </p>
                </div>

                <div className="rounded-xl border border-dashed border-violet-700/40 bg-violet-950/20 p-3">
                  <h3 className="mb-2 text-xs font-bold text-violet-300">🧪 Testing</h3>
                  <p className="mb-2 text-[9px] text-stone-500">Spawn a Moon Howler instantly for playtesting.</p>
                  <button
                    onClick={() => applyGameAction({ proto: 1, op: 'spawnMoonHowlerDebug' })}
                    className="w-full rounded-lg bg-violet-800 px-3 py-2 text-[10px] font-bold text-violet-100 transition-all hover:bg-violet-700"
                  >
                    🌝 Spawn Moon Howler
                  </button>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-blue-300">🎮 Controls</h3>
                  <div className="grid grid-cols-2 gap-1 text-stone-400">
                    <span><strong className="text-stone-200">WASD / Arrows</strong></span><span>Pan camera</span>
                    <span><strong className="text-stone-200">Mouse drag</strong></span><span>Pan camera</span>
                    <span><strong className="text-stone-200">Scroll</strong></span><span>Zoom in/out</span>
                    <span><strong className="text-stone-200">Click</strong></span><span>Select / Build</span>
                    <span><strong className="text-stone-200">Space</strong></span><span>Pause/Play</span>
                    <span><strong className="text-stone-200">B</strong></span><span>Full build catalog (left)</span>
                    <span><strong className="text-stone-200">G</strong></span><span>Toggle grid</span>
                    <span><strong className="text-stone-200">1–9</strong></span><span>Quick-build (opens left catalog)</span>
                    <span><strong className="text-stone-200">V F N P L M</strong></span><span>Sidebar tabs</span>
                    <span><strong className="text-stone-200">H</strong></span><span>Find settlers (center camera)</span>
                    <span><strong className="text-stone-200">ESC</strong></span><span>Cancel build</span>
                    <span><strong className="text-stone-200">+ / -</strong></span><span>Zoom</span>
                    <span><strong className="text-stone-200">🔊 / 🔇</strong></span><span>Mute sound — or pick Soft / Normal / Loud</span>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-emerald-300">🏗️ Buildings Guide</h3>
                  <div className="space-y-1 text-stone-400">
                    <p>• <strong className="text-amber-200">House</strong> — Family home (6 slots). Click house → <strong className="text-stone-200">Expand</strong> for up to 10.</p>
                    <p>• <strong className="text-amber-200">Farm</strong> — Produces food every season.</p>
                    <p>• <strong className="text-amber-200">Lumber Mill</strong> — Produces wood. Needs workers.</p>
                    <p>• <strong className="text-amber-200">Quarry/Mine</strong> — Produces stone.</p>
                    <p>• <strong className="text-amber-200">Roads</strong> — Infra tab (key 8). Horizontal strips — zigzag them (step north/south each segment) for paths up hills. Boost nearby buildings +15%.</p>
                    <p>• <strong className="text-amber-200">Town Hall</strong> — After <strong className="text-stone-200">Urban Planning</strong>. Staff officials for taxes, trade &amp; immigration boosts, election site, scandal buffer, and hosted festivals.</p>
                    <p>• <strong className="text-amber-200">Church</strong> — Community tab, no research needed. Faster marriages, breaks Moon Howler curses, stricter morals.</p>
                    <p>• <strong className="text-amber-200">Hospital</strong> — Staffed: +2 reputation every 5 days. Any hospital lowers energy drain.</p>
                    <p>• <strong className="text-amber-200">Demolish</strong> — Click any building → sidebar → <strong className="text-stone-200">🗑 Demolish</strong> (works on houses too; residents are reassigned).</p>
                    <p>• <strong className="text-amber-200">Reputation ⭐</strong> — Village header &amp; Progress → Trade. From Town Hall, Hospital, pilgrims, festivals, and avoiding scandals. Unlocks trade routes.</p>
                    <p>• <strong className="text-amber-200">Village head 👑</strong> — First male leads until Year 10; merit elections every 10 years after that. Village tab → Leadership for standings and record score. Scandals hurt re-election; a strong challenger can still win.</p>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-emerald-300">🦌 What Does Wildlife Do?</h3>
                  <div className="space-y-1.5 text-stone-400">
                    <p>Every animal has a role in the ecosystem. Without balance, your village will starve.</p>
                    <div className="space-y-1 rounded bg-stone-800/60 p-2">
                      <p><strong className="text-green-300">🌿 Grass</strong> — Grows naturally. Rabbits and deer eat it. If grass dies, everything starves.</p>
                      <p><strong className="text-amber-300">🐰 Rabbits</strong> — Eat grass, reproduce fast. Foxes and wolves hunt them. Humans can hunt rabbits for food.</p>
                      <p><strong className="text-orange-300">🦌 Deer</strong> — Eat grass, move in herds. Wolves and humans hunt deer. More deer = more food for predators.</p>
                      <p><strong className="text-orange-500">🦊 Foxes</strong> — Hunt rabbits to keep their population in check. Without foxes, rabbits overpopulate and eat all the grass.</p>
                      <p><strong className="text-stone-300">🐺 Wolves</strong> — Hunt deer and rabbits. Apex predators. Without wolves, deer overpopulate and destroy grasslands.</p>
                      <p><strong className="text-cyan-300">👨 Humans</strong> — Hunt animals for food, build farms for stable food. Build too much and pollution rises, harming wildlife.</p>
                    </div>
                    <p className="text-stone-500 italic">If wolves die out, deer explode, eat all grass, rabbits starve, and your people have nothing to hunt. Balance is everything.</p>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-amber-300">📜 Village Chronicle (Log tab)</h3>
                  <div className="space-y-1 text-stone-400">
                    <p>Right sidebar → <strong className="text-stone-200">📜 Log</strong> — scrollable history of everything that happened (newest on top).</p>
                    <p>Filter by type, hit <strong className="text-stone-200">Download .txt</strong> for a text file (opens in Notepad), or enable export when you 💾 Save.</p>
                    <p className="text-stone-500">File name: <strong className="text-stone-400">wilderfolk-YourVillage-chronicle.txt</strong> in your Downloads folder.</p>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-violet-300">🦴 Taming Animals</h3>
                  <div className="space-y-1 text-stone-400">
                    <p>1. Build a <strong className="text-stone-200">Taming Post</strong> (Community tab).</p>
                    <p>2. Click a wild <strong className="text-stone-200">wolf, fox, deer, or rabbit</strong> within ~140px of the post.</p>
                    <p>3. Pick an adult settler — costs food: rabbit 10, fox 25, deer 30, wolf 40.</p>
                    <p>4. Tamed animals <strong className="text-stone-200">follow their owner</strong>. Wolves and foxes sometimes hunt nearby prey for them.</p>
                    <p className="text-stone-500 italic">Moon Howlers cannot be tamed — staff a Church and keep cursed settlers nearby; cures roll each morning at 7am.</p>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-rose-300">⚠️ Disasters & Seasons</h3>
                  <div className="space-y-1 text-stone-400">
                    <p>• <strong className="text-rose-300">Fire/Flood/Tornado</strong> — Damage buildings and kill wildlife.</p>
                    <p>• <strong className="text-rose-300">Plague</strong> — Can be prevented with Medicine research.</p>
                    <p>• <strong className="text-amber-200">Winter</strong> — Grass stops growing, animals struggle.</p>
                    <p>• <strong className="text-emerald-300">Spring</strong> — Best season for growth and babies!</p>
                  </div>
                </div>
              </div>
            )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {showShortcuts && (
        <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  );
}

// ============ SUB-COMPONENTS ============

function BigNewsBanner({ news, onDismiss }: { news: { id: string; title: string; message: string; type: 'positive' | 'negative' | 'neutral' }[]; onDismiss: () => void }) {
  if (news.length === 0) return null;
  const item = news[news.length - 1];
  return (
    <div className="absolute left-1/2 top-16 z-20 w-full max-w-lg -translate-x-1/2 animate-in fade-in slide-in-from-top">
      <div className={`relative rounded-xl border p-4 shadow-2xl backdrop-blur ${
        item.type === 'positive' ? 'border-emerald-400/50 bg-emerald-950/90' :
        item.type === 'negative' ? 'border-rose-400/50 bg-rose-950/90' :
        'border-amber-400/50 bg-amber-950/90'
      }`}>
        <button
          onClick={onDismiss}
          className="absolute right-2 top-1.5 text-lg leading-none text-stone-400 hover:text-white"
          title="Dismiss"
        >
          ×
        </button>
        <div className="flex items-start gap-3 pr-6">
          <span className="text-3xl">{item.type === 'positive' ? '✨' : item.type === 'negative' ? '⚠️' : '📜'}</span>
          <div>
            <h3 className={`text-sm font-bold ${
              item.type === 'positive' ? 'text-emerald-300' :
              item.type === 'negative' ? 'text-rose-300' : 'text-amber-300'
            }`}>{item.title}</h3>
            <p className="text-xs text-stone-200">{item.message}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['WASD / drag', 'Pan camera'],
    ['Scroll / + −', 'Zoom'],
    ['Click', 'Select · build · inspect camps'],
    ['Space', 'Pause / resume'],
    ['B', 'Full build catalog (left)'],
    ['G', 'Toggle placement grid'],
    ['1–9', 'Quick-build'],
    ['V F N P L M', 'Sidebar tabs'],
    ['H', 'Center on settlers'],
    ['R', 'Rotate road / wall / gate while placing'],
    ['ESC', 'Cancel build · clear selection'],
    ['?', 'This help overlay'],
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-2xl border border-stone-600 bg-stone-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Keyboard shortcuts</h2>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-white">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
          {rows.map(([key, desc]) => (
            <span key={key} className="contents">
              <strong className="text-emerald-300">{key}</strong>
              <span className="text-stone-400">{desc}</span>
            </span>
          ))}
        </div>
        <p className="mt-3 text-[9px] text-stone-500">Alerts under the header are clickable — they jump you to raids, diplomacy, food, and trade.</p>
      </div>
    </div>
  );
}

const StatBadge = memo(function StatBadge({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded bg-stone-600/30 px-2 py-1">
      <span>{icon}</span>
      <span className="text-stone-400">{label}:</span>
      <strong className="text-white">{value}</strong>
    </div>
  );
});

const VISITOR_KIND_EMOJI: Record<VisitorGroup['kind'], string> = {
  traders: '🛒', pilgrims: '🕯️', scholars: '📚', hunters: '🏹',
  nomads: '🐎', refugees: '🧳', performers: '🎭',
};

function VisitorCampPanel({
  group,
  state,
  talkMeta,
  onTalkLeader,
  onTrade,
  onRefugeeChoice,
  onFocusCamp,
}: {
  group: VisitorGroup;
  state: WorldState;
  talkMeta: import('./game/groupEvents').VisitorLeaderTalkMeta;
  onTalkLeader: () => void;
  onTrade: (action: VisitorTradeAction) => void;
  onRefugeeChoice: (choice: RefugeeChoice) => void;
  onFocusCamp: () => void;
}) {
  const emoji = VISITOR_KIND_EMOJI[group.kind];
  const foodRoom = Math.max(0, state.storageMax.food - state.resources.food);
  const woodRoom = Math.max(0, state.storageMax.wood - state.resources.wood);
  const canBuyFood = state.resources.gold >= 25 && foodRoom >= 40;
  const canBuyWood = state.resources.gold >= 20 && woodRoom >= 30;
  const canSellFood = state.resources.food >= 30;
  const canTradeKind = group.kind === 'traders' || group.kind === 'nomads' || group.kind === 'hunters';

  return (
    <div className="rounded-xl border border-cyan-600/40 bg-cyan-950/30 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-lg">{emoji}</span>
          <div className="min-w-0">
            <h3 className="truncate text-xs font-bold text-cyan-200">{group.name}</h3>
            <p className="text-[9px] capitalize text-cyan-300/80">{group.kind} · {group.daysLeft}d · {group.entityIds.length} people</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onFocusCamp}
          className="shrink-0 rounded bg-cyan-900/50 px-2 py-1 text-[9px] font-bold text-cyan-100 hover:bg-cyan-800/50"
          title="Center map on camp"
        >
          📍
        </button>
      </div>
      <button
        type="button"
        disabled={group.leaderTalked || !!talkMeta.unavailableReason}
        onClick={onTalkLeader}
        title={talkMeta.hint}
        className="mb-2 w-full rounded bg-indigo-900 px-2 py-1.5 text-[9px] font-bold text-indigo-100 hover:bg-indigo-800 disabled:opacity-40"
      >
        {talkMeta.buttonLabel}
      </button>
      {group.kind === 'refugees' && !group.refugeeResolved && (
        <div className="space-y-1">
          <p className="text-[9px] text-stone-400">Families ask to join your village. Choose how to respond:</p>
          <button
            type="button"
            disabled={state.resources.food < 40 || state.humanPopulation >= state.maxHumanPopulation}
            onClick={() => onRefugeeChoice('welcome')}
            className="w-full rounded bg-emerald-900 px-2 py-1 text-[8px] font-bold text-emerald-100 hover:bg-emerald-800 disabled:opacity-40"
          >
            🤝 Welcome all (40🍖) — up to 2 settlers
          </button>
          <button
            type="button"
            disabled={state.resources.food < 20 || state.humanPopulation >= state.maxHumanPopulation}
            onClick={() => onRefugeeChoice('screen')}
            className="w-full rounded bg-stone-700 px-2 py-1 text-[8px] font-bold text-stone-200 hover:bg-stone-600 disabled:opacity-40"
          >
            🔍 Screen applicants (20🍖) — maybe 1 stays
          </button>
          <button
            type="button"
            onClick={() => onRefugeeChoice('turn_away')}
            className="w-full rounded bg-rose-900 px-2 py-1 text-[8px] font-bold text-rose-100 hover:bg-rose-800"
          >
            🚪 Turn away — they leave early
          </button>
        </div>
      )}
      {group.kind === 'refugees' && group.refugeeResolved && (
        <p className="text-[9px] text-stone-500">Refugee talks concluded for this group.</p>
      )}
      {canTradeKind && (
        <div className="grid grid-cols-1 gap-1">
          <button
            type="button"
            disabled={!canBuyFood}
            onClick={() => onTrade('buy_food')}
            className="w-full rounded bg-stone-700 px-2 py-1 text-[9px] font-bold text-stone-200 hover:bg-stone-600 disabled:opacity-40"
          >
            Buy food · 25💰 → 40🍖{foodRoom < 40 ? ` (${foodRoom}🍖 space)` : ''}
          </button>
          <button
            type="button"
            disabled={!canBuyWood}
            onClick={() => onTrade('buy_wood')}
            className="w-full rounded bg-stone-700 px-2 py-1 text-[9px] font-bold text-stone-200 hover:bg-stone-600 disabled:opacity-40"
          >
            Buy wood · 20💰 → 30🪵
          </button>
          <button
            type="button"
            disabled={!canSellFood}
            onClick={() => onTrade('sell_food')}
            className="w-full rounded bg-amber-900 px-2 py-1 text-[9px] font-bold text-amber-100 hover:bg-amber-800 disabled:opacity-40"
          >
            Sell food · 30🍖 → 25💰
          </button>
        </div>
      )}
      {!canTradeKind && group.kind !== 'refugees' && (
        <p className="text-[9px] text-stone-500">Passive gifts each day while they camp nearby.</p>
      )}
    </div>
  );
}

const WildlifeBar = memo(function WildlifeBar({ label, count, max, color, icon }: { label: string; count: number; max: number; color: string; icon: string }) {
  const pct = Math.min(100, (count / max) * 100);
  return (
    <div>
      <div className="mb-0.5 flex justify-between">
        <span>{icon} {label}</span>
        <strong>{count}</strong>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-stone-600">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
});

function getFamilyMembers(entity: Entity, allEntities: Entity[]): { label: string; name: string; relation: string }[] {
  const members: { label: string; name: string; relation: string }[] = [];
  const seen = new Set<number>();

  const add = (e: Entity, label: string, relation: string) => {
    if (!e.alive || e.type !== EntityType.Human || e.id === entity.id || seen.has(e.id)) return;
    seen.add(e.id);
    members.push({ label, name: e.name || 'Unknown', relation });
  };

  for (const e of allEntities) {
    if (!e.alive || e.type !== EntityType.Human) continue;
    if (e.id === entity.fatherId) add(e, '👨', 'Father');
    if (e.id === entity.motherId) add(e, '👩', 'Mother');
    if (e.partnerId === entity.id) add(e, e.gender === 'male' ? '👨' : '👩', 'Spouse');
    if (
      entity.childrenIds.includes(e.id)
      || e.motherId === entity.id
      || e.fatherId === entity.id
    ) {
      add(
        e,
        e.gender === 'male' ? '👦' : '👧',
        e.isBastard ? (e.isJuvenile ? 'Bastard child' : 'Bastard') : (e.isJuvenile ? 'Child' : 'Adult child'),
      );
    }
    if (entity.motherId && e.motherId === entity.motherId) {
      add(e, e.gender === 'male' ? '👦' : '👧', 'Sibling');
    }
    if (entity.fatherId && e.fatherId === entity.fatherId) {
      add(e, e.gender === 'male' ? '👦' : '👧', 'Sibling');
    }
  }
  return members;
}

function countLivingChildren(entity: Entity, allEntities: Entity[]): number {
  return allEntities.filter((e) =>
    e.alive
    && e.type === EntityType.Human
    && (entity.childrenIds.includes(e.id) || e.motherId === entity.id || e.fatherId === entity.id),
  ).length;
}

function SelectedEntityPanel({ entity, allEntities, state, onTame, onMoveOut, onOpenVisitorCamp }: { entity: Entity; allEntities: Entity[]; state: WorldState; onTame?: (humanId: number) => void; onMoveOut?: () => void; onOpenVisitorCamp?: (group: VisitorGroup) => void }) {
  const isVillageHead = isVillageLeader(state, entity.id);
  const isHuman = entity.type === EntityType.Human;
  const isVisitor = entity.faction === 'visitor';
  const isRival = entity.faction === 'rival';
  const visitorGroup = isVisitor ? state.visitorGroups.find((g) => g.id === entity.groupId) : null;
  const rivalCamp = isRival ? state.rivalSettlements.find((r) => r.id === entity.groupId) : null;
  const family = isHuman && !isVisitor && !isRival ? getFamilyMembers(entity, allEntities) : [];
  const childCount = isHuman && !isVisitor && !isRival ? countLivingChildren(entity, allEntities) : 0;
  const foodChainInfo: Record<string, { role: string; eats: string; huntedBy: string }> = {
    grass: { role: 'Producer', eats: 'Sunlight (photosynthesis)', huntedBy: 'Rabbits, Deer, Foxes, Wildkin' },
    rabbit: { role: 'Prey', eats: 'Grass', huntedBy: 'Foxes, Wolves, Humans' },
    deer: { role: 'Prey', eats: 'Grass', huntedBy: 'Wolves, Humans, Moon Howlers' },
    fox: { role: 'Predator', eats: 'Rabbits, Grass', huntedBy: 'None' },
    wolf: { role: 'Apex Predator', eats: 'Deer, Rabbits', huntedBy: 'None' },
    werewolf: { role: 'Full-Moon Predator', eats: 'Settlers, Deer, Rabbits', huntedBy: 'Church (breaks the curse)' },
    wildkin: { role: 'Gentle Hybrid', eats: 'Grass, Farm Food', huntedBy: 'Wolves, Foxes' },
    human: { role: 'Civilization Builder', eats: 'Deer, Rabbits, Farm Food', huntedBy: 'Moon Howlers (~every 2 weeks)' },
    tree: { role: 'Environment', eats: 'CO2, Sunlight', huntedBy: 'None (provides habitat)' },
  };
  const ecology = foodChainInfo[entity.type] || { role: 'Unknown', eats: 'Unknown', huntedBy: 'Unknown' };

  const tameableTypes: EntityType[] = [EntityType.Wolf, EntityType.Fox, EntityType.Deer, EntityType.Rabbit];
  const isTameable = tameableTypes.includes(entity.type) && !entity.tamedBy;
  const isMoonHowler = entity.type === EntityType.Werewolf && !!entity.moonHowlerCursed;
  const tamer = entity.tamedBy ? allEntities.find(e => e.id === entity.tamedBy && e.alive) : null;
  const hasTamingPost = state.buildings.some(b => b.completed && b.type === BuildingType.TamingPost && Math.hypot(b.x - entity.x, b.y - entity.y) < 140);
  const canTameHere = hasTamingPost;
  const tameFoodCost = getTameFoodCost(entity.type);
  const availableHumans = allEntities.filter(e => e.type === EntityType.Human && e.alive && !e.isJuvenile);
  const playerHumans = allEntities.filter((e) => e.alive && isPlayerHuman(e));
  const residences = state.buildings.filter((b) => b.completed && isResidenceBuilding(b));
  const canMoveOut = isHuman && !isVisitor && !isRival && isAdultChildAtHome(entity, playerHumans);
  const moveOutReady = canMoveOut && canMoveOutOfFamilyHome(entity, playerHumans, residences);

  return (
    <div className="rounded-xl border border-amber-600/30 bg-amber-900/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-lg">
          {entity.type === EntityType.Human ? (entity.gender === 'male' ? '👨' : '👩') :
           entity.type === EntityType.Rabbit ? '🐰' : entity.type === EntityType.Deer ? '🦌' :
           entity.type === EntityType.Wolf ? '🐺' : entity.type === EntityType.Fox ? '🦊' :
           entity.type === EntityType.Werewolf ? '🌝' : entity.type === EntityType.Wildkin ? '🦌' :
           entity.type === EntityType.Tree ? '🌲' : '🌿'}
        </span>
        <div>
          <h3 className="text-xs font-bold text-amber-200">
            {isHuman || entity.type === EntityType.Werewolf
              ? `${entity.name || 'Unnamed'} ${entity.surname || ''}${entity.type === EntityType.Werewolf ? ' (Moon Howler)' : ''}`
              : entity.type}
          </h3>
          {isMoonHowler && (
            <p className="text-[9px] font-semibold text-rose-300">🌝 Full moon form — curse NOT cured · hunting tonight</p>
          )}
          {isHuman && entity.moonHowlerCursed && (
            <p className="text-[9px] font-semibold text-violet-300">🌝 Moon Howler curse — NOT cured yet (human until next full moon)</p>
          )}
          {isVisitor && visitorGroup && (
            <p className="text-[9px] text-cyan-300">Visiting — {visitorGroup.name} ({visitorGroup.daysLeft}d)</p>
          )}
          {isVisitor && visitorGroup && onOpenVisitorCamp && (
            <button
              type="button"
              onClick={() => onOpenVisitorCamp(visitorGroup)}
              className="mt-1 rounded bg-cyan-900/60 px-2 py-0.5 text-[8px] font-bold text-cyan-100 hover:bg-cyan-800/60"
            >
              Open camp — trade &amp; talks
            </button>
          )}
          {isRival && rivalCamp && (
            <p className="text-[9px] text-amber-300">Settler of {rivalCamp.name} · {rivalCamp.relationship}</p>
          )}
          {isHuman && !isVisitor && !isRival && (
            <p className="text-[9px] text-amber-400">
              <span className="font-mono text-stone-400">Citizen #{entity.id}</span>
              {' · '}
              {entity.gender === 'male' ? '♂' : '♀'} {entity.relationshipStatus || 'child'}
              {entity.generation > 0 ? ` · Gen ${entity.generation}` : ''}
              {isVillageHead && (
                <span className="text-amber-200"> · 👑 Village head (since Y{state.leaderSinceYear})</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Food Chain Role */}
      <div className="mb-2 rounded bg-stone-800/60 p-2 text-[9px]">
        <div className="grid grid-cols-[3rem_1fr] gap-y-0.5">
          <span className="text-stone-500">Role</span>
          <strong className="text-amber-300">{ecology.role}</strong>
          <span className="text-stone-500">Eats</span>
          <strong className="text-emerald-300">{ecology.eats}</strong>
          <span className="text-stone-500">Hunted</span>
          <strong className="text-rose-300">{ecology.huntedBy}</strong>
        </div>
      </div>

      <div className="space-y-0.5 text-[10px] text-amber-200">
        <p>Energy: {Math.round(entity.energy)} / {entity.maxEnergy}</p>
        <p>Age: {getAgeInYears(entity, state)} years{entity.isJuvenile && ' (child)'} — b. {getBirthDateString(entity)}</p>
        {entity.huntTargetId && (
          <p className="text-orange-300">🏹 Chasing prey — watch the dashed hunt line on the map</p>
        )}
        {entity.combatTicks && entity.combatTicks > 0 && (
          <p className="text-amber-300">⚔️ In combat</p>
        )}
        {isHuman && !isVisitor && !isRival && getHumanArmamentLabel(state) && (
          <p className="text-sky-300">⚔️ Village gear: {getHumanArmamentLabel(state)}</p>
        )}
        {entity.tamedBy && (
          <p className="text-emerald-400">🦴 Tamed by {tamer?.name || 'a settler'}</p>
        )}
        {isHuman && !isVisitor && !isRival && (
          <>
            {hasResidenceAssignment(entity) ? (() => {
              const home = state.buildings.find((b) => b.id === entity.residenceBuildingId);
              const label = home ? BUILDING_CONFIGS[home.type].label : 'Home';
              return <p className="text-sky-300">🏠 Lives in: {label}</p>;
            })() : (
              <p className="text-rose-300">🏠 No home yet — build a House (auto-assigned when ready)</p>
            )}
            {canMoveOut && (
              <button
                type="button"
                onClick={() => onMoveOut?.()}
                disabled={!moveOutReady}
                title={
                  moveOutReady
                    ? 'Move into an empty house (spouse and your children come too)'
                    : 'Build and finish an empty house first'
                }
                className="mt-1 w-full rounded-lg bg-sky-700/80 px-2 py-1.5 text-[9px] font-bold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-stone-600 disabled:text-stone-400 transition-all"
              >
                🏠 Move to own home ({HUMAN_MOVE_OUT_MIN_AGE}+)
              </button>
            )}
            {isImprisoned(entity) ? (() => {
              const prison = state.buildings.find((b) => b.id === entity.prisonBuildingId);
              const daysLeft = entity.prisonerUntilTick ? Math.max(0, Math.ceil((entity.prisonerUntilTick - state.tick) / 24)) : 0;
              return (
                <p className="text-slate-400">
                  ⛓️ Imprisoned{prison ? ` at ${BUILDING_CONFIGS[prison.type].label}` : ''} · {daysLeft} day{daysLeft === 1 ? '' : 's'} left
                </p>
              );
            })() : hasWorkAssignment(entity) ? (() => {
              const jobSite = state.buildings.find((b) => b.id === entity.homeBuildingId);
              const label = jobSite ? BUILDING_CONFIGS[jobSite.type].label : 'Workplace';
              return <p className="text-emerald-300">🔨 Works at: {label}</p>;
            })() : !entity.isJuvenile && !entity.pregnant && (
              <p className="text-stone-400">🔨 No job yet — build a Farm, Mill, etc.</p>
            )}
            <p className="text-sky-300">👕 {getHumanVariantLabel(entity.gender, entity.spriteVariant ?? 0)}</p>
            {entity.occupation && entity.occupation !== 'settler' && <p>💼 {entity.occupation}</p>}
            {entity.job && (entity.skills?.[entity.job] ?? 0) > 0 && (
              <p className="text-emerald-400">⭐ {entity.job} skill: {Math.round(entity.skills?.[entity.job] ?? 0)}/100</p>
            )}
            {entity.pregnant && (
              <p className="font-bold text-pink-400">
                🤰 Pregnant! ({Math.round(((entity.pregnancyProgress || 0) / PREGNANCY_TICKS) * 100)}%)
              </p>
            )}
            {entity.partnerId && entity.relationshipStatus === 'married' && (() => {
              const spouse = allEntities.find((e) => e.id === entity.partnerId && e.alive);
              const spouseLabel = spouse
                ? `${spouse.name || 'Settler'}${spouse.surname ? ` ${spouse.surname}` : ''}`
                : 'partner';
              return <p className="text-amber-300">💍 Married to {spouseLabel}</p>;
            })()}
            {entity.affairPartnerId != null && (() => {
              const lover = allEntities.find((e) => e.id === entity.affairPartnerId && e.alive);
              return (
                <p className="text-rose-300/90">
                  💋 Secret affair{lover?.name ? ` with ${lover.name}` : ''}
                  {entity.affairProgress != null && entity.affairProgress < 100
                    ? ` (${Math.round(entity.affairProgress)}%)`
                    : ''}
                </p>
              );
            })()}
            {entity.isBastard && <p className="text-violet-300">⚜ Born outside wedlock</p>}
            {childCount > 0 && (
              <p className="text-pink-200">
                👶 {childCount} child{childCount === 1 ? '' : 'ren'}
              </p>
            )}
            {entity.courtshipProgress && entity.courtshipProgress > 0 && entity.relationshipStatus === 'single' && (
              <p className="text-pink-300">💕 Courting... {entity.courtshipProgress}%</p>
            )}
          </>
        )}
      </div>

      {isMoonHowler && (
        <p className="mt-2 text-[9px] text-rose-300">🌝 Curse NOT cured — hunting tonight. Staff a Church and keep them nearby by day for morning cures.</p>
      )}

      {/* Taming */}
      {isTameable && (
        <div className="mt-2 space-y-1">
          {!canTameHere ? (
            <p className="text-[9px] text-rose-400">Build a Taming Post nearby to tame.</p>
          ) : availableHumans.length === 0 ? (
            <p className="text-[9px] text-stone-500">No adult settler available to tame.</p>
          ) : (
            <div className="space-y-1">
              <p className="text-[9px] text-stone-400">
                Assign a settler to tame{tameFoodCost != null ? ` (${tameFoodCost} food)` : ''}:
              </p>
              <div className="grid grid-cols-2 gap-1">
                {availableHumans.slice(0, 4).map(h => (
                  <button
                    key={h.id}
                    onClick={() => onTame?.(h.id)}
                    disabled={tameFoodCost != null && state.resources.food < tameFoodCost}
                    className="rounded bg-emerald-700 px-1.5 py-1 text-[8px] font-bold text-white hover:bg-emerald-600 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    🦴 {h.name || 'Settler'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Family */}
      {family.length > 0 && (
        <div className="mt-2 border-t border-amber-600/20 pt-2">
          <h4 className="mb-1 text-[9px] font-bold uppercase tracking-wider text-amber-400">Family</h4>
          <div className="space-y-0.5">
            {family.map((m, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[9px] text-amber-200">
                <span>{m.label}</span>
                <span className="font-semibold">{m.name}</span>
                <span className="text-stone-500">({m.relation})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const BUILDING_OUTPUT_HINTS: Partial<Record<BuildingType, string>> = {
  [BuildingType.Farm]: 'Produces food — check the Food counter in the header.',
  [BuildingType.Greenhouse]: 'Produces food year-round — watch Food in the header.',
  [BuildingType.Silo]: 'Passive food every 2 days, +600 food storage, less spoilage — no workers.',
  [BuildingType.Mill]: 'Passive — standing mill boosts all food production +25%. No workers needed.',
  [BuildingType.Barn]: 'Boosts nearby Farms/Greenhouses +35% — place next to fields, not a farm itself.',
  [BuildingType.LumberMill]: 'Produces wood — watch Wood in the header.',
  [BuildingType.Quarry]: 'Produces stone — watch Stone in the header.',
  [BuildingType.Mine]: 'Produces stone — watch Stone in the header.',
  [BuildingType.Store]: 'Generates passive gold income.',
  [BuildingType.Market]: 'Trades goods for gold with assigned workers.',
  [BuildingType.Workshop]: 'Pick a recipe below — crafts every 2 days when staffed and stocked.',
  [BuildingType.Church]: 'Staffed church boosts courtship, cures Moon Howlers nearby, and catches affairs.',
  [BuildingType.School]: 'Assign a teacher — children walk here by day; schooling speeds growth and grants graduation perks.',
  [BuildingType.Blacksmith]: 'Forge iron spears & shields here after Defense research. Staffed smith boosts lumber, quarry & mine (+25% per worker).',
  [BuildingType.Hospital]: 'Staffed hospital adds reputation every 5 days; any hospital lowers energy drain.',
  [BuildingType.TownHall]: 'Staff officials — taxes, trade & immigration boost, elections, scandal buffer, host festivals.',
  [BuildingType.Well]: 'Lowers settler energy drain for the whole village.',
  [BuildingType.Prison]: 'Staffed by a Guard. Caught adulterers may be sentenced here for a few days.',
  [BuildingType.Wall]: '+8 barricade strength per segment (max +72 from all wall pieces).',
  [BuildingType.WallCorner]: 'Counts as a wall segment for raid barricade bonus.',
  [BuildingType.WallGate]: 'Gated wall segment — same defense bonus as straight walls.',
  [BuildingType.Watchtower]: '+15 barricade strength. Pairs well with walls around your core.',
  [BuildingType.Barracks]: 'Assign Guards — each patrols the village (+12 militia strength).',
};

function canAffordRecipe(resources: WorldState['resources'], recipe: ReturnType<typeof getWorkshopRecipe>): boolean {
  for (const key of Object.keys(recipe.inputs) as (keyof WorldState['resources'])[]) {
    const needed = recipe.inputs[key] ?? 0;
    if (needed > 0 && resources[key] < needed) return false;
  }
  return true;
}

function SelectedBuildingPanel({ building, state, onAssign, onAssignWorker, assignableWorkers, onRemove, onRepair, onUpgrade, onDemolish, onSetWorkshopRecipe, onQueueForge, idleWorkers, canAssignWorker, onDiplomacyAction, onTownHallAction, onFocusCamp }: {
  building: Building; state: WorldState; onAssign: () => void; onAssignWorker: (humanId: number) => void;
  assignableWorkers: Entity[]; onRemove: (id: number) => void;
  onRepair: () => void; onUpgrade: () => void; onDemolish: () => void;
  onSetWorkshopRecipe?: (recipeId: string) => void;
  onQueueForge?: (orderId: import('./game/forge').ForgeOrderId) => void;
  idleWorkers: number;
  canAssignWorker: boolean;
  onDiplomacyAction?: (cmd: WorkerCommand) => void;
  onTownHallAction?: (cmd: WorkerCommand) => void;
  onFocusCamp?: (rival: import('./game/gameTypes').RivalSettlement) => void;
}) {
  if (building.faction === 'rival') {
    const rival = state.rivalSettlements.find((r) => r.id === building.groupId);
    const config = BUILDING_CONFIGS[building.type];
    const pendingForRival = (state.pendingDiplomacyEvents ?? []).filter((e) => e.rivalId === rival?.id);
    const raidsForRival = (state.pendingRaidEvents ?? []).filter((e) => e.rivalId === rival?.id);
    const outgoingRaidsForRival = (state.pendingOutgoingRaidEvents ?? []).filter((e) => e.rivalId === rival?.id);
    const rivalStr = rival ? getRivalRaidStrength(rival) : 0;
    const raidFoodCost = rival ? getOutgoingRaidFoodCostForRival(state, rival) : 0;
    const atPeace = rival ? isRivalAtPeace(rival) : false;
    const raidEligibility = rival ? canLaunchRaidOnRival(state, rival) : { ok: false, foodCost: 0, blockReason: 'Unknown rival' };
    const canLaunchRaid = raidEligibility.ok;
    const outgoingRaidAction = rival ? getOutgoingRaidActionLabel(state, rival.id) : null;
    const isCounterRaid = raidsForRival.length > 0;
    const canSignPeace = rival && !atPeace && rival.relationship !== 'tense'
      && state.resources.gold >= 30 && state.resources.food >= 20;
    const canGift = rival && state.resources.food >= 25 && rival.relationship !== 'friendly';
    const canPact = rival && state.resources.gold >= 40 && rival.relationship !== 'tense' && rival.relationship !== 'friendly';
    const canShowForce = rival && (hasIronSpears(state) || hasStoneSpears(state))
      && state.humanPopulation >= 6
      && rival.relationship !== 'friendly';
    return (
      <div className="rounded-xl border border-indigo-600/40 bg-indigo-950/30 p-3">
        <div className="mb-2 flex items-center gap-2">
          <img src={config.sprite} alt={config.label} className="h-8 w-8 object-contain opacity-90" />
          <div>
            <h3 className="text-xs font-bold text-indigo-200">{rival?.name ?? building.campLabel ?? 'Rival Camp'}</h3>
            <p className="text-[9px] text-indigo-300/80">
              {config.label} · {rival ? formatRivalPopulationLabel(rival) : '?'} · <span className="capitalize">{rival?.relationship ?? 'unknown'}</span>
              {rival && (
                <>
                  {' '}· {formatCampDistance(getCampDistancePixels(state, state.buildings, rival))} away
                  {atPeace && <span className="text-cyan-300"> · 🕊️ peace {rival.peaceTreatyDays}d</span>}
                </>
              )}
            </p>
          </div>
        </div>
        {rival && onFocusCamp && (
          <button
            type="button"
            onClick={() => onFocusCamp(rival)}
            className="mb-2 w-full rounded bg-amber-900/50 px-2 py-1 text-[9px] font-bold text-amber-100 hover:bg-amber-800/50"
          >
            📍 Ping camp on map
          </button>
        )}
        {rival && (
          <div className="mb-2">
            <CombatPreviewPanel
              compact
              showOutgoingRaid
              outgoingRaidIsCounter={isCounterRaid}
              preview={getCombatPreview(state, {
                rival,
                attackerStrength: raidsForRival[0]?.attackerStrength ?? rivalStr,
                incomingPayoffFood: raidsForRival[0]?.lootFood,
              })}
              title={`vs ${rival.name} — ${formatCampDistance(getCampDistancePixels(state, state.buildings, rival))} · raid ${raidFoodCost}🍖`}
            />
          </div>
        )}
        {raidsForRival.map((evt) => (
          <div key={evt.id} className="mb-2 rounded-lg border border-rose-600/40 bg-rose-950/40 p-2">
            <p className="text-[10px] font-bold text-rose-200">{evt.emoji} {evt.title}</p>
            <p className="text-[9px] text-stone-400">{evt.description}</p>
            <div className="mt-1.5 grid grid-cols-1 gap-1">
              {evt.choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  title={choice.hint}
                  onClick={() => onDiplomacyAction?.({ proto: 1, op: 'respondToRaidEvent', eventId: evt.id, choiceId: choice.id })}
                  className="rounded bg-rose-950 px-2 py-1 text-[8px] font-bold text-rose-100 hover:bg-rose-900"
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {outgoingRaidsForRival.map((evt) => (
          <div key={evt.id} className="mb-2 rounded-lg border border-orange-600/40 bg-orange-950/40 p-2">
            <p className="text-[10px] font-bold text-orange-200">{evt.emoji} {evt.title}</p>
            <p className="text-[9px] text-stone-400">{evt.description}</p>
            <p className="mt-1 text-[8px] text-orange-300/90">
              {formatRaidDeadline(
                { createdAtTick: evt.createdAtTick, expiresAtTick: evt.expiresAtTick } as import('./game/frontierCombat').RaidEvent,
                state.tick,
              )}
              {evt.rivalResponse === 'payoff_offer' && (
                <span> · offer {formatRaidLootSummary(raidEventLoot(evt))}</span>
              )}
            </p>
            <div className="mt-1.5 grid grid-cols-1 gap-1">
              {evt.choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  title={choice.hint}
                  onClick={() => onDiplomacyAction?.({
                    proto: 1,
                    op: 'respondToOutgoingRaidEvent',
                    eventId: evt.id,
                    choiceId: choice.id,
                  })}
                  className="rounded bg-orange-950 px-2 py-1 text-[8px] font-bold text-orange-100 hover:bg-orange-900"
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {pendingForRival.map((evt) => (
          <div key={evt.id} className="mb-2 rounded-lg border border-amber-600/30 bg-amber-950/30 p-2">
            <p className="text-[10px] font-bold text-amber-200">{evt.emoji} {evt.title}</p>
            <p className="text-[9px] text-stone-400">{evt.description}</p>
            <div className="mt-1.5 grid grid-cols-1 gap-1">
              {evt.choices.map((choice) => {
                const eligibility = getDiplomacyChoiceEligibility(state, evt, choice.id);
                return (
                <button
                  key={choice.id}
                  type="button"
                  disabled={!eligibility.ok}
                  title={eligibility.blockReason ?? choice.hint}
                  onClick={() => {
                    if (!eligibility.ok) return;
                    onDiplomacyAction?.({ proto: 1, op: 'respondToDiplomacyEvent', eventId: evt.id, choiceId: choice.id });
                  }}
                  className="rounded bg-stone-800 px-2 py-1 text-[8px] font-bold text-stone-200 hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {choice.label}
                </button>
                );
              })}
            </div>
          </div>
        ))}
        {rival && onDiplomacyAction && (
          <div className="grid grid-cols-1 gap-1">
            <button
              type="button"
              disabled={!canGift}
              onClick={() => onDiplomacyAction({ proto: 1, op: 'sendRivalGift', rivalId: rival.id })}
              className="rounded bg-stone-700 px-2 py-1 text-[8px] font-bold text-stone-200 hover:bg-stone-600 disabled:opacity-40"
            >
              🎁 Send food gift (25🍖)
            </button>
            <button
              type="button"
              disabled={!canPact}
              onClick={() => onDiplomacyAction({ proto: 1, op: 'establishRivalTradePact', rivalId: rival.id })}
              className="rounded bg-cyan-900 px-2 py-1 text-[8px] font-bold text-cyan-100 hover:bg-cyan-800 disabled:opacity-40"
            >
              🤝 Trade pact (40💰)
            </button>
            <button
              type="button"
              disabled={!canShowForce}
              onClick={() => onDiplomacyAction({ proto: 1, op: 'showStrengthToRival', rivalId: rival.id })}
              className="rounded bg-rose-900 px-2 py-1 text-[8px] font-bold text-rose-100 hover:bg-rose-800 disabled:opacity-40"
            >
              ⚔️ Show militia (parade)
            </button>
            <button
              type="button"
              disabled={!canSignPeace}
              onClick={() => onDiplomacyAction({ proto: 1, op: 'signPeaceTreaty', rivalId: rival.id })}
              className="rounded bg-cyan-900 px-2 py-1 text-[8px] font-bold text-cyan-100 hover:bg-cyan-800 disabled:opacity-40"
              title="60 days without raids · needs neutral+ relations (not tense)"
            >
              🕊️ Sign peace (30💰 + 20🍖)
            </button>
            <button
              type="button"
              disabled={!canLaunchRaid}
              onClick={() => onDiplomacyAction({ proto: 1, op: 'launchRaidOnRival', rivalId: rival.id })}
              className="rounded bg-orange-950 px-2 py-1 text-[8px] font-bold text-orange-100 hover:bg-orange-900 disabled:opacity-40"
              title={canLaunchRaid
                ? `Costs ${raidFoodCost} food (march rations) · worsens relations`
                : (raidEligibility.blockReason ?? 'Cannot raid')}
            >
              🏹 {outgoingRaidAction?.buttonLabel ?? 'Raid their camp'} ({raidFoodCost}🍖)
            </button>
          </div>
        )}
      </div>
    );
  }

  const config = BUILDING_CONFIGS[building.type];
  const isHousing = isResidenceBuildingType(building.type);
  const residenceCap = isHousing ? getResidenceCapacity(building) : config.maxOccupants;
  const upgradeCost = building.completed && building.level < 3 ? getBuildingUpgradeCost(building) : null;
  const residents = isHousing
    ? state.entities.filter((e) => e.alive && e.residenceBuildingId === building.id)
    : [];
  const prisoners = building.type === BuildingType.Prison
    ? state.entities.filter((e) => e.alive && e.type === EntityType.Human && e.prisonBuildingId === building.id)
    : [];
  const builders = !building.completed
    ? state.entities.filter((e) => building.occupants.includes(e.id))
    : [];
  const terrainMult = getTerrainEfficiencyMultiplier(state, building);
  const adjacencyMult = getAdjacencyMultiplier(state, building);
  const totalEff = Math.round(terrainMult * adjacencyMult * 100);
  return (
    <div className="rounded-xl border border-amber-600/30 bg-amber-900/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <img src={config.sprite} alt={config.label} className="h-8 w-8 object-contain" />
        <div>
          <h3 className="text-xs font-bold text-amber-200">{config.label} {building.level > 1 && `(Lv.${building.level})`}</h3>
          <p className="text-[9px] text-amber-400">{config.description}</p>
        </div>
      </div>

      <div className="mb-2 space-y-0.5 text-[10px] text-amber-200">
        <p>Health: {Math.round(building.health)} / {building.maxHealth}</p>
        {isHousing && building.completed ? (
          <p>Residents: {residents.length} / {residenceCap}</p>
        ) : building.completed && !BUILDING_JOB_TYPES[building.type] && building.type === BuildingType.Mill ? (
          <p className="text-emerald-300">Passive — boosts all food +25% (no workers)</p>
        ) : (
          <p>{!building.completed ? 'Builders' : 'Workers'}: {building.occupants.length} / {config.maxOccupants}</p>
        )}
        {!building.completed && (
          <p>Progress: {Math.round(building.constructionProgress)}% · ~{config.buildTime} work-day{config.buildTime === 1 ? '' : 's'}</p>
        )}
        {isHousing && building.completed && (
          <p className="text-[9px] text-sky-300">
            Families live here automatically.
            {building.level < 3
              ? ` Upgrade below for +${getResidenceUpgradeSlotGain(building.type)} slots (max ${config.maxOccupants + getResidenceUpgradeSlotGain(building.type) * 2} at Lv.3).`
              : ' Fully expanded.'}
          </p>
        )}
        {!building.completed && isHousing && (
          <p className="text-[9px] text-stone-400">Assign builders to speed up construction.</p>
        )}
        {building.completed && isProductionBuildingType(building.type) && (
          <>
            <p>Placement bonus: <span className={totalEff >= 130 ? 'text-emerald-400' : totalEff >= 100 ? 'text-amber-400' : 'text-rose-400'}>{totalEff}%</span></p>
            <p className="text-[8px] text-stone-500">Terrain + nearby buildings (not worker skill)</p>
          </>
        )}
        {building.completed && BUILDING_JOB_TYPES[building.type] && building.type !== BuildingType.Church && building.type !== BuildingType.Prison && building.type !== BuildingType.Barracks && (
          <p className="text-[9px] text-sky-300">Workers are assigned here automatically (7am–7pm).</p>
        )}
        {building.completed && building.type === BuildingType.Church && (
          <p className="text-[9px] text-violet-300">Priest is manual only — pick below, or leave empty (no curse cures).</p>
        )}
        {building.completed && building.type === BuildingType.Prison && (
          <p className="text-[9px] text-violet-300">Guard is manual only — assign one below, or the cells stay empty.</p>
        )}
        {building.completed && building.type === BuildingType.Barracks && (
          <p className="text-[9px] text-violet-300">Guards are manual only — assign below; each patrols the village (+12 militia strength).</p>
        )}
        {!building.completed && (
          <p className="text-[9px] text-sky-300">Builders work 7am–7pm only — auto-assigned each morning.</p>
        )}
        {building.completed && BUILDING_OUTPUT_HINTS[building.type] && (
          <p className="text-[9px] text-stone-400">{BUILDING_OUTPUT_HINTS[building.type]}</p>
        )}
        {building.completed && building.type === BuildingType.Church && building.occupants.length === 0 && (
          <p className="text-[9px] text-amber-400">⚠️ No priest — Moon Howler cures disabled; courtship/morals bonuses reduced.</p>
        )}
        {building.completed && building.type === BuildingType.Church && (() => {
          const nearbyCursed = state.entities.filter(
            (e) => e.alive && e.moonHowlerCursed && Math.hypot(e.x - building.x, e.y - building.y) < 140,
          );
          const totalCursed = state.entities.filter((e) => e.alive && e.moonHowlerCursed).length;
          if (totalCursed === 0) {
            return (
              <p className="text-[9px] text-emerald-400">✓ No active Moon Howler curses in the village.</p>
            );
          }
          if (building.occupants.length === 0) return null;
          return (
            <p className={`text-[9px] ${nearbyCursed.length > 0 ? 'text-violet-300' : 'text-amber-400'}`}>
              {nearbyCursed.length > 0
                ? `🌝 ${nearbyCursed.length} cursed settler${nearbyCursed.length === 1 ? '' : 's'} in range — cure attempts each morning (7am).`
                : `🌝 ${totalCursed} curse${totalCursed === 1 ? '' : 's'} active but none near this church yet.`}
            </p>
          );
        })()}
        {building.completed && (building.type === BuildingType.School || building.type === BuildingType.Blacksmith || building.type === BuildingType.Hospital || building.type === BuildingType.TownHall) && building.occupants.length === 0 && (
          <p className="text-[9px] text-amber-400">⚠️ Unstaffed — bonuses are reduced or inactive until a worker is assigned.</p>
        )}
        {building.completed && building.type === BuildingType.TownHall && (
          <div className="mt-2 space-y-1.5 rounded-lg border border-blue-700/40 bg-blue-950/30 p-2">
            <p className="text-[9px] text-blue-200">{describeTownHallPerks(building)}</p>
            {onTownHallAction && (() => {
              const fest = canHostTownFestival(state, building);
              const cooldownLeft = Math.max(
                0,
                Math.ceil(((state.townHallFestivalCooldownUntilTick ?? 0) - state.tick) / 24),
              );
              return (
                <button
                  type="button"
                  disabled={!fest.ok}
                  title={fest.reason ?? `Costs ${TOWN_HALL_FESTIVAL_COST.food} food & ${TOWN_HALL_FESTIVAL_COST.gold} gold`}
                  onClick={() => onTownHallAction({ proto: 1, op: 'hostTownFestival', buildingId: building.id })}
                  className="w-full rounded bg-blue-900 px-2 py-1.5 text-[9px] font-bold text-blue-100 hover:bg-blue-800 disabled:opacity-40"
                >
                  🎉 Host town festival ({TOWN_HALL_FESTIVAL_DAYS}d)
                  {!fest.ok && cooldownLeft > 0 ? ` — ${cooldownLeft}d cooldown` : ''}
                </button>
              );
            })()}
          </div>
        )}
        {building.completed && building.type === BuildingType.Barracks && building.occupants.length === 0 && (
          <p className="text-[9px] text-amber-400">⚠️ No guards assigned — militia bonus inactive until you staff the barracks.</p>
        )}
        {building.completed && building.type === BuildingType.Blacksmith && onQueueForge && (
          <BlacksmithForgePanel
            state={state}
            buildingId={building.id}
            onQueueForge={onQueueForge}
          />
        )}
        {building.completed && building.type === BuildingType.Workshop && (() => {
          const recipe = getWorkshopRecipe(building.workshopRecipeId);
          const workers = building.occupants.length;
          const estGold = estimateWorkshopGold(state, building);
          const stocked = canAffordRecipe(state.resources, recipe);
          return (
            <div className="mt-2 space-y-1.5 rounded-lg border border-orange-700/40 bg-orange-950/30 p-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-orange-300">Crafting recipe</p>
              <p className="text-[10px] text-amber-100">
                {recipe.emoji} <strong>{recipe.label}</strong> — {recipe.description}
              </p>
              <p className="text-[9px] text-stone-300">
                Uses: {formatRecipeInputs(recipe.inputs)} → ~{estGold} gold / 2 days
                {workers > 0 && <span className="text-stone-500"> (with {workers} worker{workers === 1 ? '' : 's'})</span>}
              </p>
              {!stocked && (
                <p className="text-[9px] text-rose-400">Not enough materials in storage — craft pauses until stocked.</p>
              )}
              {onSetWorkshopRecipe && (
                <div className="grid grid-cols-2 gap-1">
                  {WORKSHOP_RECIPES.map((r) => {
                    const active = r.id === recipe.id;
                    const affordable = canAffordRecipe(state.resources, r);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onSetWorkshopRecipe(r.id)}
                        className={`rounded px-1.5 py-1 text-left text-[8px] transition-all ${
                          active
                            ? 'bg-orange-600 text-white ring-1 ring-amber-300'
                            : affordable
                              ? 'bg-stone-800/80 text-stone-200 hover:bg-stone-700'
                              : 'bg-stone-900/60 text-stone-500 hover:bg-stone-800'
                        }`}
                      >
                        <span className="font-bold">{r.emoji} {r.label}</span>
                        <span className="block text-[7px] opacity-80">{formatRecipeInputs(r.inputs)} → {r.baseGold}g</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
        {terrainMult !== 1 && <p className="text-[9px] text-stone-400">Terrain: {Math.round(terrainMult * 100)}%</p>}
        {adjacencyMult !== 1 && <p className="text-[9px] text-stone-400">Adjacency: {Math.round(adjacencyMult * 100)}%</p>}
        {building.occupants.length > 0 && BUILDING_JOB_TYPES[building.type] && (() => {
          const job = BUILDING_JOB_TYPES[building.type];
          if (!job) return null;
          const workers = state.entities.filter(e => building.occupants.includes(e.id));
          const avgSkill = workers.reduce((s, w) => s + (w.skills?.[job] ?? 0), 0) / Math.max(1, workers.length);
          return (
            <p className="text-[9px] text-emerald-400">
              Worker skill: {Math.round(avgSkill)}/100 (+{Math.round(avgSkill * 2)}% output)
              {avgSkill < 1 && <span className="text-stone-500"> · gains XP each production tick</span>}
            </p>
          );
        })()}
        {isHousing && building.completed && residents.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {residents.map((r) => (
              <p key={r.id} className="text-[9px] text-amber-100">🏠 {r.name || 'Settler'}{r.surname ? ` ${r.surname}` : ''}</p>
            ))}
          </div>
        )}
        {!building.completed && builders.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {builders.map((b) => (
              <p key={b.id} className="text-[9px] text-amber-100">🔨 {b.name || 'Settler'}{b.surname ? ` ${b.surname}` : ''}</p>
            ))}
          </div>
        )}
        {building.type === BuildingType.Prison && prisoners.length > 0 && (
          <div className="mt-2 space-y-0.5 rounded border border-slate-600/40 bg-slate-900/40 p-2">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Prisoners</p>
            {prisoners.map((p) => {
              const daysLeft = p.prisonerUntilTick ? Math.max(0, Math.ceil((p.prisonerUntilTick - state.tick) / 24)) : 0;
              return (
                <p key={p.id} className="text-[9px] text-slate-300">
                  ⛓️ {p.name || 'Settler'}{p.surname ? ` ${p.surname}` : ''} · {daysLeft} day{daysLeft === 1 ? '' : 's'} left
                </p>
              );
            })}
          </div>
        )}
        {building.completed && BUILDING_JOB_TYPES[building.type] && building.occupants.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {state.entities.filter((e) => building.occupants.includes(e.id)).map((w) => (
              <p key={w.id} className="text-[9px] text-emerald-200">
                👷 {w.name || 'Settler'}{w.surname ? ` ${w.surname}` : ''}
                {w.job ? ` · ${w.job}` : ''}
              </p>
            ))}
          </div>
        )}
      </div>

      {((!building.completed && config.maxOccupants > 0) || (building.completed && BUILDING_JOB_TYPES[building.type])) && (
        <div className="mt-1 space-y-1">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-stone-500">
            {!building.completed ? 'Construction' : 'Workers'}
          </p>
          {building.completed && BUILDING_JOB_TYPES[building.type] && assignableWorkers.length > 0 && building.occupants.length < config.maxOccupants && (
            <div className="mb-1 max-h-28 space-y-1 overflow-y-auto">
              <p className="text-[8px] text-stone-500">
                {building.type === BuildingType.Church ? 'Choose priest:' : 'Choose worker:'}
              </p>
              {assignableWorkers.map((h) => (
                <button
                  key={h.id}
                  onClick={() => onAssignWorker(h.id)}
                  className={`block w-full rounded px-2 py-1 text-left text-[9px] font-semibold text-white ${
                    building.type === BuildingType.Church
                      ? 'bg-violet-700/80 hover:bg-violet-600'
                      : 'bg-emerald-700/80 hover:bg-emerald-600'
                  }`}
                >
                  {building.type === BuildingType.Church ? '⛪ ' : '👷 '}
                  {h.name || 'Settler'}{h.surname ? ` ${h.surname}` : ''}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-1">
          {canAssignWorker && building.occupants.length < config.maxOccupants && assignableWorkers.length === 0 && (
            <button onClick={onAssign} className="rounded bg-emerald-600 px-2 py-1.5 text-[9px] font-bold text-white hover:bg-emerald-500 transition-all">
              + {!building.completed ? 'Assign builder' : idleWorkers > 0 ? `Assign worker (${idleWorkers})` : 'Reassign worker'}
            </button>
          )}
          {!canAssignWorker && building.occupants.length < config.maxOccupants && (
            <p className="col-span-2 text-[9px] text-stone-500">
              No idle settlers — recruit or free up workers.
            </p>
          )}
          {!isHousing && building.occupants.length > 0 && (
            <button onClick={() => onRemove(building.occupants[building.occupants.length - 1])} className="rounded bg-amber-600 px-2 py-1.5 text-[9px] font-bold text-white hover:bg-amber-500">
              − Remove {!building.completed ? 'builder' : 'worker'}
            </button>
          )}
          </div>
        </div>
      )}
      <div className="mt-1 space-y-1">
        <p className="text-[9px] font-semibold uppercase tracking-wider text-stone-500">Building actions</p>
        <div className="grid grid-cols-2 gap-1">
          {building.health < building.maxHealth && (
            <button onClick={onRepair} className="rounded bg-amber-700 px-2 py-1 text-[9px] font-bold text-white hover:bg-amber-600">
              🔧 Repair
            </button>
          )}
          {building.completed && building.level < 3 && upgradeCost && (
            <button onClick={onUpgrade} className="rounded bg-purple-600 px-2 py-1 text-[9px] font-bold text-white hover:bg-purple-500"
              title={`${upgradeCost.wood}w ${upgradeCost.stone}s ${upgradeCost.gold}g`}>
              {isHousing
                ? `⬆ Expand (+${getResidenceUpgradeSlotGain(building.type)})`
                : '⬆ Upgrade'}
            </button>
          )}
          <button onClick={onDemolish} className="col-span-full rounded bg-rose-700 px-2 py-1.5 text-[9px] font-bold text-white hover:bg-rose-600">
            🗑 Demolish{isHousing && residents.length > 0 ? ' (evicts residents)' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniMap({
  worldRef,
  viewRef,
}: {
  worldRef: RefObject<WorldState>;
  viewRef: RefObject<ViewState>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameCounter = useRef(0);

  useEffect(() => {
    let animId = 0;
    const draw = () => {
      frameCounter.current++;
      if (frameCounter.current % 5 === 0) {
        const world = worldRef.current;
        const camera = viewRef.current?.camera;
        const canvas = canvasRef.current;
        if (world && camera && canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const w = 140;
            const h = 100;
            ctx.fillStyle = world.season === Season.Winter ? '#ffffff' : '#72a85c';
            ctx.fillRect(0, 0, w, h);

            const scaleX = w / world.width;
            const scaleY = h / world.height;

            for (const e of world.entities) {
              if (!e.alive || e.type === EntityType.Grass) continue;
              const sx = e.x * scaleX;
              const sy = e.y * scaleY;
              if (e.type === EntityType.Tree) {
                ctx.fillStyle = '#166534';
                ctx.fillRect(sx - 1, sy - 1, 2, 2);
              } else if (e.type === EntityType.Human) {
                ctx.fillStyle = '#fbbf24';
                ctx.fillRect(sx - 1, sy - 1, 2, 2);
              } else {
                ctx.fillStyle = SPECIES_CONFIG[e.type].color;
                ctx.fillRect(sx - 1, sy - 1, 2, 2);
              }
            }

            for (const b of world.buildings) {
              if (!b.completed) continue;
              const sx = b.x * scaleX;
              const sy = b.y * scaleY;
              ctx.fillStyle = BUILDING_CONFIGS[b.type].backgroundColor;
              ctx.fillRect(sx - 2, sy - 2, 4, 3);
            }

            const camW = (world.width / camera.zoom) * scaleX * 0.5;
            const camH = (world.height / camera.zoom) * scaleY * 0.5;
            const camX = camera.x * scaleX - camW / 2;
            const camY = camera.y * scaleY - camH / 2;
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1;
            ctx.strokeRect(camX, camY, camW, camH);
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [worldRef, viewRef]);

  return (
    <div className="absolute bottom-4 left-4 overflow-hidden rounded-lg border border-stone-600 bg-stone-800/80 shadow-xl backdrop-blur">
      <canvas ref={canvasRef} width={140} height={100} className="block" />
    </div>
  );
}
