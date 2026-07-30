/**
 * Escalating valley ecology stage — Stable → Strained → Damaged → Collapse.
 * Information-first: stage + drivers are always computable for UI; mechanical
 * effects scale only after sustained stress (see design spec 2026-07-30).
 */
import type { WorldState } from './gameTypes';
import { BuildingType } from './gameTypes';
import { getAbsoluteCalendarDay } from './dayCycle';
import { getGrazingPressureReport } from './ecosystemPressure';
import { addBigNews, addNotification } from './simEffects';
import { logEvent } from './eventLog';

export type ValleyStage = 'stable' | 'strained' | 'damaged' | 'collapse';
export type EcologyDriverId = 'grazing' | 'predators' | 'overhunt' | 'footprint';
export type DriverBand = 'good' | 'caution' | 'bad';

export interface EcologyDriverView {
  id: EcologyDriverId;
  label: string;
  band: DriverBand;
  detail: string;
  /** 0 = fine, 1 = caution, 2 = bad */
  stress: number;
}

export interface ValleyEcologySnapshot {
  stage: ValleyStage;
  /** 0–3 aligned with stages for comparisons */
  stressLevel: number;
  primaryDriver: EcologyDriverId | null;
  drivers: EcologyDriverView[];
  playerSummary: string;
  helpLines: string[];
}

const STAGE_ORDER: ValleyStage[] = ['stable', 'strained', 'damaged', 'collapse'];

/** No Collapse until the colony has lived this many absolute days. */
export const ECOLOGY_COLLAPSE_MIN_DAY = 14;
/** Metrics must stay elevated this many colony days before stage +1. */
const CONFIRM_UP_DAYS = 1;
/** Improved metrics must hold before stage −1. */
const RECOVERY_LAG_DAYS = 2;
/** Damaged dwell before Collapse is allowed (colony days). */
const DAMAGED_BEFORE_COLLAPSE_DAYS = 4;
/** Re-notify same stage at most this often. */
const NOTIFY_COOLDOWN_DAYS = 3;

const STAGE_LABEL: Record<ValleyStage, string> = {
  stable: 'Stable',
  strained: 'Strained',
  damaged: 'Damaged',
  collapse: 'Collapse',
};

const STAGE_EMOJI: Record<ValleyStage, string> = {
  stable: '🌿',
  strained: '⚠️',
  damaged: '🧡',
  collapse: '☠️',
};

export function valleyStageLabel(stage: ValleyStage): string {
  return STAGE_LABEL[stage];
}

export function valleyStageEmoji(stage: ValleyStage): string {
  return STAGE_EMOJI[stage];
}

export function valleyStageIndex(stage: ValleyStage): number {
  return STAGE_ORDER.indexOf(stage);
}

function stageFromStress(level: number): ValleyStage {
  const i = Math.max(0, Math.min(3, Math.floor(level)));
  return STAGE_ORDER[i];
}

function driverBand(stress: number): DriverBand {
  if (stress >= 2) return 'bad';
  if (stress >= 1) return 'caution';
  return 'good';
}

/**
 * Instantaneous stress from current world (0–3). Not the persisted stage —
 * stage lags via confirm / recovery windows.
 */
