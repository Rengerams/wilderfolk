import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Camera, Entity, SpotlightLoreState, WorldState } from '../game/gameTypes';
import { resolveEntity, worldToScreen } from '../game/viewState';
import { terrainRiseAt } from '../game/terrainAtlas';
import { formatChatLine } from '../game/humanChat';
import {
  SPOTLIGHT_CAPTIONS, SPOTLIGHT_TOTAL_MS, SPOTLIGHT_FIRST_CHORUS_START,
  SPOTLIGHT_BRIDGE_START, spotlightFrameAt, spotlightPoseOffset, spotlightSpeakerId,
} from './spotlightChoreography';
import { spotlightFarewellDestination, spotlightFarewellPosition } from './spotlightFarewell';

type EndReason = 'complete' | 'skipped';

interface Props {
  scene: SpotlightLoreState;
  world: WorldState;
  getCamera: () => Camera;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** App remains the only camera owner; this is the visual target, never a new camera. */
  onCameraTarget: (x: number, y: number) => void;
  /** The existing canvas draws this same sprite once, at a temporary visual location. */
  onPresentation: (presentation: {
    id: number; x: number; y: number; moving: boolean; facingLeft: boolean;
  } | null) => void;
  onFinish: (sceneId: string, reason: EndReason) => void;
}

const PARTICLE_LIMIT = 24;
const PARTICLE_PERIOD_MS = 180; // <= 6 new particles per second
const PARTICLE_LIFETIME_MS = 1800;

