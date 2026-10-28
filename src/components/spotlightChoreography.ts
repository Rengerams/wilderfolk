import spotlightSource from '../game/data/dialogue/spotlight-lore.json' with { type: 'json' };
import { readPresentationDialogue } from '../game/dialogueTrees';

export const SPOTLIGHT_PRESENTATION = readPresentationDialogue(spotlightSource, 'spotlight.lore');

export const SPOTLIGHT_POSE_MS = 7000;
export const SPOTLIGHT_INTRO_MS = 2400;
export const SPOTLIGHT_APPLAUSE_MS = 2800;

export const SPOTLIGHT_CUES = [
  'juvenile-reply', 'first-look-pose', 'first-chorus-start', 'first-chorus-end',
  'second-look-lead', 'second-look-pose', 'bridge-hearts-start',
  'farewell-walk', 'final-heroine',
] as const;
export type SpotlightCue = typeof SPOTLIGHT_CUES[number];

export interface SpotlightCaption {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
  readonly cue?: SpotlightCue;
}
export interface SpotlightStep {
  readonly kind: 'intro' | 'caption' | 'pose' | 'applause';
  readonly durationMs: number;
  readonly startMs: number;
  readonly lineIndex: number | null;
  readonly pose?: 'first-look-pose' | 'second-look-pose';
}
export interface SpotlightFrame {
  readonly lineIndex: number | null;
  readonly kind: SpotlightStep['kind'];
  readonly poseProgress: number | null;
  readonly hearts: boolean;
  readonly farewellProgress: number;
  readonly finished: boolean;
}

/** All words belong to the JSON 1.3 source; presentation only owns timing and visuals. */
function readCaptions(): readonly SpotlightCaption[] {
  const tree = SPOTLIGHT_PRESENTATION;
  if (tree.id !== 'spotlight.lore.performance') {
    throw new Error('[spotlight] Missing canonical event tree');
  }
  const roles = new Set(tree.speakers);
  const seenCues = new Map<SpotlightCue, number>();
  const seenIds = new Set<string>();
  const cues = new Set<string>(SPOTLIGHT_CUES);
  const captions = tree.lines.map((line, index) => {
    const cue = line.cue;
    const id = line.id ?? '';
    if (!id || seenIds.has(id) || !roles.has(line.speaker) || !line.text.trim()) {
      throw new Error('[spotlight] Invalid line id, speaker or text at index ' + index);
    }
    seenIds.add(id);
    if (cue) {
      if (!cues.has(cue) || seenCues.has(cue as SpotlightCue)) {
        throw new Error('[spotlight] Unknown or duplicate cue: ' + cue);
      }
      seenCues.set(cue as SpotlightCue, index);
    }
    return { id, speaker: line.speaker, text: line.text, ...(cue ? { cue: cue as SpotlightCue } : {}) };
  });
  if (SPOTLIGHT_CUES.some((cue) => !seenCues.has(cue))) throw new Error('[spotlight] Required cue missing');
  const ordered = SPOTLIGHT_CUES.map((cue) => seenCues.get(cue)!);
  if (ordered.some((position, i) => i > 0 && position <= ordered[i - 1]!)) {
    throw new Error('[spotlight] Choreography cue order is invalid');
  }
  if (captions[seenCues.get('juvenile-reply')!]?.speaker !== 'heroine'
      || captions[seenCues.get('final-heroine')!]?.speaker !== 'heroine'
      || seenCues.get('final-heroine') !== captions.length - 1) {
    throw new Error('[spotlight] Heroine must speak both replies and the final line');
  }
  const adultRoles = Array.from({ length: 10 }, (_, i) => 'speaker_' + (i + 1));
  if (!adultRoles.every((role) => roles.has(role) && captions.some((line) => line.speaker === role))) {
    throw new Error('[spotlight] Each of ten authored chorus roles must speak');
  }
  return Object.freeze(captions.map((line) => Object.freeze(line)));
}

export const SPOTLIGHT_CAPTIONS = readCaptions();