export function computeRawEcologyStress(state: WorldState): {
  stressLevel: number;
  drivers: EcologyDriverView[];
  primaryDriver: EcologyDriverId | null;
} {
  const grazing = getGrazingPressureReport(state);
  const wolves = state.wildlifeCounts?.wolves ?? 0;
  const deer = state.wildlifeCounts?.deer ?? 0;
  const rabbits = state.wildlifeCounts?.rabbits ?? 0;
  const prey = deer + rabbits;
  const eco = state.ecosystemHealth ?? 100;
  const pollution = state.pollutionLevel ?? 0;
  const humans = state.humanPopulation ?? 0;

  // --- Grazing ---
  let grazingStress = 0;
  if (grazing.level === 'critical') grazingStress = 2;
  else if (grazing.level === 'caution') grazingStress = 1;
  if (grazing.pressureRatio >= 1.6) grazingStress = Math.max(grazingStress, 2);
  if (grazing.pressureRatio >= 2.0) grazingStress = 2;

  // --- Predators / prey chain ---
  let predatorStress = 0;
  if (wolves === 0 && deer >= 8) predatorStress = 2;
  else if (wolves === 0 && deer >= 5) predatorStress = 1;
  else if (wolves <= 1 && deer >= 12) predatorStress = 2;
  else if (prey === 0 && humans >= 4) predatorStress = 2; // barren for hunters
  else if (prey > 0 && prey < 3 && humans >= 8) predatorStress = 1;

  // --- Overhunt (staffed hunting spots + low prey relative to pop) ---
  const huntSpots = state.buildings.filter(
    (b) =>
      b.completed
      && b.type === BuildingType.HuntingSpot
      && b.faction !== 'rival'
      && b.occupants.length > 0,
  ).length;
  let overhuntStress = 0;
  if (huntSpots >= 2 && prey < humans * 0.8 && prey < 10) overhuntStress = 2;
  else if (huntSpots >= 1 && prey < 6 && humans >= 6) overhuntStress = 1;
  else if (huntSpots >= 3 && prey < 15) overhuntStress = 1;

  // --- Footprint / pollution ---
  let footprintStress = 0;
  if (eco < 25 || pollution >= 70) footprintStress = 2;
  else if (eco < 45 || pollution >= 45) footprintStress = 1;

  const drivers: EcologyDriverView[] = [
    {
      id: 'grazing',
      label: 'Meadows under heavy grazing',
      band: driverBand(grazingStress),
      detail: grazing.headline,
      stress: grazingStress,
    },
    {
      id: 'predators',
      label: 'Food chain unbalanced (predators/prey)',
      band: driverBand(predatorStress),
      detail:
        wolves === 0 && deer >= 5
          ? 'Few or no wolves while deer multiply — grass will suffer.'
          : prey === 0
            ? 'Little wild prey left near the village.'
            : `Wolves ${wolves} · deer ${deer} · rabbits ${rabbits}.`,
      stress: predatorStress,
    },
    {
      id: 'overhunt',
      label: 'Hunting pressure too high',
      band: driverBand(overhuntStress),
      detail:
        huntSpots === 0
          ? 'No staffed hunting posts — pressure is low.'
          : `${huntSpots} staffed hunting post${huntSpots === 1 ? '' : 's'}; wild prey ${prey}.`,
      stress: overhuntStress,
    },
    {
      id: 'footprint',
      label: 'Town and pollution press the wild',
      band: driverBand(footprintStress),
      detail: `Ecosystem health ${Math.round(eco)}% · pollution ${Math.round(pollution)}%.`,
      stress: footprintStress,
    },
  ];

  const worst = Math.max(...drivers.map((d) => d.stress));
  const badCount = drivers.filter((d) => d.stress >= 2).length;
  const cautionCount = drivers.filter((d) => d.stress >= 1).length;

  // Map worst driver stress + multi-driver boost → 0–3
  let stressLevel = 0;
  if (worst >= 2 && (badCount >= 2 || cautionCount >= 3)) stressLevel = 3;
  else if (worst >= 2) stressLevel = 2;
  else if (worst >= 1 && cautionCount >= 2) stressLevel = 2;
  else if (worst >= 1) stressLevel = 1;
  else stressLevel = 0;

  const primary =
    [...drivers].sort((a, b) => b.stress - a.stress).find((d) => d.stress > 0)?.id ?? null;

  return { stressLevel, drivers, primaryDriver: primary };
}

const HELP_BY_DRIVER: Record<EcologyDriverId, string[]> = {
  grazing: [
    'Ease hunting so deer numbers can fall naturally — or let wolves work.',
    'Avoid paving every meadow; grass needs open pasture.',
    'Watch the Nature tab demand vs recovery numbers.',
  ],
  predators: [
    'Leave some wolves wild (Harmony needs them free).',
    'Do not wipe predators just to “secure” the valley.',
    'If prey is gone, rest hunting posts until wildlife returns.',
  ],
  overhunt: [
    'Unstaff a Hunting Spot for a season.',
    'Rely more on farms and greenhouses for food.',
    'Give deer and rabbits time to rebound.',
  ],
  footprint: [
    'Research cleaner industry where available.',
    'Slow expansion if ecosystem health is dropping.',
    'Balance buildings with wild land — not every tile needs a wall.',
  ],
};

