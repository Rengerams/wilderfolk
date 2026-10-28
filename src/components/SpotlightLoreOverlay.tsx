import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Camera, SpotlightLoreState, WorldState } from '../game/gameTypes';
import { resolveEntity, worldToScreen } from '../game/viewState';
import { formatChatLine } from '../game/humanChat';

type EndReason = 'complete' | 'skipped';

interface Props {
  scene: SpotlightLoreState;
  world: WorldState;
  getCamera: () => Camera;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onFinish: (sceneId: string, reason: EndReason) => void;
}

const LINES = [
  '1-2-3-4, walking like a man!',
  'Hitting like a hammer!',
  "She's a juvenile scam!",
  'Never was a quitter!',
  'Tasty like a raindrop!',
  "She's got the look!",
  'Heavenly bound, cause heaven has got a number!',
  "When she's spinning me around!",
  'Kissing is a colour!',
  'Wait. Which colour? The painter would like to know.',
  "She's got the look!",
  "She's got the look!",
  'What in the world can make a brown-eyed girl turn blue?',
  'That would be my blueberry pie. She ate all of it.',
  "When everything I'll ever do, I'll do for you!",
  "And I go: la la la la la — she's got the look!",
  "No, no, you're early. We haven't reached the chorus!",
  "She's got the look!",
  'Fire in the ice!',
  "Who put my soup in the ice cellar?",
  'Banging on the head drum!',
  'Shaking like a mad bull!',
  "She's got the look!",
  'Swaying to the band!',
  'Moving like a hammer!',
  "She's a miracle, man!",
  "A miracle GIRL, you goose!",
  'Loving is the ocean!',
  'Kissing is the wet sand!',
  "She's got the look!",
  'Well, now everyone is looking. What was the question?',
] as const;

function lineDuration(text: string): number {
  return Math.max(3000, Math.min(5300, 1900 + text.length * 43));
}

/** Read-only in-map scene: simulation remains paused, speech advances by wall time. */
export default function SpotlightLoreOverlay({ scene, world, getCamera, canvasRef, onFinish }: Props) {
  const [lineIndex, setLineIndex] = useState(-1);
  const completed = useRef(false);
  const finishRef = useRef(onFinish);
  const getCameraRef = useRef(getCamera);
  const radialRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const actorsRef = useRef<{
    girl: { x: number; y: number } | null;
    speaker: { x: number; y: number } | null;
  }>({ girl: null, speaker: null });

  useEffect(() => {
    if (scene.phase !== 'ready' || completed.current) return;
    const duration = lineIndex < 0 ? 2400 : lineIndex === LINES.length ? 2800 : lineDuration(LINES[lineIndex] ?? '');
    const timer = window.setTimeout(() => {
      if (completed.current) return;
      if (lineIndex === LINES.length) {
        completed.current = true;
        finishRef.current(scene.id, 'complete');
      } else {
        setLineIndex((index) => index + 1);
      }
    }, duration);
    return () => window.clearTimeout(timer);
  }, [scene.id, scene.phase, lineIndex]);

  const girl = resolveEntity(world, scene.heroineId);
  const speakerId = scene.performerIds[Math.max(0, lineIndex) % scene.performerIds.length];
  const speaker = resolveEntity(world, speakerId ?? null);
  // Publish committed actors and callbacks before projecting the stage.
  useLayoutEffect(() => {
    finishRef.current = onFinish;
    getCameraRef.current = getCamera;
    actorsRef.current = {
      girl: girl ? { x: girl.x, y: girl.y } : null,
      speaker: speaker ? { x: speaker.x, y: speaker.y } : null,
    };
  });
  useLayoutEffect(() => {
    let frame = 0;
    const sync = () => {
      const camera = getCameraRef.current();
      const { girl: star, speaker: voice } = actorsRef.current;
      const cw = canvasRef.current?.clientWidth ?? 800;
      const ch = canvasRef.current?.clientHeight ?? 600;
      const [gx, gy] = star
        ? worldToScreen(star.x, star.y, camera, cw, ch)
        : [cw / 2, ch / 2];
      const [sx, sy] = voice
        ? worldToScreen(voice.x, voice.y, camera, cw, ch)
        : [cw / 2, ch / 2];
      if (radialRef.current) {
        radialRef.current.style.background =
          `radial-gradient(ellipse 180px 145px at ${gx}px ${gy - 32}px, transparent 0%, rgba(12,11,8,0.08) 40%, rgba(12,11,8,0.5) 100%)`;
      }
      if (ringRef.current) {
        ringRef.current.style.left = `${gx}px`;
        ringRef.current.style.top = `${gy - 18}px`;
      }
      if (bubbleRef.current) {
        bubbleRef.current.style.left = `${Math.min(cw - 160, Math.max(160, sx))}px`;
        bubbleRef.current.style.top = `${Math.max(85, Math.min(ch - 140, sy - 82)) - 30}px`;
      }
      frame = window.requestAnimationFrame(sync);
    };
    sync();
    return () => window.cancelAnimationFrame(frame);
  }, [canvasRef, scene.id, lineIndex]);

  const line = lineIndex >= 0 ? LINES[lineIndex] : null;

  const skip = () => {
    if (completed.current) return;
    completed.current = true;
    finishRef.current(scene.id, 'skipped');
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-[80] overflow-hidden" aria-label="Village spotlight scene">
      <div
        ref={radialRef}
        className="absolute inset-0 transition-opacity duration-700"
        aria-hidden="true"
      />
      <div
        ref={ringRef}
        className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-300/80 shadow-[0_0_36px_16px_rgba(251,191,36,0.25)]"
        aria-hidden="true"
      />
      <div className="absolute left-1/2 top-5 -translate-x-1/2 rounded-lg border border-amber-500/70 bg-stone-950/90 px-5 py-2 text-center shadow-xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300">A very strange village tradition</p>
        <p className="text-sm font-semibold text-stone-100">{girl?.name ?? 'Someone'} has the look!</p>
      </div>
      {scene.phase === 'gathering' ? (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-md bg-stone-950/85 px-4 py-2 text-sm text-amber-100">
          The neighbours are gathering. Nobody knows why.
        </div>
      ) : line && speaker ? (
        <>
          <div
            ref={bubbleRef}
            className="absolute z-10 w-[min(20rem,75%)] -translate-x-1/2 rounded-xl border border-stone-700 bg-amber-50 px-4 py-3 text-center text-sm text-stone-900 shadow-2xl"
            role="status"
            aria-live="polite"
          >
            <p className="mb-1 text-[11px] font-bold text-amber-800">{speaker.name ?? 'Villager'}</p>
            <p className="whitespace-pre-line font-semibold">{formatChatLine(line, speaker)}</p>
          </div>
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-md bg-stone-950/80 px-3 py-1 text-xs text-amber-100">
            {lineIndex + 1} / {LINES.length}
          </div>
        </>
      ) : lineIndex === LINES.length ? (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-md border border-amber-400/70 bg-stone-950/90 px-4 py-2 text-sm font-bold text-amber-100" role="status">
          A confused round of applause. The star takes a bow.
        </div>
      ) : scene.phase === 'ready' ? (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-md bg-stone-950/85 px-4 py-2 text-sm text-amber-100">
          An awkward silence. Someone clears their throat...
        </div>
      ) : null}
      <button
        type="button"
        onClick={skip}
        className="pointer-events-auto absolute right-4 top-4 rounded-lg border border-amber-600 bg-stone-950/90 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
      >
        Skip scene
      </button>
    </div>
  );
}
