import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import {
  initGame,
  initTradeRoutes,
  EntityType, BuildingType,

  GAME_TITLE, GAME_VERSION, GAME_PHASE, GAME_SUBTITLE,

  saveGame, loadGame, hasSave, deleteSave, downloadSaveFile, loadGameFromFileText,
  getDiplomacyChoiceEligibility, getVisitorLeaderTalkMeta,
  ensureFullTradeRoutes,
  getCombatPreview,
  formatRaidDeadline, formatRaidLootSummary, raidEventLoot,
  hasIronSpears, hasStoneSpears,
} from './game/gameEngine';
import {
  canPlaceBuilding,
  canAssignWorkerToBuilding,
  listAssignableWorkersForBuilding,
} from './game/buildingActions';
import { MapSize, MapPreset } from './game/gameTypes';
import {
  NIGHT_START, TICKS_PER_DAY, TICKS_PER_HOUR, getHourOfDay, isNightHour, getAbsoluteCalendarDay,
} from './game/dayCycle';
import { getVisitorQuest } from './game/visitorQuest';
import type { WorldState } from './game/gameEngine';

import { GameLoop } from './game/gameLoop';
import type { WorkerCommand } from './game/simWorker/commands';
import type { EntityCatalog } from './game/entityCatalog';
import { resolveAliveHumans } from './game/entityCatalog';
import { computeVillageStats, type VillageStatsSummary } from './game/uiSimSummary';
import { isFoodAlert } from './game/resourceUtils';
import {
  createInitialView,
  zoomCameraViewAt,
  focusCameraOn,
  CAMERA_ZOOM_DEFAULT,
  CAMERA_ZOOM_MIN,
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_STEP_IN,
  CAMERA_ZOOM_STEP_OUT,
  CAMERA_ZOOM_PRESETS,
  clampCameraZoom,
  clampCameraTarget,
  resolveEntity,
  resolveBuilding,
  type ViewState,
} from './game/viewState';
import { isRotatableBuildingType, toggleBuildingRotation } from './game/buildingRotation';

import { preloadAllSprites } from './game/spriteLoader';
import { formatRaidDeadlineSafe } from './game/raidUtils';
import SelectedBuildingPanel from './components/SelectedBuildingPanel';
import MiniMap from './components/MiniMap';
import { isPlayerHuman } from './game/playerHuman';
import { loadNames, fixDefaultNames } from './game/nameLoader';
import { ensureDialogueBankFromBundle, preloadDialogueBank } from './game/dialogueTrees';
import { preloadRenderer } from './game/rendererLoader';
const IntroScreen = lazy(() => import('./game/IntroScreen'));
const MapSetupScreen = lazy(() => import('./game/MapSetupScreen'));
const CombatPreviewPanel = lazy(() => import('./game/CombatPreviewPanel'));
const BuildCatalogPanel = lazy(() => import('./components/BuildCatalogPanel'));
import ActiveEventBanner from './components/ActiveEventBanner';
import BigNewsBanner from './components/BigNewsBanner';
import ShortcutsOverlay from './components/ShortcutsOverlay';
import VisitorCampPanel from './components/VisitorCampPanel';
import SelectedEntityPanel from './components/SelectedEntityPanel';


import { downloadChronicleLog, loadExportChronicleOnSave } from './game/eventLogExport';
import { beginAudio, primeAudioUnlock, playClickSound, stopIntroSong } from './audio';
import { useGameAudio } from './hooks/useGameAudio';
import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useCanvasInteractions } from './hooks/useCanvasInteractions';
import { useContextualTutorial } from './hooks/useContextualTutorial';
import ContextualTutorialCard from './components/ContextualTutorialCard';
import {
  loadTutorialsEnabled,
  loadJuiceEffectsEnabled,
  loadShowSimTick,
  loadFirstNightWarningDismissed,
  loadTutorialChoice,
  saveTutorialChoice,
  saveAutoSavePreference,
  saveTutorialsEnabled,
  saveJuiceEffectsEnabled,
  saveShowSimTick,
  saveFirstNightWarningDismissed,
} from './game/preferences';
import { LabelWithResourceCost } from './components/ResourceCost';
import { BARRICADE_RAID_COST, canAffordResourceCost, formatResourceCostNeed } from './game/resourceCost';
import VillageTabPanel from './components/tabPanels/VillageTabPanel';
import FrontierTabPanel from './components/tabPanels/FrontierTabPanel';
import NatureTabPanel from './components/tabPanels/NatureTabPanel';
import ProgressTabPanel from './components/tabPanels/ProgressTabPanel';
import LogTabPanel from './components/tabPanels/LogTabPanel';
import MoreTabPanel from './components/tabPanels/MoreTabPanel';


import AlertBar from './components/AlertBar';
import Emoji from './components/Emoji';
import GameHeader from './components/GameHeader';

import { getPriorityAlerts, type PriorityAlert } from './game/priorityAlerts';
import type { FocusHintAction } from './game/focusHints';
import './App.css';
import { BUILDING_HOTKEYS } from './game/hotkeys';
import TutorialOverlay from './components/TutorialOverlay';
import TutorialCampaignBanner from './components/TutorialCampaignBanner';
import MomentTitleCard, { type MomentCardData } from './components/MomentTitleCard';
import { currentCampaignStep, TUTORIAL_CAMPAIGN } from './game/tutorialCampaign';
import { VALLEY_CHAPTERS } from './game/valleyChronicle';
import { getBuildingConfig } from './game/buildingConfig';

const SPEED_OPTIONS = [0.5, 1, 2, 3, 5, 10];

type SidebarTab = 'village' | 'frontier' | 'nature' | 'progress' | 'log' | 'more';
type LogSubTab = 'chronicle' | 'combat';

type ProgressSubTab = 'research' | 'trade' | 'goals' | 'charts';
type MoreSubTab = 'guide' | 'roadmap';

const SIDEBAR_TABS: { id: SidebarTab; icon: string; label: string; hint: string }[] = [
  { id: 'village', icon: '🏘️', label: 'Village', hint: 'People, leadership, armament' },
  { id: 'frontier', icon: '🏕️', label: 'Frontier', hint: 'Visitors, rivals, raids' },
  { id: 'nature', icon: '🌿', label: 'Nature', hint: 'Ecosystem & wildlife' },
  { id: 'progress', icon: '📊', label: 'Progress', hint: 'Research · Trade · Goals — press P' },
  { id: 'log', icon: '📜', label: 'Log', hint: 'Village chronicle' },
  { id: 'more', icon: '⋯', label: 'More', hint: 'Guide & roadmap' },
];