export function computeValleyEcologySnapshot(state: WorldState): ValleyEcologySnapshot {
  const raw = computeRawEcologyStress(state);
  const stage = state.valleyStage ?? stageFromStress(raw.stressLevel);
  const primary = raw.primaryDriver;
  const primaryView = raw.drivers.find((d) => d.id === primary);

  let playerSummary: string;
  switch (stage) {
    case 'stable':
      playerSummary = 'The valley is in balance — keep an eye on deer, wolves, and meadows.';
      break;
    case 'strained':
      playerSummary = primaryView
        ? `The valley is strained — ${primaryView.label.toLowerCase()}. Hunts may feel thinner; this is the wild chain, not bad luck.`
        : 'The valley is under strain — game and meadows are tighter. Check Nature; thin hunts are ecology, not pure chance.';
      break;
    case 'damaged':
      playerSummary = primaryView
        ? `The valley is damaged — ${primaryView.detail}`
        : 'The valley is damaged. Act soon or the chain may collapse.';
      break;
    case 'collapse':
      playerSummary =
        'Valley in collapse — food chain and meadows are failing. Stop overhunting and restore wild balance.';
      break;
  }

  const helpLines = primary
    ? HELP_BY_DRIVER[primary].slice(0, 3)
    : ['Keep wolves, deer, and grass in a healthy band.', 'Open Nature when alerts appear.'];

  return {
    stage,
    stressLevel: valleyStageIndex(stage),
    primaryDriver: primary,
    drivers: raw.drivers,
    playerSummary,
    helpLines,
  };
}

/** Hunt food multiplier from valley stage (1 = normal). */
export function getValleyHuntYieldMultiplier(state: WorldState): number {
  switch (state.valleyStage ?? 'stable') {
    case 'strained':
      return 0.9;
    case 'damaged':
      return 0.7;
    case 'collapse':
      return 0.45;
    default:
      return 1;
  }
}

/** Mild farm edge only when footprint/grazing is bad enough to reach Damaged+. */
export function getValleyFarmYieldMultiplier(state: WorldState): number {
  const stage = state.valleyStage ?? 'stable';
  if (stage === 'damaged') return 0.95;
  if (stage === 'collapse') return 0.88;
  return 1;
}

/** Extra daily illness chance at higher stages. */
export function getValleyIllnessChanceBonus(state: WorldState): number {
  switch (state.valleyStage ?? 'stable') {
    case 'damaged':
      return 0.00008;
    case 'collapse':
      return 0.0002;
    default:
      return 0;
  }
}

function ensureStageFields(state: WorldState): void {
  if (state.valleyStage == null) state.valleyStage = 'stable';
  if (state.valleyStageSinceDay == null) {
    state.valleyStageSinceDay = getAbsoluteCalendarDay(state.tick);
  }
  if (state.valleyRawStressStreakDays == null) state.valleyRawStressStreakDays = 0;
  if (state.valleyRawCalmStreakDays == null) state.valleyRawCalmStreakDays = 0;
  if (state.valleyLastStageNotifyDay == null) state.valleyLastStageNotifyDay = -999;
}

function announceStage(
  state: WorldState,
  prev: ValleyStage,
  next: ValleyStage,
  snap: ValleyEcologySnapshot,
  day: number,
): void {
  if (prev === next) return;
  const rising = valleyStageIndex(next) > valleyStageIndex(prev);
  const emoji = STAGE_EMOJI[next];
  const title = rising
    ? `${emoji} Valley ${STAGE_LABEL[next].toLowerCase()}`
    : `${emoji} Valley recovering`;
  const message = snap.playerSummary;

  const cooldownOk = day - (state.valleyLastStageNotifyDay ?? -999) >= NOTIFY_COOLDOWN_DAYS
    || rising
    || valleyStageIndex(next) <= valleyStageIndex(prev) - 1;

  if (!cooldownOk && !rising) return;

  state.valleyLastStageNotifyDay = day;

  if (next === 'strained' && rising) {
    addNotification(state, title, message, 'warning');
  } else if (next === 'damaged' || next === 'collapse') {
    addBigNews(state, title, message, 'negative');
    addNotification(state, title, message, 'warning');
  } else if (!rising && (prev === 'collapse' || prev === 'damaged')) {
    addBigNews(state, title, 'The valley is healing — stay careful so it does not slip again.', 'positive');
    addNotification(state, title, message, 'success');
  } else if (!rising && prev === 'strained' && next === 'stable') {
    addNotification(state, `${emoji} Meadows easing`, 'Grazing pressure looks manageable again.', 'success');
  } else if (rising) {
    addNotification(state, title, message, 'warning');
  }

  logEvent(state, 'event', `Valley ecology: ${STAGE_LABEL[prev]} → ${STAGE_LABEL[next]}. ${message}`);
}

