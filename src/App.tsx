import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import {
  initGame,
  initTradeRoutes,
  EntityType, BuildingType,

  GAME_TITLE, GAME_VERSION, GAME_PHASE, GAME_SUBTITLE,

  saveGame, loadGameOutcome, describeSaveLoadOutcome, hasSave, hasSaveSlot, deleteSave, downloadSaveFile,
  parseSaveJson, describeSaveReadFailure, loadGameFromParsed,
  getDiplomacyChoiceEligibility, getVisitorLeaderTalkMeta,
  ensureFullTradeRoutes,
  getCombatPreview,
  formatRaidDeadline, formatRaidLootSummary, raidEventLoot,
  getRaidChoiceEligibility,
} from './game/gameEngine';
import {
  canAssignWorkerToBuilding,
  getPlaceBuildingFailureReason,
  listAssignableWorkersForBuilding,
} from './game/buildingActions';
import {
  NIGHT_START, TICKS_PER_DAY, TICKS_PER_HOUR, getHourOfDay, isNightHour, getAbsoluteCalendarDay,
} from './game/dayCycle';
import { getVisitorQuest } from './game/visitorQuest';
import { canEstablishTradeRoute } from './game/tradeCaravans';
import {
  actionOutcomeFromGate,
  diplomacyChoiceReasonCode,
  storyChoiceReasonCode,
} from './game/actionOutcome';
import { getStoryChoiceEligibility } from './game/storyEvents';
// The village-request card's gate lives with the command that answers it (`resolveVillageRequest`),
// not in the `gameEngine` barrel, so it is imported from its owner directly.
import { getVillageRequestEligibility } from './game/groupEvents';
import type { WorldState } from './game/gameEngine';

import type { EntityCatalog } from './game/entityCatalog';
import { formatCitizenName } from './game/citizenId';
import { computeVillageStats, type VillageStatsSummary } from './game/uiSimSummary';
import { isFoodAlert } from './game/resourceUtils';
import {
  createInitialView,
  createBuildGhost,
  zoomCameraViewAt,
  focusCameraOn,
  CAMERA_ZOOM_DEFAULT,
  CAMERA_ZOOM_STEP_IN,
  CAMERA_ZOOM_STEP_OUT,
  clampCameraZoom,
  clampCameraTarget,
  resolveEntity,
  resolveBuilding,
  type ViewState,
} from './game/viewState';
import { isRotatableBuildingType, toggleBuildingRotation } from './game/buildingRotation';

import { preloadAllSprites } from './game/spriteLoader';
import SelectedBuildingPanel from './components/SelectedBuildingPanel';
import GameMapStage from './components/GameMapStage';
import { isPlayerHuman } from './game/playerHuman';
import { areNamesLoaded, loadNames, fixDefaultNames } from './game/nameLoader';
import { ensureDialogueBankFromBundle, preloadDialogueBank } from './game/dialogueTrees';
import { preloadRenderer } from './game/rendererLoader';
const IntroScreen = lazy(() => import('./game/IntroScreen'));
const MapSetupScreen = lazy(() => import('./game/MapSetupScreen'));
const CombatPreviewPanel = lazy(() => import('./game/CombatPreviewPanel'));
import ActiveEventBanner from './components/ActiveEventBanner';
import VillageRequestCard from './components/VillageRequestCard';
import BigNewsBanner from './components/BigNewsBanner';
import ShortcutsOverlay from './components/ShortcutsOverlay';
import GameDashboard from './components/dashboard/GameDashboard';
import VisitorCampPanel from './components/VisitorCampPanel';
import SelectedEntityPanel from './components/SelectedEntityPanel';
import FamilyTreeWindow from './components/FamilyTreeWindow';
import WorkHoursWindow from './components/WorkHoursWindow';
import SimulationDiagnosticsPanel from './components/SimulationDiagnosticsPanel';
import { setRelationshipDiagnosticsConsoleLoggingEnabled } from './game/relationshipDiagnostics';
import GamePlayLayout from './components/GamePlayLayout';
import GameInspector from './components/GameInspector';
import GameOverlays from './components/GameOverlays';
import GameSidebar from './components/GameSidebar';

import GameBuildRail from './components/GameBuildRail';


import { useGamePersistence, type SaveToast } from './hooks/useGamePersistence';
import { useTransientGameFeedback } from './hooks/useTransientGameFeedback';
import { useGameSession } from './hooks/useGameSession';
import {
  TUTORIAL_DONE_STORAGE_KEY as TUTORIAL_DONE_KEY,
  overviewNavFromState,
  sidebarTabForOverviewNav,
  useGameShellState,
} from './hooks/useGameShellState';
import { beginAudio, beginIntroAudio, primeAudioUnlock, playClickSound, stopIntroSong } from './audio';
import { useGameAudio } from './hooks/useGameAudio';
import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useCanvasInteractions } from './hooks/useCanvasInteractions';
import { useContextualTutorial } from './hooks/useContextualTutorial';
import ContextualTutorialCard from './components/ContextualTutorialCard';
import {
  saveTutorialChoice,
  saveAutoSavePreference,
  saveTutorialsEnabled,
  saveJuiceEffectsEnabled,
  saveShowSimTick,
  saveShowFps,
  saveFirstNightWarningDismissed,
} from './game/preferences';
import { LabelWithResourceCost } from './components/ResourceCost';
import CitizenOverviewScreen from './components/CitizenOverviewScreen';

import AlertBar from './components/AlertBar';
import Emoji from './components/Emoji';
import GameHeader from './components/GameHeader';
import { useFpsMeter } from './hooks/useFpsMeter';
import { useVirtualPlayer } from './hooks/useVirtualPlayer';

import { getPriorityAlerts, type PriorityAlert } from './game/priorityAlerts';
import type { FocusHintAction } from './game/focusHints';
import './App.css';
import TutorialOverlay from './components/TutorialOverlay';
import TutorialCampaignBanner from './components/TutorialCampaignBanner';
import MomentTitleCard from './components/MomentTitleCard';
import { currentCampaignStep, TUTORIAL_CAMPAIGN } from './game/tutorialCampaign';

const SPEED_OPTIONS = [0.5, 1, 2, 3, 5, 10];

/**
 * The save/load feedback banner, rendered by both session states.
 *
 * It used to exist only in the game shell, so a refused load on the new-settlement screen — where
 * "Load saved game" lives — set a message that was never drawn and expired before the player could
 * reach the game. `className` carries the z-index because that screen is
 * a `fixed inset-0 z-50` overlay and the banner has to sit above it.
 */