export function spotlightLineDurationMs(text: string): number {
  return Math.max(3000, Math.min(5300, 1900 + text.length * 43));
}

function buildSteps(): readonly SpotlightStep[] {
  const steps: SpotlightStep[] = [];
  let at = 0;
  const add = (kind: SpotlightStep['kind'], durationMs: number, lineIndex: number | null, pose?: SpotlightStep['pose']) => {
    steps.push(Object.freeze({ kind, durationMs, startMs: at, lineIndex, ...(pose ? { pose } : {}) }));
    at += durationMs;
  };
  add('intro', SPOTLIGHT_INTRO_MS, null);
  SPOTLIGHT_CAPTIONS.forEach((line, i) => {
    add('caption', spotlightLineDurationMs(line.text), i);
    if (line.cue === 'first-look-pose' || line.cue === 'second-look-pose') {
      add('pose', SPOTLIGHT_POSE_MS, i, line.cue);
    }
  });
  add('applause', SPOTLIGHT_APPLAUSE_MS, null);
  return Object.freeze(steps);
}

export const SPOTLIGHT_STEPS = buildSteps();
export const SPOTLIGHT_TOTAL_MS = SPOTLIGHT_STEPS.reduce((total, step) => total + step.durationMs, 0);

function captionStart(cue: SpotlightCue): number {
  const lineIndex = SPOTLIGHT_CAPTIONS.findIndex((line) => line.cue === cue);
  const step = SPOTLIGHT_STEPS.find((step) => step.kind === 'caption' && step.lineIndex === lineIndex);
  if (!step) throw new Error('[spotlight] Cue has no timeline step: ' + cue);
  return step.startMs;
}
function captionEnd(cue: SpotlightCue): number {
  const lineIndex = SPOTLIGHT_CAPTIONS.findIndex((line) => line.cue === cue);
  const step = SPOTLIGHT_STEPS.find((step) => step.kind === 'caption' && step.lineIndex === lineIndex);
  return step!.startMs + step!.durationMs;
}
export const SPOTLIGHT_FIRST_CHORUS_START = captionStart('first-chorus-start');
export const SPOTLIGHT_FIRST_CHORUS_END = captionEnd('first-chorus-end');
export const SPOTLIGHT_BRIDGE_START = captionStart('bridge-hearts-start');
export const SPOTLIGHT_FAREWELL_START = captionStart('farewell-walk');
export const SPOTLIGHT_APPLAUSE_START = SPOTLIGHT_TOTAL_MS - SPOTLIGHT_APPLAUSE_MS;

export function spotlightFrameAt(elapsedMs: number): SpotlightFrame {
  const ms = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const step = SPOTLIGHT_STEPS.find((item) => ms < item.startMs + item.durationMs)
    ?? SPOTLIGHT_STEPS[SPOTLIGHT_STEPS.length - 1]!;
  const progress = Math.max(0, Math.min(1, (ms - step.startMs) / step.durationMs));
  const hearts = (ms >= SPOTLIGHT_FIRST_CHORUS_START && ms < SPOTLIGHT_FIRST_CHORUS_END)
    || (ms >= SPOTLIGHT_BRIDGE_START && ms < SPOTLIGHT_APPLAUSE_START);
  const farewellProgress = Math.max(0, Math.min(1,
    (ms - SPOTLIGHT_FAREWELL_START) / (SPOTLIGHT_APPLAUSE_START - SPOTLIGHT_FAREWELL_START)));
  return {
    lineIndex: step.lineIndex,
    kind: step.kind,
    poseProgress: step.kind === 'pose' ? progress : null,
    hearts,
    farewellProgress,
    finished: ms >= SPOTLIGHT_TOTAL_MS,
  };
}

/** Exactly one existing sprite follows a small closed circle, without changing Entity.x/y. */
export function spotlightPoseOffset(progress: number, radius = 11): { x: number; y: number } {
  const t = Math.max(0, Math.min(1, progress));
  const angle = 2 * Math.PI * t;
  return { x: radius * (Math.cos(angle) - 1), y: radius * Math.sin(angle) };
}