/**
 * Daily tick: advance confirm/recovery streaks and maybe change valleyStage.
 * Call once per calendar day after wildlife counts / eco metrics are fresh enough.
 */
export function tickValleyEcologyStage(state: WorldState): void {
  ensureStageFields(state);
  const day = getAbsoluteCalendarDay(state.tick);
  const raw = computeRawEcologyStress(state);
  const current = state.valleyStage ?? 'stable';
  const currentIdx = valleyStageIndex(current);
  const targetIdx = raw.stressLevel;

  // Streaks: raw wants higher vs lower than current stage
  if (targetIdx > currentIdx) {
    state.valleyRawStressStreakDays = (state.valleyRawStressStreakDays ?? 0) + 1;
    state.valleyRawCalmStreakDays = 0;
  } else if (targetIdx < currentIdx) {
    state.valleyRawCalmStreakDays = (state.valleyRawCalmStreakDays ?? 0) + 1;
    state.valleyRawStressStreakDays = 0;
  } else {
    // Holding: decay opposite streaks slowly
    state.valleyRawStressStreakDays = Math.max(0, (state.valleyRawStressStreakDays ?? 0) - 1);
    state.valleyRawCalmStreakDays = Math.max(0, (state.valleyRawCalmStreakDays ?? 0) - 1);
  }

  let next = current;

  // Upward
  if (targetIdx > currentIdx && (state.valleyRawStressStreakDays ?? 0) >= CONFIRM_UP_DAYS) {
    let newIdx = currentIdx + 1;
    // Collapse gates
    if (newIdx >= 3) {
      const daysInDamaged =
        current === 'damaged'
          ? day - (state.valleyStageSinceDay ?? day)
          : 0;
      if (day < ECOLOGY_COLLAPSE_MIN_DAY) {
        newIdx = 2; // cap at damaged early game
      } else if (current !== 'damaged' || daysInDamaged < DAMAGED_BEFORE_COLLAPSE_DAYS) {
        // Need dwell at damaged unless already there long enough;
        // if jumping from strained with stress 3, land on damaged first
        if (current === 'strained' || current === 'stable') newIdx = Math.min(newIdx, 2);
        if (current === 'damaged' && daysInDamaged < DAMAGED_BEFORE_COLLAPSE_DAYS) {
          newIdx = 2;
        }
      }
    }
    next = STAGE_ORDER[Math.min(newIdx, 3)];
  }

  // Downward with recovery lag
  if (targetIdx < currentIdx && (state.valleyRawCalmStreakDays ?? 0) >= RECOVERY_LAG_DAYS) {
    next = STAGE_ORDER[Math.max(0, currentIdx - 1)];
  }

  if (next !== current) {
    // Collapse entry: one-time rep hit
    if (next === 'collapse' && current !== 'collapse') {
      state.villageReputation = Math.max(0, (state.villageReputation ?? 0) - 4);
    }
    state.valleyStage = next;
    state.valleyStageSinceDay = day;
    state.valleyRawStressStreakDays = 0;
    state.valleyRawCalmStreakDays = 0;
    const snap = computeValleyEcologySnapshot(state);
    announceStage(state, current, next, snap, day);
  }
}

/** Ensure stage fields exist after load (recompute if missing). */
export function ensureValleyEcologyOnLoad(state: WorldState): void {
  ensureStageFields(state);
  const raw = computeRawEcologyStress(state);
  // Soft clamp: if saved stage is more than 1 step from raw, pull toward raw by one
  const cur = valleyStageIndex(state.valleyStage ?? 'stable');
  if (Math.abs(raw.stressLevel - cur) > 1) {
    const toward = raw.stressLevel > cur ? cur + 1 : cur - 1;
    state.valleyStage = STAGE_ORDER[Math.max(0, Math.min(3, toward))];
    state.valleyStageSinceDay = getAbsoluteCalendarDay(state.tick);
  }
}

export function getValleyStageFocusHint(state: WorldState): {
  icon: string;
  title: string;
  detail: string;
} | null {
  const stage = state.valleyStage ?? 'stable';
  if (stage === 'stable') return null;
  const snap = computeValleyEcologySnapshot(state);
  const help = snap.helpLines[0] ?? 'Open Nature for details.';
  return {
    icon: STAGE_EMOJI[stage],
    title:
      stage === 'collapse'
        ? 'Valley in collapse'
        : stage === 'damaged'
          ? 'Valley damaged — act soon'
          : 'Valley strained — be careful',
    detail: `${snap.playerSummary} ${help}`,
  };
}
