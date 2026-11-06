import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Camera, Entity, SpotlightLoreState, WorldState } from '../game/gameTypes';
import { resolveEntity, worldToScreen } from '../game/viewState';
import { terrainRiseAt } from '../game/terrainAtlas';
import { formatChatLine } from '../game/humanChat';
import { bindNumberedPresentationSpeakers } from '../game/dialogueTrees';
import { preloadSpotlightApplause, playSpotlightApplause } from '../audio/spotlightApplause';
import { preloadSpotlightMusic, playSpotlightMusic, type SpotlightMusicPlayback } from '../audio/spotlightMusic';
import {
  SPOTLIGHT_CAPTIONS, SPOTLIGHT_TOTAL_MS, SPOTLIGHT_FIRST_CHORUS_START,
  SPOTLIGHT_BRIDGE_START, SPOTLIGHT_APPLAUSE_START, SPOTLIGHT_PRESENTATION, spotlightFrameAt, spotlightPoseOffset,
  spotlightOpeningFrame, SPOTLIGHT_MUSIC_FADE_MS, spotlightOpeningCues, SPOTLIGHT_WALK_RADIUS_PX,
} from './spotlightChoreography';
import { spotlightFarewellDestination, spotlightFarewellPosition, spotlightSafePoseRadius } from './spotlightFarewell';
import { useOverlayKeyboard } from '../hooks/useOverlayKeyboard';

type EndReason = 'complete' | 'skipped';

interface Props {
  scene: SpotlightLoreState;
  world: WorldState;
  getCamera: () => Camera;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onCameraTarget: (x: number, y: number) => void;
  onPresentation: (presentation: {
    id: number; x: number; y: number; moving: boolean; facingLeft: boolean;
    speech?: { speakerId: number; text: string } | null;
  } | null) => void;
  onFinish: (sceneId: string, reason: EndReason) => void;
}

const PARTICLE_LIMIT = 24;
const PARTICLE_PERIOD_MS = 180;
const PARTICLE_LIFETIME_MS = 1800;