/** One map-mounted wall-clock scene. Never sends dialogue, movement or particle state to the worker. */
export default function SpotlightLoreOverlay({
  scene, world, getCamera, canvasRef, onCameraTarget, onPresentation, onFinish,
}: Props) {
  const [lineIndex, setLineIndex] = useState(-1);
  const [stageKind, setStageKind] = useState<'gathering' | 'intro' | 'caption' | 'pose' | 'applause'>('gathering');
  const completed = useRef(false);
  const callbacks = useRef({ getCamera, onCameraTarget, onPresentation, onFinish });
  const radialRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const particleRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    callbacks.current = { getCamera, onCameraTarget, onPresentation, onFinish };
  });

  // Look up the real actors once for this scene, never scan the population per video frame.
  const cast = useMemo(() => {
    const actorIds = new Set([scene.heroineId, ...scene.performerIds]);
    return new Map(world.entities.filter((entity) => actorIds.has(entity.id)).map((entity) => [entity.id, entity]));
  }, [world.entities, scene.heroineId, scene.performerIds]);
  const girl = cast.get(scene.heroineId) ?? resolveEntity(world, scene.heroineId);
  const departure = useMemo(() => spotlightFarewellDestination(world, scene),
    [world.worldMap, world.buildings, world.width, world.height, scene]);

  useEffect(() => {
    if (scene.phase !== 'ready' || completed.current) return;
    const from = { x: scene.gatherX, y: scene.gatherY };
    let frameHandle = 0;
    let previousIndex = -1;
    let previousKind: 'intro' | 'caption' | 'pose' | 'applause' | null = null;
    let startTime: number | null = null;
    const chorusMean = scene.slots.reduce(
      (mean, slot) => ({ x: mean.x + slot.x / scene.slots.length, y: mean.y + slot.y / scene.slots.length }),
      { x: 0, y: 0 },
    );

    const paint = (now: number) => {
      if (completed.current) return;
      if (startTime === null) startTime = now;
      const elapsed = now - startTime;
      const step = spotlightFrameAt(elapsed);
      if (step.finished) {
        completed.current = true;
        callbacks.current.onPresentation(null);
        callbacks.current.onFinish(scene.id, 'complete');
        return;
      }
      if (step.lineIndex !== previousIndex) {
        previousIndex = step.lineIndex ?? -1;
        setLineIndex(previousIndex);
      }
      if (step.kind !== previousKind) {
        previousKind = step.kind;
        setStageKind(step.kind);
      }

      const pose = step.poseProgress === null ? { x: 0, y: 0 } : spotlightPoseOffset(step.poseProgress);
      const walked = spotlightFarewellPosition(from, departure, step.farewellProgress);
      const x = walked.x + pose.x;
      const y = walked.y + pose.y;
      const moving = step.poseProgress !== null || (step.farewellProgress > 0 && step.farewellProgress < 1);
      const facingLeft = step.poseProgress !== null
        ? Math.sin(step.poseProgress * Math.PI * 2) < 0
        : departure.x < from.x;

      // Renderer uses the actual heroine's sprite once, with a frame-scoped display projection.
      callbacks.current.onPresentation({ id: scene.heroineId, x, y, moving, facingLeft });
      if (step.farewellProgress > 0) callbacks.current.onCameraTarget(x, y);

      const camera = callbacks.current.getCamera();
      const cw = canvasRef.current?.clientWidth ?? world.width;
      const ch = canvasRef.current?.clientHeight ?? world.height;
      const project = (px: number, py: number): { x: number; y: number } => {
        const [sx, sy] = worldToScreen(px, py, camera, cw, ch);
        return { x: sx, y: sy - terrainRiseAt(world.worldMap, px, py) * camera.zoom };
      };
      const onScreen = project(x, y);
      if (radialRef.current) {
        radialRef.current.style.background =
          'radial-gradient(ellipse 180px 145px at ' + onScreen.x + 'px ' + (onScreen.y - 32) +
          'px, transparent 0%, rgba(12,11,8,0.08) 40%, rgba(12,11,8,0.5) 100%)';
      }
      if (ringRef.current) {
        ringRef.current.style.left = onScreen.x + 'px';
        ringRef.current.style.top = (onScreen.y - 18) + 'px';
      }
      const caption = step.lineIndex === null ? null : SPOTLIGHT_CAPTIONS[step.lineIndex];
      const speakingId = caption ? spotlightSpeakerId(caption.speaker, scene.heroineId, scene.performerIds) : null;
      const speakingEntity = speakingId === scene.heroineId ? girl : cast.get(speakingId ?? -1);
      const sourcePosition = speakingId === scene.heroineId ? onScreen
        : speakingEntity ? project(speakingEntity.x, speakingEntity.y) : onScreen;
      if (bubbleRef.current) {
        bubbleRef.current.style.left = Math.min(cw - 160, Math.max(160, sourcePosition.x)) + 'px';
        bubbleRef.current.style.top = (Math.max(85, Math.min(ch - 140, sourcePosition.y - 82)) - 30) + 'px';
      }

      // Deterministic, bounded comic stage confetti; never generates gameplay relationships.
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
      callbacks.current.onPresentation(null);
    };
  }, [scene.id, scene.phase, scene.heroineId, scene.gatherX, scene.gatherY, scene.slots, scene.performerIds,
    departure, girl, cast, canvasRef, world.width, world.height, world.worldMap]);

  const line = lineIndex >= 0 ? SPOTLIGHT_CAPTIONS[lineIndex] : null;
  const speakingId = line ? spotlightSpeakerId(line.speaker, scene.heroineId, scene.performerIds) : null;
  const speakingEntity: Entity | undefined = speakingId === scene.heroineId
    ? girl ?? undefined : cast.get(speakingId ?? -1);

  const skip = () => {
    if (completed.current) return;
    completed.current = true;
    callbacks.current.onPresentation(null);
    callbacks.current.onFinish(scene.id, 'skipped');
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-[80] overflow-hidden" aria-label="Village spotlight scene">
      <div ref={radialRef} className="absolute inset-0 transition-opacity duration-700" aria-hidden="true" />
      <div ref={ringRef}
        className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-300/80 shadow-[0_0_36px_16px_rgba(251,191,36,0.25)]"
        aria-hidden="true" />
      <div ref={particleRef} className="pointer-events-none absolute inset-0" aria-hidden="true">
        {Array.from({ length: PARTICLE_LIMIT }, (_, i) => (
          <span key={i} className="absolute left-0 top-0 select-none text-xl" style={{ opacity: 0, willChange: 'transform, opacity' }} />
        ))}
      </div>
      <div className="absolute left-1/2 top-5 -translate-x-1/2 rounded-lg border border-amber-500/70 bg-stone-950/90 px-5 py-2 text-center shadow-xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300">A very strange village tradition</p>
        <p className="text-sm font-semibold text-stone-100">{girl?.name ?? 'Someone'} has the look!</p>
      </div>
      {scene.phase === 'gathering' ? (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-md bg-stone-950/85 px-4 py-2 text-sm text-amber-100">
          The neighbours are gathering. Nobody knows why.
        </div>
      ) : line && speakingEntity && (stageKind === 'caption' || stageKind === 'pose') ? (
        <>
          <div ref={bubbleRef}
            className="absolute z-10 w-[min(20rem,75%)] -translate-x-1/2 rounded-xl border border-stone-700 bg-amber-50 px-4 py-3 text-center text-sm text-stone-900 shadow-2xl"
            role="status" aria-live="polite">
            <p className="mb-1 text-[11px] font-bold text-amber-800">{speakingEntity.name ?? 'Villager'}</p>
            <p className="whitespace-pre-line font-semibold">{formatChatLine(line.text, speakingEntity)}</p>
          </div>
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-md bg-stone-950/80 px-3 py-1 text-xs text-amber-100">
            {lineIndex + 1} / {SPOTLIGHT_CAPTIONS.length}{stageKind === 'pose' ? ' · Show-off walk (7 sec)' : ''}
          </div>
        </>
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
        className="pointer-events-auto absolute right-4 top-4 rounded-lg border border-amber-600 bg-stone-950/90 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
        Skip scene
      </button>
      <span className="sr-only">Performance duration {Math.round(SPOTLIGHT_TOTAL_MS / 1000)} seconds.</span>
    </div>
  );
}