function SaveToastBanner({
  toast,
  onDismiss,
  className = 'z-30',
}: {
  toast: SaveToast;
  onDismiss: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      title="Dismiss"
      className={`pointer-events-auto absolute bottom-16 left-1/2 ${className} -translate-x-1/2 rounded-lg border px-4 py-2 text-sm font-semibold shadow-2xl backdrop-blur hover:brightness-110 ${
        toast.type === 'success'
          ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-200'
          : 'border-rose-500/40 bg-rose-950/90 text-rose-200'
      }`}
    >
      {toast.type === 'success' ? '💾 ' : '⚠️ '}{toast.message}
    </button>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debugMode = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('debug') === '1';
  // Roadmap U5 — "normal play stays quiet". Diagnostics *collection* is always on (the drawer and
  // the cumulative history need it), but the once-per-colony-day console snapshot is a debug tool.
  // Nothing used to switch it off, so every session printed a full snapshot each in-game day and
  // the test tier had to silence it by hand. `?debug=1` opts in; the drawer's debug section is the
  // reader for the history this keeps.
  useEffect(() => {
    setRelationshipDiagnosticsConsoleLoggingEnabled(debugMode);
  }, [debugMode]);
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
  const [selectedBuildingType, setSelectedBuildingType] = useState<BuildingType | null>(null);
  const {
    activeTab,
    buildPanelOpen,
    campaignActive,
    citizenOverviewOpen,
    closeCitizenOverview,
    firstNightWarningDismissed,
    inspectorCollapsed,
    juiceEffectsEnabled,
    logSubTab,
    mapSetupSource,
    moreSubTab,
    openCitizenOverview,
    openTab,
    overviewSection,
    overviewWorldFocus,
    progressSubTab,
    selectOverviewNav,
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
    toggleCitizenOverview,
    tutorialChoice,
    tutorialsEnabled,
    tutorialStep,
  } = useGameShellState();
  const [spritesLoaded, setSpritesLoaded] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  /**
   * The citizen whose family tree is open, if any. The tree gets its own window rather than a
   * section of the inspector: laid out by generation it is legible, and inlined it was part of what
   * made the selected-citizen card one long stack.
   */
  const [familyTreeFor, setFamilyTreeFor] = useState<number | null>(null);
  /** Work & venue hours as its own window (owner: one window per subject). */
  const [workHoursOpen, setWorkHoursOpen] = useState(false);
  // Reading the save slot touches localStorage and JSON-parses the whole save, so it must never
  // run from the render body (the game view re-renders every tick). The slot is read once on
  // mount, then only from the events that can change it: another tab writing to it (the `storage`
  // event) or this session creating/deleting it (beside each `setHasSavedGame` call).
  // `saveSlotPresent` is slot *presence* (raw `localStorage`), `hasSavedGame` is "this build can load
  // it". They were both seeded from `hasSave()`, which is the second meaning — so a slot holding a save
  // from a different build read as "No browser save", the Load action was disabled, and
  // `describeSaveReadFailure`'s "Save is from a different build … Start a new settlement" was
  // unreachable from this screen. Keeping the two apart is what lets the Load
  // affordance stay enabled and the refusal message be the thing the player reads.
  const [saveSlotPresent, setSaveSlotPresent] = useState(hasSaveSlot);
  const [hasSavedGame, setHasSavedGame] = useState(hasSave);
  useEffect(() => {
    const refreshSaveSlot = () => setSaveSlotPresent(hasSaveSlot());
    window.addEventListener('storage', refreshSaveSlot);
    window.addEventListener('focus', refreshSaveSlot);
    return () => {
      window.removeEventListener('storage', refreshSaveSlot);
      window.removeEventListener('focus', refreshSaveSlot);
    };
  }, []);
  const canLoadSavedGame = hasSavedGame || saveSlotPresent;
  const {
    applyGameAction,
    catalogRef,
    loopRef,
    replaceSession,
    viewRef,
    worldRef,
  } = useGameSession({
    canvasRef,
    initialWorld: world,
    initialView: view,
    spritesLoaded,
    showIntro,
    showMapSetup,
    setWorld,
    setView,
    setVillageStats,
    setCatalog,
    setHasPlacedHouse,
  });
  const autoPlayer = useVirtualPlayer({ world, applyGameAction });
  const fps = useFpsMeter(showFps || autoPlayer.enabled);
  const gameplayActive = !showIntro && !showMapSetup && spritesLoaded;
  const { muted, volumePreset, toggleMute: handleToggleMute, setVolumePreset: handleVolumePreset } = useGameAudio(world, gameplayActive);

  useEffect(() => {
    if (showIntro) {
      void beginIntroAudio();
      return;
    }
    // Map setup and in-game: stop the theme and block gesture-driven restarts.
    stopIntroSong();
  }, [showIntro]);

  useEffect(() => {
    if (!gameplayActive) return;
    void beginAudio();
  }, [gameplayActive]);
  const { active: contextualTip, dismissActive: dismissContextualTip, markSeen: markContextualTipSeen } = useContextualTutorial(
    world,
    gameplayActive && tutorialsEnabled && !showTutorial,
  );
  const audioStartedRef = useRef(false);
  const markGameSaved = useCallback(() => {
    setHasSavedGame(true);
  }, []);
  const {
    dismissSaveToast,
    persistCurrentGame,
    persistCurrentGameRef,
    saveToast,
    showSaveToast,
  } = useGamePersistence({
    loopRef,
    worldRef,
    viewRef,
    onGameSaved: markGameSaved,
  });
  const {
    activeBigNews,
    activeEventDismissible,
    activeEventForBanner,
    activeMoment,
    dismissActiveEvent,
    dismissBigNewsItem,
    dismissMomentCard,
    dismissNotification,
    resetTransientFeedbackForNewSession,
    synchronizeTransientFeedbackFromWorld,
  } = useTransientGameFeedback({
    world,
    worldRef,
    loopRef,
    onFeedbackInteraction: playClickSound,
  });

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

  useLayoutEffect(() => {
    selectedBuildingTypeRef.current = selectedBuildingType;
    gameplayActiveRef.current = gameplayActive;
  }, [selectedBuildingType, gameplayActive]);

  // Preload sprites, names, and the canonical split dialogue bank.
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
  }, [worldRef]);

  // Keep the sim frozen while Quick Start or map setup is open
  useEffect(() => {
    const loop = loopRef.current;
    if (!spritesLoaded || showIntro || showMapSetup || !showTutorial || !loop) return;
    loop.mutateWorld((w) => { w.paused = true; });
  }, [showTutorial, spritesLoaded, showIntro, showMapSetup, loopRef]);

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

  const togglePause = useCallback(() => {
    const loop = loopRef.current;
    if (!loop) return;
    const wasPaused = loop.getWorld().paused;
    loop.mutateWorld((w) => { w.paused = !w.paused; });
    if (wasPaused) {
      loop.applyCommand({ proto: 1, op: 'autoStaffWorkers' });
    }
  }, [loopRef]);

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
  }, [loopRef, catalogRef.current]);

  const acknowledgeContextualTip = useCallback(() => {
    if (!contextualTip) return;
    const tipId = contextualTip.id;
    dismissContextualTip();
    markContextualTipSeen(tipId);
    loopRef.current?.mutateWorld((w) => {
      w.tutorialSeen = [...new Set([...(w.tutorialSeen ?? []), tipId])];
    });
  }, [contextualTip, dismissContextualTip, markContextualTipSeen, loopRef.current]);

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
  }, [dismissContextualTip, resumeAfterTutorialOverlay, setTutorialStep, setShowTutorial, setTutorialsEnabled]);

  const handleToggleJuiceEffects = useCallback(() => {
    const next = !juiceEffectsEnabled;
    saveJuiceEffectsEnabled(next);
    setJuiceEffectsEnabled(next);
  }, [juiceEffectsEnabled, setJuiceEffectsEnabled]);

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
  }, [tutorialsEnabled, dismissContextualTip, setShowTutorial, setTutorialsEnabled]);

  const handleTutorialChoiceChange = useCallback((enabled: boolean) => {
    saveTutorialChoice(enabled);
    setTutorialChoice(enabled);
  }, [setTutorialChoice]);

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

  const handleToggleShowSimTick = useCallback(() => {
    const next = !showSimTick;
    saveShowSimTick(next);
    setShowSimTick(next);
  }, [showSimTick, setShowSimTick]);

  const handleToggleShowFps = useCallback(() => {
    const next = !showFps;
    saveShowFps(next);
    setShowFps(next);
  }, [showFps, setShowFps]);

  const finishTutorial = useCallback(() => {
    try {
      localStorage.setItem(TUTORIAL_DONE_KEY, '1');
    } catch { /* ignore */ }
    setShowTutorial(false);
    setTutorialStep(0);
    resumeAfterTutorialOverlay();
  }, [resumeAfterTutorialOverlay, setShowTutorial, setTutorialStep]);

  const toggleGrid = useCallback(() => {
    const loop = loopRef.current;
    if (!loop) return;
    const next = !loop.getView().showGrid;
    loop.patchView({ showGrid: next });
  }, [loopRef]);

  /**
   * F4 — logistics overlay toggle. Presentation only: it flips a `ViewState` flag and nothing
   * else, so no simulation state, save field or command is touched. The projection itself is
   * built in `buildRenderSnapshot` while the flag is on.
   */
  const toggleLogistics = useCallback(() => {
    const loop = loopRef.current;
    if (!loop) return;
    const next = !loop.getView().showLogistics;
    loop.patchView({ showLogistics: next });
  }, [loopRef]);

  // The "Click map repeatedly to place more" hint shows for the first-ever
  // (Placement how-to was removed with the build banner — the ghost on the
  // map is the only placement indicator; Esc / right-click exits.)
  const cancelBuildMode = useCallback(() => {
    setSelectedBuildingType(null);
    stripDragStartRef.current = null;
    loopRef.current?.patchView({ buildMode: null, buildGhost: null, buildStripPreview: null, buildRotation: 0 });
  }, [loopRef.current]);

  const rotateBuildPlacement = useCallback(() => {
    const loop = loopRef.current;
    if (!loop || !selectedBuildingType || !isRotatableBuildingType(selectedBuildingType)) return;
    const view = loop.getView();
    const nextRotation = toggleBuildingRotation(view.buildRotation);
    const ghost = view.buildGhost;
    // Rotation swaps the footprint, so the verdict is re-derived from the owner — reason included,
    // so the ghost's label follows the rotation (F5).
    loop.patchView({
      buildRotation: nextRotation,
      ...(ghost
        ? {
            buildGhost: createBuildGhost(
              ghost.x,
              ghost.y,
              getPlaceBuildingFailureReason(
                loop.getWorld(),
                selectedBuildingType,
                ghost.x,
                ghost.y,
                nextRotation,
              ),
            ),
          }
        : {}),
    });
  }, [selectedBuildingType, loopRef]);

  const clearSelection = useCallback(() => {
    loopRef.current?.patchView({
      selectedEntityId: null,
      selectedEntityIds: [],
      selectedBuildingId: null,
      highlightedCampKey: null,
      selectedCampKey: null,
    });
  }, [loopRef.current]);

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
  }, [setInspectorCollapsed, loopRef]);

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
  }, [setInspectorCollapsed, loopRef]);

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
  }, [setInspectorCollapsed, loopRef]);

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
  }, [loopRef, setInspectorCollapsed, catalogRef.current]);

  // Keep camera on favorite citizen each sim tick
  useEffect(() => {
    const loop = loopRef.current;
    const catalog = catalogRef.current;
    if (!loop || showIntro || showMapSetup) return;
    const view = loop.getView();
    const id = view.favoriteEntityId;
    if (id == null) return;
    const w = loop.getWorld();
    const ent = resolveEntity(w, id) ?? catalog?.get(id) ?? null;
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
  }, [world.tick, showIntro, showMapSetup, loopRef, catalogRef]);

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
  }, [clearSelection, setBuildPanelOpen, loopRef.current]);

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
  }, [selectBuildingType, focusCampOnMap, focusBuildingOnMap, openTab, setProgressSubTab, setInspectorCollapsed, setBuildPanelOpen]);

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
  }, [selectBuildingType, focusCampOnMap, focusBuildingOnMap, openTab, setProgressSubTab, setInspectorCollapsed, setBuildPanelOpen]);

  const getViewCamera = useCallback(() => {
    return loopRef.current?.getView().camera ?? viewRef.current.camera;
  }, [loopRef.current, viewRef.current.camera]);

  useEffect(() => {
    sidebarContentRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  const togglePauseRef = useRef(togglePause);
  const selectBuildingTypeRef = useRef(selectBuildingType);
  const cancelBuildModeRef = useRef(cancelBuildMode);
  const toggleGridRef = useRef(toggleGrid);
  const toggleLogisticsRef = useRef(toggleLogistics);
  const rotateBuildPlacementRef = useRef(rotateBuildPlacement);
  const showShortcutsRef = useRef(showShortcuts);
  const citizenOverviewOpenRef = useRef(citizenOverviewOpen);
  const toggleCitizenOverviewRef = useRef(toggleCitizenOverview);
  const closeCitizenOverviewRef = useRef(closeCitizenOverview);
  // The village overview is plain local state rather than a shell callback, so its toggle is assigned
  // in the sync effect below instead of holding a stale `showDashboard`.
  const toggleDashboardRef = useRef<() => void>(() => {});

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
  }, [loopRef]);

  const applyZoomRef = useRef(applyZoom);

  const zoomCameraTo = useCallback((targetZoom: number) => {
    const loop = loopRef.current;
    const canvas = canvasRef.current;
    if (!loop || !canvas) return;
    const world = loop.getWorld();
    const { width: cw, height: ch } = canvas.getBoundingClientRect();
    const cam = loop.getView().camera;
    const next = focusCameraOn(loop.getView(), cam.targetX, cam.targetY, targetZoom);
    loop.patchView({ camera: clampCameraTarget(next.camera, world.width, world.height, cw, ch) });
  }, [loopRef]);

  const resetZoom = useCallback(() => {
    zoomCameraTo(CAMERA_ZOOM_DEFAULT);
  }, [zoomCameraTo]);

  /** Jump to a preset zoom level (keeps camera center). */
  const setZoomLevel = useCallback((zoom: number) => {
    zoomCameraTo(clampCameraZoom(zoom));
  }, [zoomCameraTo]);

  /** Focus camera on a world point and clamp to map bounds (notifications/minimap share). */
  const focusWorldCamera = useCallback((x: number, y: number, zoom = 1.5) => {
    const loop = loopRef.current;
    if (!loop) return;
    const nextView = focusCameraOn(loop.getView(), x, y, zoom);
    const rect = canvasRef.current?.getBoundingClientRect();
    loop.patchView({
      camera: clampCameraTarget(
        nextView.camera, world.width, world.height,
        rect?.width ?? world.width, rect?.height ?? world.height,
      ),
    });
  }, [world.width, world.height, loopRef]);

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
    toggleLogisticsRef.current = toggleLogistics;
    rotateBuildPlacementRef.current = rotateBuildPlacement;
    showShortcutsRef.current = showShortcuts;
    citizenOverviewOpenRef.current = citizenOverviewOpen;
    toggleCitizenOverviewRef.current = toggleCitizenOverview;
    closeCitizenOverviewRef.current = closeCitizenOverview;
    toggleDashboardRef.current = () => setShowDashboard((prev) => !prev);
    applyZoomRef.current = applyZoom;
  }, [
    togglePause,
    selectBuildingType,
    cancelBuildMode,
    toggleGrid,
    toggleLogistics,
    rotateBuildPlacement,
    showShortcuts,
    citizenOverviewOpen,
    toggleCitizenOverview,
    closeCitizenOverview,
    applyZoom,
  ]);

  useKeyboardControls({
    loopRef,
    canvasRef,
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
    citizenOverviewOpenRef,
    toggleCitizenOverviewRef,
    toggleDashboardRef,
    closeCitizenOverviewRef,
    cancelBuildModeRef,
    togglePauseRef,
    selectBuildingTypeRef,
    toggleGridRef,
    toggleLogisticsRef,
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
  }, [loopRef.current]);

  const handleOpenTrade = useCallback(() => {
    openTab('progress');
    setProgressSubTab('trade');
  }, [openTab, setProgressSubTab]);

  const handleOpenGuide = useCallback(() => {
    openTab('more');
    setMoreSubTab('guide');
  }, [openTab, setMoreSubTab]);
  const beginNewGameSession = useCallback((villageName: string) => {
    const start = async () => {
      // Founders must be named from the census files, not the boot markers.
      if (!areNamesLoaded()) await loadNames();
      deleteSave();
      const s = initGame({ size: selectedMapSize, preset: selectedMapPreset, villageName });
      fixDefaultNames(s);
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
      resetTransientFeedbackForNewSession();
      replaceSession(s, nextView);
      setSelectedBuildingType(null);
      setHasSavedGame(false);
      setFirstNightWarningDismissed(false);
      saveFirstNightWarningDismissed(false);
      setShowTutorial(showQuickStart);
      setTutorialStep(0);
      setCampaignActive(tutorialChoice);
      setShowMapSetup(false);
    };
    void start();
  }, [
    selectedMapSize,
    selectedMapPreset,
    tutorialsEnabled,
    tutorialChoice,
    resetTransientFeedbackForNewSession,
    replaceSession,
    setCampaignActive,
    setFirstNightWarningDismissed,
    setShowTutorial,
    setTutorialStep,
    setShowMapSetup,
  ]);

  const startNewGame = useCallback(() => {
    setMapSetupSource('game');
    setShowMapSetup(true);
  }, [setShowMapSetup, setMapSetupSource]);

  const toggleAutoSave = useCallback(() => {
    loopRef.current?.mutateWorld((w) => {
      w.autoSave = !w.autoSave;
      saveAutoSavePreference(w.autoSave);
    });
  }, [loopRef.current]);

  const handleSave = useCallback(() => {
    void persistCurrentGame({ chronicle: true, feedback: true });
  }, [persistCurrentGame]);

  const applyLoadedSession = useCallback((loaded: { world: WorldState; view: ViewState }) => {
    loaded.world.tradeRoutes = ensureFullTradeRoutes(
      loaded.world.tradeRoutes.length > 0 ? loaded.world.tradeRoutes : initTradeRoutes(),
    );
    fixDefaultNames(loaded.world);
    synchronizeTransientFeedbackFromWorld(loaded.world);
    replaceSession(loaded.world, loaded.view);
    setHasSavedGame(true);
  }, [replaceSession, synchronizeTransientFeedbackFromWorld]);

  /**
   * The one browser-slot load path. Both entry points — the game menu and the new-settlement screen —
   * go through it, because they used to repeat the refusal block *verbatim* (jscpd clone; 2026-09-20
   * audit, W-3) and had already drifted once: the setup path called a reason-discarding loader, so a
   * slot that could not be read *or* restored made "Load saved game" do nothing, silently, on every
   * retry (`LIVE-FINDINGS-STATUS.md`, F19).
   *
   * Read first so a refusal names its real cause (empty / unreadable / malformed / another build /
   * parsed-but-unrestorable) instead of guessing "corrupted" or "different build".
   */
  const loadFromSlot = useCallback((options?: { closeSetup?: boolean; successToast?: string }) => {
    const outcome = loadGameOutcome();
    if (!outcome.ok) {
      setHasSavedGame(outcome.reason === 'unrestorable' ? hasSave() : false);
      showSaveToast({ message: describeSaveLoadOutcome(outcome), type: 'error' });
      return;
    }
    applyLoadedSession(outcome);
    setHasSavedGame(true);
    if (options?.closeSetup) setShowMapSetup(false);
    if (options?.successToast) showSaveToast({ message: options.successToast, type: 'success' });
  }, [applyLoadedSession, showSaveToast, setShowMapSetup]);

  const handleLoad = useCallback(() => {
    loadFromSlot({ successToast: 'Game loaded' });
  }, [loadFromSlot]);

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
      showSaveToast({ message: result.error, type: 'error' });
      return;
    }
    setHasSavedGame(true);
    showSaveToast({
      message: 'Save downloaded — keep the .json file safe',
      type: 'success',
    });
  }, [showSaveToast, worldRef, loopRef, viewRef]);

  const handleLoadFromFile = useCallback((jsonText: string) => {
    // Parse first: the refusal reason (empty / damaged / another build) is what the
    // player needs to see. Only then attempt the full world restore.
    const parsed = parseSaveJson(jsonText);
    if (!parsed.valid) {
      showSaveToast({ message: describeSaveReadFailure(parsed), type: 'error' });
      return;
    }
    const loaded = loadGameFromParsed(parsed.parsed);
    if (!loaded) {
      // The "parsed but not restorable" message has one owner (`saveLoad.describeSaveLoadOutcome`),
      // so the slot, menu and file paths cannot drift apart.
      showSaveToast({ message: describeSaveLoadOutcome({ reason: 'unrestorable' }), type: 'error' });
      return;
    }
    applyLoadedSession(loaded);
    setShowMapSetup(false);
    setHasSavedGame(true);
    // Keep browser slot in sync with the file you just loaded
    try {
      saveGame(loaded.world, loaded.view);
    } catch {
      /* ignore */
    }
    showSaveToast({ message: 'Colony loaded from file', type: 'success' });
  }, [applyLoadedSession, showSaveToast, setShowMapSetup]);

  const handleLoadFromSetup = useCallback(() => {
    loadFromSlot({ closeSetup: true });
  }, [loadFromSlot]);

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
  // Ask the trade owner instead of restating its rule: the Market requirement exempts the
  // coin→materials rescue routes (`isMaterialPurchaseRoute`), which a local `marketOk` check
  // dropped — the HUD then read "nothing available" for a colony that could still buy wood
  // (`BUG_REPORTS/2026-09-16-material-purchase-trade-routes-unreachable.md`).
  const tradeReadyCount = useMemo(
    () => world.tradeRoutes.filter((r) => canEstablishTradeRoute(world, r.id).ok).length,
    [world],
  );
  // `progressTabAlert` was removed with the sidebar's Village button — that badge was its only
  // consumer. `tradeReadyCount` above is still used (the header icon set), so it stays.
  const foodAlert = isFoodAlert(world);

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
        hasSave={canLoadSavedGame}
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
      {/* The setup screen is a full-screen `z-50` overlay, so a refused load has to be drawn above
          it — this is the screen whose "Load saved game" button produces the refusal. */}
      {saveToast && <SaveToastBanner toast={saveToast} onDismiss={dismissSaveToast} className="z-[60]" />}
      </Suspense>
    );
  }

  if (!spritesLoaded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-stone-900">
        <div className="text-center">
          <img src="/logo.png" alt="Wilderfolk" className="mx-auto mb-4 h-32 w-32 animate-pulse" style={{ filter: 'drop-shadow(0 0 30px rgba(34,197,94,0.4))' }} />
          <h1 className="mb-2 text-2xl font-bold text-white">{GAME_TITLE}</h1>
          <p className="mb-4 text-stone-300">Loading pixel art assets...</p>
          <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-stone-700">
            <div className="h-full animate-pulse rounded-full bg-emerald-500" style={{ width: '60%' }} />
          </div>
        </div>
      </div>
    );
  }

  // Inspector data must come from the authoritative world first; the catalog is
  // optimized for identity/kinematics and can lag residence/job/status fields.
  const selectedEntity = resolveEntity(world, view.selectedEntityId)
    ?? catalog?.get(view.selectedEntityId);
  const selectedBuilding = resolveBuilding(world, view.selectedBuildingId);
  const pendingDiplomacy = world.pendingDiplomacyEvents ?? [];
  const pendingRaids = world.pendingRaidEvents ?? [];
  const pendingOutgoingRaids = world.pendingOutgoingRaidEvents ?? [];
  const activeVillageRequest = world.activeVillageRequest;
  const showVillageRequest = !!(
    activeVillageRequest
    && pendingDiplomacy.length === 0
    && pendingRaids.length === 0
    && pendingOutgoingRaids.length === 0
  );
  const showActiveEventBanner = !!(
    activeEventForBanner
    && !showVillageRequest
    && pendingDiplomacy.length === 0
    && pendingRaids.length === 0
  );

  // `frontierAlertCount` was removed with the sidebar's Village button — its badge was the only
  // consumer. The header icons compute their own alert counts.
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
    <GamePlayLayout
      header={(
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
          hasSavedGame={canLoadSavedGame}
          speedOptions={SPEED_OPTIONS}
          onTogglePause={togglePause}
          onSetSpeed={setSpeed}
          onOpenTrade={handleOpenTrade}
          onOpenDashboard={() => setShowDashboard(true)}
          // One header icon per overview subject; each opens that subject's own window. The rail id is
          // asked for rather than re-listed (`sidebarTabForOverviewNav`), so a new subject cannot be
          // reachable from the keyboard but missing from the header.
          onOpenSubject={(subject) => {
            playClickSound();
            openTab(sidebarTabForOverviewNav(subject));
          }}
          activeSubject={citizenOverviewOpen ? overviewNavFromState(overviewSection, overviewWorldFocus) : null}
          onSave={handleSave}
          onLoad={handleLoad}
          onSaveToFile={() => { void handleSaveToFile(); }}
          onLoadFromFile={handleLoadFromFile}
          tutorialsEnabled={tutorialsEnabled}
          juiceEffectsEnabled={juiceEffectsEnabled}
          showSimTick={showSimTick}
          showFps={showFps}
          autoPlay={autoPlayer.enabled}
          autoPlayStatus={autoPlayer.status}
          autoPlayHistory={autoPlayer.history}
          onToggleAutoPlay={autoPlayer.toggle}
          onToggleAutoSave={toggleAutoSave}
          onToggleTutorials={handleToggleTutorials}
          onToggleJuiceEffects={handleToggleJuiceEffects}
          onToggleShowSimTick={handleToggleShowSimTick}
          onToggleShowFps={handleToggleShowFps}
          onToggleMute={handleToggleMute}
          onVolumePreset={handleVolumePreset}
          onOpenGuide={handleOpenGuide}
          onStartNewGame={startNewGame}
          onOpenCitizenOverview={openCitizenOverview}
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
      )}
      alertBar={<AlertBar alerts={priorityAlerts} onAlert={handlePriorityAlert} />}
      buildRail={(
        <GameBuildRail
          world={world}
          buildPanelOpen={buildPanelOpen}
          selectedBuildingType={selectedBuildingType}
          showGrid={view.showGrid}
          onToggleOpen={() => setBuildPanelOpen((open) => !open)}
          onOpen={() => setBuildPanelOpen(true)}
          onSelect={selectBuildingType}
          onLocked={(type) => applyGameAction({ proto: 1, op: 'notifyBuildingLocked', type })}
          onCancel={cancelBuildMode}
          onToggleGrid={toggleGrid}
        />
      )}
      mapStage={(
        <>
          <GameMapStage
            canvasRef={canvasRef}
            canvasCursor={canvasCursor}
            fps={fps}
            showFps={showFps}
            autoPlaySession={autoPlayer.session}
            worldRef={worldRef}
            viewRef={viewRef}
            cameraTargetZoom={view.camera.targetZoom}
            onNavigate={focusWorldCamera}
            onApplyZoom={applyZoom}
            onSetZoomLevel={setZoomLevel}
            onResetZoom={resetZoom}
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onContextMenu={handleContextMenu}
          />

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
                    focusWorldCamera(n.focus.x, n.focus.y, 1.5);
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
                className={`group relative w-full rounded-xl border-2 px-3 py-2 pr-8 text-left text-sm shadow-xl backdrop-blur-md transition-all animate-in slide-in-from-right hover:brightness-110 ${
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
                <span className="mt-0.5 block text-[13px] leading-relaxed opacity-90">{n.message}</span>
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
                      <p className="text-sm text-stone-300">{evt.description}</p>
                      <p className="mt-1 text-[11px] text-orange-300/90">
                        {evt.rivalResponse === 'payoff_offer'
                          ? `Offer: ${formatRaidLootSummary(raidEventLoot(evt))}`
                          : 'They chose to fight'}
                        {' · '}
                        <strong>{formatRaidDeadline(evt, world.tick)}</strong>
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
                            className="rounded-lg bg-stone-900/80 px-2 py-1.5 text-left text-xs font-semibold text-stone-100 hover:bg-stone-800"
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
                        className="mt-1.5 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
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
                      <p className="text-sm text-stone-300">{evt.description}</p>
                      <p className="mt-1 text-[11px] text-rose-300/90">
                        At risk: {formatRaidLootSummary(raidEventLoot(evt)) || `${evt.lootFood}🍖`}
                        {' · '}
                        <strong>{formatRaidDeadline(evt, world.tick)}</strong>
                        {evt.marchDistanceTiles > 0 && (
                          <span> · {evt.marchDistanceTiles} tiles march</span>
                        )}
                      </p>
                      <div className="mt-2">
                        <Suspense fallback={<p className="text-[11px] text-stone-300">Loading preview…</p>}>
                          <CombatPreviewPanel
                            compact
                            preview={raidPreview}
                            title="If they raid you — defend or barricade"
                          />
                        </Suspense>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-1">
                        {evt.choices.map((choice) => {
                          // Ask the raid owner instead of re-deriving its gate (roadmap U2/O2, the
                          // same shape as the story card two blocks down). The inline version tested
                          // `hasIronSpears || hasStoneSpears` while the owner tests
                          // `hasMilitiaWeapons` = spears **or swords**, so a sword-armed colony was
                          // shown a disabled Defend button reading "Stone or iron spears required"
                          // where the owner refuses with "Need weapons (spears or swords)" — copy
                          // that had already drifted from the rule it described.
                          const eligibility = getRaidChoiceEligibility(world, evt, choice.id);
                          const blocked = !eligibility.ok;
                          const blockReason = eligibility.blockReason;
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
                            className="rounded-lg bg-stone-900/80 px-2 py-1.5 text-left text-xs font-semibold text-stone-100 hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
                            title={blockReason ?? choice.hint}
                          >
                            <LabelWithResourceCost label={choice.label} cost={choice.cost} />
                            {/* The reason is rendered, not tooltipped: `title` is unreachable on touch,
                                which is the defect the diplomacy buttons were fixed for (bug 46). */}
                            {blocked && blockReason && (
                              <span className="mt-0.5 block text-[11px] font-normal text-amber-300">
                                {blockReason}
                              </span>
                            )}
                          </button>
                          );
                        })}
                      </div>
                      <RivalFocusButton
                        world={world}
                        rivalId={evt.rivalId}
                        label="Watch war-band on map"
                        onFocus={(rival) => focusCampOnMap('rival', rival.id, rival.campX, rival.campY, rival.buildingIds[0])}
                      />
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* The two authored-decision cards share one anchored, centred column. Both used to carry
              `absolute left-1/2 top-4 z-10 w-full max-w-lg -translate-x-1/2`, and diplomacy comes
              later in the DOM, so a pending diplomacy card painted over a story card's title and first
              choice. They are flow children of this column now, which stacks them — and the column is
              the anchor, because this overlay is a plain `absolute inset-0` box rather than a flex
              container, so a bare flow child would land in its top-left corner. */}
          <div className="pointer-events-none absolute left-1/2 top-4 z-10 flex w-full max-w-lg -translate-x-1/2 flex-col">
          {/* Signature story cards — authored choices with real sim consequences */}
          {world.pendingStoryEvents && world.pendingStoryEvents.length > 0 && (
            <div className="pointer-events-auto w-full max-w-lg animate-in fade-in slide-in-from-top">
              {world.pendingStoryEvents.slice(0, 2).map((evt) => (
                <div key={evt.id} className="mb-2 rounded-xl border border-emerald-500/40 bg-emerald-950/90 p-3 shadow-xl backdrop-blur">
                  <div className="flex items-start gap-3">
                    <Emoji className="text-2xl">{evt.emoji}</Emoji>
                    <div className="flex-1">
                      <h3 className="font-bold text-emerald-100">{evt.title}</h3>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-emerald-200/80">{evt.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {evt.choices.map((choice) => {
                          // Ask the story owner instead of guessing (roadmap U2/O2). A refused
                          // answer is re-queued by `respondToStoryEvent`, so the card already stays
                          // open — what was missing is the reason: an unaffordable choice used to
                          // look clickable and refuse in silence.
                          const outcome = actionOutcomeFromGate(
                            getStoryChoiceEligibility(world, evt, choice.id),
                            storyChoiceReasonCode(evt.storyKey, choice.id),
                          );
                          const blocked = outcome.kind === 'blocked';
                          return (
                          <GatedChoiceButton
                            key={choice.id}
                            label={choice.label}
                            blocked={blocked}
                            explanation={outcome.explanation}
                            hint={choice.detail}
                            colorClass="bg-stone-900/80 text-emerald-100 hover:bg-stone-800"
                            onChoose={() => applyGameAction({ proto: 1, op: 'respondToStoryEvent', eventId: evt.id, choiceId: choice.id })}
                          />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Diplomacy event cards — player must respond */}
          {pendingDiplomacy.length > 0 && (
            <div className="pointer-events-auto w-full max-w-lg animate-in fade-in slide-in-from-top">
              {pendingDiplomacy.slice(0, 2).map((evt) => (
                <div key={evt.id} className="mb-2 rounded-xl border border-amber-500/40 bg-amber-950/90 p-3 shadow-xl backdrop-blur">
                  <div className="flex items-start gap-3">
                    <Emoji className="text-2xl">{evt.emoji}</Emoji>
                    <div className="flex-1">
                      <h3 className="font-bold text-amber-100">{evt.title}</h3>
                      <p className="text-sm text-stone-300">{evt.description}</p>
                      <div className="mt-2 grid grid-cols-1 gap-1">
                        {evt.choices.map((choice) => {
                          const outcome = actionOutcomeFromGate(
                            getDiplomacyChoiceEligibility(world, evt, choice.id),
                            diplomacyChoiceReasonCode(evt.kind, choice.id),
                          );
                          const blocked = outcome.kind === 'blocked';
                          return (
                          <GatedChoiceButton
                            key={choice.id}
                            label={choice.label}
                            blocked={blocked}
                            explanation={outcome.explanation}
                            hint={choice.hint}
                            colorClass="bg-stone-800/80 text-stone-100 hover:bg-stone-700"
                            onChoose={() => applyGameAction({ proto: 1, op: 'respondToDiplomacyEvent', eventId: evt.id, choiceId: choice.id })}
                          />
                          );
                        })}
                      </div>
                      <RivalFocusButton
                        world={world}
                        rivalId={evt.rivalId}
                        label="Show camp on map"
                        onFocus={(rival) => focusCampOnMap('rival', rival.id, rival.campX, rival.campY, rival.buildingIds[0])}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* end of the shared authored-decision column */}
          </div>
          </div>

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
                        <span className="shrink-0 text-xs text-stone-400">{daysLeft}d left</span>
                      </div>
                      <p className="mt-0.5 text-sm leading-relaxed text-stone-300">{q.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold text-stone-400">
                          Needs {q.goalAmount} {resEmoji[q.goalResource] ?? q.goalResource} · you have {have}
                        </span>
                        <button
                          type="button"
                          disabled={!canDeliver}
                          onClick={() => {
                            playClickSound();
                            applyGameAction({ proto: 1, op: 'deliverVisitorQuest' });
                          }}
                          className="ml-auto rounded-lg bg-amber-600 px-3 py-1 text-[13px] font-bold text-amber-50 hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-500"
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
                    <p className="text-sm text-stone-300">
                      {firstNightWarningMessage}
                    </p>
                    <button
                      onClick={() => {
                        setFirstNightWarningDismissed(true);
                        saveFirstNightWarningDismissed(true);
                      }}
                      className="mt-2 rounded-lg bg-amber-700/60 px-3 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-600/60"
                    >
                      Got it
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Save toast — the same banner the setup screen draws, so one message has one renderer */}
          {saveToast && <SaveToastBanner toast={saveToast} onDismiss={dismissSaveToast} />}

          {/* Pause HUD — map stays clickable for inspect/build while frozen */}
          {world.paused && !showTutorial && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-amber-500/40 bg-stone-900/85 px-4 py-1 text-[13px] font-bold text-amber-200 shadow-lg backdrop-blur">
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

        </>
      )}
      inspector={(
        <aside
          className={`side-panel flex flex-col border-l border-stone-700/80 ${
            // Wide only when there is something to inspect. With nothing selected this column used to
            // hold the diagnostics drawer across the full 18.5rem — an empty box the owner reported as
            // *"now the right panel no need to be that big anymore"*. Nothing selected = the narrow
            // rail, and the map keeps the width (the same narrowing the collapsed branch already does
            // for the same reason).
            hasInspectorSelection && !inspectorCollapsed ? 'w-[18.5rem]' : 'w-12'
          }`}
        >
        <GameInspector
          hasSelection={hasInspectorSelection}
          collapsed={inspectorCollapsed}
          selectedLabel={selectedVisitorCamp?.name ?? selectedBuilding?.type ?? selectedEntity?.name ?? 'Selected'}
          onClear={clearSelection}
          onToggleCollapsed={() => setInspectorCollapsed((v) => !v)}
          diagnostics={<SimulationDiagnosticsPanel loopRef={loopRef} debugMode={debugMode} />}
        >

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
              <>
                <SelectedEntityPanel
                  entity={selectedEntity}
                  allEntities={world.entities}
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
                  onTame={(humanId: number) => {
                    playClickSound();
                    const entityId = selectedEntity.id;
                    applyGameAction({ proto: 1, op: 'tameEntity', entityId, humanId });
                  }}
                  onOpenVisitorCamp={(group) => focusCampOnMap('visitor', group.id, group.campX, group.campY)}
                  onOpenFamilyTree={() => {
                    playClickSound();
                    setFamilyTreeFor(selectedEntity.id);
                  }}
                />
                {/* Its own window. `onSelect` walks the tree through the SAME door a map click uses,
                    so selecting a relative behaves exactly like clicking them on the map. */}
                {familyTreeFor != null &&
                  (() => {
                    const treeEntity = resolveEntity(world, familyTreeFor) ?? catalog?.get(familyTreeFor);
                    if (!treeEntity) return null;
                    return (
                      <FamilyTreeWindow
                        entity={treeEntity}
                        allEntities={world.entities}
                        onClose={() => setFamilyTreeFor(null)}
                        onSelect={(entityId) => {
                          playClickSound();
                          setFamilyTreeFor(entityId);
                          loopRef.current?.patchView({
                            selectedEntityId: entityId,
                            selectedEntityIds: [entityId],
                          });
                        }}
                      />
                    );
                  })()}
              </>
            ) : selectedBuilding ? (
              <>
                {(() => {
                  const selectedSettlers = (view.selectedEntityIds ?? [])
                    .map((id) => resolveEntity(world, id) ?? catalog?.get(id) ?? null)
                    .filter((e): e is import('./game/gameTypes').Entity =>
                      !!e && e.alive && isPlayerHuman(e) && !e.isJuvenile);
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
                      className="mb-2 w-full rounded-xl border-2 border-amber-400/60 bg-amber-400/15 px-3 py-2 text-left text-sm font-semibold text-amber-200 shadow-lg backdrop-blur-md transition-colors hover:bg-amber-400/25"
                    >
                      👥 Assign {selectedSettlers.length} selected settlers here
                    </button>
                  );
                })()}
              <SelectedBuildingPanel
                key={selectedBuilding.id}
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
                onSetStaffingMode={(mode) => {
                  playClickSound();
                  applyGameAction({ proto: 1, op: 'setBuildingStaffingMode', buildingId: selectedBuilding.id, mode });
                }}
                onQueueForge={(orderId) => {
                  playClickSound();
                  applyGameAction({ proto: 1, op: 'queueForgeOrder', buildingId: selectedBuilding.id, orderId });
                }}
                onTownHallAction={(cmd) => {
                  playClickSound();
                  applyGameAction(cmd);
                }}
                canAssignWorker={canAssignWorkerToBuilding(world, selectedBuilding.id)}
                onDiplomacyAction={(cmd) => {
                  playClickSound();
                  applyGameAction(cmd);
                }}
                onFocusCamp={(rival) => focusCampOnMap('rival', rival.id, rival.campX, rival.campY, rival.buildingIds[0])}
              />
              </>
            ) : null}


        </GameInspector>
      <GameSidebar>
          <div ref={sidebarContentRef} className="flex flex-1 flex-col items-center gap-3 px-2 py-4">
            {/* The "Village" button and its caption that stood here are **removed** (owner:
                *"the villaige buton not in right side like i said"*). The citizen/village window is
                opened from its icon in the header — the header icon set is the one route per subject,
                which is what the old caption was trying to explain — so a second button in this
                sidebar was a duplicate entrance to the same window. The sidebar now holds only the
                view toggles. Do not reinstate it here. */}
          </div>
      </GameSidebar>
        </aside>
      )}
            overlays={(
        <GameOverlays>
      {/*
        The authored decision cards below stack in one flow column instead of each pinning itself to
        `top-4`. The story card and the diplomacy card were both `absolute left-1/2 top-4 z-10 w-full
        max-w-lg -translate-x-1/2`, and diplomacy comes later in the DOM, so with a story card and a
        pending diplomacy card up at once the diplomacy card painted over the story card's title and
        first choice — an authored decision the player could not read or answer.
        `storyHelpers.pushStoryEvent` only avoids other *story* events, so the pair is reachable.
      */}
      {showVillageRequest && activeVillageRequest && (
        <VillageRequestCard
          request={activeVillageRequest}
          // Why Accept would be refused, from the owner that actually refuses it. Without this the
          // card's `disabled` gate was always false (the prop was never passed), so an unaffordable
          // offer rendered as an enabled button carrying the *positive* "Pay 15 gold → receive 30
          // food" detail, and the real refusal only appeared as a toast after the click — the
          // fail-open affordance the raid and diplomacy cards had already stopped doing.
          acceptBlockedReason={
            getVillageRequestEligibility(world, activeVillageRequest, 'accept').blockReason ?? null
          }
          onResolve={(requestId, choice) => applyGameAction({
            proto: 1,
            op: 'resolveVillageRequest',
            requestId,
            choice,
          })}
        />
      )}

      {showActiveEventBanner && activeEventForBanner && (
        <ActiveEventBanner event={activeEventForBanner} onDismiss={dismissActiveEvent} />
      )}

      {activeBigNews.length > 0 && !showActiveEventBanner && !showVillageRequest && (
        <BigNewsBanner
          news={activeBigNews}
          onDismiss={dismissBigNewsItem}
        />
      )}

      {showShortcuts && (
        <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />
      )}

      {showDashboard && (
        <GameDashboard
          state={world}
          onClose={() => setShowDashboard(false)}
          onNavigate={(where) => {
            setShowDashboard(false);
            switch (where) {
              case 'farm':
                handleHintAction({ id: 'build_farm', label: 'Build a Farm' });
                break;
              case 'house':
                handleHintAction({ id: 'build_house', label: 'Build a House' });
                break;
              case 'village':
                openTab('village');
                break;
              case 'nature':
                openTab('nature');
                break;
              case 'frontier':
                openTab('frontier');
                break;
            }
          }}
        />
      )}

      {citizenOverviewOpen && (
        <CitizenOverviewScreen
          state={world}
          villageStats={villageStats}
          favoriteEntityId={view.favoriteEntityId}
          pendingRaidCount={pendingRaids.length}
          pendingOutgoingRaidCount={pendingOutgoingRaids.length}
          pendingDiplomacyCount={pendingDiplomacy.length}
          tradeReadyCount={tradeReadyCount}
          section={overviewSection}
          worldFocus={overviewWorldFocus}
          onNavChange={selectOverviewNav}
          progressSubTab={progressSubTab}
          setProgressSubTab={setProgressSubTab}
          logSubTab={logSubTab}
          setLogSubTab={setLogSubTab}
          moreSubTab={moreSubTab}
          setMoreSubTab={setMoreSubTab}
          tutorialsEnabled={tutorialsEnabled}
          onClose={closeCitizenOverview}
          onRecruitSettler={() => applyGameAction({ proto: 1, op: 'recruitSettler' })}
          onAutoStaffAll={() => applyGameAction({ proto: 1, op: 'autoStaffWorkers' })}
          onFocusBuilding={focusBuildingOnMap}
          onFocusCitizen={focusCitizenOnMap}
          onToggleFavoriteCitizen={(id) => {
            playClickSound();
            toggleFavoriteCitizen(id);
          }}
          onHintAction={(action) => {
            // Map/build/focus actions need the world underneath — leave the overlay first.
            const needsMap =
              action.id.startsWith('build_')
              || action.id.startsWith('focus_');
            if (needsMap) closeCitizenOverview();
            handleHintAction(action);
          }}
          suppressHintIds={campaignStep?.id === 'build_house' ? ['build_house'] : []}
          onOpenWorkHours={() => {
            playClickSound();
            setWorkHoursOpen(true);
          }}
          onFocusVisitor={(id, x, y) => focusCampOnMap('visitor', id, x, y)}
          onFocusRival={(id, x, y, buildingId) => focusCampOnMap('rival', id, x, y, buildingId)}
          onLaunchRaid={(rivalId) => {
            playClickSound();
            applyGameAction({ proto: 1, op: 'launchRaidOnRival', rivalId });
          }}
          onStartResearch={(researchId) => applyGameAction({ proto: 1, op: 'startResearch', researchId })}
          onEstablishTradeRoute={(routeId) => applyGameAction({ proto: 1, op: 'establishTradeRoute', routeId })}
          onReplayTutorial={() => { setTutorialStep(0); setShowTutorial(true); }}
          onToggleTutorials={handleToggleTutorials}
          onSpawnMoonHowlerDebug={() => applyGameAction({ proto: 1, op: 'spawnMoonHowlerDebug' })}
          debugMode={debugMode}
          onStartGuidedCampaign={() => applyGameAction({ proto: 1, op: 'startGuidedCampaign' })}
        />
      )}
      {/* Its own window, independent of any selection (owner: one window per subject). */}
      {workHoursOpen && (
        <WorkHoursWindow
          state={world}
          onClose={() => setWorkHoursOpen(false)}
          onApplyWorkSchedule={(startHour, endHour) =>
            applyGameAction({ proto: 1, op: 'setWorkSchedule', startHour, endHour })
          }
          onApplyVenueSchedule={(venue, startHour, endHour) =>
            applyGameAction({ proto: 1, op: 'setVenueSchedule', venue, startHour, endHour })
          }
          onApplyWorkforcePolicy={(preset) =>
            applyGameAction({ proto: 1, op: 'setWorkforcePolicy', preset })
          }
        />
      )}
        </GameOverlays>
      )}
    />
  );
}

// ============ SUB-COMPONENTS ============

/**
 * An authored event choice that the owning gate may refuse: the label, the owner's explanation as
 * visible text (not only a tooltip), and the refusal disabling the control.
 *
 * The story card and the diplomacy card rendered this control byte-for-byte identically except for
 * their colours and their command op — jscpd's remaining `.tsx` clone in this file. `RaidChoiceButtons`
 * in `SelectedBuildingPanel` is the same shape for the raid cards.
 */
function GatedChoiceButton({
  label,
  blocked,
  explanation,
  hint,
  colorClass,
  onChoose,
}: {
  label: string;
  blocked: boolean;
  explanation?: string | null;
  hint?: string;
  colorClass: string;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      disabled={blocked}
      onClick={() => {
        if (blocked) return;
        playClickSound();
        onChoose();
      }}
      className={`rounded-lg px-2 py-1.5 text-left text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${colorClass}`}
      title={explanation ?? hint}
    >
      {label}
      {explanation && (
        <span className="block font-normal text-amber-200/90">{explanation}</span>
      )}
    </button>
  );
}

function RivalFocusButton({
  world,
  rivalId,
  label,
  onFocus,
}: {
  world: WorldState;
  rivalId: string;
  label: string;
  onFocus: (rival: { id: string; campX: number; campY: number; buildingIds: number[] }) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        const rival = world.rivalSettlements.find((r) => r.id === rivalId);
        if (rival) onFocus(rival);
      }}
      className="mt-1.5 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
    >
      📍 {label}
    </button>
  );
}

function FavoriteFollowBanner({
  fav,
  onStop,
}: {
  fav: { id: number; name?: string; surname?: string };
  onStop: (id: number) => void;
}) {
  // The owner's identified form: it keeps the `#id` (two nameless settlers must stay distinguishable
  // here) *and* the one nameless-settler fallback.
  const label = formatCitizenName(fav);
  return (
    <div className="pointer-events-auto absolute left-1/2 top-14 z-20 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-amber-500/40 bg-stone-900/90 px-3 py-1.5 shadow-lg backdrop-blur">
        <span className="text-sm" aria-hidden>⭐</span>
        <span className="text-[13px] font-semibold text-amber-100">
          Following {label}
        </span>
        <button
          type="button"
          onClick={() => {
            playClickSound();
            onStop(fav.id);
          }}
          className="rounded-full bg-stone-700/80 px-2 py-0.5 text-xs font-bold text-stone-200 hover:bg-stone-600 hover:text-white"
        >
          Stop
        </button>
      </div>
    </div>
  );
}