export default function SpotlightLoreOverlay({
  scene, world, getCamera, canvasRef, onCameraTarget, onPresentation, onFinish,
}: Props) {
  const [lineIndex, setLineIndex] = useState(-1);
  const [stageKind, setStageKind] = useState<'gathering' | 'intro' | 'caption' | 'pose' | 'applause'>('gathering');
  const completed = useRef(false);
  const callbacks = useRef({ getCamera, onCameraTarget, onPresentation, onFinish });
  const radialRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const particleRef = useRef<HTMLDivElement | null>(null);
  const applauseRef = useRef<HTMLDivElement | null>(null);
  const applauseSoundRef = useRef<{ stop: () => void } | null>(null);
  const musicSoundRef = useRef<SpotlightMusicPlayback | null>(null);
  const blackoutRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    callbacks.current = { getCamera, onCameraTarget, onPresentation, onFinish };
  });

  const girl = resolveEntity(world, scene.heroineId) ?? undefined;
  const boundCaptions = useMemo(
    () => bindNumberedPresentationSpeakers(SPOTLIGHT_PRESENTATION, scene.performerIds, scene.heroineId),
    [scene.performerIds, scene.heroineId],
  );
   const stageOrigin = useMemo(() => ({
    x: scene.gatherX,
    y: scene.gatherY,
  }), [scene.gatherX, scene.gatherY]);
  const departure = useMemo(() => spotlightFarewellDestination(world, {
    ...scene, gatherX: stageOrigin.x, gatherY: stageOrigin.y,
  }), [world, scene, stageOrigin]);
  const poseRadius = useMemo(() => spotlightSafePoseRadius(world, stageOrigin),
    [world, stageOrigin]);

  const stageViewRef = useRef<{
    world: WorldState; scene: SpotlightLoreState; girl: Entity | undefined;
    origin: { x: number; y: number };
    exit: ReturnType<typeof spotlightFarewellDestination>;
    radius: number;
  } | null>(null);
  useLayoutEffect(() => {
    stageViewRef.current = {
      world, scene, girl, origin: stageOrigin,
      exit: departure, radius: poseRadius,
    };
  });

  useEffect(() => {
    if (scene.phase === 'ready' || scene.phase === 'gathering') {
      void preloadSpotlightMusic().catch(() => undefined);
    }
    if (scene.phase === 'ready') void preloadSpotlightApplause().catch(() => undefined);
  }, [scene.id, scene.phase]);

  useEffect(() => {
    if (scene.phase !== 'ready' || stageKind !== 'applause') return;
    const playback = playSpotlightApplause();
    applauseSoundRef.current = playback;
    return () => {
      playback.stop();
      if (applauseSoundRef.current === playback) applauseSoundRef.current = null;
    };
  }, [scene.id, scene.phase, stageKind]);

  useEffect(() => {
    if (scene.phase !== 'ready' || completed.current) return;
    const view = stageViewRef.current;
    if (!view) return;
    const {
      world: stageWorld, scene: stage, origin: from, exit, radius,
    } = view;
    let frameHandle = 0;
    let previousIndex = -1;
    let previousKind: 'intro' | 'caption' | 'pose' | 'applause' | null = null;
    let startTime: number | null = null;
    let cameraFocused = false;
    let soundtrackStarted = false;
    let soundtrackFaded = false;
    let soundtrackStopped = false;
    const men = stage.slots.filter((slot) => resolveEntity(stageWorld, slot.humanId)?.gender === 'male');
    const effectTargets = men.length > 0 ? men : stage.slots;
    const chorusMean = effectTargets.reduce(
      (mean, slot) => ({ x: mean.x + slot.x / effectTargets.length, y: mean.y + slot.y / effectTargets.length }),
      { x: 0, y: 0 },
    );

    const paint = (now: number) => {
      if (completed.current) return;
      // Timeline bookkeeping created inside this effect, never read during render.
      // oxlint-disable-next-line react/immutability
      if (startTime === null) startTime = now;
      const elapsed = now - startTime;
      const step = spotlightFrameAt(elapsed);
      const opening = spotlightOpeningFrame(elapsed);
      const cues = spotlightOpeningCues(elapsed, step.kind, {
        camera: cameraFocused, music: soundtrackStarted,
      });
      if (cues.focusCamera) {
        cameraFocused = true;
        callbacks.current.onCameraTarget(from.x, from.y);
      }
      if (cues.startMusic) {
        soundtrackStarted = true;
        musicSoundRef.current = playSpotlightMusic();
      }
      if (!soundtrackFaded && elapsed >= SPOTLIGHT_APPLAUSE_START - SPOTLIGHT_MUSIC_FADE_MS) {
        soundtrackFaded = true;
        musicSoundRef.current?.fadeOut(SPOTLIGHT_MUSIC_FADE_MS / 1000);
      }
      if (step.kind === 'applause' && !soundtrackStopped) {
        soundtrackStopped = true;
        musicSoundRef.current?.stop(false);
      }
      if (step.finished) {
        completed.current = true;
        musicSoundRef.current?.stop();
        musicSoundRef.current = null;
        callbacks.current.onPresentation(null);
        callbacks.current.onFinish(stage.id, 'complete');
        return;
      }
      const nextIndex = step.lineIndex ?? -1;
      if (nextIndex !== previousIndex) {
        previousIndex = nextIndex;
        setLineIndex(nextIndex);
      }
      if (step.kind !== previousKind) {
        previousKind = step.kind;
        setStageKind(step.kind);
      }

      // Gebruik de ruime 28px catwalk straal
      const circleRadius = Math.max(SPOTLIGHT_WALK_RADIUS_PX, radius);
      const pose = step.poseProgress === null ? { x: 0, y: 0 } : spotlightPoseOffset(step.poseProgress, circleRadius);
      const walked = spotlightFarewellPosition(from, exit, step.farewellProgress);
      const x = walked.x + pose.x;
      const bowProgress = step.kind === 'applause'
        ? Math.max(0, Math.min(1, (elapsed - SPOTLIGHT_APPLAUSE_START) / 1500)) : 0;
      const bowOffset = step.kind === 'applause' ? 3 * Math.sin(Math.PI * bowProgress) : 0;
      const y = walked.y + pose.y + bowOffset;
      
      const isWalkingCircle = step.poseProgress !== null;
      const moving = isWalkingCircle || (step.farewellProgress > 0 && step.farewellProgress < 1);

      // Kijkt vooruit in plaats van achteruit te moonwalken:
      const facingLeft = isWalkingCircle
        ? Math.sin(step.poseProgress! * Math.PI * 2) > 0
        : exit.x < from.x;

      callbacks.current.onPresentation({ id: stage.heroineId, x, y, moving, facingLeft });
      if (step.farewellProgress > 0) callbacks.current.onCameraTarget(x, y);

      const camera = callbacks.current.getCamera();
      const cw = canvasRef.current?.clientWidth ?? stageWorld.width;
      const ch = canvasRef.current?.clientHeight ?? stageWorld.height;
      const project = (px: number, py: number): { x: number; y: number } => {
        const [sx, sy] = worldToScreen(px, py, camera, cw, ch);
        return { x: sx, y: sy - terrainRiseAt(stageWorld.worldMap, px, py) * camera.zoom };
      };
      const onScreen = project(x, y);
      if (blackoutRef.current) {
        blackoutRef.current.style.opacity = String(step.kind === 'intro' ? opening.blackoutOpacity : 0);
        const rect = canvasRef.current?.getBoundingClientRect();
        const viewX = (rect?.left ?? 0) + onScreen.x;
        const viewY = (rect?.top ?? 0) + onScreen.y - 38;
        const hole = `radial-gradient(ellipse 190px 220px at ${viewX}px ${viewY}px,
          transparent 0%, transparent 55%, black 100%)`;
        blackoutRef.current.style.maskImage = opening.spotlightVisible ? hole : 'none';
        blackoutRef.current.style.webkitMaskImage = opening.spotlightVisible ? hole : 'none';
      }
      const applauseMarkers = applauseRef.current?.children;
      if (applauseMarkers) {
        for (let index = 0; index < applauseMarkers.length; index++) {
          const marker = applauseMarkers[index] as HTMLElement;
          const human = resolveEntity(stageWorld, stage.performerIds[index]);
          if (step.kind !== 'applause' || !human) {
            marker.style.opacity = '0';
            continue;
          }
          const location = project(human.x, human.y);
          const bounce = Math.sin(elapsed / 150 + index * 2.2);
          marker.style.left = location.x + 'px';
          marker.style.top = (location.y - 58 - bounce * 7) + 'px';
          marker.style.opacity = String(0.45 + 0.5 * Math.abs(bounce));
        }
      }
      if (radialRef.current) {
        radialRef.current.style.background =
          'radial-gradient(ellipse 320px 260px at ' + onScreen.x + 'px ' + (onScreen.y - 32) +
          'px, transparent 0%, rgba(12,11,8,0.03) 55%, rgba(12,11,8,0.3) 100%)';
      }
      if (ringRef.current) {
        ringRef.current.style.opacity = step.kind === 'intro' && !opening.spotlightVisible ? '0' : '1';
        ringRef.current.style.left = onScreen.x + 'px';
        ringRef.current.style.top = (onScreen.y - 18) + 'px';
      }

      const nodes = particleRef.current?.children;
      if (nodes) {
        const epoch = elapsed >= SPOTLIGHT_BRIDGE_START ? elapsed - SPOTLIGHT_BRIDGE_START
          : elapsed - SPOTLIGHT_FIRST_CHORUS_START;
        const newest = Math.floor(epoch / PARTICLE_PERIOD_MS);
        for (let i = 0; i < PARTICLE_LIMIT; i++) {
          const element = nodes[i] as HTMLElement;
          const particleId = newest - i;
          const age = epoch - particleId * PARTICLE_PERIOD_MS;
          if (!step.hearts || particleId < 0 || age < 0 || age >= PARTICLE_LIFETIME_MS) {
            element.style.opacity = '0';
            continue;
          }
          const progress = age / PARTICLE_LIFETIME_MS;
          const side = Math.sin((particleId + 1) * 2.399963);
          const targetX = chorusMean.x - x;
          const targetY = chorusMean.y - y;
          const dx = targetX * progress * 0.6 * camera.zoom + side * 38 * progress;
          const dy = targetY * progress * 0.5 * camera.zoom - (24 + (particleId % 4) * 8) * progress;
          element.textContent = particleId % 3 === 0 ? '💋' : '♥';
          element.style.color = particleId % 3 === 0 ? '#ef4444' : '#f472b6';
          element.style.transform = 'translate(' + (onScreen.x + dx) + 'px,' + (onScreen.y - 42 + dy) + 'px)';
          element.style.opacity = String(Math.min(1, (1 - progress) * 1.6));
        }
      }
      frameHandle = window.requestAnimationFrame(paint);
    };
    frameHandle = window.requestAnimationFrame(paint);
    return () => {
      window.cancelAnimationFrame(frameHandle);
      musicSoundRef.current?.stop();
      musicSoundRef.current = null;
      callbacks.current.onPresentation(null);
    };
  }, [scene.id, scene.phase, canvasRef]);

  const line = lineIndex >= 0 ? boundCaptions[lineIndex] : null;
  const speaker = line?.speakerId === scene.heroineId
    ? girl : resolveEntity(world, line?.speakerId ?? -1);
  const captionText = line && speaker && (stageKind === 'caption' || stageKind === 'pose')
    ? formatChatLine(line.text, speaker) : null;
  const skip = () => {
    if (completed.current) return;
    completed.current = true;
    applauseSoundRef.current?.stop();
    musicSoundRef.current?.stop();
    musicSoundRef.current = null;
    callbacks.current.onPresentation(null);
    callbacks.current.onFinish(scene.id, 'skipped');
  };

  useOverlayKeyboard('spotlight-lore', skip);

  return (
    <div className="pointer-events-auto absolute inset-0 z-[80] overflow-hidden" aria-label="Village spotlight scene">
      <div ref={radialRef} className="absolute inset-0 transition-opacity duration-700" aria-hidden="true" />
      {scene.phase === 'ready' && typeof document !== 'undefined' && createPortal(
        <div ref={blackoutRef} className="pointer-events-none fixed inset-0 z-[9999] bg-black"
          style={{ opacity: 1 }} aria-hidden="true" />,
        document.body,
      )}
      <div ref={ringRef}
        className="absolute z-[31] h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-300/80 shadow-[0_0_40px_20px_rgba(251,191,36,0.2)]"
        aria-hidden="true" />
      <div ref={particleRef} className="pointer-events-none absolute inset-0" aria-hidden="true">
        {Array.from({ length: PARTICLE_LIMIT }, (_, i) => (
          <span key={i} className="absolute left-0 top-0 select-none text-xl" style={{ opacity: 0, willChange: 'transform, opacity' }} />
        ))}
      </div>
      <div ref={applauseRef} className="pointer-events-none absolute inset-0" aria-hidden="true">
        {scene.performerIds.map((id) => (
          <span key={id} className="absolute -translate-x-1/2 -translate-y-1/2 text-xl"
            style={{ opacity: 0, willChange: 'left, top, opacity' }}>👏</span>
        ))}
      </div>
      {/* Vaste dialoog-strip netjes onder de titelbanner gepind */}
      <div className="absolute left-1/2 top-5 z-[32] flex w-[min(46rem,calc(100vw-3rem))] -translate-x-1/2 flex-col items-center gap-2 text-center">
        <div className="rounded-lg border border-amber-500/70 bg-stone-950/90 px-5 py-2 shadow-xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300">A very strange village tradition</p>
          <p className="text-sm font-semibold text-stone-100">{girl?.name ?? 'Someone'} has the look!</p>
        </div>
        {captionText && (
          <p className="rounded-xl border border-amber-400/60 bg-stone-950/90 px-4 py-2 text-sm font-medium leading-snug text-stone-100 shadow-xl"
            role="status" aria-live="polite">
            {captionText}
          </p>
        )}
        {line && (stageKind === 'caption' || stageKind === 'pose') && (
          <span className="rounded bg-stone-950/75 px-2 py-0.5 text-[10px] font-medium text-amber-100/90">
            {lineIndex + 1} / {SPOTLIGHT_CAPTIONS.length}{stageKind === 'pose' ? ' · Show-off walk (7 sec)' : ''}
          </span>
        )}
      </div>
      {scene.phase === 'gathering' ? (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-md bg-stone-950/85 px-4 py-2 text-sm text-amber-100">
          The neighbours are gathering. Nobody knows why.
        </div>
      ) : stageKind === 'applause' ? (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-md border border-amber-400/70 bg-stone-950/90 px-4 py-2 text-sm font-bold text-amber-100" role="status">
          A confused round of applause. The star takes a bow.
        </div>
      ) : scene.phase === 'ready' ? (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-md bg-stone-950/85 px-4 py-2 text-sm text-amber-100">
          An awkward silence. Someone clears their throat...
        </div>
      ) : null}
      <button type="button" onClick={skip}
        className="pointer-events-auto absolute z-[40] right-4 top-4 rounded-lg border border-amber-600 bg-stone-950/90 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
        Skip scene
      </button>
      <span className="sr-only">Performance duration {Math.round(SPOTLIGHT_TOTAL_MS / 1000)} seconds.</span>
    </div>
  );
}