const TUTORIAL_DONE_KEY = 'wilderfolk-tutorial-done';



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
  const [selectedMapSize, setSelectedMapSize] = useState<MapSize>(MapSize.Small);
  const [selectedMapPreset, setSelectedMapPreset] = useState<MapPreset>(MapPreset.Verdant);
  const [selectedBuildingType, setSelectedBuildingType] = useState<BuildingType | null>(null);

  const [saveToast, setSaveToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [spritesLoaded, setSpritesLoaded] = useState(false);
  const [openTabs, setOpenTabs] = useState<Set<SidebarTab>>(() => new Set(['village']));
  const activeTab = useMemo(() => {
    const tabs = Array.from(openTabs);
    return tabs[tabs.length - 1] ?? 'village';
  }, [openTabs]);
  const openTab = useCallback((tab: SidebarTab) => {
    setOpenTabs((prev) => new Set(prev).add(tab));
  }, []);
  const toggleTab = useCallback((tab: SidebarTab) => {
    setOpenTabs((prev) => {
      const next = new Set(prev);
      if (next.has(tab)) next.delete(tab);
      else next.add(tab);
      return next;
    });
  }, []);
  const [progressSubTab, setProgressSubTab] = useState<ProgressSubTab>('research');
  const [moreSubTab, setMoreSubTab] = useState<MoreSubTab>('guide');
  const [logSubTab, setLogSubTab] = useState<LogSubTab>('chronicle');
  const [inspectorCollapsed, setInspectorCollapsed] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [tutorialsEnabled, setTutorialsEnabled] = useState(() => loadTutorialsEnabled());
  const [tutorialChoice, setTutorialChoice] = useState(() => loadTutorialChoice());
  const [campaignActive, setCampaignActive] = useState(false);
  const [juiceEffectsEnabled, setJuiceEffectsEnabled] = useState(() => loadJuiceEffectsEnabled());
  const [showSimTick, setShowSimTick] = useState(() => loadShowSimTick());
  const [momentCard, setMomentCard] = useState<MomentCardData | null>(null);
  // Last Valley Chronicle chapter the player has dismissed — lets the chapter card
  // be derived purely in render (no effect/ref: `world` is a fresh object every tick).
  const [dismissedChapter, setDismissedChapter] = useState<string | null>(null);
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
  const [hiddenBigNewsIds, setHiddenBigNewsIds] = useState<ReadonlySet<string>>(() => new Set());
  const [hiddenActiveEventIds, setHiddenActiveEventIds] = useState<ReadonlySet<string>>(() => new Set());
  const gameplayActive = !showIntro && !showMapSetup && spritesLoaded;
  const { muted, volumePreset, toggleMute: handleToggleMute, setVolumePreset: handleVolumePreset } = useGameAudio(world, gameplayActive);

  useEffect(() => {
    if (showIntro || gameplayActive) return;
    stopIntroSong();
  }, [showIntro, gameplayActive]);

  useEffect(() => {
    if (!gameplayActive) return;
    void beginAudio();
  }, [gameplayActive]);
  const { active: contextualTip, dismissActive: dismissContextualTip, markSeen: markContextualTipSeen } = useContextualTutorial(
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
  const audioStartedRef = useRef(false);

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
  const rightClickOriginRef = useRef<{ x: number; y: number } | null>(null);
  const selectedBuildingTypeRef = useRef(selectedBuildingType);
  const stripDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const cameraVelRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<Set<string>>(new Set());
  const sidebarContentRef = useRef<HTMLDivElement>(null);
  const gameplayActiveRef = useRef(gameplayActive);
  const dismissBigNewsRef = useRef<(id: string) => void>(() => {});
  const dismissActiveEventRef = useRef<() => void>(() => {});
  const dismissTipRef = useRef<() => void>(() => {});
  const topBigNewsIdRef = useRef<string | null>(null);
  const hasActiveEventRef = useRef(false);
  const hasContextualTipRef = useRef(false);
  const persistCurrentGameRef = useRef<
    (options?: { chronicle?: boolean; feedback?: boolean }) => Promise<boolean>
  >(async () => false);

  useLayoutEffect(() => {
    selectedBuildingTypeRef.current = selectedBuildingType;
    gameplayActiveRef.current = gameplayActive;
  }, [selectedBuildingType, gameplayActive]);

  // Preload sprites, names, and dialogue bank (sim_dialogue_trees.json)
  useEffect(() => {
    Promise.all([preloadAllSprites(), loadNames(), preloadDialogueBank(), preloadRenderer()])
      .then(() => {
        setWorld((prev) => {
          const next = structuredClone(prev) as WorldState;
          fixDefaultNames(next);
          worldRef.current = next;
          return next;
        });
        setSpritesLoaded(true);
      })
      .catch((err) => {
        console.error('Asset preload failed — continuing with fallbacks', err);
        // Still install dialogue trees so speech bubbles use the bank.
        ensureDialogueBankFromBundle();
        setSpritesLoaded(true);
      });
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
    if (!view) return false;
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

  const autoSaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-save every 30 seconds (stable interval via ref guard)
  useEffect(() => {
    if (autoSaveIntervalRef.current) return;
    autoSaveIntervalRef.current = setInterval(() => {
      const loop = loopRef.current;
      if (!loop) return;
      const snapshot = loop.getWorld();
      if (!snapshot.autoSave) return;
      void persistCurrentGameRef.current({ chronicle: false, feedback: false }).then((ok) => {
        if (!ok) {
          setSaveToast({ message: 'Auto-save failed — try manual save from the menu', type: 'error' });
        }
      });
    }, 30000);
    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
        autoSaveIntervalRef.current = null;
      }
    };
  }, []);

  // Auto-dismiss big news after ~15s (360 ticks) — stable interval, no length dep
  useEffect(() => {
    const timer = setInterval(() => {
      loopRef.current?.mutateWorld((prev) => {
        if (prev.bigNews.length === 0) return;
        const now = prev.tick;
        const updated = prev.bigNews
          .map((n) => ({ ...n, dismissed: n.dismissed || now - n.createdAt > 360 }))
          .filter((n) => !n.dismissed || now - n.createdAt < 600);
        const changed = updated.length !== prev.bigNews.length
          || updated.some((n, i) => n.dismissed !== prev.bigNews[i]?.dismissed);
        if (changed) prev.bigNews = updated;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fade out toast notifications after ~12s unless the player dismisses them first
  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - 12_000;
      loopRef.current?.mutateWorld((w) => {
        const next = w.notifications.filter((n) => n.createdAt > cutoff);
        if (next.length !== w.notifications.length) w.notifications = next;
      });
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // Best-effort save on unmount when a session is still active
  useEffect(() => {
    return () => {
      const loop = loopRef.current;
      if (!loop) return;
      const view = loop.getView() ?? viewRef.current;
      if (!view) return;
      void persistCurrentGameRef.current({ chronicle: false, feedback: false });
    };
  }, []);

  // Keep the sim frozen while Quick Start or map setup is open
  useEffect(() => {
    if (!spritesLoaded || showIntro || showMapSetup || !showTutorial) return;
    loopRef.current?.mutateWorld((w) => { w.paused = true; });
  }, [showTutorial, spritesLoaded, showIntro, showMapSetup]);

  // The colony founds at 08:00 (tick = TICKS_PER_HOUR * 8) — day boundaries sit at
  // tick 24, 96, 168… so "first game day" and the warning window anchor there.
  const isFirstGameDay = world.tick < TICKS_PER_DAY + TICKS_PER_HOUR * 8;

  // First-night shelter reminder until a House is placed (or player dismisses)
  const showFirstNightWarning =
    !firstNightWarningDismissed && !hasPlacedHouse && world.tick < TICKS_PER_DAY * 2 + TICKS_PER_HOUR * 8;

  const hourNow = getHourOfDay(world.tick);
  const nightFallen = isNightHour(hourNow);
  // "Sunset is approaching" only makes sense in the afternoon — not at 08:00.
  const sunsetApproaching = isFirstGameDay && !nightFallen && hourNow >= NIGHT_START - 4;
  const firstNightWarningMessage = !nightFallen
    ? `Hour ${hourNow}:00 — night begins at ${NIGHT_START}:00. Place a House on the map and assign workers!`
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
    const unsub = loop.subscribe((nextWorld, nextView, simChanged, nextCatalog) => {
      worldRef.current = nextWorld;
      viewRef.current = nextView;
      catalogRef.current = nextCatalog;
      // Canvas/minimap read refs every frame — skip React commits on 100ms periodic polls.
      if (!simChanged) return;
      setCatalog(nextCatalog);
      setVillageStats(computeVillageStats(nextWorld, nextCatalog));
      setHasPlacedHouse((prev) => prev || nextWorld.buildings.some(
        (b) => b.type === BuildingType.House && (b.completed || b.constructionProgress > 0),
      ));
      setWorld(nextWorld);
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
    const loop = loopRef.current;
    if (!loop) return;
    const wasPaused = loop.getWorld().paused;
    loop.mutateWorld((w) => { w.paused = !w.paused; });
    if (wasPaused) {
      void loop.applyCommand({ proto: 1, op: 'autoStaffWorkers' });
    }
  }, []);

  const resumeAfterTutorialOverlay = useCallback(() => {
    primeAudioUnlock();
    const loop = loopRef.current;
    if (!loop) return;
    const w = loop.getWorld();
    const settlers = catalogRef.current?.getPlayerHumans()
      ?? w.entities.filter((ent) => ent.alive && isPlayerHuman(ent));
    if (settlers.length > 0) {
      const cx = settlers.reduce((sum, ent) => sum + ent.x, 0) / settlers.length;
      const cy = settlers.reduce((sum, ent) => sum + ent.y, 0) / settlers.length;
      const nextView = focusCameraOn(loop.getView(), cx, cy, 1.5);
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      loop.patchView({
        camera: clampCameraTarget(
          nextView.camera, w.width, w.height,
          rect?.width ?? w.width, rect?.height ?? w.height,
        ),
      });
    }
    loop.mutateWorld((session) => { session.paused = false; });
  }, []);

  const acknowledgeContextualTip = useCallback(() => {
    if (!contextualTip) return;
    const tipId = contextualTip.id;
    dismissContextualTip();
    markContextualTipSeen(tipId);
    loopRef.current?.mutateWorld((w) => {
      w.tutorialSeen = [...new Set([...(w.tutorialSeen ?? []), tipId])];
    });
  }, [contextualTip, dismissContextualTip, markContextualTipSeen]);

  // Auto-acknowledge a tip after a short grace — a card can never nag forever
  // or re-appear if the player ignores it (also persists it into the save).
  useEffect(() => {
    if (!contextualTip) return;
    const timer = setTimeout(() => acknowledgeContextualTip(), 20_000);
    return () => clearTimeout(timer);
  }, [contextualTip, acknowledgeContextualTip]);

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

  const handleTutorialChoiceChange = useCallback((enabled: boolean) => {
    saveTutorialChoice(enabled);
    setTutorialChoice(enabled);
  }, []);

  // Current first-spring guide step — advances automatically as the player plays.
  // (When every step is complete, currentCampaignStep returns null and the banner
  // simply stops rendering; campaignActive can stay true harmlessly for the session.)
  const campaignStep = useMemo(() => {
    if (!campaignActive || !world) return null;
    return currentCampaignStep(world);
  }, [campaignActive, world]);
  const campaignStepIndex = useMemo(() => {
    if (!campaignStep) return -1;
    return TUTORIAL_CAMPAIGN.findIndex((s) => s.id === campaignStep.id);
  }, [campaignStep]);

  // Valley Chronicle chapter moments — derive the pending title card in render.
  // Pure computation (no effect/ref): `world` is a fresh object every tick, and the
  // card auto-dismisses via MomentTitleCard's own timers once `onDone` stays stable.
  const pendingChapterCard = useMemo(() => {
    const ids = world?.chronicleChapters ?? [];
    const last = ids.length > 0 ? ids[ids.length - 1] : null;
    if (!last || last === dismissedChapter) return null;
    return VALLEY_CHAPTERS.find((c) => c.id === last) ?? null;
  }, [world, dismissedChapter]);
  const activeMoment = momentCard ?? pendingChapterCard;
  const dismissMomentCard = useCallback(() => {
    if (momentCard) {
      setMomentCard(null);
      return;
    }
    if (pendingChapterCard) setDismissedChapter(pendingChapterCard.id);
  }, [momentCard, pendingChapterCard]);

  const handleToggleShowSimTick = useCallback(() => {
    const next = !showSimTick;
    saveShowSimTick(next);
    setShowSimTick(next);
  }, [showSimTick]);

  const finishTutorial = useCallback(() => {
    try {
      localStorage.setItem(TUTORIAL_DONE_KEY, '1');
    } catch { /* ignore */ }
    setShowTutorial(false);
    setTutorialStep(0);
    resumeAfterTutorialOverlay();
  }, [resumeAfterTutorialOverlay]);

  const dismissNotification = useCallback((id: string) => {
    playClickSound();
    loopRef.current?.mutateWorld((w) => {
      w.dismissedNotificationIds = [...new Set([...(w.dismissedNotificationIds ?? []), id])];
      w.notifications = w.notifications.filter((n) => n.id !== id);
    });
  }, []);

  const dismissBigNewsItem = useCallback((id: string) => {
    playClickSound();
    setHiddenBigNewsIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    loopRef.current?.mutateWorld((w) => {
      w.dismissedBigNewsIds = [...new Set([...(w.dismissedBigNewsIds ?? []), id])];
      w.bigNews = w.bigNews.filter((n) => n.id !== id);
    });
  }, []);

  const dismissActiveEvent = useCallback(() => {
    const w = worldRef.current;
    const evt = w.activeEvent;
    if (!evt) return;
    playClickSound();
    const visitorNewsIds = evt.id.startsWith('visitor_')
      ? w.bigNews.filter((n) => n.title.includes('Visitors Arrived')).map((n) => n.id)
      : [];
    setHiddenActiveEventIds((prev) => {
      if (prev.has(evt.id)) return prev;
      const next = new Set(prev);
      next.add(evt.id);
      return next;
    });
    if (visitorNewsIds.length > 0) {
      setHiddenBigNewsIds((prev) => {
        const next = new Set(prev);
        for (const id of visitorNewsIds) next.add(id);
        return next;
      });
    }
    loopRef.current?.mutateWorld((session) => {
      session.dismissedActiveEventIds = [...new Set([...(session.dismissedActiveEventIds ?? []), evt.id])];
      session.activeEvent = null;
      if (visitorNewsIds.length > 0) {
        session.dismissedBigNewsIds = [...new Set([...(session.dismissedBigNewsIds ?? []), ...visitorNewsIds])];
        session.bigNews = session.bigNews.filter((n) => !visitorNewsIds.includes(n.id));
      }
    });
  }, []);

  const toggleGrid = useCallback(() => {
    const loop = loopRef.current;
    if (!loop) return;
    const next = !loop.getView().showGrid;
    loop.patchView({ showGrid: next });
  }, []);

  // The "Click map repeatedly to place more" hint shows for the first-ever
  // (Placement how-to was removed with the build banner — the ghost on the
  // map is the only placement indicator; Esc / right-click exits.)
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
      selectedEntityIds: [],
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
      selectedEntityIds: [],
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
      selectedEntityIds: [],
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
      selectedEntityIds: [entity.id],
      selectedBuildingId: null,
      highlightedCampKey: null,
      selectedCampKey: null,
    });
    setInspectorCollapsed(false);
  }, []);

  /** Favorite = follow this citizen with the camera until cleared or they die. */
  const toggleFavoriteCitizen = useCallback((entityId: number) => {
    const loop = loopRef.current;
    if (!loop) return;
    const view = loop.getView();
    const nextId = view.favoriteEntityId === entityId ? null : entityId;
    if (nextId != null) {
      const ent = resolveEntity(loop.getWorld(), nextId)
        ?? catalogRef.current?.get(nextId)
        ?? null;
      if (!ent?.alive) {
        loop.patchView({ favoriteEntityId: null });
        return;
      }
      const nextView = focusCameraOn(view, ent.x, ent.y, 1.5);
      loop.patchView({
        ...nextView,
        favoriteEntityId: nextId,
        selectedEntityId: nextId,
        selectedEntityIds: [nextId],
        selectedBuildingId: null,
        selectedCampKey: null,
        highlightedCampKey: null,
      });
      setInspectorCollapsed(false);
      setView(loop.getView());
      return;
    }
    loop.patchView({ favoriteEntityId: null });
    setView(loop.getView());
  }, []);

  // Keep camera on favorite citizen each sim tick
  useEffect(() => {
    const loop = loopRef.current;
    if (!loop || showIntro || showMapSetup) return;
    const view = loop.getView();
    const id = view.favoriteEntityId;
    if (id == null) return;
    const w = loop.getWorld();
    const ent = resolveEntity(w, id) ?? catalogRef.current?.get(id) ?? null;
    if (!ent?.alive) {
      loop.patchView({ favoriteEntityId: null });
      return;
    }
    const nextView = focusCameraOn(view, ent.x, ent.y);
    const rect = canvasRef.current?.getBoundingClientRect();
    loop.patchView({
      camera: clampCameraTarget(
        nextView.camera, w.width, w.height,
        rect?.width ?? w.width, rect?.height ?? w.height,
      ),
    });
  }, [world.tick, showIntro, showMapSetup]);

  const selectBuildingType = useCallback((type: BuildingType) => {
    clearSelection();
    setBuildPanelOpen(true);
    stripDragStartRef.current = null;
    setSelectedBuildingType(type);
    loopRef.current?.patchView({
      buildMode: type,
      buildGhost: null,
      buildStripPreview: null,
      buildRotation: 0,
      showGrid: true,
      selectedBuildingId: null,
      selectedEntityId: null,
      selectedEntityIds: [],
    });
  }, [clearSelection]);

  const handleHintAction = useCallback((action: FocusHintAction) => {
    playClickSound();
    switch (action.id) {
      case 'open_goals':
        openTab('progress');
        setProgressSubTab('goals');
        break;
      case 'open_frontier':
        openTab('frontier');
        break;
      case 'open_trade':
        openTab('progress');
        setProgressSubTab('trade');
        break;
      case 'build_market':
        selectBuildingType(BuildingType.Market);
        break;
      case 'open_research':
        openTab('progress');
        setProgressSubTab('research');
        break;
      case 'open_village':
        openTab('village');
        break;
      case 'open_nature':
        openTab('nature');
        break;
      case 'open_log':
        openTab('log');
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
          openTab('frontier');
          focusCampOnMap('visitor', action.visitorId, action.visitorX, action.visitorY);
          setInspectorCollapsed(false);
        }
        break;
      case 'focus_rival':
        if (action.rivalId != null && action.rivalX != null && action.rivalY != null) {
          openTab('frontier');
          focusCampOnMap('rival', action.rivalId, action.rivalX, action.rivalY, action.rivalBuildingId);
          setInspectorCollapsed(false);
        }
        break;
      case 'focus_blacksmith':
        if (action.buildingId != null && action.buildingX != null && action.buildingY != null) {
          openTab('village');
          focusBuildingOnMap(action.buildingId, action.buildingX, action.buildingY);
        }
        break;
      case 'build_blacksmith':
        selectBuildingType(BuildingType.Blacksmith);
        setBuildPanelOpen(true);
        break;
    }
  }, [selectBuildingType, focusCampOnMap, focusBuildingOnMap, openTab]);

  const handlePriorityAlert = useCallback((alert: PriorityAlert) => {
    playClickSound();
    const action = alert.action;
    switch (action.type) {
      case 'tab':
        openTab(action.tab);
        if (action.progressSub) setProgressSubTab(action.progressSub);
        break;
      case 'build':
        selectBuildingType(action.building);
        setBuildPanelOpen(true);
        break;
      case 'focus_rival':
        openTab('frontier');
        focusCampOnMap('rival', action.rivalId, action.x, action.y, action.buildingId);
        setInspectorCollapsed(false);
        break;
      case 'focus_visitor':
        openTab('frontier');
        focusCampOnMap('visitor', action.groupId, action.x, action.y);
        setInspectorCollapsed(false);
        break;
      case 'focus_building':
        focusBuildingOnMap(action.buildingId, action.x, action.y);
        break;
    }
  }, [selectBuildingType, focusCampOnMap, focusBuildingOnMap, openTab]);

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
    // Viewport-aware clamp: keeps the visible area inside the world even when
    // zoomed out (no empty ring around the map).
    loop.patchView({ camera: clampCameraTarget(next.camera, world.width, world.height, cw, ch) });
  }, []);

  const applyZoomRef = useRef(applyZoom);

  const resetZoom = useCallback(() => {
    const loop = loopRef.current;
    const canvas = canvasRef.current;
    if (!loop || !canvas) return;
    const world = loop.getWorld();
    const { width: cw, height: ch } = canvas.getBoundingClientRect();
    const cam = loop.getView().camera;
    const next = focusCameraOn(loop.getView(), cam.targetX, cam.targetY, CAMERA_ZOOM_DEFAULT);
    loop.patchView({ camera: clampCameraTarget(next.camera, world.width, world.height, cw, ch) });
  }, []);

  /** Jump to a preset zoom level (keeps camera center). */
  const setZoomLevel = useCallback((zoom: number) => {
    const loop = loopRef.current;
    const canvas = canvasRef.current;
    if (!loop || !canvas) return;
    const world = loop.getWorld();
    const { width: cw, height: ch } = canvas.getBoundingClientRect();
    const cam = loop.getView().camera;
    const next = focusCameraOn(loop.getView(), cam.targetX, cam.targetY, clampCameraZoom(zoom));
    loop.patchView({ camera: clampCameraTarget(next.camera, world.width, world.height, cw, ch) });
  }, []);

  // passive:false — React onWheel cannot preventDefault on modern browsers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = e.deltaY > 0 ? CAMERA_ZOOM_STEP_OUT : CAMERA_ZOOM_STEP_IN;
      applyZoomRef.current(factor, e.clientX - rect.left, e.clientY - rect.top);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [spritesLoaded, showIntro, showMapSetup]);

  useLayoutEffect(() => {
    togglePauseRef.current = togglePause;
    selectBuildingTypeRef.current = selectBuildingType;
    cancelBuildModeRef.current = cancelBuildMode;
    toggleGridRef.current = toggleGrid;
    rotateBuildPlacementRef.current = rotateBuildPlacement;
    showShortcutsRef.current = showShortcuts;
    applyZoomRef.current = applyZoom;
  }, [togglePause, selectBuildingType, cancelBuildMode, toggleGrid, rotateBuildPlacement, showShortcuts, applyZoom]);

  useKeyboardControls({
    loopRef,
    selectedBuildingTypeRef,
    gameplayActiveRef,
    showShortcutsRef,
    keysRef,
    cameraVelRef,
    catalogRef,
    openTab,
    setProgressSubTab,
    setShowShortcuts,
    setBuildPanelOpen,
    cancelBuildModeRef,
    togglePauseRef,
    selectBuildingTypeRef,
    toggleGridRef,
    rotateBuildPlacementRef,
    applyZoomRef,
    dismissBigNewsRef,
    dismissActiveEventRef,
    dismissTipRef,
    topBigNewsIdRef,
    hasActiveEventRef,
    hasContextualTipRef,
    persistCurrentGameRef,
  });

  const {
    handleCanvasClick,
    handleMouseMove,
    handleMouseDown,
    handleMouseUp,
    handleMouseLeave,
    handleContextMenu,
  } = useCanvasInteractions({
    canvasRef,
    loopRef,
    worldRef,
    catalogRef,
    selectedBuildingType,
    getViewCamera,
    applyGameAction,
    stripDragStartRef,
    isDraggingRef,
    cameraDragStartRef,
    clickOriginRef,
    rightClickOriginRef,
    setInspectorCollapsed,
    juiceEffectsEnabled,
    gameplayActive,
    cancelBuildMode,
    onPrimeAudioUnlock: primeAudioUnlock,
    audioStartedRef,
  });

  const setSpeed = useCallback((speed: number) => {
    loopRef.current?.mutateWorld((w) => { w.speed = speed; });
  }, []);

  const handleOpenTrade = useCallback(() => {
    openTab('progress');
    setProgressSubTab('trade');
  }, [openTab]);

  const handleOpenGuide = useCallback(() => {
    openTab('more');
    setMoreSubTab('guide');
  }, [openTab]);
  const beginNewGameSession = useCallback((villageName: string) => {
    deleteSave();
    const s = initGame({ size: selectedMapSize, preset: selectedMapPreset, villageName });
    // Only pause when the quick-start overlay will actually show — otherwise the sim stays frozen.
    // Respect the done flag too: a player who already skipped/completed the tutorial must not
    // get the "how to place buildings" overlay again on a new game.
    let tutorialDone = false;
    try {
      tutorialDone = localStorage.getItem(TUTORIAL_DONE_KEY) === '1';
    } catch { /* ignore */ }
    const showQuickStart = tutorialsEnabled && !tutorialDone;
    s.paused = showQuickStart;
    s.tradeRoutes = ensureFullTradeRoutes(initTradeRoutes());
    const nextView = createInitialView(s.width, s.height);
    worldRef.current = s;
    viewRef.current = nextView;
    setHiddenBigNewsIds(new Set());
    setHiddenActiveEventIds(new Set());
    setWorld(s);
    setView(nextView);
    loopRef.current?.setSession(s, nextView);
    setSelectedBuildingType(null);
    setHasSavedGame(false);
    setFirstNightWarningDismissed(false);
    saveFirstNightWarningDismissed(false);
    setShowTutorial(showQuickStart);
    setTutorialStep(0);
    setCampaignActive(tutorialChoice);
    setDismissedChapter(null);
    setShowMapSetup(false);
  }, [selectedMapSize, selectedMapPreset, tutorialsEnabled, tutorialChoice]);

  const startNewGame = useCallback(() => {
    setMapSetupSource('game');
    setShowMapSetup(true);
  }, []);

  const toggleAutoSave = useCallback(() => {
    loopRef.current?.mutateWorld((w) => {
      w.autoSave = !w.autoSave;
      saveAutoSavePreference(w.autoSave);
    });
  }, []);

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
    setHiddenBigNewsIds(new Set([
      ...(loaded.world.dismissedBigNewsIds ?? []),
      ...loaded.world.bigNews.filter((n) => n.dismissed).map((n) => n.id),
    ]));
    setHiddenActiveEventIds(new Set(loaded.world.dismissedActiveEventIds ?? []));
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
          : 'No browser save — use Load from file',
        type: 'error',
      });
    }
  }, [applyLoadedSession]);

  const handleSaveToFile = useCallback(async () => {
    const loop = loopRef.current;
    const view = loop?.getView() ?? viewRef.current;
    if (!view) return;
    let worldToSave = worldRef.current;
    if (loop) {
      worldToSave = await loop.exportAuthoritativeWorld();
    }
    const result = downloadSaveFile(worldToSave, view);
    if (!result.success) {
      setSaveToast({ message: result.error, type: 'error' });
      return;
    }
    setHasSavedGame(true);
    setSaveToast({
      message: 'Save downloaded — keep the .json file safe',
      type: 'success',
    });
  }, []);

  const handleLoadFromFile = useCallback((jsonText: string) => {
    if (!jsonText.trim()) {
      setSaveToast({ message: 'Could not read that file', type: 'error' });
      return;
    }
    const loaded = loadGameFromFileText(jsonText);
    if (loaded) {
      applyLoadedSession(loaded);
      setShowMapSetup(false);
      setHasSavedGame(true);
      // Keep browser slot in sync with the file you just loaded
      try {
        saveGame(loaded.world, loaded.view);
      } catch {
        /* ignore */
      }
      setSaveToast({ message: 'Colony loaded from file', type: 'success' });
    } else {
      setSaveToast({
        message: 'Save from a different build — beta keeps only current-build saves. Start a new settlement.',
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

  const activeBigNews = world.bigNews.filter(
    (n) => !n.dismissed && !hiddenBigNewsIds.has(n.id),
  );
  const activeEventDismissible = !!(
    world.activeEvent && !hiddenActiveEventIds.has(world.activeEvent.id)
  );

  useLayoutEffect(() => {
    dismissBigNewsRef.current = dismissBigNewsItem;
    dismissActiveEventRef.current = dismissActiveEvent;
    dismissTipRef.current = acknowledgeContextualTip;
    topBigNewsIdRef.current = activeBigNews.length > 0
      ? activeBigNews[activeBigNews.length - 1].id
      : null;
    hasActiveEventRef.current = activeEventDismissible;
    hasContextualTipRef.current = !!(contextualTip && tutorialsEnabled && !showTutorial);
  }, [
    dismissBigNewsItem,
    dismissActiveEvent,
    acknowledgeContextualTip,
    activeBigNews,
    activeEventDismissible,
    contextualTip,
    tutorialsEnabled,
    showTutorial,
  ]);

  const priorityAlerts = getPriorityAlerts(world);
  const tradeReadyCount = useMemo(() => {
    const hasMarket = world.buildings.some(
      (b) => b.completed && b.faction !== 'rival' && b.type === BuildingType.Market,
    );
    if (!hasMarket) return 0;
    return world.tradeRoutes.filter((r) => !r.active && world.villageReputation >= r.reputationRequired).length;
  }, [world.tradeRoutes, world.villageReputation, world.buildings]);
  const progressTabAlert = world.activeResearch != null || tradeReadyCount > 0;
  const foodAlert = isFoodAlert(world);

  const selectedBuildingIdleWorkerCount = useMemo(() => {
    const building = resolveBuilding(world, view.selectedBuildingId);
    if (!building) return 0;
    const humans = resolveAliveHumans(world, catalog ?? undefined);
    if (!building.completed) {
      return humans.filter((human) => {
        if (human.isJuvenile || human.faction) return false;
        return !world.buildings.some(
          (b) => !b.completed && b.occupants.includes(human.id),
        );
      }).length;
    }
    return humans.filter(
      (human) => !human.isJuvenile && human.homeBuildingId == null && !human.faction,
    ).length;
  }, [view.selectedBuildingId, world, catalog]);

  if (showIntro) {
    return (
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-stone-950 text-stone-400">Loading…</div>}>
        <IntroScreen
          onContinue={() => {
            setShowIntro(false);
            setMapSetupSource('intro');
            setShowMapSetup(true);
          }}
        />
      </Suspense>
    );
  }

  if (showMapSetup) {
    return (
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-stone-950 text-stone-400">Loading…</div>}>
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
          beginNewGameSession(villageName);
        }}
        onLoad={() => {
          primeAudioUnlock();
          handleLoadFromSetup();
        }}
        hasSave={hasSavedGame || hasSave()}
        tutorialsEnabled={tutorialsEnabled}
        onTutorialsChange={(enabled) => {
          saveTutorialsEnabled(enabled);
          setTutorialsEnabled(enabled);
          if (!enabled) {
            try {
              localStorage.setItem(TUTORIAL_DONE_KEY, '1');
            } catch { /* ignore */ }
            setShowTutorial(false);
            dismissContextualTip();
          }
        }}
        tutorialChoice={tutorialChoice}
        onTutorialChoiceChange={handleTutorialChoiceChange}
      />
      </Suspense>
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
  const pendingDiplomacy = world.pendingDiplomacyEvents ?? [];
  const pendingRaids = world.pendingRaidEvents ?? [];
  const pendingOutgoingRaids = world.pendingOutgoingRaidEvents ?? [];
  const activeEventForBanner = world.activeEvent && !hiddenActiveEventIds.has(world.activeEvent.id)
    ? world.activeEvent
    : null;
  const showActiveEventBanner = !!(
    activeEventForBanner
    && pendingDiplomacy.length === 0
    && pendingRaids.length === 0
  );

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
    <div className="game-shell flex h-screen w-screen flex-col overflow-hidden text-stone-100">
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
        onOpenTrade={handleOpenTrade}
        onSave={handleSave}
        onLoad={handleLoad}
        onSaveToFile={() => { void handleSaveToFile(); }}
        onLoadFromFile={handleLoadFromFile}
        tutorialsEnabled={tutorialsEnabled}
        juiceEffectsEnabled={juiceEffectsEnabled}
        showSimTick={showSimTick}
        onToggleAutoSave={toggleAutoSave}
        onToggleTutorials={handleToggleTutorials}
        onToggleJuiceEffects={handleToggleJuiceEffects}
        onToggleShowSimTick={handleToggleShowSimTick}
        onToggleMute={handleToggleMute}
        onVolumePreset={handleVolumePreset}
        onOpenGuide={handleOpenGuide}
        onStartNewGame={startNewGame}
        onFocusLeader={() => {
          const leaderId = world.villageLeaderId;
          if (leaderId == null) return;
          const leader =
            catalog?.get(leaderId)
            ?? resolveEntity(world, leaderId)
            ?? world.entities.find((e) => e.id === leaderId);
          if (leader?.alive) focusCitizenOnMap(leader);
        }}
      />

      <AlertBar alerts={priorityAlerts} onAlert={handlePriorityAlert} />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — collapsible construction panel */}
        <aside
          className={`build-panel side-panel relative flex shrink-0 flex-col border-r border-stone-700/80 transition-[width] duration-150 ease-in-out ${
            buildPanelOpen ? 'w-[15.5rem]' : 'w-12'
          }`}
        >
          <button
            onClick={() => setBuildPanelOpen((open) => !open)}
            className="build-panel-toggle absolute -right-3 top-5 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-stone-600 bg-stone-850 text-xs font-bold text-stone-300 shadow-lg transition-all hover:border-emerald-500/50 hover:bg-stone-700 hover:text-emerald-300"
            title={buildPanelOpen ? 'Collapse build panel (B)' : 'Expand build panel (B)'}
          >
            {buildPanelOpen ? '‹' : '›'}
          </button>

          {buildPanelOpen ? (
            <Suspense fallback={<p className="p-3 text-[10px] text-stone-500">Loading build catalog…</p>}>
              <BuildCatalogPanel
                world={world}
                selected={selectedBuildingType}
                showGrid={view.showGrid}
                hotkeys={BUILDING_HOTKEYS}
                onSelect={selectBuildingType}
                onLocked={(type) => applyGameAction({ proto: 1, op: 'notifyBuildingLocked', type })}
                onCancel={cancelBuildMode}
                onToggleGrid={toggleGrid}
              />
            </Suspense>
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
                    title={`Cancel ${getBuildingConfig(selectedBuildingType).label} (ESC)`}
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
        <main className="map-stage relative" style={{ flex: '1 1 0%', minHeight: 0, minWidth: 0 }}>
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={(e) => handleMouseUp(e)}
            onMouseLeave={handleMouseLeave}
            onContextMenu={handleContextMenu}
            className="map-canvas"
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', imageRendering: 'pixelated', cursor: canvasCursor, display: 'block' }}
          />
          {/* UI vignette frame over the map (does not block hits except children) */}
          <div className="map-frame-overlay pointer-events-none absolute inset-0 z-[5]" aria-hidden />

          <div className="pointer-events-none absolute inset-0 z-10">
          {/* Build mode is shown by the building ghost following the cursor —
              no banner. Esc / right-click exits placement; R rotates. */}
          
          {/* Floating notifications — top-right, clear of build rail & banners */}
          <div
            className="pointer-events-auto absolute right-3 top-3 z-[40] flex max-h-[calc(100vh-7rem)] w-[min(20rem,calc(100vw-8rem))] flex-col gap-1.5 overflow-y-auto pr-0.5"
            aria-live="polite"
          >
            {world.notifications.slice(-4).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (n.focus) {
                    const loop = loopRef.current;
                    if (loop) {
                      const nextView = focusCameraOn(loop.getView(), n.focus.x, n.focus.y, 1.5);
                      const rect = canvasRef.current?.getBoundingClientRect();
                      loop.patchView({
                        camera: clampCameraTarget(
                          nextView.camera, world.width, world.height,
                          rect?.width ?? world.width, rect?.height ?? world.height,
                        ),
                      });
                    }
                  }
                  // Visitor/rival camp notification — select the camp so the
                  // inspector opens with its talk/trade actions visible.
                  if (n.campKey) {
                    loopRef.current?.patchView({
                      selectedCampKey: n.campKey,
                      selectedEntityId: null,
                      selectedEntityIds: [],
                      selectedBuildingId: null,
                    });
                    setInspectorCollapsed(false);
                  }
                  dismissNotification(n.id);
                }}
                title={n.focus ? (n.campKey ? 'Open camp · click to dismiss' : 'Focus location · click to dismiss') : 'Dismiss'}
                className={`group relative w-full rounded-xl border-2 px-3 py-2 pr-8 text-left text-xs shadow-xl backdrop-blur-md transition-all animate-in slide-in-from-right hover:brightness-110 ${
                  n.type === 'success'
                    ? 'border-emerald-500/45 bg-emerald-950/92 text-emerald-100'
                    : n.type === 'warning'
                      ? 'border-amber-500/45 bg-amber-950/92 text-amber-100'
                      : n.type === 'event'
                        ? 'border-sky-500/40 bg-sky-950/92 text-sky-100'
                        : 'border-stone-500/50 bg-stone-900/94 text-stone-100'
                }`}
              >
                <span className="block font-bold leading-tight">{n.title}</span>
                <span className="mt-0.5 block text-[11px] leading-snug opacity-90">{n.message}</span>
                <span className="absolute right-2 top-2 text-sm leading-none text-stone-400 group-hover:text-white">×</span>
              </button>
            ))}
          </div>

          {/* Raid defense — respond before march deadline (distance-scaled) */}
          {pendingOutgoingRaids.length > 0 && (
            <div className={`pointer-events-auto absolute left-1/2 ${pendingRaids.length > 0 ? 'top-44' : 'top-4'} z-20 w-full max-w-lg -translate-x-1/2 animate-in fade-in slide-in-from-top`}>
              {pendingOutgoingRaids.slice(0, 2).map((evt) => (
                <div key={evt.id} className="mb-2 rounded-xl border border-orange-500/50 bg-orange-950/95 p-3 shadow-xl backdrop-blur">
                  <div className="flex items-start gap-3">
                    <Emoji className="text-2xl">{evt.emoji}</Emoji>
                    <div className="flex-1">
                      <h3 className="font-bold text-orange-100">{evt.title}</h3>
                      <p className="text-xs text-stone-300">{evt.description}</p>
                      <p className="mt-1 text-[9px] text-orange-300/90">
                        {evt.rivalResponse === 'payoff_offer'
                          ? `Offer: ${formatRaidLootSummary(raidEventLoot(evt))}`
                          : 'They chose to fight'}
                        {' · '}
                        <strong>{formatRaidDeadlineSafe(evt, world.tick)}</strong>
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
            <div className="pointer-events-auto absolute left-1/2 top-4 z-20 w-full max-w-lg -translate-x-1/2 animate-in fade-in slide-in-from-top">
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
                    <Emoji className="text-2xl">{evt.emoji}</Emoji>
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
                        <Suspense fallback={<p className="text-[9px] text-stone-500">Loading preview…</p>}>
                          <CombatPreviewPanel
                            compact
                            preview={raidPreview}
                            title="If they raid you — defend or barricade"
                          />
                        </Suspense>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-1">
                        {evt.choices.map((choice) => {
                          const payoffBlocked = choice.id === 'payoff' && world.resources.food < evt.lootFood;
                          const barricadeBlocked = choice.id === 'barricade'
                            && !canAffordResourceCost(world.resources, BARRICADE_RAID_COST);
                          const defendBlocked = choice.id === 'defend'
                            && (!hasIronSpears(world) && !hasStoneSpears(world) || raidPreview.militiaStrength <= 0);
                          const blocked = payoffBlocked || barricadeBlocked || defendBlocked;
                          const blockReason = payoffBlocked
                            ? formatResourceCostNeed({ food: evt.lootFood })
                            : barricadeBlocked
                              ? formatResourceCostNeed(BARRICADE_RAID_COST)
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
                            <LabelWithResourceCost label={choice.label} cost={choice.cost} />
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

          {/* Signature story cards — authored choices with real sim consequences */}
          {(world.pendingStoryEvents ?? []).length > 0 && (
            <div className="pointer-events-auto absolute left-1/2 top-4 z-10 w-full max-w-lg -translate-x-1/2 animate-in fade-in slide-in-from-top">
              {(world.pendingStoryEvents ?? []).slice(0, 2).map((evt) => (
                <div key={evt.id} className="mb-2 rounded-xl border border-emerald-500/40 bg-emerald-950/90 p-3 shadow-xl backdrop-blur">
                  <div className="flex items-start gap-3">
                    <Emoji className="text-2xl">{evt.emoji}</Emoji>
                    <div className="flex-1">
                      <h3 className="font-bold text-emerald-100">{evt.title}</h3>
                      <p className="mt-0.5 text-[11px] leading-snug text-emerald-200/80">{evt.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {evt.choices.map((choice) => (
                          <button
                            key={choice.id}
                            type="button"
                            onClick={() => {
                              playClickSound();
                              applyGameAction({ proto: 1, op: 'respondToStoryEvent', eventId: evt.id, choiceId: choice.id });
                            }}
                            className="rounded-lg bg-stone-900/80 px-2 py-1.5 text-left text-[10px] font-semibold text-emerald-100 hover:bg-stone-800"
                            title={choice.detail}
                          >
                            {choice.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Diplomacy event cards — player must respond */}
          {pendingDiplomacy.length > 0 && (
            <div className={`pointer-events-auto absolute left-1/2 ${pendingRaids.length > 0 || pendingOutgoingRaids.length > 0 ? 'top-44' : 'top-4'} z-10 w-full max-w-lg -translate-x-1/2 animate-in fade-in slide-in-from-top`}>
              {pendingDiplomacy.slice(0, 2).map((evt) => (
                <div key={evt.id} className="mb-2 rounded-xl border border-amber-500/40 bg-amber-950/90 p-3 shadow-xl backdrop-blur">
                  <div className="flex items-start gap-3">
                    <Emoji className="text-2xl">{evt.emoji}</Emoji>
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

          {/* Favorite citizen follow banner */}
          {view.favoriteEntityId != null && (() => {
            const fav = resolveEntity(world, view.favoriteEntityId)
              ?? catalog?.get(view.favoriteEntityId)
              ?? null;
            if (!fav?.alive) return null;
            return <FavoriteFollowBanner fav={fav} onStop={toggleFavoriteCitizen} />;
          })()}

          {/* Visitor quest card (traveling smith) */}
          {(() => {
            const q = getVisitorQuest(world);
            if (!q) return null;
            const resEmoji: Record<string, string> = { wood: '🪵', stone: '🪨', food: '🍖', gold: '💰', iron: '🔩' };
            const have = world.resources[q.goalResource] ?? 0;
            const canDeliver = have >= q.goalAmount;
            const daysLeft = Math.max(0, q.expiresDay - getAbsoluteCalendarDay(world.tick));
            return (
              <div className="pointer-events-auto absolute left-1/2 top-16 z-[25] w-full max-w-md -translate-x-1/2 animate-in fade-in slide-in-from-top">
                <div className="rounded-xl border border-amber-500/40 bg-stone-900/95 p-3 shadow-xl backdrop-blur">
                  <div className="flex items-start gap-3">
                    <Emoji className="text-2xl">{q.emoji}</Emoji>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-bold text-amber-200">{q.title}</h3>
                        <span className="shrink-0 text-[10px] text-stone-500">{daysLeft}d left</span>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-stone-300">{q.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold text-stone-400">
                          Needs {q.goalAmount} {resEmoji[q.goalResource] ?? q.goalResource} · you have {have}
                        </span>
                        <button
                          type="button"
                          disabled={!canDeliver}
                          onClick={() => {
                            playClickSound();
                            applyGameAction({ proto: 1, op: 'deliverVisitorQuest' });
                          }}
                          className="ml-auto rounded-lg bg-amber-600 px-3 py-1 text-[11px] font-bold text-amber-50 hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-500"
                        >
                          Deliver → +{q.rewardGold}💰 +{q.rewardReputation}⭐
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* First-night shelter warning */}
          {showFirstNightWarning && (
            <div className="pointer-events-auto absolute left-1/2 top-16 z-20 w-full max-w-md -translate-x-1/2 animate-in fade-in slide-in-from-top">
              <div className="rounded-xl border border-amber-500/40 bg-amber-950/90 p-3 shadow-xl backdrop-blur">
                <div className="flex items-start gap-3">
                  <Emoji className="text-2xl">{sunsetApproaching ? '🌅' : '🌙'}</Emoji>
                  <div className="flex-1">
                    <h3 className="font-bold text-amber-200">
                      {sunsetApproaching ? 'Sunset is approaching' : 'Your pioneers need shelter'}
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

          {/* Minimap — click anywhere to jump the camera there */}
          <MiniMap
            worldRef={worldRef}
            viewRef={viewRef}
            onNavigate={(wx, wy) => {
              const loop = loopRef.current;
              if (loop) {
                const nextView = focusCameraOn(loop.getView(), wx, wy);
                const rect = canvasRef.current?.getBoundingClientRect();
                loop.patchView({
                  camera: clampCameraTarget(
                    nextView.camera, world.width, world.height,
                    rect?.width ?? world.width, rect?.height ?? world.height,
                  ),
                });
              }
            }}
          />

          {/* Zoom controls — wider range; speech bubbles visible from ~28% zoom */}
          <div className="pointer-events-auto absolute bottom-4 right-4 z-20 flex flex-col items-stretch gap-0.5 rounded-lg border border-stone-600 bg-stone-800/85 p-1 shadow-xl backdrop-blur">
            <button
              type="button"
              onClick={() => applyZoom(CAMERA_ZOOM_STEP_IN)}
              disabled={view.camera.targetZoom >= CAMERA_ZOOM_MAX - 1e-3}
              className="flex h-8 w-8 items-center justify-center rounded-md text-lg font-bold text-stone-200 hover:bg-stone-700/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              title="Zoom in (+)"
              aria-label="Zoom in"
            >
              +
            </button>
            <label className="sr-only" htmlFor="camera-zoom-preset">Zoom level</label>
            <select
              id="camera-zoom-preset"
              value={
                // Snap select to nearest preset for display
                (() => {
                  const z = clampCameraZoom(view.camera.targetZoom);
                  let best = CAMERA_ZOOM_PRESETS[0];
                  let bestD = Math.abs(z - best);
                  for (const p of CAMERA_ZOOM_PRESETS) {
                    const d = Math.abs(z - p);
                    if (d < bestD) {
                      best = p;
                      bestD = d;
                    }
                  }
                  return String(best);
                })()
              }
              onChange={(e) => setZoomLevel(Number(e.target.value))}
              className="h-7 w-8 cursor-pointer appearance-none rounded-md border-0 bg-stone-700/60 px-0 text-center text-[9px] font-semibold tabular-nums text-stone-200 hover:bg-stone-600/80 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              title={`Zoom ${Math.round(clampCameraZoom(view.camera.targetZoom) * 100)}% — pick a preset`}
              aria-label="Zoom preset"
            >
              {CAMERA_ZOOM_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {Math.round(p * 100)}%
                </option>
              ))}
            </select>
            <div
              className="px-0.5 text-center text-[8px] font-medium tabular-nums text-stone-500"
              title="Live zoom"
            >
              {Math.round(clampCameraZoom(view.camera.targetZoom) * 100)}%
            </div>
            <button
              type="button"
              onClick={() => applyZoom(CAMERA_ZOOM_STEP_OUT)}
              disabled={view.camera.targetZoom <= CAMERA_ZOOM_MIN + 1e-3}
              className="flex h-8 w-8 items-center justify-center rounded-md text-lg font-bold text-stone-200 hover:bg-stone-700/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              title="Zoom out (-)"
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              onClick={resetZoom}
              className="flex h-7 w-8 items-center justify-center rounded-md text-[11px] text-stone-400 hover:bg-stone-700/80 hover:text-stone-200"
              title={`Reset zoom (${Math.round(CAMERA_ZOOM_DEFAULT * 100)}%)`}
              aria-label="Reset zoom"
            >
              ⟲
            </button>
          </div>

          {/* Save toast */}
          {saveToast && (
            <button
              type="button"
              onClick={() => setSaveToast(null)}
              title="Dismiss"
              className={`pointer-events-auto absolute bottom-16 left-1/2 z-30 -translate-x-1/2 rounded-lg border px-4 py-2 text-sm font-semibold shadow-2xl backdrop-blur hover:brightness-110 ${
              saveToast.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-200'
                : 'border-rose-500/40 bg-rose-950/90 text-rose-200'
            }`}>
              {saveToast.type === 'success' ? '💾 ' : '⚠️ '}{saveToast.message}
            </button>
          )}

          {/* Pause HUD — map stays clickable for inspect/build while frozen */}
          {world.paused && !showTutorial && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-amber-500/40 bg-stone-900/85 px-4 py-1 text-[11px] font-bold text-amber-200 shadow-lg backdrop-blur">
              ⏸ Paused — Space to resume · ☰ menu to save
            </div>
          )}

          {/* Quick-start tutorial */}
          <TutorialOverlay
            showTutorial={showTutorial}
            tutorialStep={tutorialStep}
            onSetTutorialStep={setTutorialStep}
            onFinish={finishTutorial}
            onDisableAll={disableAllTutorials}
          />
          </div>

          {campaignActive && campaignStep && !showTutorial && (
            <TutorialCampaignBanner
              step={campaignStep}
              stepIndex={campaignStepIndex}
              total={TUTORIAL_CAMPAIGN.length}
              onSkip={() => setCampaignActive(false)}
            />
          )}

          {!showTutorial && activeMoment && (
            <MomentTitleCard moment={activeMoment} onDone={dismissMomentCard} />
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

        </main>

        {/* Right sidebar */}
        <aside className="side-panel flex w-[18.5rem] flex-col border-l border-stone-700/80">
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
                isFavorite={view.favoriteEntityId === selectedEntity.id}
                onToggleFavorite={
                  selectedEntity.type === EntityType.Human && isPlayerHuman(selectedEntity)
                    ? () => {
                        playClickSound();
                        toggleFavoriteCitizen(selectedEntity.id);
                      }
                    : undefined
                }
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
              <>
                {(() => {
                  const selectedSettlers = (view.selectedEntityIds ?? [])
                    .map((id) => resolveEntity(world, id) ?? catalog?.get(id) ?? null)
                    .filter((e): e is import('./game/gameTypes').Entity =>
                      !!e && e.alive && e.type === EntityType.Human && !e.faction && !e.isJuvenile);
                  if (selectedSettlers.length < 2) return null;
                  return (
                    <button
                      onClick={() => {
                        playClickSound();
                        for (const s of selectedSettlers) {
                          applyGameAction({ proto: 1, op: 'assignWorker', buildingId: selectedBuilding.id, humanId: s.id });
                        }
                        loopRef.current?.patchView({ selectedEntityIds: [], selectedEntityId: null });
                      }}
                      className="mb-2 w-full rounded-xl border-2 border-amber-400/60 bg-amber-400/15 px-3 py-2 text-left text-xs font-semibold text-amber-200 shadow-lg backdrop-blur-md transition-colors hover:bg-amber-400/25"
                    >
                      👥 Assign {selectedSettlers.length} selected settlers here
                    </button>
                  );
                })()}
              <SelectedBuildingPanel
                building={selectedBuilding}
                state={world}
                onAssign={() => applyGameAction({ proto: 1, op: 'assignWorker', buildingId: selectedBuilding.id })}
                onAutoStaffAll={() => applyGameAction({ proto: 1, op: 'autoStaffWorkers' })}
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
                onSetHuntingPrey={(prey) => {
                  playClickSound();
                  applyGameAction({ proto: 1, op: 'setHuntingSpotPrey', buildingId: selectedBuilding.id, prey });
                }}
                onSetMineMode={(mode) => {
                  playClickSound();
                  applyGameAction({ proto: 1, op: 'setMineMode', buildingId: selectedBuilding.id, mode });
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
              </>
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
                onClick={() => toggleTab(tab.id)}
                className={`sidebar-tab relative ${openTabs.has(tab.id) ? 'sidebar-tab--active text-emerald-400' : 'text-stone-500 hover:text-stone-300'}`}
                title={tab.hint}
              >
                <Emoji className="text-lg">{tab.icon}</Emoji>
                <span className="text-[11px] font-bold leading-tight sm:text-xs">{tab.label}</span>
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
            {openTabs.has('village') && (
              <div className="mb-3 rounded-xl border border-stone-600/30 bg-stone-800/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-stone-300">🏘️ Village</h3>
                  <button
                    type="button"
                    onClick={() => toggleTab('village')}
                    className="text-xs text-stone-500 hover:text-stone-300"
                    title="Close panel"
                  >
                    ✕
                  </button>
                </div>
                <VillageTabPanel
                  state={world}
                  villageStats={villageStats}
                  favoriteEntityId={view.favoriteEntityId}
                  onRecruitSettler={() => applyGameAction({ proto: 1, op: 'recruitSettler' })}
                  onFocusBuilding={focusBuildingOnMap}
                  onFocusCitizen={focusCitizenOnMap}
                  onToggleFavoriteCitizen={(id) => {
                    playClickSound();
                    toggleFavoriteCitizen(id);
                  }}
                  onOpenGoals={() => { openTab('progress'); setProgressSubTab('goals'); }}
                  onHintAction={handleHintAction}
                  suppressHintIds={campaignStep?.id === 'build_house' ? ['build_house'] : []}
                />
              </div>
            )}

            {openTabs.has('frontier') && (
              <div className="mb-3 rounded-xl border border-stone-600/30 bg-stone-800/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-stone-300">🏕️ Frontier</h3>
                  <button
                    type="button"
                    onClick={() => toggleTab('frontier')}
                    className="text-xs text-stone-500 hover:text-stone-300"
                    title="Close panel"
                  >
                    ✕
                  </button>
                </div>
                <FrontierTabPanel
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
              </div>
            )}

            {openTabs.has('nature') && (
              <div className="mb-3 rounded-xl border border-stone-600/30 bg-stone-800/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-stone-300">🌿 Nature</h3>
                  <button
                    type="button"
                    onClick={() => toggleTab('nature')}
                    className="text-xs text-stone-500 hover:text-stone-300"
                    title="Close panel"
                  >
                    ✕
                  </button>
                </div>
                <NatureTabPanel
                  state={world}
                />
              </div>
            )}

            {openTabs.has('progress') && (
              <div className="mb-3 rounded-xl border border-stone-600/30 bg-stone-800/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-stone-300">📊 Progress</h3>
                  <button
                    type="button"
                    onClick={() => toggleTab('progress')}
                    className="text-xs text-stone-500 hover:text-stone-300"
                    title="Close panel"
                  >
                    ✕
                  </button>
                </div>
                <ProgressTabPanel
                  state={world}
                  progressSubTab={progressSubTab}
                  setProgressSubTab={setProgressSubTab}
                  tradeReadyCount={tradeReadyCount}
                  onStartResearch={(researchId) => applyGameAction({ proto: 1, op: 'startResearch', researchId })}
                  onEstablishTradeRoute={(routeId) => applyGameAction({ proto: 1, op: 'establishTradeRoute', routeId })}
                />
              </div>
            )}

            {openTabs.has('log') && (
              <div className="mb-3 rounded-xl border border-stone-600/30 bg-stone-800/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-stone-300">📜 Log</h3>
                  <button
                    type="button"
                    onClick={() => toggleTab('log')}
                    className="text-xs text-stone-500 hover:text-stone-300"
                    title="Close panel"
                  >
                    ✕
                  </button>
                </div>
                <LogTabPanel
                  state={world}
                  logSubTab={logSubTab}
                  setLogSubTab={setLogSubTab}
                />
              </div>
            )}

            {openTabs.has('more') && (
              <div className="mb-3 rounded-xl border border-stone-600/30 bg-stone-800/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-stone-300">⋯ More</h3>
                  <button
                    type="button"
                    onClick={() => toggleTab('more')}
                    className="text-xs text-stone-500 hover:text-stone-300"
                    title="Close panel"
                  >
                    ✕
                  </button>
                </div>
                <MoreTabPanel
                  moreSubTab={moreSubTab}
                  setMoreSubTab={setMoreSubTab}
                  tutorialsEnabled={tutorialsEnabled}
                  onReplayTutorial={() => { setTutorialStep(0); setShowTutorial(true); }}
                  onToggleTutorials={handleToggleTutorials}
                  onSpawnMoonHowlerDebug={() => applyGameAction({ proto: 1, op: 'spawnMoonHowlerDebug' })}
                />
              </div>
            )}
          </div>
        </aside>
        </div>

      {showActiveEventBanner && activeEventForBanner && (
        <ActiveEventBanner event={activeEventForBanner} onDismiss={dismissActiveEvent} />
      )}

      {activeBigNews.length > 0 && !showActiveEventBanner && (
        <BigNewsBanner
          news={activeBigNews}
          onDismiss={dismissBigNewsItem}
        />
      )}

      {showShortcuts && (
        <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  );
}

// ============ SUB-COMPONENTS ============

function FavoriteFollowBanner({
  fav,
  onStop,
}: {
  fav: { id: number; name?: string; surname?: string };
  onStop: (id: number) => void;
}) {
  const label = fav.name
    ? `${fav.name}${fav.surname ? ` ${fav.surname}` : ''}`
    : `Citizen #${fav.id}`;
  return (
    <div className="pointer-events-auto absolute left-1/2 top-14 z-20 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-amber-500/40 bg-stone-900/90 px-3 py-1.5 shadow-lg backdrop-blur">
        <span className="text-sm" aria-hidden>⭐</span>
        <span className="text-[11px] font-semibold text-amber-100">
          Following {label}
        </span>
        <button
          type="button"
          onClick={() => {
            playClickSound();
            onStop(fav.id);
          }}
          className="rounded-full bg-stone-700/80 px-2 py-0.5 text-[10px] font-bold text-stone-200 hover:bg-stone-600 hover:text-white"
        >
          Stop
        </button>
      </div>
    </div>
  );
}

