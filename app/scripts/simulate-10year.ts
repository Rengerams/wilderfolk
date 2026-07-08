/**
 * Headless 10 in-game year balance pass — exercises buildings, research, forge,
 * diplomacy, raids, visitors, and rival actions with extensive logging.
 *
 * Run: npm run simulate:10year  (or simulate:20year for v0.5 ship gate)
 * Env:
 *   SIM_YEARS          — in-game years for official balance test (default 10; v0.5 gate = 20)
 *   SIM_PROFILE        — village | town (default) | eco — growth pacing (pop range is INFO only)
 *                      (town @10y: ~160–230; mid-Y0 often 170+ once housing + rep stack)
 *   SIM_LOG_FILE       — write full log to path (default: scripts/logs/sim-<years>year-<profile>-<timestamp>.txt)
 *   SIM_CHRONICLE_FILE — flat chronicle export path (default: scripts/logs/sim-<years>year-<profile>-chronicle-<timestamp>.txt)
 *   SIM_LOG_EVENTS     — 1 = include full grouped chronicle in main log (default 1); 0 = summary counts only
 *   SIM_LOG_LIFE       — 1 = stream pregnancies/births/deaths/marriages live (default 1); 0 = off (skips O(n) pregnancy scan)
 *   SIM_EVENT_LOG_MAX  — cap in-memory chronicle entries (default 5000; newest kept)
 *   SIM_LIFE_LOG_FILE  — dedicated life-events path (default: <main-log>-life.txt)
 *   SIM_VERBOSE        — 1 = log every player action to console (default 0)
 *   SIM_STRICT_COVERAGE — 1 = exit 1 if any option category untested
 *   PROGRESS_EVERY     — live heartbeat interval in ticks (default 360 = 15 game days)
 *   PERF_SAMPLE_EVERY  — perf sample interval in ticks (default 8640 = 1 game year)
 *   SIM_MAX_TICKS      — dev smoke only (shorter run). Unset for the official 10-year balance test.
 *   SIM_FULL_SIM       — 1 = no viewport throttle (slowest; old behavior)
 *   SIM_ZOOM           — viewport zoom for focus box (default 0.45, matches typical play)
 *   SIM_USE_WORKER     — 1 = worker_threads (slower; use npm run simulate:10year:worker); default via run-sim = 0 (fast main-thread)
 *   SIM_HEADLESS       — 1 = compact syncSimPrep + no render SoA (default for worker sims); 0 = full importSave + render pack
 *
 * Buildings are not scripted on a timeline — autoBuildFree picks types from village needs.
 * Logs a full building inventory + build chronicle; year-end and final sweeps place missing types.
 * Scheduled actions only apply yearly resource grants and pre-winter bumps.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  initGame,
  recruitSettler,
  getSeason,
  assignAllWorkers,
  assignIdleWorkerToBuilding,
  getOccupationForBuilding,
  BuildingType,
  BUILDING_CONFIGS,
  Season,
} from '../src/game/gameEngine';
import { findBuildSpot, tryPlaceBuilding, tryPlaceWallChain } from './simBuildUtils';
import {
  buildChronicleMeta,
  formatEventSummaryLines,
  formatGroupedChronicleLines,
  formatCombatReportLines,
  writeChronicleFile,
} from './simEventLog';
import type { WorldState, BuildingType as BuildingTypeName } from '../src/game/gameTypes';
import { JobType } from '../src/game/gameTypes';
import { MapSize, createInitialResearchNodes } from '../src/game/gameTypes';
import {
  isPlayerHuman,
  respondToDiplomacyEvent,
  getDiplomacyChoiceEligibility,
  sendRivalGift,
  establishRivalTradePact,
  showStrengthToRival,
  signPeaceTreaty,
  talkToVisitorLeader,
  tradeWithVisitors,
  negotiateRefugees,
  spawnRivalSettlement,
  spawnVisitorGroup,
  isRivalAtPeace,
  type VisitorTradeAction,
  type RefugeeChoice,
} from '../src/game/groupEvents';
import type { DiplomacyEvent, DiplomacyEventKind, VisitorKind } from '../src/game/gameTypes';
import type { RaidEvent } from '../src/game/frontierCombat';
import {
  respondToRaidEvent,
  launchRaidOnRival,
  canLaunchRaidOnRival,
  getMilitiaStrength,
  getBarricadeStrength,
  resolveDefenseRatio,
  type RaidOutcomeTier,
} from '../src/game/frontierCombat';
import { computeMilitiaBreakdown } from '../src/game/militiaBalance';
import { countCompletedDefenseBuildings, getWallSegmentBonus } from '../src/game/defenseStructures';
import { startResearch, syncResearchUnlocks } from '../src/game/research';
import {
  FORGE_ORDERS,
  getForgeBlockReason,
  isForgeOrderComplete,
  queueForgeOrder,
  type ForgeOrderId,
} from '../src/game/forge';
import {
  TICKS_PER_DAY,
  DAYS_PER_YEAR,
  getResidenceCapacity,
  isResidenceBuildingType,
  isImprisoned,
} from '../src/game/dayCycle';
import { getGrazingPressureReport } from '../src/game/ecosystemPressure';
import { hasStoneSpears, hasIronSpears } from '../src/game/combat';
import { getSimFocus } from './simFocus';
import {
  advanceSimTick,
  disposeSimWorkerHost,
  initSimWorkerHost,
  simUsesWorker,
  simHeadless,
} from './simWorkerRuntime';
import { saveJuiceEffectsEnabled } from '../src/game/preferences';
import { formatCitizenName } from '../src/game/citizenId';
import { getNamePoolInfo, loadNames } from '../src/game/nameLoader';

const TICKS_PER_YEAR = TICKS_PER_DAY * DAYS_PER_YEAR;
const SIM_YEARS = Math.max(1, parseInt(process.env.SIM_YEARS ?? '10', 10) || 10);
/** Official balance test length: SIM_YEARS in-game years (winters + Y<n> gates). */
const FULL_BALANCE_TICKS = TICKS_PER_YEAR * SIM_YEARS;
const WINTER_ENTER_TICK = 270 * TICKS_PER_DAY;
const TOTAL_TICKS = process.env.SIM_MAX_TICKS
  ? Math.max(1, parseInt(process.env.SIM_MAX_TICKS, 10) || FULL_BALANCE_TICKS)
  : FULL_BALANCE_TICKS;
const IS_SMOKE_RUN = Boolean(process.env.SIM_MAX_TICKS) && TOTAL_TICKS < FULL_BALANCE_TICKS;
const IS_FULL_BALANCE_RUN = !IS_SMOKE_RUN && TOTAL_TICKS >= FULL_BALANCE_TICKS;

type SimProfile = 'village' | 'town' | 'eco';

const RAW_PROFILE = (process.env.SIM_PROFILE ?? 'town').toLowerCase();
const SIM_PROFILE: SimProfile = RAW_PROFILE === 'village' || RAW_PROFILE === 'eco' ? RAW_PROFILE : 'town';

type ProfileConfig = {
  label: string;
  popMin: number;
  popMax: number;
  ecoMin: number;
  ecoMax: number;
  grantMultiplier: number;
  autoRecruit: boolean;
  autoHouses: boolean;
  housesPerYear: number;
  maxRecruitsPerYear: number;
  preferEcoBuildings: boolean;
  skipRoadCoverage: boolean;
};

/** Reference span for pop gates — scaled when SIM_YEARS ≠ 10 (e.g. 20-year ship gate). */
const POP_GATE_YEARS_REF = 10;

const PROFILE_CONFIG: Record<SimProfile, ProfileConfig> = {
  village: {
    label: 'Village (minimum viable)',
    popMin: 95,
    popMax: 540,
    ecoMin: 30,
    ecoMax: 100,
    grantMultiplier: 0.65,
    autoRecruit: true,
    autoHouses: true,
    housesPerYear: 6,
    maxRecruitsPerYear: 5,
    preferEcoBuildings: false,
    skipRoadCoverage: false,
  },
  town: {
    label: 'Town (default balance pass)',
    popMin: 160,
    popMax: 530,
    ecoMin: 35,
    ecoMax: 60,
    grantMultiplier: 1,
    autoRecruit: true,
    autoHouses: true,
    housesPerYear: 8,
    maxRecruitsPerYear: 12,
    preferEcoBuildings: false,
    skipRoadCoverage: false,
  },
  eco: {
    label: 'Eco path',
    popMin: 100,
    popMax: 845,
    ecoMin: 65,
    ecoMax: 100,
    grantMultiplier: 0.7,
    autoRecruit: true,
    autoHouses: true,
    housesPerYear: 8,
    maxRecruitsPerYear: 4,
    preferEcoBuildings: true,
    skipRoadCoverage: true,
  },
};

function scaledPopGateMin(): number {
  return Math.round(profileCfg.popMin * Math.pow(SIM_YEARS / POP_GATE_YEARS_REF, 0.7));
}

function scaledPopGateMax(): number {
  return Math.round(profileCfg.popMax * Math.pow(SIM_YEARS / POP_GATE_YEARS_REF, 0.7));
}

const WINTER_START_DAY = 270;
const WINTER_DAYS = DAYS_PER_YEAR - WINTER_START_DAY;
const PRE_WINTER_BUFFER_DAYS = 20;
const PRE_WINTER_DAY = WINTER_START_DAY - PRE_WINTER_BUFFER_DAYS;
const FIRST_WINTER_TICK = WINTER_ENTER_TICK;
const DIPLOMACY_STALE_TICKS = 30 * TICKS_PER_DAY;
const RAID_STALE_TICKS = 6 * TICKS_PER_DAY;

const SIM_USE_WORKER = simUsesWorker();
const SIM_VERBOSE = process.env.SIM_VERBOSE === '1';
const SIM_LOG_EVENTS = process.env.SIM_LOG_EVENTS !== '0';
const SIM_LOG_LIFE = process.env.SIM_LOG_LIFE !== '0';
const SIM_STRICT_COVERAGE = process.env.SIM_STRICT_COVERAGE === '1';
const PROGRESS_EVERY = Number(process.env.PROGRESS_EVERY ?? TICKS_PER_DAY * 15);
const PERF_SAMPLE_EVERY = Number(process.env.PERF_SAMPLE_EVERY ?? TICKS_PER_YEAR);
/** Keep newest entries only — eventLog grows via unshift (index 0 = newest). */
const EVENT_LOG_MAX = Number(process.env.SIM_EVENT_LOG_MAX ?? 5000);

const here = dirname(fileURLToPath(import.meta.url));
const defaultLogDir = join(here, 'logs');
const profileCfg = PROFILE_CONFIG[SIM_PROFILE];

/** String building types only — safe if BuildingType ever becomes a numeric enum. */
const ALL_BUILDING_TYPES = Object.values(BuildingType).filter(
  (v): v is BuildingTypeName => typeof v === 'string',
);

// ─── Logging ───────────────────────────────────────────────────────────────

class SimLogger {
  private lines: string[] = [];
  private lifeLines: string[] = [];
  private startMs = performance.now();
  private readonly logPath: string;
  private readonly lifeLogPath: string;
  private announcedLogPath = false;
  private mainDirty = false;
  private lifeDirty = false;

  constructor(profile: SimProfile) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const engineTag = SIM_USE_WORKER ? '' : '-mainthread';
    this.logPath = process.env.SIM_LOG_FILE ?? join(defaultLogDir, `sim-${SIM_YEARS}year-${profile}${engineTag}-${stamp}.txt`);
    this.lifeLogPath = process.env.SIM_LIFE_LOG_FILE ?? this.logPath.replace(/\.txt$/i, '-life.txt');
  }

  getLogPath(): string {
    return this.logPath;
  }

  getLifeLogPath(): string {
    return this.lifeLogPath;
  }

  getLifeEventCount(): number {
    return this.lifeLines.length;
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.logPath), { recursive: true });
      writeFileSync(this.logPath, this.lines.join('\n'), 'utf8');
      if (!this.announcedLogPath) {
        this.announcedLogPath = true;
        console.log(`[simulate-10year] Live log: ${this.logPath}`);
        if (SIM_LOG_LIFE) {
          console.log(`[simulate-10year] Life events: ${this.lifeLogPath}`);
        }
      }
    } catch {
      /* console-only fallback */
    }
  }

  private persistLife(): void {
    if (!SIM_LOG_LIFE || this.lifeLines.length === 0) return;
    try {
      mkdirSync(dirname(this.lifeLogPath), { recursive: true });
      writeFileSync(this.lifeLogPath, `${this.lifeLines.join('\n')}\n`, 'utf8');
    } catch {
      /* ignore */
    }
  }

  /** Pregnancies, births, deaths, marriages — batched to disk once per tick via flushLifeBuffers(). */
  life(msg: string): void {
    if (!SIM_LOG_LIFE) return;
    const line = `  🧬 ${msg}`;
    this.lifeLines.push(msg);
    this.lines.push(line);
    console.log(line);
    this.mainDirty = true;
    this.lifeDirty = true;
  }

  /** Write buffered life lines — call once per tick after drainLifeEvents, not per event. */
  flushLifeBuffers(): void {
    if (!SIM_LOG_LIFE || !this.lifeDirty) return;
    if (this.mainDirty) {
      this.persist();
      this.mainDirty = false;
    }
    this.persistLife();
    this.lifeDirty = false;
  }

  section(title: string): void {
    this.lines.push('');
    this.lines.push(`--- ${title} ---`);
  }

  /** Buffered only — printed in final report. */
  log(msg: string): void {
    this.lines.push(msg);
    if (SIM_VERBOSE) console.log(msg);
  }

  /** Immediate console + buffer (milestones, injections, errors). */
  live(msg: string): void {
    this.lines.push(msg);
    console.log(msg);
    this.persist();
  }

  /** Progress heartbeat with % complete and ETA. */
  progress(tick: number, year: number, dayInYear: number, msg: string): void {
    const pct = ((tick / TOTAL_TICKS) * 100).toFixed(1);
    const elapsed = (performance.now() - this.startMs) / 1000;
    const rate = tick / Math.max(elapsed, 0.001);
    const eta = rate > 0 ? Math.round((TOTAL_TICKS - tick) / rate) : 0;
    const line = `[${pct}%] Y${year} day ${dayInYear} tick ${tick} | +${elapsed.toFixed(0)}s ETA ~${eta}s | ${msg}`;
    this.lines.push(line);
    console.log(line);
    this.persist();
  }

  progressYear(tick: number, year: number, msg: string): void {
    const pct = ((tick / TOTAL_TICKS) * 100).toFixed(1);
    const elapsed = (performance.now() - this.startMs) / 1000;
    const rate = tick / Math.max(elapsed, 0.001);
    const eta = rate > 0 ? Math.round((TOTAL_TICKS - tick) / rate) : 0;
    const line = `[${pct}%] Year ${year} tick ${tick} | +${elapsed.toFixed(0)}s ETA ~${eta}s | ${msg}`;
    this.lines.push(line);
    console.log(line);
    this.persist();
  }

  flush(_profile: SimProfile): string | null {
    this.flushLifeBuffers();
    const text = this.lines.join('\n');
    try {
      mkdirSync(dirname(this.logPath), { recursive: true });
      writeFileSync(this.logPath, text, 'utf8');
      console.log('\n=== Final report ===');
      console.log(text);
      console.log(`\n[simulate-10year] Log written to ${this.logPath}`);
      return this.logPath;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[simulate-10year] Failed to write log to ${this.logPath}: ${msg}`);
      console.log('\n=== Final report (console only) ===');
      console.log(text);
      return null;
    }
  }
}

// ─── Option coverage ───────────────────────────────────────────────────────

type CoverageMap = Record<string, Set<string>>;

function cov(map: CoverageMap, category: string, id: string): void {
  if (!map[category]) map[category] = new Set();
  map[category].add(id);
}

function covReport(map: CoverageMap, expected: Record<string, string[]>): string[] {
  const out: string[] = [];
  for (const [cat, ids] of Object.entries(expected)) {
    const tested = map[cat] ?? new Set();
    const missing = ids.filter((id) => !tested.has(id));
    out.push(
      `${cat}: ${tested.size}/${ids.length} tested`
      + (missing.length ? ` — missing: ${missing.join(', ')}` : ' ✓'),
    );
  }
  return out;
}

const EXPECTED_OPTIONS: Record<string, string[]> = {
  buildings: [...ALL_BUILDING_TYPES],
  diplomacy_tribute: ['pay', 'negotiate', 'refuse'],
  diplomacy_border_dispute: ['concede', 'stand_firm', 'militia'],
  diplomacy_alliance: ['accept', 'decline', 'counter'],
  diplomacy_peace_treaty: ['sign', 'decline', 'tribute'],
  raid_response: ['defend', 'barricade', 'payoff'],
  rival_action: ['gift', 'trade_pact', 'show_strength', 'peace_treaty', 'counter_raid'],
  visitor_trade: ['buy_food', 'buy_wood', 'sell_food'],
  refugee: ['welcome', 'screen', 'turn_away'],
  visitor_talk: ['traders', 'pilgrims', 'scholars', 'hunters', 'nomads', 'performers', 'refugees'],
  forge: ['iron_spears', 'iron_shields', 'guard_halberds', 'wall_plates', 'iron_pickaxes'],
  research: createInitialResearchNodes().map((n) => n.id),
};

/** All visitor kinds required for visitor_talk coverage (order = spawn priority). */
const VISITOR_TALK_KINDS: VisitorKind[] = [
  'traders', 'pilgrims', 'scholars', 'hunters', 'nomads', 'performers', 'refugees',
];

const DIPLOMACY_CHOICE_IDS: Record<DiplomacyEventKind, string[]> = {
  tribute: ['pay', 'negotiate', 'refuse'],
  border_dispute: ['concede', 'stand_firm', 'militia'],
  alliance: ['accept', 'decline', 'counter'],
  peace_treaty: ['sign', 'decline', 'tribute'],
};

const DIPLOMACY_META: Record<DiplomacyEventKind, { emoji: string; title: (n: string) => string; description: (n: string) => string }> = {
  tribute: {
    emoji: '🪙',
    title: (n) => `${n} demands tribute`,
    description: (n) => `Envoys from ${n} expect food for safe passage.`,
  },
  border_dispute: {
    emoji: '⚔️',
    title: (n) => `Border dispute with ${n}`,
    description: (n) => `${n} claims your hunters crossed their territory.`,
  },
  alliance: {
    emoji: '🤝',
    title: (n) => `${n} proposes an alliance`,
    description: (n) => `${n}'s leader offers a formal pact.`,
  },
  peace_treaty: {
    emoji: '🕊️',
    title: (n) => `${n} offers a peace treaty`,
    description: (n) => `Envoys from ${n} ask for a formal truce.`,
  },
};

const RAID_RESPONSES = ['defend', 'barricade', 'payoff'] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

function summarizeTickMs(samples: number[]) {
  if (samples.length === 0) return { avg: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    avg: sum / sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1],
  };
}

function tryPlace(
  state: WorldState,
  type: BuildingTypeName,
  cx: number,
  cy: number,
): { state: WorldState; ok: boolean; detail?: string } {
  if (!canUnlockBuilding(state, type)) {
    return { state, ok: false, detail: `locked (${BUILDING_CONFIGS[type].unlockRequirement ?? 'unknown'})` };
  }
  if (type === BuildingType.Wall) {
    const chain = tryPlaceWallChain(state, cx, cy);
    return chain.ok ? chain : tryPlaceBuilding(state, type, cx, cy);
  }
  return tryPlaceBuilding(state, type, cx, cy);
}

function getCompletedBuildingTypes(state: WorldState): Set<BuildingTypeName> {
  return new Set(
    state.buildings
      .filter((b) => b.completed && b.faction !== 'rival')
      .map((b) => b.type),
  );
}

type BuildingCount = { completed: number; inProgress: number };

function countBuildingsByType(state: WorldState): Map<BuildingTypeName, BuildingCount> {
  const counts = new Map<BuildingTypeName, BuildingCount>();
  for (const b of state.buildings) {
    if (b.faction === 'rival') continue;
    const cur = counts.get(b.type) ?? { completed: 0, inProgress: 0 };
    if (b.completed) cur.completed++;
    else cur.inProgress++;
    counts.set(b.type, cur);
  }
  return counts;
}

function formatBuildingTypesLine(state: WorldState): string {
  const counts = countBuildingsByType(state);
  const parts = [...counts.entries()]
    .filter(([, c]) => c.completed > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([type, c]) => `${type}×${c.completed}`);
  return parts.length > 0 ? parts.join(', ') : '(none)';
}

function expectedBuildingTypeCount(): number {
  return ALL_BUILDING_TYPES.filter(
    (type) => !(profileCfg.skipRoadCoverage && type === BuildingType.Road),
  ).length;
}

/** Compact building line for live progress heartbeats. */
function formatBuildingLiveSummary(state: WorldState, coverage: CoverageMap): string {
  syncBuildingCoverage(state, coverage);
  const typesDone = getCompletedBuildingTypes(state).size;
  const typesExpected = expectedBuildingTypeCount();
  const completed = state.buildings.filter((b) => b.completed && b.faction !== 'rival').length;
  const inProgress = state.buildings.filter((b) => !b.completed && b.faction !== 'rival').length;
  const prog = inProgress > 0 ? ` (+${inProgress} in progress)` : '';
  return `buildings=${completed}${prog} types=${typesDone}/${typesExpected} [${formatBuildingTypesLine(state)}]`;
}

function calendarAtTick(tick: number): { year: number; day: number } {
  const days = Math.floor(tick / TICKS_PER_DAY);
  return { year: Math.floor(days / DAYS_PER_YEAR), day: days % DAYS_PER_YEAR };
}

/** Stream successful placements to console (auto_build / buildings / coverage_sweep). */
function drainBuildActions(
  logger: SimLogger,
  actionLog: ActionLog[],
  fromIndex: number,
): void {
  for (let i = fromIndex; i < actionLog.length; i++) {
    const entry = actionLog[i];
    if (!entry.ok) continue;
    if (entry.category !== 'auto_build' && entry.category !== 'buildings' && entry.category !== 'coverage_sweep') {
      continue;
    }
    const type = entry.action.replace('place:', '');
    const cal = calendarAtTick(entry.tick);
    logger.live(
      `  🏗️ Y${cal.year} D${cal.day} tick ${entry.tick} | placed ${type} (${entry.category})`
      + (entry.detail ? ` — ${entry.detail}` : ''),
    );
  }
}

function formatBuildingInventoryReport(state: WorldState, coverage: CoverageMap): string[] {
  const counts = countBuildingsByType(state);
  const lines: string[] = [];

  const completed = [...counts.entries()]
    .filter(([, c]) => c.completed > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  lines.push(`Completed types: ${completed.length}/${ALL_BUILDING_TYPES.length}`);
  for (const [type, c] of completed) {
    const prog = c.inProgress > 0 ? ` (+${c.inProgress} in progress)` : '';
    lines.push(`  ${type}: ${c.completed} completed${prog}`);
  }

  const inProgressOnly = [...counts.entries()]
    .filter(([, c]) => c.inProgress > 0 && c.completed === 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (inProgressOnly.length > 0) {
    lines.push('In progress (not yet completed):');
    for (const [type, c] of inProgressOnly) {
      lines.push(`  ${type}: ${c.inProgress}`);
    }
  }

  syncBuildingCoverage(state, coverage);
  const tested = coverage.buildings ?? new Set<BuildingTypeName>();
  const missing = ALL_BUILDING_TYPES.filter((type) => {
    if (profileCfg.skipRoadCoverage && type === BuildingType.Road) return false;
    return !tested.has(type);
  });
  if (missing.length > 0) {
    lines.push(`Never completed (${missing.length}):`);
    for (const type of missing) {
      const unlock = canUnlockBuilding(state, type)
        ? 'unlocked'
        : `locked (${BUILDING_CONFIGS[type].unlockRequirement ?? 'prereq'})`;
      const afford = canAffordBuilding(state, type) ? 'affordable now' : 'cannot afford now';
      lines.push(`  ${type} — ${unlock}, ${afford}`);
    }
  } else {
    lines.push('All building types completed at least once ✓');
  }

  return lines;
}

function formatBuildChronicle(actionLog: ActionLog[]): string[] {
  const builds = actionLog.filter(
    (a) => (a.category === 'auto_build' || a.category === 'buildings' || a.category === 'coverage_sweep') && a.ok,
  );
  if (builds.length === 0) return ['(no automated placements logged)'];

  const byType = new Map<string, number[]>();
  for (const entry of builds) {
    const type = entry.action.replace('place:', '');
    const ticks = byType.get(type) ?? [];
    ticks.push(entry.tick);
    byType.set(type, ticks);
  }

  const lines = [`Total placements: ${builds.length}`];
  for (const [type, ticks] of [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`  ${type}: ${ticks.length}× (ticks ${Math.min(...ticks)}–${Math.max(...ticks)})`);
  }
  return lines;
}

function syncBuildingCoverage(state: WorldState, coverage: CoverageMap): void {
  for (const type of getCompletedBuildingTypes(state)) {
    cov(coverage, 'buildings', type);
  }
}

function syncResearchCoverage(state: WorldState, coverage: CoverageMap): void {
  for (const node of state.researchNodes) {
    if (node.researched) cov(coverage, 'research', node.id);
  }
}

function syncForgeCoverage(state: WorldState, coverage: CoverageMap): void {
  for (const orderId of EXPECTED_OPTIONS.forge) {
    if (
      isForgeOrderComplete(state.villageForge, orderId as ForgeOrderId)
      || state.villageForge.activeOrder === orderId
    ) {
      cov(coverage, 'forge', orderId);
    }
  }
}

function canUnlockBuilding(state: WorldState, type: BuildingTypeName): boolean {
  const req = BUILDING_CONFIGS[type].unlockRequirement;
  if (!req) return true;
  return state.unlockedTechs.includes(req);
}

function resourceSnapshot(state: WorldState): string {
  const r = state.resources;
  return `food=${Math.floor(r.food)} wood=${Math.floor(r.wood)} stone=${Math.floor(r.stone)} gold=${Math.floor(r.gold)}`;
}

function militiaSnapshot(state: WorldState): string {
  const humans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
  const b = computeMilitiaBreakdown(state, humans);
  return `militia=${b.militiaStrength} barricade=${b.barricadeStrength} (${b.spearTier}/${b.shieldTier}) guards=${b.guardCount}`;
}

function getTotalBeds(state: WorldState): number {
  return state.buildings
    .filter((b) => b.completed && b.faction !== 'rival' && isResidenceBuildingType(b.type))
    .reduce((sum, b) => sum + getResidenceCapacity(b), 0);
}

type BedsCacheKey = { buildingsLen: number; completedResidences: number };
let bedsCache: { key: BedsCacheKey; beds: number } | null = null;

function bedsCacheKey(state: WorldState): BedsCacheKey {
  let completedResidences = 0;
  for (const b of state.buildings) {
    if (b.completed && b.faction !== 'rival' && isResidenceBuildingType(b.type)) {
      completedResidences++;
    }
  }
  return { buildingsLen: state.buildings.length, completedResidences };
}

function getTotalBedsCached(state: WorldState): number {
  const key = bedsCacheKey(state);
  if (
    bedsCache
    && bedsCache.key.buildingsLen === key.buildingsLen
    && bedsCache.key.completedResidences === key.completedResidences
  ) {
    return bedsCache.beds;
  }
  const beds = getTotalBeds(state);
  bedsCache = { key, beds };
  return beds;
}



function getWoodNeedPerDay(pop: number): number {
  return pop > 0 ? Math.ceil(pop / 5) : 0;
}

function getWinterWoodNeed(pop: number): number {
  return getWoodNeedPerDay(pop) * WINTER_DAYS;
}

/**
 * Modest pre-winter bump only — never fills to full winter need (that made the gate meaningless).
 * Caps per-year injection so town/eco still face real heating pressure.
 */
function topUpPreWinterStockpile(state: WorldState, profile: SimProfile): WorldState {
  if (profile === 'village') return state;
  const pop = state.humanPopulation;
  const woodNeed = getWinterWoodNeed(pop);
  const woodFloor = Math.min(state.storageMax.wood, Math.floor(woodNeed * 0.5));
  const foodFloor = Math.min(state.storageMax.food, Math.max(350, pop * 8));
  const maxWoodBump = scaleGrant(profile === 'town' ? 450 : 320);
  const maxFoodBump = scaleGrant(profile === 'town' ? 220 : 160);
  const woodAdd = Math.min(maxWoodBump, Math.max(0, woodFloor - state.resources.wood));
  const foodAdd = Math.min(maxFoodBump, Math.max(0, foodFloor - state.resources.food));
  if (woodAdd === 0 && foodAdd === 0) return state;
  return {
    ...state,
    resources: {
      ...state.resources,
      wood: Math.min(state.storageMax.wood, state.resources.wood + woodAdd),
      food: Math.min(state.storageMax.food, state.resources.food + foodAdd),
    },
  };
}

/** Shallow clone for spawn helpers — avoids full structuredClone; shares eventLog (spawn rarely logs). */
function shallowCloneWorld(state: WorldState): WorldState {
  return {
    ...state,
    entities: [...state.entities],
    buildings: [...state.buildings],
    rivalSettlements: [...state.rivalSettlements],
    visitorGroups: [...state.visitorGroups],
    pendingDiplomacyEvents: [...(state.pendingDiplomacyEvents ?? [])],
    pendingRaidEvents: [...(state.pendingRaidEvents ?? [])],
    entityByType: undefined,
    grassGrid: undefined,
    mobileGrid: undefined,
    scentGrid: undefined,
  };
}

function pruneEventLog(state: WorldState): void {
  if (state.eventLog.length <= EVENT_LOG_MAX) return;
  state.eventLog.length = EVENT_LOG_MAX;
}

/** eventLog uses unshift — new entries are always at indices [0 .. added-1]. */
function newEventLogCount(beforeLen: number, state: WorldState): number {
  return Math.max(0, state.eventLog.length - beforeLen);
}

function forEachNewEventLogEntry(
  beforeLen: number,
  state: WorldState,
  fn: (entry: WorldState['eventLog'][number]) => void,
): void {
  const added = newEventLogCount(beforeLen, state);
  for (let i = 0; i < added; i++) {
    const entry = state.eventLog[i];
    if (entry) fn(entry);
  }
}

function countNewEventLogType(beforeLen: number, state: WorldState, type: string): number {
  let n = 0;
  forEachNewEventLogEntry(beforeLen, state, (e) => {
    if (e.type === type) n++;
  });
  return n;
}

/** Player deaths only — uses new chronicle slice (O(new) not O(entities)). */
function countNewPlayerDeaths(beforeLen: number, state: WorldState): number {
  let n = 0;
  forEachNewEventLogEntry(beforeLen, state, (e) => {
    if (e.type !== 'death' || !e.entityName) return;
    if (e.message.includes('Wildkin')) return;
    n++;
  });
  return n;
}

function hasNewEventLogType(beforeLen: number, state: WorldState, type: string, tick?: number): boolean {
  let found = false;
  forEachNewEventLogEntry(beforeLen, state, (e) => {
    if (e.type === type && (tick === undefined || e.tick === tick)) found = true;
  });
  return found;
}

type PregnancySnap = Map<number, { pregnantById?: number; partnerId?: number }>;

function snapshotPregnancies(state: WorldState): PregnancySnap {
  const snap: PregnancySnap = new Map();
  for (const e of state.entities) {
    if (e.alive && isPlayerHuman(e) && e.gender === 'female' && e.pregnant) {
      snap.set(e.id, { pregnantById: e.pregnantById, partnerId: e.partnerId });
    }
  }
  return snap;
}

function formatLifeTick(state: WorldState): string {
  return `Y${state.year} D${state.dayInYear} tick ${state.tick}`;
}

function resolveFatherName(state: WorldState, mother: WorldState['entities'][number]): string {
  const fatherId = mother.pregnantById ?? mother.partnerId;
  if (fatherId == null) return 'unknown';
  const father = state.entities.find((e) => e.id === fatherId);
  return father ? formatCitizenName(father) : `#${fatherId}`;
}

const LIVE_LIFE_EVENT_TYPES = new Set(['birth', 'death', 'marriage', 'scandal']);

function liveLifeEventKind(entry: WorldState['eventLog'][number]): string | null {
  if (LIVE_LIFE_EVENT_TYPES.has(entry.type)) return entry.type;
  if (entry.type !== 'event') return null;
  if (entry.message.includes('imprisoned for scandal')) return 'imprison';
  if (entry.message.includes('released from prison')) return 'release';
  return null;
}

/** Stream pregnancies (entity state) and chronicle life events after each gameTick. */
function drainLifeEvents(
  logger: SimLogger,
  pregnanciesBefore: PregnancySnap,
  eventLogLenBefore: number,
  state: WorldState,
): void {
  if (!SIM_LOG_LIFE) return;

  for (const e of state.entities) {
    if (!e.alive || !isPlayerHuman(e) || e.gender !== 'female' || !e.pregnant) continue;
    if (pregnanciesBefore.has(e.id)) continue;
    const mother = formatCitizenName(e);
    const father = resolveFatherName(state, e);
    const kind = e.pregnantById != null ? 'pregnancy (affair)' : 'pregnancy';
    logger.life(`${formatLifeTick(state)} | ${kind} | ${mother} expecting (father: ${father})`);
  }

  forEachNewEventLogEntry(eventLogLenBefore, state, (entry) => {
    const kind = liveLifeEventKind(entry);
    if (!kind) return;
    const who = entry.entityName ? ` (${entry.entityName})` : '';
    logger.life(`${formatLifeTick(state)} | ${kind} | ${entry.message}${who}`);
  });
}

function countCompletedBuildings(state: WorldState, type: BuildingTypeName): number {
  return state.buildings.filter((b) => b.completed && b.faction !== 'rival' && b.type === type).length;
}

function hasCompletedBuilding(state: WorldState, type: BuildingTypeName): boolean {
  return countCompletedBuildings(state, type) > 0;
}

function canAffordBuilding(state: WorldState, type: BuildingTypeName): boolean {
  if (!canUnlockBuilding(state, type)) return false;
  const cost = BUILDING_CONFIGS[type].cost;
  const foodCost = (cost as { food?: number }).food ?? 0;
  return state.resources.wood >= cost.wood
    && state.resources.stone >= cost.stone
    && state.resources.gold >= cost.gold
    && state.resources.food >= foodCost;
}

/** Top up resources so coverage sweeps can afford a placement (sim-only). */
function fundForBuildingCost(state: WorldState, type: BuildingTypeName): WorldState {
  const cost = BUILDING_CONFIGS[type].cost;
  const foodCost = (cost as { food?: number }).food ?? 0;
  const woodNeed = Math.max(0, cost.wood - state.resources.wood);
  const stoneNeed = Math.max(0, cost.stone - state.resources.stone);
  const goldNeed = Math.max(0, cost.gold - state.resources.gold);
  const foodNeed = Math.max(0, foodCost - state.resources.food);
  if (woodNeed === 0 && stoneNeed === 0 && goldNeed === 0 && foodNeed === 0) return state;
  return {
    ...state,
    resources: {
      ...state.resources,
      wood: Math.min(state.storageMax.wood, state.resources.wood + woodNeed + scaleGrant(80)),
      stone: Math.min(state.storageMax.stone, state.resources.stone + stoneNeed + scaleGrant(40)),
      gold: Math.min(state.storageMax.gold, state.resources.gold + goldNeed + scaleGrant(30)),
      food: Math.min(state.storageMax.food, state.resources.food + foodNeed + scaleGrant(20)),
    },
  };
}

/** Headless sim — mark in-progress player builds complete so coverage logs match placements. */
function simInstantCompleteInProgress(state: WorldState): WorldState {
  let changed = false;
  const buildings = state.buildings.map((b) => {
    if (b.faction === 'rival' || b.completed) return b;
    changed = true;
    return {
      ...b,
      completed: true,
      constructionProgress: 100,
      occupants: [],
      spriteScale: 1,
    };
  });
  if (!changed) return state;
  let totalCompleted = 0;
  for (const b of buildings) {
    if (b.completed && b.faction !== 'rival') totalCompleted++;
  }
  return { ...state, buildings, totalBuildingsCompleted: totalCompleted };
}

function isPreWinterRecruitPause(state: WorldState): boolean {
  return state.dayInYear >= PRE_WINTER_DAY - 30 && state.dayInYear < WINTER_START_DAY;
}

function scaleGrant(n: number): number {
  return Math.round(n * profileCfg.grantMultiplier);
}



function storageCapsForProfile(profile: SimProfile): Pick<WorldState['storageMax'], 'food' | 'wood' | 'stone'> {
  if (profile === 'town') return { food: 2500, wood: 4000, stone: 2000 };
  if (profile === 'eco') return { food: 2200, wood: 3500, stone: 2000 };
  return { food: 1500, wood: 2500, stone: 1500 };
}

// ─── Winter tracking (per-winter pass/fail for 10-year test) ─────────────────

type WinterSnapshot = {
  day: number;
  tick: number;
  pop: number;
  maxPop: number;
  beds: number;
  food: number;
  wood: number;
  eco: number;
  woodNeedDay: number;
  woodNeedWinter: number;
  woodBufferDays: number;
  foodPerCapita: number;
};

type WinterRecord = {
  year: number;
  preWinter?: WinterSnapshot;
  entry: WinterSnapshot;
  exit?: WinterSnapshot;
  minFood: number;
  minWood: number;
  minPop: number;
  playerDeathsInWinter: number;
  netPopLoss: number;
  heatingFailDays: number;
  passed: boolean;
  failReasons: string[];
  /** Sim ended before spring — excluded from winter balance gates. */
  incomplete?: boolean;
};

class WinterTracker {
  private records: WinterRecord[] = [];
  private current: WinterRecord | null = null;
  private preWinterByYear = new Map<number, WinterSnapshot>();
  private preWinterYears = new Set<number>();
  private winterStartPlayerDeaths = 0;

  private makeSnapshot(state: WorldState): WinterSnapshot {
    const pop = state.humanPopulation;
    const woodNeedDay = getWoodNeedPerDay(pop);
    return {
      day: state.dayInYear,
      tick: state.tick,
      pop,
      maxPop: state.maxHumanPopulation,
      beds: getTotalBedsCached(state),
      food: Math.floor(state.resources.food),
      wood: Math.floor(state.resources.wood),
      eco: state.ecosystemHealth,
      woodNeedDay,
      woodNeedWinter: getWinterWoodNeed(pop),
      woodBufferDays: woodNeedDay > 0 ? Math.floor(state.resources.wood / woodNeedDay) : 999,
      foodPerCapita: pop > 0 ? state.resources.food / pop : 0,
    };
  }

  capturePreWinter(state: WorldState): void {
    if (this.preWinterYears.has(state.year)) return;
    this.preWinterYears.add(state.year);
    this.preWinterByYear.set(state.year, this.makeSnapshot(state));
    if (this.current?.year === state.year) {
      this.current.preWinter = this.preWinterByYear.get(state.year);
    }
  }

  onWinterEnter(state: WorldState, playerDeathsCumulative: number): WinterSnapshot {
    const pop = state.humanPopulation;
    const woodNeedDay = getWoodNeedPerDay(pop);
    this.winterStartPlayerDeaths = playerDeathsCumulative;
    this.current = {
      year: state.year,
      preWinter: this.preWinterByYear.get(state.year),
      entry: {
        day: state.dayInYear,
        tick: state.tick,
        pop,
        maxPop: state.maxHumanPopulation,
        beds: getTotalBedsCached(state),
        food: Math.floor(state.resources.food),
        wood: Math.floor(state.resources.wood),
        eco: state.ecosystemHealth,
        woodNeedDay,
        woodNeedWinter: getWinterWoodNeed(pop),
        woodBufferDays: woodNeedDay > 0 ? Math.floor(state.resources.wood / woodNeedDay) : 999,
        foodPerCapita: pop > 0 ? state.resources.food / pop : 0,
      },
      minFood: Math.floor(state.resources.food),
      minWood: Math.floor(state.resources.wood),
      minPop: pop,
      playerDeathsInWinter: 0,
      netPopLoss: 0,
      heatingFailDays: 0,
      passed: true,
      failReasons: [],
    };
    return this.current.entry;
  }

  /** Update running minima every winter tick. */
  onWinterIntraDay(state: WorldState): void {
    if (!this.current) return;
    const food = Math.floor(state.resources.food);
    const wood = Math.floor(state.resources.wood);
    const pop = state.humanPopulation;
    this.current.minFood = Math.min(this.current.minFood, food);
    this.current.minWood = Math.min(this.current.minWood, wood);
    this.current.minPop = Math.min(this.current.minPop, pop);
  }

  /** Track player-human deaths every winter tick (entity IDs — not heating-heuristic). */
  recordWinterDeaths(n: number): void {
    if (!this.current || n <= 0) return;
    this.current.playerDeathsInWinter += n;
  }

  /**
   * Called once per calendar day at tick end (after gameTick heating).
   * heatingFailed mirrors gameEngine: wood < ceil(pop/5) at daily consumption time.
   */
  onWinterCalendarDayEnd(
    state: WorldState,
    woodAtDayStart: number,
    popAtDayStart: number,
  ): void {
    if (!this.current) return;
    this.onWinterIntraDay(state);
    const woodNeed = getWoodNeedPerDay(popAtDayStart);
    const heatingFailed = popAtDayStart > 0 && woodAtDayStart < woodNeed;
    if (heatingFailed) this.current.heatingFailDays++;
  }

  onWinterExit(
    state: WorldState,
    playerDeathsCumulative: number,
    opts?: { incomplete?: boolean },
  ): WinterRecord | null {
    if (!this.current) return null;
    const pop = state.humanPopulation;
    const woodNeedDay = getWoodNeedPerDay(pop);
    this.current.netPopLoss = Math.max(0, this.current.entry.pop - pop);
    const entityDeaths = playerDeathsCumulative - this.winterStartPlayerDeaths;
    // Prefer entity-tracked tally (covers raids/combat on any winter day).
    this.current.playerDeathsInWinter = Math.max(this.current.playerDeathsInWinter, entityDeaths);
    this.current.exit = {
      day: state.dayInYear,
      tick: state.tick,
      pop,
      maxPop: state.maxHumanPopulation,
      beds: getTotalBedsCached(state),
      food: Math.floor(state.resources.food),
      wood: Math.floor(state.resources.wood),
      eco: state.ecosystemHealth,
      woodNeedDay,
      woodNeedWinter: getWinterWoodNeed(pop),
      woodBufferDays: woodNeedDay > 0 ? Math.floor(state.resources.wood / woodNeedDay) : 999,
      foodPerCapita: pop > 0 ? state.resources.food / pop : 0,
    };
    if (opts?.incomplete) {
      this.current.incomplete = true;
      this.current.passed = true;
      this.current.failReasons = [];
    } else {
      this.judgeWinter(this.current);
    }
    const closed = this.current;
    this.records.push(closed);
    this.current = null;
    return closed;
  }

  private judgeWinter(w: WinterRecord): void {
    const reasons: string[] = [];
    if (w.minFood <= 0) reasons.push(`starvation (min food=${w.minFood})`);
    const popDrop = w.entry.pop - w.minPop;
    const resourceStress = w.minFood < Math.min(400, w.entry.pop * 8) || w.heatingFailDays > 7;
    if (resourceStress && w.entry.pop > 0 && popDrop > Math.max(3, Math.ceil(w.entry.pop * 0.12))) {
      reasons.push(`pop trough ${w.minPop} during resource stress (entered ${w.entry.pop}, lost ${popDrop})`);
    }
    if (resourceStress && w.entry.pop > 0 && w.netPopLoss > Math.max(3, Math.ceil(w.entry.pop * 0.12))) {
      reasons.push(`net pop loss ${w.netPopLoss} with winter stress (entered ${w.entry.pop}, spring ${w.exit?.pop ?? '?'})`);
    }
    if (w.heatingFailDays > 14) {
      reasons.push(`heating stress (${w.heatingFailDays}/90 days short on wood)`);
    }
    if (w.minWood <= 0 && w.entry.pop >= 15) {
      reasons.push('wood stockpile depleted during winter');
    }
    const pre = w.preWinter ?? w.entry;
    if (pre.wood < pre.woodNeedWinter * 0.35 && pre.pop >= 20) {
      reasons.push(`low pre-winter wood buffer (${pre.wood} < 35% of need ${pre.woodNeedWinter})`);
    }
    if (pre.foodPerCapita < 8 && pre.pop >= 20) {
      reasons.push(`thin food buffer (${pre.foodPerCapita.toFixed(1)} food/cap at day ${pre.day})`);
    }
    w.failReasons = reasons;
    w.passed = reasons.length === 0;
  }

  /** Close an in-progress winter at run end — marked incomplete, not balance-judged. */
  forceCloseOpenWinter(state: WorldState, playerDeathsCumulative: number): WinterRecord | null {
    if (!this.current) return null;
    return this.onWinterExit(state, playerDeathsCumulative, { incomplete: true });
  }

  /** Closed winters only — never judge an in-progress winter. */
  getRecords(): WinterRecord[] {
    return this.records;
  }

  formatReport(): string[] {
    const lines: string[] = [];
    for (const w of this.records) {
      const e = w.entry;
      const pre = w.preWinter;
      const verdict = w.incomplete ? 'INCOMPLETE' : w.passed ? 'PASS' : 'FAIL';
      lines.push(
        `Winter Y${w.year} | ${verdict}`
        + (w.failReasons.length ? ` — ${w.failReasons.join('; ')}` : '')
        + (w.incomplete ? ' (sim ended mid-winter — not gated)' : ''),
      );
      if (pre && pre.day !== e.day) {
        lines.push(
          `  pre-winter day ${pre.day}: pop=${pre.pop}/${pre.maxPop} beds=${pre.beds}`
          + ` food=${pre.food} (${pre.foodPerCapita.toFixed(1)}/cap) wood=${pre.wood}`
          + ` buffer=${pre.woodBufferDays}d need=${pre.woodNeedWinter} eco=${pre.eco}%`,
        );
      }
      lines.push(
        `  entry day ${e.day}: pop=${e.pop}/${e.maxPop} beds=${e.beds}`
        + ` food=${e.food} wood=${e.wood} need=${e.woodNeedDay}/day (${e.woodNeedWinter} winter)`
        + ` buffer=${e.woodBufferDays}d eco=${e.eco}%`,
      );
      lines.push(
        `  during: minFood=${w.minFood} minWood=${w.minWood} minPop=${w.minPop}`
        + ` playerDeaths=${w.playerDeathsInWinter} netPopLoss=${w.netPopLoss}`
        + ` heatingFailDays=${w.heatingFailDays}/90`,
      );
      if (w.exit) {
        const x = w.exit;
        lines.push(
          `  exit day ${x.day}: pop=${x.pop} food=${x.food} wood=${x.wood} eco=${x.eco}%`,
        );
      }
    }
    const complete = this.records.filter((r) => !r.incomplete);
    const passed = complete.filter((r) => r.passed).length;
    const total = complete.length;
    const incomplete = this.records.length - total;
    lines.push(
      `Winter summary: ${passed}/${total} winters passed`
      + (incomplete > 0 ? ` (${incomplete} incomplete, excluded from gates)` : ''),
    );
    return lines;
  }
}

/** Cumulative frontier activity (incoming vs player-initiated), not pending queue depth. */
class FrontierTracker {
  private seenRaidIds = new Set<string>();
  private seenDiplomacyIds = new Set<string>();

  incomingRaids = 0;
  incomingDiplomacy = 0;
  outgoingRaids = 0;
  outgoingDiplomacy = 0;

  scanIncoming(state: WorldState): void {
    for (const evt of state.pendingRaidEvents ?? []) {
      if (this.seenRaidIds.has(evt.id)) continue;
      this.seenRaidIds.add(evt.id);
      this.incomingRaids++;
    }
    for (const evt of state.pendingDiplomacyEvents ?? []) {
      if (this.seenDiplomacyIds.has(evt.id)) continue;
      this.seenDiplomacyIds.add(evt.id);
      this.incomingDiplomacy++;
    }
  }

  recordOutgoingRaid(): void {
    this.outgoingRaids++;
  }

  recordOutgoingDiplomacy(): void {
    this.outgoingDiplomacy++;
  }

  formatProgress(): string {
    return `raids_on=${this.incomingRaids} raids_out=${this.outgoingRaids}`
      + ` dip_on=${this.incomingDiplomacy} dip_out=${this.outgoingDiplomacy}`;
  }
}

type YearSnapshot = {
  year: number;
  tick: number;
  pop: number;
  resources: string;
  eco: number;
  ecoYears80: number;
  rep: number;
  militia: string;
  grazing: string;
  buildings: number;
  buildingTypes: string;
  raidsOnVillage: number;
  raidsInitiated: number;
  diplomacyOnVillage: number;
  diplomacyInitiated: number;
  visitors: number;
  rivals: number;
  playerDeaths: number;
};

function captureYearSnapshot(state: WorldState, playerDeaths: number, frontier: FrontierTracker): YearSnapshot {
  const grazing = getGrazingPressureReport(state);
  return {
    year: state.year,
    tick: state.tick,
    pop: state.humanPopulation,
    resources: resourceSnapshot(state),
    eco: state.ecosystemHealth,
    ecoYears80: state.ecoHealthYearsAbove80,
    rep: state.villageReputation,
    militia: militiaSnapshot(state),
    grazing: `${grazing.level} (${(grazing.pressureRatio * 100).toFixed(0)}% pressure)`,
    buildings: state.buildings.filter((b) => b.completed && b.faction !== 'rival').length,
    buildingTypes: formatBuildingTypesLine(state),
    raidsOnVillage: frontier.incomingRaids,
    raidsInitiated: frontier.outgoingRaids,
    diplomacyOnVillage: frontier.incomingDiplomacy,
    diplomacyInitiated: frontier.outgoingDiplomacy,
    visitors: state.visitorGroups.length,
    rivals: state.rivalSettlements.length,
    playerDeaths,
  };
}

// ─── Scheduled growth scenario (10 years, profile-aware) ─────────────────────

type ScheduledResult = { state: WorldState; ok: boolean; detail?: string };
type ScheduledAction = { at: number; fn: (s: WorldState) => ScheduledResult; label: string };

/** Yearly grants only — no scripted building placements. */
function buildScheduledSupports(profile: SimProfile): ScheduledAction[] {
  const actions: ScheduledAction[] = [];

  const fund = (at: number, patch: Partial<WorldState['resources']>, label: string) => {
    actions.push({
      at,
      label,
      fn: (s) => ({
        state: {
        ...s,
        resources: {
          ...s.resources,
          food: Math.min(s.storageMax.food, s.resources.food + scaleGrant(patch.food ?? 0)),
          wood: Math.min(s.storageMax.wood, s.resources.wood + scaleGrant(patch.wood ?? 0)),
          stone: Math.min(s.storageMax.stone, s.resources.stone + scaleGrant(patch.stone ?? 0)),
          gold: Math.min(s.storageMax.gold, s.resources.gold + scaleGrant(patch.gold ?? 0)),
        },
        maxHumanPopulation: Math.max(s.maxHumanPopulation, profile === 'town' ? 120 : profile === 'eco' ? 80 : 50),
        storageMax: (() => {
          const caps = storageCapsForProfile(profile);
          return {
            ...s.storageMax,
            food: Math.max(s.storageMax.food, caps.food),
            wood: Math.max(s.storageMax.wood, caps.wood),
            stone: Math.max(s.storageMax.stone, caps.stone),
          };
        })(),
        },
        ok: true,
      }),
    });
  };

  fund(500, { food: 350, wood: 500, stone: 250, gold: 180 }, 'Year-1 resource grant');
  fund(TICKS_PER_YEAR + 600, { wood: 450, stone: 350, gold: 280, food: 180 }, 'Year-2 resource grant');
  fund(TICKS_PER_YEAR * 2 + 700, { food: 450, wood: 700, stone: 450, gold: 350 }, 'Year-3 resource grant');
  fund(TICKS_PER_YEAR * 4 + 300, { food: 550, wood: 900, stone: 550, gold: 450 }, 'Year-5 resource grant');

  // Pre-winter stockpile handled by bounded topUpPreWinterStockpile at day 250 (no double-dip grants).

  for (let y = 5; y < SIM_YEARS; y++) {
    fund(TICKS_PER_YEAR * y, {
      food: 500 + y * 80,
      wood: 700 + y * 120,
      stone: 400 + y * 60,
      gold: 300 + y * 50,
    }, `Year-${y} resource grant`);
  }

  return actions;
}

const ECO_BUILDING_PRIORITY: BuildingTypeName[] = [
  BuildingType.Farm, BuildingType.Silo, BuildingType.Barn, BuildingType.Greenhouse,
  BuildingType.Well, BuildingType.LumberMill,
];

/** Civic / industry types unlocked by research — coverage sweep targets these explicitly. */
const CIVIC_BUILDING_PRIORITY: BuildingTypeName[] = [
  BuildingType.Church,
  BuildingType.Prison,
  BuildingType.Blacksmith,
  BuildingType.Mine,
  BuildingType.Mill,
  BuildingType.Market,
  BuildingType.School,
  BuildingType.Hospital,
  BuildingType.Mansion,
  BuildingType.TownHall,
];

const GROWTH_STATE = { recruitsThisYear: 0, housesThisYear: 0, lastGrowthYear: -1 };

function resetGrowthState(): void {
  GROWTH_STATE.recruitsThisYear = 0;
  GROWTH_STATE.housesThisYear = 0;
  GROWTH_STATE.lastGrowthYear = -1;
}

function resetGrowthYear(year: number): void {
  if (year !== GROWTH_STATE.lastGrowthYear) {
    GROWTH_STATE.recruitsThisYear = 0;
    GROWTH_STATE.housesThisYear = 0;
    GROWTH_STATE.lastGrowthYear = year;
  }
}

/** Smooth ramp — founders → lively mid-game when housing/rep stack (matches active play). */
function targetPopForYear(year: number): number {
  const t = Math.min(1, Math.max(0, year / SIM_YEARS));
  const startPop = 12;
  const endPop = scaledPopGateMax();
  const curved = Math.pow(t, 0.82);
  return Math.round(startPop + (endPop - startPop) * curved);
}

/** Pick the next building from live village needs (can repeat farms, mills, houses). */
function pickFreeBuildPriority(state: WorldState): BuildingTypeName | null {
  const pop = state.humanPopulation;
  const beds = getTotalBedsCached(state);
  const targetPop = targetPopForYear(state.year);
  const foodPerCap = pop > 0 ? state.resources.food / pop : 99;
  const mills = countCompletedBuildings(state, BuildingType.LumberMill);
  const farms = countCompletedBuildings(state, BuildingType.Farm);
  const woodNeedDay = getWoodNeedPerDay(pop);
  const woodRunway = woodNeedDay > 0 ? state.resources.wood / woodNeedDay : 99;

  const pick = (type: BuildingTypeName, cond = true): BuildingTypeName | null => (
    cond && canAffordBuilding(state, type) ? type : null
  );

  const essentials: [BuildingTypeName, boolean][] = [
    [BuildingType.House, !hasCompletedBuilding(state, BuildingType.House)],
    [BuildingType.Farm, !hasCompletedBuilding(state, BuildingType.Farm)],
    [BuildingType.LumberMill, !hasCompletedBuilding(state, BuildingType.LumberMill)],
    [BuildingType.Well, pop >= 4 && !hasCompletedBuilding(state, BuildingType.Well)],
    [BuildingType.Quarry, !hasCompletedBuilding(state, BuildingType.Quarry)],
  ];
  for (const [type, cond] of essentials) {
    const choice = pick(type, cond);
    if (choice) return choice;
  }

  if (beds < pop + 3 || beds < targetPop) {
    const choice = pick(BuildingType.House);
    if (choice) return choice;
  }
  if (mills < Math.max(1, Math.ceil(pop / 35)) || woodRunway < 50) {
    const choice = pick(BuildingType.LumberMill);
    if (choice) return choice;
  }
  if (foodPerCap < 14 || farms < Math.max(1, Math.ceil(pop / 14))) {
    const choice = pick(BuildingType.Farm);
    if (choice) return choice;
  }

  // Church + prison before mid-game affair spikes — arrests need a staffed prison.
  if (state.unlockedTechs.includes('architecture_1')) {
    const dramaPipeline: [BuildingTypeName, boolean][] = [
      [BuildingType.Church, !hasCompletedBuilding(state, BuildingType.Church)],
      [BuildingType.Prison, !hasCompletedBuilding(state, BuildingType.Prison)],
    ];
    for (const [type, cond] of dramaPipeline) {
      const choice = pick(type, cond);
      if (choice) return choice;
    }
  }

  if (profileCfg.preferEcoBuildings) {
    for (const type of ECO_BUILDING_PRIORITY) {
      if (hasCompletedBuilding(state, type)) continue;
      const cond = type !== BuildingType.Greenhouse || pop >= 22;
      const choice = pick(type, cond);
      if (choice) return choice;
    }
  }

  const oneOffs: [BuildingTypeName, boolean][] = [
    [BuildingType.Silo, farms >= 1],
    [BuildingType.Barn, true],
    [BuildingType.Workshop, true],
    [BuildingType.Store, true],
    [BuildingType.Church, !profileCfg.preferEcoBuildings && !hasCompletedBuilding(state, BuildingType.Church)],
    [BuildingType.TamingPost, !profileCfg.preferEcoBuildings],
    [BuildingType.Road, !profileCfg.skipRoadCoverage],
  ];
  for (const [type, cond] of oneOffs) {
    if (hasCompletedBuilding(state, type)) continue;
    const choice = pick(type, cond);
    if (choice) return choice;
  }

  for (const type of CIVIC_BUILDING_PRIORITY) {
    if (hasCompletedBuilding(state, type)) continue;
    if (!canUnlockBuilding(state, type)) continue;
    const choice = pick(type);
    if (choice) return choice;
  }

  const defenseBuildings: [BuildingTypeName, boolean][] = [
    [BuildingType.Wall, canUnlockBuilding(state, BuildingType.Wall) && pop >= 12],
    [BuildingType.Watchtower, canUnlockBuilding(state, BuildingType.Watchtower)],
    [BuildingType.Barracks, canUnlockBuilding(state, BuildingType.Barracks) && pop >= 18],
    [BuildingType.WallCorner, canUnlockBuilding(state, BuildingType.WallCorner) && hasCompletedBuilding(state, BuildingType.Wall)],
    [BuildingType.WallGate, canUnlockBuilding(state, BuildingType.WallGate) && hasCompletedBuilding(state, BuildingType.Wall)],
    [BuildingType.Prison, canUnlockBuilding(state, BuildingType.Prison)],
  ];
  for (const [type, cond] of defenseBuildings) {
    if (hasCompletedBuilding(state, type)) continue;
    const choice = pick(type, cond);
    if (choice) return choice;
  }

  if (mills < Math.ceil(pop / 28)) {
    const choice = pick(BuildingType.LumberMill);
    if (choice) return choice;
  }
  if (farms < Math.ceil(pop / 12)) {
    const choice = pick(BuildingType.Farm);
    if (choice) return choice;
  }
  if (beds < targetPop + 8) {
    const choice = pick(BuildingType.House);
    if (choice) return choice;
  }

  return null;
}

/** Place missing building types for coverage before needs-based growth starves them out. */
function pickCoverageBuildPriority(state: WorldState, coverage: CoverageMap): BuildingTypeName | null {
  syncBuildingCoverage(state, coverage);
  for (const type of ALL_BUILDING_TYPES) {
    if (profileCfg.skipRoadCoverage && type === BuildingType.Road) continue;
    if (coverage.buildings?.has(type)) continue;
    if (!canAffordBuilding(state, type)) continue;
    return type;
  }
  return null;
}

/** Final pass — ring-search every missing building type before verdict. */
function ensureFullBuildingCoverage(
  state: WorldState,
  cx: number,
  cy: number,
  coverage: CoverageMap,
  log: ActionLog[],
): WorldState {
  let s = state;
  syncBuildingCoverage(s, coverage);
  const missing = ALL_BUILDING_TYPES.filter((type) => {
    if (profileCfg.skipRoadCoverage && type === BuildingType.Road) return false;
    return !coverage.buildings?.has(type);
  });
  if (missing.length === 0) return s;

  for (const type of missing) {
    if (!canUnlockBuilding(s, type)) {
      log.push({
        tick: s.tick,
        category: 'coverage_sweep',
        action: `place:${type}`,
        ok: false,
        detail: `locked (${BUILDING_CONFIGS[type].unlockRequirement ?? 'prereq'})`,
      });
      continue;
    }
    s = fundForBuildingCost(s, type);
    const result = type === BuildingType.Wall
      ? tryPlaceWallChain(s, cx, cy)
      : (() => {
        const spot = findBuildSpot(s, type, cx, cy);
        return spot
          ? tryPlaceBuilding(s, type, spot[0], spot[1])
          : { state: s, ok: false as const, detail: 'no valid spot' };
      })();
    if (result.ok) {
      cov(coverage, 'buildings', type);
      log.push({
        tick: s.tick,
        category: 'coverage_sweep',
        action: `place:${type}`,
        ok: true,
        detail: result.detail ?? 'final sweep',
      });
      s = simInstantCompleteInProgress(result.state);
    } else {
      log.push({
        tick: s.tick,
        category: 'coverage_sweep',
        action: `place:${type}`,
        ok: false,
        detail: result.detail ?? 'placement failed',
      });
    }
  }
  return s;
}

function countStaffAtBuilding(state: WorldState, buildingId: number): number {
  return state.entities.filter(
    (e) => e.alive && isPlayerHuman(e) && e.homeBuildingId === buildingId && !isImprisoned(e),
  ).length;
}

/** Fill construction crews and every job slot (including manual-staff buildings). */
function autoStaffAllBuildings(state: WorldState): WorldState {
  assignAllWorkers(state.entities.filter(isPlayerHuman), state.buildings);
  return ensurePrisonGuard(state);
}

/** Prefer pulling a guard from these sites when the village has no idle workers (sim-only). */
const PRISON_GUARD_DONOR_PRIORITY: BuildingTypeName[] = [
  BuildingType.Barracks,
  BuildingType.TamingPost,
  BuildingType.Greenhouse,
  BuildingType.Road,
  BuildingType.Store,
  BuildingType.Workshop,
  BuildingType.Market,
  BuildingType.Mill,
  BuildingType.Mansion,
  BuildingType.School,
  BuildingType.Hospital,
  BuildingType.Farm,
  BuildingType.LumberMill,
  BuildingType.Mine,
  BuildingType.Quarry,
  BuildingType.Blacksmith,
  BuildingType.Church,
];

function stealWorkerForPrisonGuard(state: WorldState, prisonId: number): WorldState {
  const prison = state.buildings.find((b) => b.id === prisonId);
  if (!prison) return state;
  const humans = state.entities.filter(isPlayerHuman);
  for (const donorType of PRISON_GUARD_DONOR_PRIORITY) {
    for (const donor of state.buildings) {
      if (!donor.completed || donor.faction === 'rival' || donor.type !== donorType) continue;
      const worker = humans.find(
        (h) => h.alive
          && !h.isJuvenile
          && !isImprisoned(h)
          && !h.pregnant
          && h.homeBuildingId === donor.id,
      );
      if (!worker) continue;
      donor.occupants = donor.occupants.filter((id) => id !== worker.id);
      worker.homeBuildingId = prison.id;
      worker.job = JobType.Guard;
      worker.occupation = getOccupationForBuilding(BuildingType.Prison);
      if (!prison.occupants.includes(worker.id)) prison.occupants.push(worker.id);
      return state;
    }
  }
  return state;
}

/** Arrests require a Guard at the prison — pull one in if auto-assign missed (common when pop is fully employed). */
function ensurePrisonGuard(state: WorldState): WorldState {
  let next = state;
  for (const prison of next.buildings) {
    if (!prison.completed || prison.type !== BuildingType.Prison || prison.faction === 'rival') continue;
    if (countStaffAtBuilding(next, prison.id) > 0) continue;
    next = assignIdleWorkerToBuilding(next, prison.id);
    if (countStaffAtBuilding(next, prison.id) > 0) continue;
    next = stealWorkerForPrisonGuard(next, prison.id);
  }
  return next;
}

function formatPrisonReport(state: WorldState, log: WorldState['eventLog']): string[] {
  const imprisonEvents = log.filter((e) => e.type === 'event' && e.message.includes('imprisoned for scandal'));
  const releaseEvents = log.filter((e) => e.type === 'event' && e.message.includes('released from prison'));
  const caughtScandals = log.filter((e) => e.type === 'scandal' && e.message.includes('was caught with'));
  const rumorScandals = log.filter((e) => e.type === 'scandal' && e.message.includes('Whispers spread'));
  const prisons = state.buildings.filter((b) => b.completed && b.type === BuildingType.Prison);
  const staffedPrisons = prisons.filter((b) => countStaffAtBuilding(state, b.id) > 0).length;
  const imprisonedNow = state.entities.filter((e) => e.alive && isImprisoned(e)).length;
  const hasArch1 = state.unlockedTechs.includes('architecture_1');
  const lines = [
    `Prisons completed: ${prisons.length} | Staffed: ${staffedPrisons}`
    + ` | architecture_1: ${hasArch1 ? 'yes' : 'no'}`,
    `Scandals — caught: ${caughtScandals.length} | rumors: ${rumorScandals.length}`,
    `Imprisonments: ${imprisonEvents.length} | Releases: ${releaseEvents.length} | Jailed now: ${imprisonedNow}`,
    'Note: only caught scandals imprison married settlers (not single paramours); rumors need a staffed prison + ~22% exposure roll.',
  ];
  if (prisons.length === 0 && !hasArch1) {
    lines.push('  → No prison yet — research architecture_1 (sim now prioritizes it earlier).');
  } else if (prisons.length === 0) {
    lines.push('  → architecture_1 unlocked but no prison placed — check build coverage logs.');
  } else if (staffedPrisons === 0) {
    lines.push('  → Prison built but no Guard staffed — imprisonment cannot trigger.');
  } else if (caughtScandals.length === 0 && rumorScandals.length === 0) {
    lines.push('  → No affairs exposed — need married settlers + affair progress (Church helps).');
  } else if (caughtScandals.length === 0 && rumorScandals.length > 0) {
    lines.push('  → Rumors only this run — caught busts are RNG-heavy even with a staffed prison.');
  }
  if (imprisonEvents.length > 0) {
    for (const e of imprisonEvents.slice(0, 8)) {
      lines.push(`  Y${e.year} D${e.day} tick ${e.tick} | ${e.message}`);
    }
    if (imprisonEvents.length > 8) {
      lines.push(`  … +${imprisonEvents.length - 8} more`);
    }
  } else if (caughtScandals.length > 0) {
    for (const e of caughtScandals.slice(0, 4)) {
      lines.push(`  caught Y${e.year} D${e.day} | ${e.message}`);
    }
    if (staffedPrisons === 0) {
      lines.push('  → Caught scandals but prison had no Guard — sim now steals a worker each tick until staffed.');
    } else {
      lines.push('  → Caught scandals logged but no imprisonments (arrest roll failed or prison full).');
    }
  }
  return lines;
}

function autoBuildFree(
  state: WorldState,
  cx: number,
  cy: number,
  coverage: CoverageMap,
  log: ActionLog[],
): WorldState {
  const preferCoverage = state.tick % 108 < 72;
  const type = (preferCoverage ? pickCoverageBuildPriority(state, coverage) : null)
    ?? pickFreeBuildPriority(state)
    ?? pickCoverageBuildPriority(state, coverage);
  if (!type) return state;
  const { state: next, ok, detail } = tryPlace(state, type, cx, cy);
  if (ok) {
    cov(coverage, 'buildings', type);
    log.push({
      tick: state.tick,
      category: 'auto_build',
      action: `place:${type}`,
      ok: true,
      detail: `pop=${state.humanPopulation} food=${Math.floor(state.resources.food)} wood=${Math.floor(state.resources.wood)}`,
    });
    return simInstantCompleteInProgress(next);
  }
  if (SIM_VERBOSE && detail) {
    log.push({ tick: state.tick, category: 'auto_build', action: `place:${type}`, ok: false, detail });
  }
  return state;
}

function autoProfileGrowth(
  state: WorldState,
  cx: number,
  cy: number,
  log: ActionLog[],
): WorldState {
  resetGrowthYear(state.year);
  let s = state;
  const targetPop = targetPopForYear(state.year);

  if (
    profileCfg.autoRecruit
    && !isPreWinterRecruitPause(s)
    && GROWTH_STATE.recruitsThisYear < profileCfg.maxRecruitsPerYear
  ) {
    const pop = s.humanPopulation;
    const underTarget = pop < targetPop;
    if (pop < s.maxHumanPopulation - 1 && underTarget && s.resources.food >= 30 && s.resources.gold >= 20) {
      const before = pop;
      const next = recruitSettler(s);
      if (next.humanPopulation > before) {
        GROWTH_STATE.recruitsThisYear++;
        log.push({ tick: s.tick, category: 'auto_growth', action: 'recruit', ok: true, detail: `pop ${before}→${next.humanPopulation} target=${targetPop}` });
        s = next;
      }
    }
  }

  return s;
}

// ─── Injected coverage events (rivals, visitors, diplomacy, raids) ───────────

function injectDiplomacyEvent(state: WorldState, rivalId: string, kind: DiplomacyEventKind): WorldState | null {
  const pending = state.pendingDiplomacyEvents ?? [];
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return null;
  if (pending.some((e) => e.rivalId === rivalId && e.kind === kind)) return null;

  const meta = DIPLOMACY_META[kind];
  const event: DiplomacyEvent = {
    id: `sim_dip_${kind}_${state.tick}`,
    rivalId: rival.id,
    rivalName: rival.name,
    kind,
    emoji: meta.emoji,
    title: meta.title(rival.name),
    description: meta.description(rival.name),
    choices: DIPLOMACY_CHOICE_IDS[kind].map((id) => ({ id, label: id, hint: id })),
    createdAtTick: state.tick,
  };
  return { ...state, pendingDiplomacyEvents: [...pending, event] };
}

function dropStaleDiplomacyEvents(state: WorldState, log: ActionLog[]): WorldState {
  const events = state.pendingDiplomacyEvents ?? [];
  if (events.length === 0) return state;
  const kept: DiplomacyEvent[] = [];
  for (const evt of events) {
    if (state.tick - evt.createdAtTick >= DIPLOMACY_STALE_TICKS) {
      log.push({
        tick: state.tick,
        category: 'diplomacy_stale',
        action: evt.kind,
        ok: true,
        detail: `expired after ${DIPLOMACY_STALE_TICKS} ticks`,
      });
    } else {
      kept.push(evt);
    }
  }
  if (kept.length === events.length) return state;
  return { ...state, pendingDiplomacyEvents: kept };
}

function dropStaleRaidEvents(state: WorldState, log: ActionLog[]): WorldState {
  const events = state.pendingRaidEvents ?? [];
  if (events.length === 0) return state;
  const kept = events.filter((evt) => {
    const expires = evt.expiresAtTick ?? evt.createdAtTick + RAID_STALE_TICKS;
    const stale = state.tick >= expires || state.tick - evt.createdAtTick >= RAID_STALE_TICKS;
    if (stale) {
      log.push({
        tick: state.tick,
        category: 'raid_stale',
        action: evt.rivalName,
        ok: true,
        detail: 'expired unanswerable raid',
      });
    }
    return !stale;
  });
  if (kept.length === events.length) return state;
  return { ...state, pendingRaidEvents: kept };
}

function injectRaidEvent(state: WorldState, rivalId: string, lootFood = 25): WorldState | null {
  const pending = state.pendingRaidEvents ?? [];
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return null;
  if (pending.some((e) => e.rivalId === rivalId)) return null;

  const event: RaidEvent = {
    id: `sim_raid_${state.tick}`,
    rivalId: rival.id,
    rivalName: rival.name,
    emoji: '⚔️',
    title: `${rival.name} is raiding!`,
    description: `Sim-injected raid for balance coverage.`,
    choices: [
      { id: 'defend', label: 'Defend', hint: 'Militia fight' },
      { id: 'barricade', label: 'Barricade', hint: 'Fortify' },
      { id: 'payoff', label: `Pay ${lootFood}`, hint: 'Pay off' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + 6 * TICKS_PER_DAY,
    marchDistanceTiles: 12,
    attackerStrength: (() => {
      const defendStr = getMilitiaStrength(state, state.entities);
      const barricadeStr = getBarricadeStrength(state, state.entities);
      const defenderRef = Math.max(defendStr, barricadeStr, 40);
      const ratioBands = [0.55, 0.75, 0.92, 1.05, 1.25] as const;
      const band = ratioBands[Math.floor(state.tick / TICKS_PER_DAY) % ratioBands.length];
      return Math.max(35, Math.floor(defenderRef * band));
    })(),
    lootFood,
    lootGold: 10,
    lootWood: 30 + Math.floor(rival.population * 3),
    lootStone: 12 + rival.population,
  };
  return { ...state, pendingRaidEvents: [...pending, event] };
}

function ensureRival(
  state: WorldState,
  relationship: 'tense' | 'competitive' | 'neutral' | 'friendly',
): { state: WorldState; label: string | null } {
  if (state.rivalSettlements.some((r) => r.relationship === relationship)) {
    return { state, label: null };
  }
  const next = shallowCloneWorld(state);
  spawnRivalSettlement(next, next.entities, next.buildings);
  const idx = next.rivalSettlements.length - 1;
  next.rivalSettlements = next.rivalSettlements.map((r, i) => (
    i === idx
      ? { ...r, relationship, raidCooldownDays: 0, daysUntilAction: 8, peaceTreatyDays: 0 }
      : r
  ));
  const rival = next.rivalSettlements[idx];
  return { state: next, label: `spawn_rival:${rival.name}[${relationship}]` };
}

/** Pick a rival for harness raid injection; re-tense them so diplomacy/peace doesn't block coverage. */
function prepareRaidInjectionTarget(state: WorldState): { state: WorldState; rivalId: string | null; label: string | null } {
  let s = state;
  let label: string | null = null;
  if (s.rivalSettlements.length === 0) {
    const spawned = ensureRival(s, 'tense');
    if (spawned.label) label = spawned.label;
    s = spawned.state;
  }
  const rival = s.rivalSettlements.find((r) => r.relationship === 'tense')
    ?? s.rivalSettlements.find((r) => r.relationship === 'competitive')
    ?? s.rivalSettlements[0];
  if (!rival) return { state: s, rivalId: null, label };
  if (rival.relationship !== 'tense') {
    s = {
      ...s,
      rivalSettlements: s.rivalSettlements.map((r) => (
        r.id === rival.id
          ? { ...r, relationship: 'tense' as const, peaceTreatyDays: 0, raidCooldownDays: 0 }
          : r
      )),
    };
    label = label ?? `retense_rival:${rival.name}`;
  }
  return { state: s, rivalId: rival.id, label };
}

function ensureVisitor(state: WorldState, kind: VisitorKind): { state: WorldState; label: string | null } {
  const active = state.visitorGroups.filter((g) => g.kind === kind && g.daysLeft > 0);
  if (kind === 'refugees') {
    // New refugee wave once the prior group finished negotiation (talk + welcome/screen/turn_away).
    if (active.some((g) => !g.refugeeResolved)) return { state, label: null };
  } else if (active.some((g) => !g.leaderTalked)) {
    // Don't stack duplicate kinds before leader talk coverage runs.
    return { state, label: null };
  } else if (active.length > 0) {
    return { state, label: null };
  }
  const next = shallowCloneWorld(state);
  const beforeLen = next.visitorGroups.length;
  spawnVisitorGroup(next, next.entities, next.buildings, kind);
  const spawned = next.visitorGroups[next.visitorGroups.length - 1];
  if (kind === 'refugees' && spawned && next.visitorGroups.length > beforeLen && spawned.kind === 'refugees') {
    next.visitorGroups = next.visitorGroups.map((g, i) => (
      i === next.visitorGroups.length - 1 ? { ...g, refugeeResolved: false } : g
    ));
  }
  return { state: next, label: `spawn_visitor:${kind}` };
}

// ─── Coverage injection schedule (scales to SIM_MAX_TICKS) ─────────────────

type InjectionKind =
  | { type: 'rival'; relationship: 'tense' | 'competitive' | 'neutral' | 'friendly' }
  | { type: 'visitor'; kind: VisitorKind }
  | { type: 'diplomacy'; kind: DiplomacyEventKind }
  | { type: 'raid' };

type ScheduledInjection = { tick: number; injection: InjectionKind };

function spacedTicks(start: number, end: number, count: number): number[] {
  if (count <= 0 || end <= start) return [];
  if (count === 1) return [Math.round((start + end) / 2)];
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(Math.round(start + (i / (count - 1)) * (end - start)));
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

function assignTicks(
  items: InjectionKind[],
  start: number,
  end: number,
  minGap = 48,
): ScheduledInjection[] {
  if (items.length === 0 || end <= start) return [];
  const gap = items.length === 1
    ? 0
    : Math.max(1, Math.min(minGap, Math.floor((end - start) / (items.length - 1))));
  const out: ScheduledInjection[] = [];
  let tick = start;
  for (const injection of items) {
    out.push({ tick: Math.min(end, tick), injection });
    tick += gap;
  }
  return out;
}

/** Per-decade injection offsets (repeated for 20-year and longer full balance runs). */
const DECADE_INJECTION_TEMPLATE: { offset: number; injection: InjectionKind }[] = [
  { offset: 4000, injection: { type: 'rival', relationship: 'tense' } },
  { offset: 4200, injection: { type: 'rival', relationship: 'competitive' } },
  { offset: 4400, injection: { type: 'rival', relationship: 'neutral' } },
  { offset: 4800, injection: { type: 'visitor', kind: 'traders' } },
  { offset: 5000, injection: { type: 'visitor', kind: 'hunters' } },
  { offset: 5200, injection: { type: 'visitor', kind: 'pilgrims' } },
  { offset: 5500, injection: { type: 'visitor', kind: 'performers' } },
  { offset: 5800, injection: { type: 'visitor', kind: 'scholars' } },
  { offset: 6000, injection: { type: 'visitor', kind: 'refugees' } },
  { offset: 8000, injection: { type: 'diplomacy', kind: 'tribute' } },
  { offset: 8300, injection: { type: 'diplomacy', kind: 'tribute' } },
  { offset: 8600, injection: { type: 'diplomacy', kind: 'tribute' } },
  { offset: 10000, injection: { type: 'diplomacy', kind: 'border_dispute' } },
  { offset: 10300, injection: { type: 'diplomacy', kind: 'border_dispute' } },
  { offset: 10600, injection: { type: 'diplomacy', kind: 'border_dispute' } },
  { offset: 12000, injection: { type: 'diplomacy', kind: 'alliance' } },
  { offset: 12300, injection: { type: 'diplomacy', kind: 'alliance' } },
  { offset: 12600, injection: { type: 'diplomacy', kind: 'alliance' } },
  { offset: 14000, injection: { type: 'diplomacy', kind: 'peace_treaty' } },
  { offset: 14300, injection: { type: 'diplomacy', kind: 'peace_treaty' } },
  { offset: 14600, injection: { type: 'diplomacy', kind: 'peace_treaty' } },
  { offset: 18000, injection: { type: 'visitor', kind: 'hunters' } },
  { offset: 19000, injection: { type: 'visitor', kind: 'nomads' } },
  { offset: 20000, injection: { type: 'raid' } },
  { offset: 22000, injection: { type: 'visitor', kind: 'performers' } },
  { offset: 22000, injection: { type: 'raid' } },
  { offset: 24000, injection: { type: 'visitor', kind: 'pilgrims' } },
  { offset: 24000, injection: { type: 'raid' } },
  { offset: 26000, injection: { type: 'visitor', kind: 'refugees' } },
  { offset: 52000, injection: { type: 'visitor', kind: 'refugees' } },
  { offset: 52000, injection: { type: 'raid' } },
  { offset: 54000, injection: { type: 'visitor', kind: 'scholars' } },
  { offset: 54000, injection: { type: 'raid' } },
  { offset: 56000, injection: { type: 'visitor', kind: 'nomads' } },
  { offset: 56000, injection: { type: 'raid' } },
];

function buildInjectionSchedule(totalTicks: number): ScheduledInjection[] {
  if (totalTicks >= FULL_BALANCE_TICKS) {
    const decades = Math.ceil(SIM_YEARS / 10);
    const full: ScheduledInjection[] = [];
    for (let d = 0; d < decades; d++) {
      const base = d * TICKS_PER_YEAR * 10;
      for (const { offset, injection } of DECADE_INJECTION_TEMPLATE) {
        const tick = base + offset;
        if (tick <= totalTicks) full.push({ tick, injection });
      }
    }
    return full;
  }

  // Partial run — compress all coverage into the available window after rivals spawn.
  const rivalTicks = spacedTicks(
    Math.max(600, Math.floor(totalTicks * 0.52)),
    Math.max(900, Math.floor(totalTicks * 0.62)),
    3,
  );
  const schedule: ScheduledInjection[] = rivalTicks.map((tick, i) => ({
    tick,
    injection: {
      type: 'rival' as const,
      relationship: (['tense', 'competitive', 'neutral'] as const)[i] ?? 'neutral',
    },
  }));

  const windowStart = (rivalTicks[rivalTicks.length - 1] ?? 600) + 72;
  const windowEnd = totalTicks - 48;
  if (windowEnd <= windowStart) return schedule;

  const gap = Math.max(24, Math.floor((windowEnd - windowStart) / 40));
  let cursor = windowStart;

  // Phase 1 — every visitor_talk kind (spawn + auto-talk same tick).
  for (const kind of VISITOR_TALK_KINDS) {
    schedule.push({ tick: cursor, injection: { type: 'visitor', kind } });
    cursor += gap;
  }

  // Phase 2 — extra refugee waves for welcome / screen / turn_away coverage.
  for (let i = 0; i < 2; i++) {
    schedule.push({ tick: Math.min(windowEnd, cursor), injection: { type: 'visitor', kind: 'refugees' } });
    cursor += gap * 2;
  }

  // Phase 3 — diplomacy + raids in whatever window remains.
  const frontierItems: InjectionKind[] = [
    { type: 'diplomacy', kind: 'tribute' },
    { type: 'diplomacy', kind: 'tribute' },
    { type: 'diplomacy', kind: 'tribute' },
    { type: 'diplomacy', kind: 'border_dispute' },
    { type: 'diplomacy', kind: 'border_dispute' },
    { type: 'diplomacy', kind: 'border_dispute' },
    { type: 'diplomacy', kind: 'alliance' },
    { type: 'diplomacy', kind: 'alliance' },
    { type: 'diplomacy', kind: 'alliance' },
    { type: 'diplomacy', kind: 'peace_treaty' },
    { type: 'diplomacy', kind: 'peace_treaty' },
    { type: 'diplomacy', kind: 'peace_treaty' },
    { type: 'raid' },
    { type: 'raid' },
    { type: 'raid' },
  ];
  schedule.push(...assignTicks(frontierItems, Math.min(cursor, windowEnd), windowEnd, gap));

  return schedule.sort((a, b) => a.tick - b.tick);
}

const INJECTION_SCHEDULE = buildInjectionSchedule(TOTAL_TICKS);
const INJECTIONS_BY_TICK = new Map<number, InjectionKind[]>();
for (const { tick, injection } of INJECTION_SCHEDULE) {
  const list = INJECTIONS_BY_TICK.get(tick) ?? [];
  list.push(injection);
  INJECTIONS_BY_TICK.set(tick, list);
}

const HAS_SCHEDULED_DIPLOMACY = INJECTION_SCHEDULE.some((e) => e.injection.type === 'diplomacy');
const HAS_SCHEDULED_RAIDS = INJECTION_SCHEDULE.some((e) => e.injection.type === 'raid');
const HAS_SCHEDULED_WINTER = TOTAL_TICKS >= FIRST_WINTER_TICK;

function formatRunLength(ticks: number): string {
  if (ticks >= FULL_BALANCE_TICKS) {
    return `${ticks} ticks (${SIM_YEARS} game years)`;
  }
  const years = (ticks / TICKS_PER_YEAR).toFixed(2);
  const days = Math.floor(ticks / TICKS_PER_DAY);
  return `${ticks} ticks (~${years} game years, ${days} days — smoke run, not the 10-year test)`;
}

function applyInjection(state: WorldState, injection: InjectionKind): { state: WorldState; label: string | null } {
  switch (injection.type) {
    case 'rival':
      return ensureRival(state, injection.relationship);
    case 'visitor':
      return ensureVisitor(state, injection.kind);
    case 'diplomacy': {
      const dipRival = state.rivalSettlements.find((r) => r.relationship === 'tense')
        ?? state.rivalSettlements[0];
      if (!dipRival) return { state, label: null };
      const injected = injectDiplomacyEvent(state, dipRival.id, injection.kind);
      return injected
        ? { state: injected, label: `diplomacy:${injection.kind}` }
        : { state, label: null };
    }
    case 'raid': {
      const prepared = prepareRaidInjectionTarget(state);
      if (!prepared.rivalId) return { state: prepared.state, label: prepared.label };
      const injected = injectRaidEvent(prepared.state, prepared.rivalId, 22);
      return injected
        ? { state: injected, label: prepared.label ?? 'raid:incoming' }
        : { state: prepared.state, label: prepared.label };
    }
    default:
      return { state, label: null };
  }
}

/** Scheduled injections so frontier / visitor options are exercised even if RNG skips them. */
function tickCoverageInjections(
  state: WorldState,
  t: number,
  log: ActionLog[],
  logger?: SimLogger,
): WorldState {
  const batch = INJECTIONS_BY_TICK.get(t);
  if (!batch) return state;

  let s = state;
  for (const injection of batch) {
    const result = applyInjection(s, injection);
    s = result.state;
    if (result.label) {
      log.push({ tick: t, category: 'inject', action: result.label, ok: true });
      logger?.live(`  → inject tick ${t}: ${result.label}`);
    }
    if (injection.type === 'raid' && result.label && !result.label.includes('raid:')) {
      log.push({ tick: t, category: 'inject', action: 'raid:incoming', ok: true });
      logger?.live(`  → inject tick ${t}: raid:incoming`);
    }
  }
  return s;
}

// ─── Auto player actions (option coverage) ─────────────────────────────────

type ActionLog = { tick: number; category: string; action: string; ok: boolean; detail?: string };

function pickUntestedChoice(
  tested: Set<string>,
  choices: string[],
  eligibility: (id: string) => boolean,
): string | null {
  for (const id of choices) {
    if (!tested.has(id) && eligibility(id)) return id;
  }
  for (const id of choices) {
    if (eligibility(id)) return id;
  }
  return null;
}

function autoResearch(state: WorldState, coverage: CoverageMap, log: ActionLog[]): WorldState {
  if (state.activeResearch) return state;
  syncResearchUnlocks(state);

  const order = SIM_PROFILE === 'eco' || SIM_PROFILE === 'town'
    ? [
      'forestry_1', 'forestry_2', 'architecture_1', 'defense_2', 'defense_1', 'mining_1', 'agriculture_1',
      'defense_3', 'trade_1', 'education_1', 'medicine_1',
      'defense_4', 'defense_5', 'agriculture_2', 'mining_2',
      'architecture_2', 'trade_2', 'education_2', 'medicine_2', 'agriculture_3',
    ]
    : [
    'defense_2', 'forestry_1', 'defense_1', 'mining_1', 'agriculture_1',
    'defense_3', 'trade_1', 'education_1', 'medicine_1', 'architecture_1',
    'defense_4', 'defense_5', 'agriculture_2', 'forestry_2', 'mining_2',
    'architecture_2', 'trade_2', 'education_2', 'medicine_2', 'agriculture_3',
  ];

  for (const id of order) {
    const node = state.researchNodes.find((n) => n.id === id);
    if (!node || node.researched || !node.unlocked) continue;
    const next = startResearch(state, id);
    if (next.activeResearch === id) {
      log.push({ tick: state.tick, category: 'research', action: `start:${id}`, ok: true });
      return next;
    }
  }
  return state;
}

function autoForge(state: WorldState, coverage: CoverageMap, log: ActionLog[]): WorldState {
  const smith = state.buildings.find((b) => b.completed && b.type === BuildingType.Blacksmith);
  if (!smith) return state;

  const orders: ForgeOrderId[] = FORGE_ORDERS.map((o) => o.id);
  for (const orderId of orders) {
    if (coverage.forge?.has(orderId)) continue;
    if (isForgeOrderComplete(state.villageForge, orderId)) continue;
    if (state.villageForge.activeOrder && state.villageForge.activeOrder !== orderId) continue;
    if (getForgeBlockReason(state, orderId) != null) continue;
    const before = state.villageForge.activeOrder;
    const next = queueForgeOrder(state, smith.id, orderId);
    if (next.villageForge.activeOrder === orderId && before !== orderId) {
      log.push({ tick: state.tick, category: 'forge', action: `queue:${orderId}`, ok: true });
      return next;
    }
  }
  return state;
}

function autoPlaceUnbuiltTypes(
  state: WorldState,
  cx: number,
  cy: number,
  coverage: CoverageMap,
  log: ActionLog[],
): WorldState {
  const completed = getCompletedBuildingTypes(state);

  const typesToTry = profileCfg.preferEcoBuildings
    ? [...ECO_BUILDING_PRIORITY, ...ALL_BUILDING_TYPES.filter((t) => !ECO_BUILDING_PRIORITY.includes(t))]
    : ALL_BUILDING_TYPES;

  for (const type of typesToTry) {
    if (profileCfg.skipRoadCoverage && type === BuildingType.Road) continue;
    if (completed.has(type)) continue;

    if (!canUnlockBuilding(state, type)) continue;
    const s = fundForBuildingCost(state, type);
    const result = type === BuildingType.Wall
      ? tryPlaceWallChain(s, cx, cy)
      : (() => {
        const spot = findBuildSpot(s, type, cx, cy);
        return spot
          ? tryPlaceBuilding(s, type, spot[0], spot[1])
          : { state: s, ok: false as const, detail: 'no valid spot' };
      })();
    const { state: next, ok, detail } = result;
    if (ok) {
      cov(coverage, 'buildings', type);
      log.push({ tick: state.tick, category: 'buildings', action: `place:${type}`, ok: true });
      return simInstantCompleteInProgress(next);
    }
    if (detail && SIM_VERBOSE) {
      log.push({ tick: state.tick, category: 'buildings', action: `place:${type}`, ok: false, detail });
    }
  }
  return state;
}

function autoDiplomacy(state: WorldState, coverage: CoverageMap, log: ActionLog[]): WorldState {
  const s = dropStaleDiplomacyEvents(state, log);
  const events = s.pendingDiplomacyEvents ?? [];
  if (events.length === 0) return s;

  for (const evt of events) {
    const cat = `diplomacy_${evt.kind}`;
    const tested = coverage[cat] ?? new Set();
    const choices = DIPLOMACY_CHOICE_IDS[evt.kind] ?? [];
    const choice = pickUntestedChoice(tested, choices, (id) => {
      const el = getDiplomacyChoiceEligibility(s, evt, id);
      return el.ok;
    });
    if (!choice) continue;

    const beforeLen = s.pendingDiplomacyEvents.length;
    const next = respondToDiplomacyEvent(s, evt.id, choice);
    const resolved = next.pendingDiplomacyEvents.length < beforeLen;
    if (resolved) cov(coverage, cat, choice);
    const remaining = next.pendingDiplomacyEvents?.find((e) => e.id === evt.id);
    log.push({
      tick: s.tick,
      category: cat,
      action: choice,
      ok: resolved,
      detail: resolved || !remaining
        ? undefined
        : getDiplomacyChoiceEligibility(next, remaining, choice).blockReason,
    });
    return next;
  }
  return s;
}

function predictRaidOutcome(
  state: WorldState,
  evt: RaidEvent,
  choice: (typeof RAID_RESPONSES)[number],
): RaidOutcomeTier | 'payoff' | 'unresolved' {
  if (choice === 'payoff') return 'payoff';
  const strength = choice === 'barricade'
    ? getBarricadeStrength(state, state.entities)
    : getMilitiaStrength(state, state.entities);
  return resolveDefenseRatio(strength, evt.attackerStrength);
}

function sliceNewCombatMessages(beforeLen: number, state: WorldState): string[] {
  const msgs: string[] = [];
  for (let i = beforeLen; i < state.eventLog.length; i++) {
    const entry = state.eventLog[i];
    if (entry?.type === 'combat') msgs.push(entry.message);
  }
  return msgs;
}

function autoRaidResponse(state: WorldState, coverage: CoverageMap, log: ActionLog[]): WorldState {
  const s = dropStaleRaidEvents(state, log);
  const events = s.pendingRaidEvents ?? [];
  if (events.length === 0) return s;

  for (const evt of events) {
    const tested = coverage.raid_response ?? new Set();
    const choice = pickUntestedChoice(tested, [...RAID_RESPONSES], (id) => {
      if (id === 'defend') {
        return (hasStoneSpears(s) || hasIronSpears(s))
          && getMilitiaStrength(s, s.entities) > 0;
      }
      if (id === 'barricade') return s.resources.wood >= 20 && s.resources.stone >= 10;
      if (id === 'payoff') return s.resources.food >= evt.lootFood;
      return false;
    });
    if (!choice) continue;

    const beforeLen = s.pendingRaidEvents.length;
    const eventLogBefore = s.eventLog.length;
    const deathsBefore = s.entities.filter((e) => e.alive && isPlayerHuman(e)).length;
    const predicted = predictRaidOutcome(s, evt, choice);
    const next = respondToRaidEvent(s, evt.id, choice);
    const resolved = next.pendingRaidEvents.length < beforeLen;
    if (resolved) cov(coverage, 'raid_response', choice);
    const deathsAfter = next.entities.filter((e) => e.alive && isPlayerHuman(e)).length;
    const casualties = Math.max(0, deathsBefore - deathsAfter);
    const combatMsgs = sliceNewCombatMessages(eventLogBefore, next);
    const outcomeMsg = combatMsgs[combatMsgs.length - 1] ?? '(no combat log)';
    log.push({
      tick: s.tick,
      category: 'raid_response',
      action: choice,
      ok: resolved,
      detail: `attacker=${evt.attackerStrength} vs ${
        choice === 'barricade'
          ? getBarricadeStrength(s, s.entities)
          : getMilitiaStrength(s, s.entities)
      } | predicted=${predicted} | casualties=${casualties} | ${outcomeMsg}`,
    });
    return next;
  }
  return s;
}

function canVisitorTrade(state: WorldState, action: VisitorTradeAction): boolean {
  if (action === 'buy_food') return state.resources.gold >= 25;
  if (action === 'buy_wood') return state.resources.gold >= 20;
  if (action === 'sell_food') return state.resources.food >= 30;
  return false;
}

function canRefugeeChoice(state: WorldState, choice: RefugeeChoice): boolean {
  if (choice === 'turn_away') return true;
  if (state.humanPopulation >= state.maxHumanPopulation) return false;
  if (choice === 'welcome') return state.resources.food >= 40;
  if (choice === 'screen') return state.resources.food >= 20;
  return false;
}

function autoVisitors(state: WorldState, coverage: CoverageMap, log: ActionLog[]): WorldState {
  let s = state;
  const talkTested = coverage.visitor_talk ?? new Set();

  // Re-spawn any visitor_talk kind that expired before leader talk (don't wait for next inject).
  for (const kind of VISITOR_TALK_KINDS) {
    if (talkTested.has(kind)) continue;
    const hasActive = s.visitorGroups.some((g) => g.kind === kind && g.daysLeft > 0);
    if (!hasActive) {
      const spawned = ensureVisitor(s, kind);
      s = spawned.state;
      if (spawned.label) {
        log.push({ tick: s.tick, category: 'visitor_respawn', action: spawned.label, ok: true });
      }
    }
  }

  // Untested visitor kinds first so injected groups get leader talk before expiring.
  const groups = [...s.visitorGroups].sort((a, b) => {
    const aNeedTalk = !a.leaderTalked && !talkTested.has(a.kind);
    const bNeedTalk = !b.leaderTalked && !talkTested.has(b.kind);
    if (aNeedTalk !== bNeedTalk) return aNeedTalk ? -1 : 1;
    return 0;
  });

  for (const group of groups) {
    if (group.kind === 'refugees') {
      if (!group.leaderTalked) {
        const before = group.leaderTalked;
        s = talkToVisitorLeader(s, group.id);
        const g = s.visitorGroups.find((x) => x.id === group.id);
        const resolved = Boolean(g?.leaderTalked && !before);
        if (resolved) cov(coverage, 'visitor_talk', group.kind);
        log.push({ tick: s.tick, category: 'visitor_talk', action: group.kind, ok: resolved });
        continue;
      }
      if (!group.refugeeResolved) {
        const tested = coverage.refugee ?? new Set();
        const choices: RefugeeChoice[] = ['welcome', 'screen', 'turn_away'];
        const choice = pickUntestedChoice(tested, choices, (id) => canRefugeeChoice(s, id as RefugeeChoice));
        if (!choice) continue;
        const before = group.refugeeResolved;
        s = negotiateRefugees(s, group.id, choice);
        const g = s.visitorGroups.find((x) => x.id === group.id);
        const resolved = Boolean(g?.refugeeResolved && !before);
        if (resolved) cov(coverage, 'refugee', choice);
        log.push({ tick: s.tick, category: 'refugee', action: choice, ok: resolved });
      }
      continue;
    }

    if (!group.leaderTalked) {
      const before = group.leaderTalked;
      s = talkToVisitorLeader(s, group.id);
      const g = s.visitorGroups.find((x) => x.id === group.id);
      const resolved = Boolean(g?.leaderTalked && !before);
      if (resolved) cov(coverage, 'visitor_talk', group.kind);
      log.push({ tick: s.tick, category: 'visitor_talk', action: group.kind, ok: resolved });
    }

    const tradeActions: VisitorTradeAction[] = ['buy_food', 'buy_wood', 'sell_food'];
    const canTrade = group.kind === 'traders' || group.kind === 'nomads' || group.kind === 'hunters';
    if (canTrade && group.tradesCompleted < 3) {
      const tested = coverage.visitor_trade ?? new Set();
      const action = pickUntestedChoice(tested, tradeActions, (id) => canVisitorTrade(s, id as VisitorTradeAction));
      if (action) {
        const before = group.tradesCompleted;
        s = tradeWithVisitors(s, group.id, action as VisitorTradeAction);
        const g = s.visitorGroups.find((x) => x.id === group.id);
        const resolved = (g?.tradesCompleted ?? 0) > before;
        if (resolved) cov(coverage, 'visitor_trade', action);
        log.push({ tick: s.tick, category: 'visitor_trade', action, ok: resolved });
      }
    }
  }

  return s;
}

function rivalActionApplied(
  before: WorldState,
  after: WorldState,
  rivalId: string,
  actionId: string,
): boolean {
  const rb = before.rivalSettlements.find((r) => r.id === rivalId);
  const ra = after.rivalSettlements.find((r) => r.id === rivalId);
  if (!rb || !ra) return false;

  switch (actionId) {
    case 'gift':
      // Gift spends food even when already friendly (no relationship shift left).
      return after.resources.food < before.resources.food;
    case 'trade_pact':
      return ra.relationship === 'friendly'
        && (rb.relationship !== 'friendly' || after.resources.gold < before.resources.gold);
    case 'show_strength':
      return rb.relationship !== ra.relationship
        || rb.daysUntilAction !== ra.daysUntilAction
        || hasNewEventLogType(before.eventLog.length, after, 'event', after.tick);
    case 'peace_treaty':
      return (after.resources.gold < before.resources.gold && after.resources.food < before.resources.food)
        || ra.peaceTreatyDays > rb.peaceTreatyDays;
    case 'counter_raid':
      return hasNewEventLogType(before.eventLog.length, after, 'combat', after.tick);
    default:
      return false;
  }
}

function rivalsForAction(rivals: WorldState['rivalSettlements'], actionId: string, tick: number): WorldState['rivalSettlements'] {
  const relRank: Record<string, number> = { tense: 0, competitive: 1, neutral: 2, friendly: 3 };
  const sorted = [...rivals].sort((a, b) => (relRank[a.relationship] ?? 9) - (relRank[b.relationship] ?? 9));
  const rotate = tick % Math.max(1, sorted.length);
  const rotated = [...sorted.slice(rotate), ...sorted.slice(0, rotate)];
  if (actionId === 'trade_pact') {
    return rotated.filter((r) => r.relationship === 'neutral' || r.relationship === 'competitive');
  }
  if (actionId === 'show_strength' || actionId === 'counter_raid') {
    return rotated.filter((r) => r.relationship === 'tense' || r.relationship === 'competitive');
  }
  if (actionId === 'peace_treaty') {
    return rotated.filter((r) => r.relationship !== 'friendly');
  }
  return rotated;
}

function autoRivalActions(
  state: WorldState,
  coverage: CoverageMap,
  log: ActionLog[],
  frontier: FrontierTracker,
): WorldState {
  let s = state;
  const rivals = s.rivalSettlements;
  if (rivals.length === 0) return s;

  const actions: { id: string; fn: (st: WorldState, rid: string) => WorldState }[] = [
    { id: 'gift', fn: sendRivalGift },
    { id: 'trade_pact', fn: establishRivalTradePact },
    { id: 'show_strength', fn: showStrengthToRival },
    { id: 'peace_treaty', fn: signPeaceTreaty },
  ];

  const untested = actions.filter((a) => !coverage.rival_action?.has(a.id));
  for (const { id, fn } of untested) {
    for (const rival of rivalsForAction(rivals, id, s.tick)) {
      const before = s;
      const next = fn(s, rival.id);
      if (rivalActionApplied(before, next, rival.id, id)) {
        cov(coverage, 'rival_action', id);
        log.push({ tick: s.tick, category: 'rival_action', action: `${id}:${rival.name}`, ok: true });
        frontier.recordOutgoingDiplomacy();
        s = next;
        break;
      }
    }
  }

  if (!coverage.rival_action?.has('counter_raid')) {
    for (const rival of rivalsForAction(s.rivalSettlements, 'counter_raid', s.tick)) {
      let attemptState = s;
      const liveRival = attemptState.rivalSettlements.find((r) => r.id === rival.id);
      if (!liveRival) continue;

      if (liveRival.relationship === 'friendly' || isRivalAtPeace(liveRival)) {
        attemptState = {
          ...attemptState,
          rivalSettlements: attemptState.rivalSettlements.map((r) => (
            r.id === rival.id
              ? { ...r, relationship: 'tense' as const, peaceTreatyDays: 0, raidCooldownDays: 0 }
              : r
          )),
        };
      }

      const check = canLaunchRaidOnRival(
        attemptState,
        attemptState.rivalSettlements.find((r) => r.id === rival.id) ?? liveRival,
      );
      if (!check.ok) continue;

      const before = attemptState;
      const next = launchRaidOnRival(attemptState, rival.id);
      if (rivalActionApplied(before, next, rival.id, 'counter_raid')) {
        cov(coverage, 'rival_action', 'counter_raid');
        log.push({ tick: s.tick, category: 'rival_action', action: `counter_raid:${rival.name}`, ok: true });
        frontier.recordOutgoingRaid();
        s = next;
        break;
      }
    }
  }

  return s;
}

// ─── Main simulation ─────────────────────────────────────────────────────────

async function runSimulation(): Promise<void> {
  await loadNames();
  // Particles / screen shake are no-ops in balance testing but still cost allocations.
  saveJuiceEffectsEnabled(false);
  resetGrowthState();
  const logger = new SimLogger(SIM_PROFILE);
  const coverage: CoverageMap = {};
  const actionLog: ActionLog[] = [];
  const yearSnapshots: YearSnapshot[] = [];
  const winterTracker = new WinterTracker();
  const frontierTracker = new FrontierTracker();
  const perfSamples: { tick: number; ms: number; humans: number; alive: number }[] = [];
  const mainSyncMs: number[] = [];
  const workerWaitMs: number[] = [];
  const prepSyncMs: number[] = [];
  const allTickMs: number[] = [];

  let state = initGame({ villageName: 'Balanceville', size: MapSize.Large });
  const simFocus = getSimFocus(state);

  const workerBoot = await initSimWorkerHost(state);
  const workerHost = workerBoot.host;
  state = workerBoot.state;
  const initCaps = storageCapsForProfile(SIM_PROFILE);
  const startWood = Math.min(
    SIM_PROFILE === 'town' ? 4000 : SIM_PROFILE === 'eco' ? 3500 : 2500,
    initCaps.wood,
  );
  state.resources.food = SIM_PROFILE === 'town' ? 1100 : 900;
  state.resources.wood = startWood;
  state.resources.stone = 1800;
  state.resources.gold = 450;
  state.maxHumanPopulation = SIM_PROFILE === 'town' ? 100 : SIM_PROFILE === 'eco' ? 80 : 55;
  state.storageMax = {
    ...state.storageMax,
    food: initCaps.food,
    wood: initCaps.wood,
    stone: initCaps.stone,
  };

  const cx = state.width / 2;
  const cy = state.height / 2;
  const scheduled = buildScheduledSupports(SIM_PROFILE);
  let lastYear = state.year;
  let lastSeason: Season | null = null;
  let lastDayInYear = state.dayInYear;
  let playerDeathsCumulative = 0;
  let playerBirthsCumulative = 0;

  const start = performance.now();
  let lastProgressTick = 0;

  logger.live(`=== Wilderfolk ${SIM_YEARS}-year balance simulation (live) ===`);
  logger.live(
    SIM_USE_WORKER
      ? simHeadless()
        ? 'Tick engine: worker_threads (headless — syncSimPrep, no render SoA)'
        : 'Tick engine: worker_threads (full importSave + render SoA — playability path)'
      : 'Tick engine: main-thread gameTick (SIM_USE_WORKER=0 legacy debug path)',
  );
  if (SIM_USE_WORKER) {
    logger.live(
      'Perf note: worker path is ~4× slower wall time — validates live-game protocol, not balance throughput.'
      + ' For fast runs use: npm run simulate:10year (main-thread default).',
    );
  } else {
    logger.live('Perf: main-thread ticks (fast balance path). Worker validation: npm run simulate:10year:worker');
  }
  logger.live(`Profile: ${SIM_PROFILE} — ${profileCfg.label}`);
  const names = getNamePoolInfo();
  logger.live(
    names.full
      ? `Name pool: full lists (${names.male} male, ${names.female} female, ${names.last} surnames)`
      : `Name pool: embedded fallback (${names.male} male, ${names.female} female — expect repeats like Ezra & Hannah)`,
  );
  logger.live(`Targets @ Y${SIM_YEARS}: pop ${scaledPopGateMin()}–${scaledPopGateMax()}`);
  logger.live(`Target: ${formatRunLength(TOTAL_TICKS)} | map ${state.width}×${state.height}`);
  if (IS_SMOKE_RUN) {
    const winterNote = HAS_SCHEDULED_WINTER
      ? 'on'
      : `off (winter starts tick ${FIRST_WINTER_TICK}, smoke run is ${TOTAL_TICKS})`;
    logger.live(
      `⚠ Smoke run — NOT the ${SIM_YEARS}-year balance test. Unset SIM_MAX_TICKS for official verdict`
      + ` (${FULL_BALANCE_TICKS} ticks = ${SIM_YEARS} years).`,
    );
    logger.live(
      `Smoke gates: Y${SIM_YEARS}/pop-range skipped; winter=${winterNote};`
      + ` diplomacy=${HAS_SCHEDULED_DIPLOMACY ? 'on' : 'off'};`
      + ` raids=${HAS_SCHEDULED_RAIDS ? 'on' : 'off'}`,
    );
  }
  logger.live(`Progress every ${PROGRESS_EVERY} ticks (~${(PROGRESS_EVERY / TICKS_PER_DAY).toFixed(0)} game days)`);
  logger.live(
    `Build mode: free — auto_build every 36 ticks, coverage sweep every 96 ticks`
    + ` (${expectedBuildingTypeCount()} types); placements stream live as 🏗️`,
  );
  if (SIM_LOG_LIFE) {
    logger.live(`Life events: live → ${logger.getLifeLogPath()} (pregnancies, births, deaths, marriages, scandals, prison)`);
  }
  logger.live('');

  for (let t = 1; t <= TOTAL_TICKS; t++) {
    for (const action of scheduled) {
      if (action.at === t) {
        const result = action.fn(state);
        state = result.state;
        actionLog.push({
          tick: t,
          category: 'scheduled',
          action: action.label,
          ok: result.ok,
          detail: result.detail,
        });
        if (SIM_VERBOSE || action.at >= TICKS_PER_YEAR) {
          const suffix = result.ok ? '' : ` [FAILED${result.detail ? `: ${result.detail}` : ''}]`;
          logger.live(`  → scheduled tick ${t}: ${action.label}${suffix}`);
        }
      }
    }

    state = tickCoverageInjections(state, t, actionLog, logger);

    const buildLogBefore = actionLog.length;

    // Order matters: research/forge first, then frontier responses (fresh eligibility),
    // then growth/placement which spend resources.
    state = autoResearch(state, coverage, actionLog);
    state = autoForge(state, coverage, actionLog);
    state = autoDiplomacy(state, coverage, actionLog);
    state = autoRaidResponse(state, coverage, actionLog);
    state = autoVisitors(state, coverage, actionLog);
    if (t % 72 === 0) {
      state = autoRivalActions(state, coverage, actionLog, frontierTracker);
    }
    if (t % 36 === 0) {
      state = autoBuildFree(state, cx, cy, coverage, actionLog);
    }
    if (t % 60 === 0) {
      state = autoProfileGrowth(state, cx, cy, actionLog);
    }
    if (t % 96 === 0) {
      state = autoPlaceUnbuiltTypes(state, cx, cy, coverage, actionLog);
    }
    state = autoStaffAllBuildings(state);
    drainBuildActions(logger, actionLog, buildLogBefore);

    const woodBeforeTick = state.resources.wood;
    const popBeforeTick = state.humanPopulation;
    const eventLogLenBefore = state.eventLog.length;
    let pregnanciesBefore: PregnancySnap | undefined;
    if (SIM_LOG_LIFE) pregnanciesBefore = snapshotPregnancies(state);

    const tickStart = performance.now();
    const tickResult = await advanceSimTick(state, simFocus, workerHost);
    state = tickResult.state;
    if (tickResult.timing) {
      prepSyncMs.push(tickResult.timing.importMs);
      mainSyncMs.push(tickResult.timing.mainSyncMs);
      workerWaitMs.push(tickResult.timing.workerWaitMs);
    }
    pruneEventLog(state);
    frontierTracker.scanIncoming(state);
    allTickMs.push(performance.now() - tickStart);

    if (SIM_LOG_LIFE && pregnanciesBefore) {
      drainLifeEvents(logger, pregnanciesBefore, eventLogLenBefore, state);
      logger.flushLifeBuffers();
    }

    const playerDeathsThisTick = countNewPlayerDeaths(eventLogLenBefore, state);
    playerDeathsCumulative += playerDeathsThisTick;
    playerBirthsCumulative += countNewEventLogType(eventLogLenBefore, state, 'birth');

    if (state.dayInYear >= PRE_WINTER_DAY && state.dayInYear < WINTER_START_DAY && lastDayInYear < PRE_WINTER_DAY) {
      state = topUpPreWinterStockpile(state, SIM_PROFILE);
      winterTracker.capturePreWinter(state);
      const pop = state.humanPopulation;
      const woodNeedDay = getWoodNeedPerDay(pop);
      const woodNeedWinter = getWinterWoodNeed(pop);
      const woodBufferDays = woodNeedDay > 0 ? Math.floor(state.resources.wood / woodNeedDay) : 999;
      const foodPerCap = pop > 0 ? state.resources.food / pop : 0;
      logger.live(
        `  📋 Pre-winter Y${state.year} day ${PRE_WINTER_DAY} | pop=${pop}/${state.maxHumanPopulation} beds=${getTotalBedsCached(state)}`
        + ` food=${Math.floor(state.resources.food)} (${foodPerCap.toFixed(1)}/cap) wood=${Math.floor(state.resources.wood)}`
        + ` buffer=${woodBufferDays}d need=${woodNeedWinter}`,
      );
    }
    const season = getSeason(state.dayInYear);
    if (season === Season.Winter) {
      winterTracker.recordWinterDeaths(playerDeathsThisTick);
      winterTracker.onWinterIntraDay(state);
      if (state.tick % TICKS_PER_DAY === 0) {
        winterTracker.onWinterCalendarDayEnd(state, woodBeforeTick, popBeforeTick);
      }
    }

    if (state.year !== lastYear) {
      const yearSweepBefore = actionLog.length;
      for (let sweep = 0; sweep < 4; sweep++) {
        const typesBefore = getCompletedBuildingTypes(state).size;
        state = autoPlaceUnbuiltTypes(state, cx, cy, coverage, actionLog);
        state = simInstantCompleteInProgress(state);
        if (getCompletedBuildingTypes(state).size === typesBefore) break;
      }
      drainBuildActions(logger, actionLog, yearSweepBefore);
      const snap = captureYearSnapshot(state, playerDeathsCumulative, frontierTracker);
      yearSnapshots.push(snap);
      syncResearchCoverage(state, coverage);
      syncBuildingCoverage(state, coverage);
      syncForgeCoverage(state, coverage);
      logger.progressYear(
        t,
        state.year,
        `YEAR END | pop=${snap.pop} ${snap.resources} eco=${snap.eco}% rep=${snap.rep}`
        + ` | buildings=${snap.buildings} [${snap.buildingTypes}]`
        + ` rivals=${snap.rivals} playerDeaths=${snap.playerDeaths}`,
      );
      lastYear = state.year;
    }

    if (lastSeason !== null && lastSeason !== Season.Winter && season === Season.Winter) {
      const e = winterTracker.onWinterEnter(state, playerDeathsCumulative);
      logger.live(
        `  ❄ Winter Y${state.year} day ${e.day} ENTER | pop=${e.pop}/${e.maxPop} beds=${e.beds}`
        + ` food=${e.food} wood=${e.wood} need=${e.woodNeedDay}/d (${e.woodNeedWinter} total)`
        + ` buffer=${e.woodBufferDays}d eco=${e.eco}%`,
      );
    }
    if (lastSeason === Season.Winter && season !== Season.Winter) {
      const rec = winterTracker.onWinterExit(state, playerDeathsCumulative);
      if (rec) {
        logger.live(
          `  ❄ Winter Y${rec.year} EXIT ${rec.passed ? 'PASS' : 'FAIL'}`
          + ` | minFood=${rec.minFood} minWood=${rec.minWood} minPop=${rec.minPop}`
          + ` playerDeaths=${rec.playerDeathsInWinter} netLoss=${rec.netPopLoss}`
          + ` heatingFail=${rec.heatingFailDays}d`
          + (rec.failReasons.length ? ` — ${rec.failReasons.join('; ')}` : ''),
        );
      }
    }
    lastSeason = season;
    lastDayInYear = state.dayInYear;

    if (t - lastProgressTick >= PROGRESS_EVERY) {
      const recentMs = allTickMs.slice(-Math.min(PROGRESS_EVERY, allTickMs.length));
      const avgRecent = recentMs.length
        ? recentMs.reduce((a, b) => a + b, 0) / recentMs.length
        : 0;
      const beds = getTotalBedsCached(state);
      let aliveEntities = 0;
      for (const e of state.entities) if (e.alive) aliveEntities++;
      logger.progress(
        t,
        state.year,
        state.dayInYear,
        `pop=${state.humanPopulation}/${state.maxHumanPopulation} beds=${beds}`
        + ` food=${Math.floor(state.resources.food)} wood=${Math.floor(state.resources.wood)}`
        + ` eco=${state.ecosystemHealth}%`
        + ` entities=${aliveEntities}`
        + ` | ${formatBuildingLiveSummary(state, coverage)}`
        + ` | ${frontierTracker.formatProgress()}`
        + ` | avg ${avgRecent.toFixed(2)}ms/tick`,
      );
      lastProgressTick = t;
    }

    if (t % PERF_SAMPLE_EVERY === 0) {
      let alive = 0;
      for (const e of state.entities) if (e.alive) alive++;
      perfSamples.push({
        tick: t,
        ms: allTickMs[allTickMs.length - 1],
        humans: state.humanPopulation,
        alive,
      });
    }
  }

  winterTracker.forceCloseOpenWinter(state, playerDeathsCumulative);

  const finalSweepBefore = actionLog.length;
  state = ensureFullBuildingCoverage(state, cx, cy, coverage, actionLog);
  drainBuildActions(logger, actionLog, finalSweepBefore);
  syncResearchCoverage(state, coverage);
  syncBuildingCoverage(state, coverage);
  syncForgeCoverage(state, coverage);

  const elapsed = ((performance.now() - start) / 1000).toFixed(1);
  const humans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
  const overall = summarizeTickMs(allTickMs);
  const syncOverall = summarizeTickMs(mainSyncMs);
  const workerOverall = summarizeTickMs(workerWaitMs);
  const completedBuildings = state.buildings.filter((b) => b.completed && b.faction !== 'rival');
  const log = state.eventLog;
  const combatEvents = log.filter((e) => e.type === 'combat').length;
  const tradeEvents = log.filter((e) => e.type === 'trade').length;
  const researchEvents = log.filter((e) => e.type === 'research').length;

  logger.live(`\n✓ Simulation complete in ${elapsed}s`);
  logger.log(`=== Wilderfolk ${SIM_YEARS}-year balance simulation ===`);
  logger.log(`Profile: ${SIM_PROFILE} — ${profileCfg.label}`);
  logger.log(`Targets @ Y${SIM_YEARS}: pop ${scaledPopGateMin()}–${scaledPopGateMax()}`);
  logger.log(`Ticks: ${formatRunLength(TOTAL_TICKS)} | Wall time: ${elapsed}s`);
  logger.log(`Calendar: Year ${state.year}, Day ${state.dayInYear} | Total days: ${Math.floor(state.tick / TICKS_PER_DAY)}`);
  logger.log(`Map: ${state.width}×${state.height} (large)`);
  logger.log(`Housing: ${getTotalBedsCached(state)} beds | maxPop=${state.maxHumanPopulation}`);

  logger.section('Year-by-year snapshots');
  for (const y of yearSnapshots) {
    logger.log(
      `Y${y.year} tick=${y.tick} | pop=${y.pop} | ${y.resources} | eco=${y.eco}% (≥80% streak=${y.ecoYears80}y)`
      + ` | rep=${y.rep} | ${y.militia} | grazing=${y.grazing}`
      + ` | buildings=${y.buildings} [${y.buildingTypes}]`
      + ` raids_on=${y.raidsOnVillage} raids_out=${y.raidsInitiated}`
      + ` dip_on=${y.diplomacyOnVillage} dip_out=${y.diplomacyInitiated}`
      + ` | visitors=${y.visitors} rivals=${y.rivals} playerDeaths=${y.playerDeaths}`,
    );
  }

  logger.section(`Winter log (${SIM_YEARS}-year test judgment)`);
  const winterLines = winterTracker.formatReport();
  if (winterLines.length === 0) {
    logger.log('(no winters captured)');
  } else {
    for (const line of winterLines) logger.log(line);
  }

  logger.section('End state — population');
  logger.log(`Camp population: ${humans.length} (adults ${humans.filter((h) => !h.isJuvenile).length}, children ${humans.filter((h) => h.isJuvenile).length})`);
  logger.log(`Village leader id: ${state.villageLeaderId ?? 'none'} | last election year: ${state.lastElectionYear}`);
  logger.log(`Player deaths (entity-tracked): ${playerDeathsCumulative} | births: ${playerBirthsCumulative}`);
  logger.log(`Death events in log (all entities): ${log.filter((e) => e.type === 'death').length}`);

  logger.section('Prison & scandal');
  for (const line of formatPrisonReport(state, log)) logger.log(line);

  logger.section('Combat & raids');
  for (const line of formatCombatReportLines(log, actionLog)) logger.log(line);

  logger.section('Building inventory');
  for (const line of formatBuildingInventoryReport(state, coverage)) logger.log(line);

  logger.section('Build chronicle (automated placements)');
  for (const line of formatBuildChronicle(actionLog)) logger.log(line);

  logger.section('End state — village & frontier');
  logger.log(`Completed buildings: ${completedBuildings.length}`);
  logger.log(`Building types placed: ${formatBuildingTypesLine(state)}`);
  logger.log(`Resources: ${resourceSnapshot(state)}`);
  logger.log(`Reputation: ${state.villageReputation} | Ecosystem: ${state.ecosystemHealth}% | eco≥80% years: ${state.ecoHealthYearsAbove80}`);
  logger.log(`Wildlife: rabbits=${state.wildlifeCounts.rabbits} deer=${state.wildlifeCounts.deer} wolves=${state.wildlifeCounts.wolves} grass=${state.wildlifeCounts.grass}`);
  const wallSegments = countCompletedDefenseBuildings(state.buildings, [
    BuildingType.Wall, BuildingType.WallCorner, BuildingType.WallGate,
  ]);
  logger.log(
    `Militia: ${militiaSnapshot(state)} | raw strength=${getMilitiaStrength(state, state.entities)}`
    + ` barricade=${getBarricadeStrength(state, state.entities)} (+${getWallSegmentBonus(state.buildings, state)} from ${wallSegments} wall segments)`,
  );
  const forged = FORGE_ORDERS.filter((o) => isForgeOrderComplete(state.villageForge, o.id)).map((o) => o.id).join(',') || 'none';
  logger.log(`Forge: forged=[${forged}] active=${state.villageForge.activeOrder ?? 'none'}`);
  logger.log(`Researched: ${state.researchNodes.filter((n) => n.researched).map((n) => n.id).join(', ') || '(none)'}`);
  logger.log(`Rivals (${state.rivalSettlements.length}): ${state.rivalSettlements.map((r) => `${r.name}[${r.relationship} pop=${r.population}]`).join('; ') || 'none'}`);

  syncResearchCoverage(state, coverage);
  syncBuildingCoverage(state, coverage);
  syncForgeCoverage(state, coverage);

  const diplomacyResolved = actionLog.filter((a) => a.category.startsWith('diplomacy_') && a.ok).length;
  const raidsResolved = actionLog.filter((a) => a.category === 'raid_response' && a.ok).length;
  const diplomacyCoverage = Object.keys(EXPECTED_OPTIONS)
    .filter((k) => k.startsWith('diplomacy_'))
    .reduce((n, k) => n + (coverage[k]?.size ?? 0), 0);

  logger.section('Event totals');
  for (const line of formatEventSummaryLines(log)) logger.log(line);
  logger.log(`Player deaths (entity-tracked): ${playerDeathsCumulative} | births (log): ${playerBirthsCumulative}`);
  logger.log(`Combat events: ${combatEvents} | Trade events: ${tradeEvents} | Research events: ${researchEvents}`);
  logger.log(
    `Frontier totals: raids on village=${frontierTracker.incomingRaids} player raids=${frontierTracker.outgoingRaids}`
    + ` | diplomacy on village=${frontierTracker.incomingDiplomacy} player diplomacy=${frontierTracker.outgoingDiplomacy}`,
  );
  logger.log(`Diplomacy responses: ${diplomacyResolved} (coverage choices=${diplomacyCoverage}) | Raid responses: ${raidsResolved} (coverage=${coverage.raid_response?.size ?? 0})`);

  if (SIM_LOG_EVENTS) {
    logger.section('Village chronicle — all events (grouped, oldest first)');
    for (const line of formatGroupedChronicleLines(log)) logger.log(line);
  } else {
    logger.log('\n(Set SIM_LOG_EVENTS=1 to include full weddings/births/deaths listing in this log)');
  }

  const chronicleStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const chronicleEngineTag = SIM_USE_WORKER ? '' : '-mainthread';
  const chroniclePath = process.env.SIM_CHRONICLE_FILE
    ?? join(defaultLogDir, `sim-${SIM_YEARS}year-${SIM_PROFILE}${chronicleEngineTag}-chronicle-${chronicleStamp}.txt`);
  writeChronicleFile(log, buildChronicleMeta(state), chroniclePath);
  if (SIM_LOG_LIFE) {
    logger.log(`Life events log: ${logger.getLifeLogPath()} (${logger.getLifeEventCount()} entries)`);
  }
  logger.log(`\nFlat chronicle export: ${chroniclePath}`);

  logger.section('Option coverage');
  for (const line of covReport(coverage, EXPECTED_OPTIONS)) {
    logger.log(line);
  }

  logger.section('Performance');
  logger.log(
    `Round-trip (harness): avg=${overall.avg.toFixed(2)}ms p50=${overall.p50.toFixed(2)}ms p95=${overall.p95.toFixed(2)}ms max=${overall.max.toFixed(2)}ms`,
  );
  if (SIM_USE_WORKER && mainSyncMs.length > 0) {
    const importOverall = summarizeTickMs(prepSyncMs);
    logger.log(
      `Prep sync (importSave/syncSimPrep): avg=${importOverall.avg.toFixed(2)}ms p50=${importOverall.p50.toFixed(2)}ms`
      + ` p95=${importOverall.p95.toFixed(2)}ms max=${importOverall.max.toFixed(2)}ms`,
    );
    logger.log(
      `Main-thread sync (playability): avg=${syncOverall.avg.toFixed(2)}ms p50=${syncOverall.p50.toFixed(2)}ms`
      + ` p95=${syncOverall.p95.toFixed(2)}ms max=${syncOverall.max.toFixed(2)}ms`,
    );
    logger.log(
      `Worker sim wait (off-thread): avg=${workerOverall.avg.toFixed(2)}ms p50=${workerOverall.p50.toFixed(2)}ms`
      + ` p95=${workerOverall.p95.toFixed(2)}ms max=${workerOverall.max.toFixed(2)}ms`,
    );
  }
  logger.log(`Budget @ 60fps: ${(1000 / 60).toFixed(1)}ms/frame for main-thread sync | @ 10×: ${(1000 / 600).toFixed(2)}ms/tick`);
  for (const s of perfSamples) {
    logger.log(`  tick ${s.tick}: ${s.ms.toFixed(2)}ms | humans=${s.humans} alive=${s.alive}`);
  }

  const winterRecords = winterTracker.getRecords();
  const completeWinterRecords = winterRecords.filter((r) => !r.incomplete);
  const wintersPassed = completeWinterRecords.filter((r) => r.passed).length;
  const wintersTotal = completeWinterRecords.length;
  const popGateMin = scaledPopGateMin();
  const popGateMax = scaledPopGateMax();
  const popInRange = humans.length >= popGateMin && humans.length <= popGateMax;
  const winterGatesApplicable = HAS_SCHEDULED_WINTER && wintersTotal > 0;
  const buildingTypesCompleted = getCompletedBuildingTypes(state).size;
  const buildingTypesExpected = expectedBuildingTypeCount();
  const missingBuildingTypes = ALL_BUILDING_TYPES.filter((type) => {
    if (profileCfg.skipRoadCoverage && type === BuildingType.Road) return false;
    return !coverage.buildings?.has(type);
  });
  const allBuildingTypesBuilt = missingBuildingTypes.length === 0;

  logger.section(`Balance gates — profile: ${SIM_PROFILE}`);
  type BalanceGate = {
    name: string;
    pass: boolean;
    detail: string;
    applicable: boolean;
    skipReason?: string;
  };
  const gates: BalanceGate[] = [
    {
      name: `Reached year ${SIM_YEARS}`,
      applicable: IS_FULL_BALANCE_RUN,
      skipReason: `smoke run — ${SIM_YEARS}-year test needs ${FULL_BALANCE_TICKS} ticks (have ${TOTAL_TICKS})`,
      pass: state.year >= SIM_YEARS,
      detail: `year=${state.year}`,
    },
    {
      name: 'Population alive',
      applicable: true,
      pass: humans.length > 0,
      detail: `pop=${humans.length}`,
    },
    {
      name: 'Food stockpile > 0',
      applicable: true,
      pass: state.resources.food > 0,
      detail: `food=${Math.floor(state.resources.food)}`,
    },
    {
      name: 'All winters survived',
      applicable: winterGatesApplicable,
      skipReason: HAS_SCHEDULED_WINTER
        ? 'no completed winter in run'
        : `run ended before winter (tick ${TOTAL_TICKS} < ${FIRST_WINTER_TICK})`,
      pass: wintersPassed === wintersTotal,
      detail: `${wintersPassed}/${wintersTotal} winters passed`,
    },
    {
      name: 'No winter starvation',
      applicable: winterGatesApplicable,
      skipReason: HAS_SCHEDULED_WINTER
        ? 'no completed winter in run'
        : `run ended before winter (tick ${TOTAL_TICKS} < ${FIRST_WINTER_TICK})`,
      pass: completeWinterRecords.every((r) => r.minFood > 0),
      detail: `min winter food across years: ${completeWinterRecords.length ? Math.min(...completeWinterRecords.map((r) => r.minFood)) : 'n/a'}`,
    },
    {
      name: 'Diplomacy exercised',
      applicable: HAS_SCHEDULED_DIPLOMACY,
      skipReason: `no diplomacy injections scheduled (run < ${INJECTION_SCHEDULE.find((e) => e.injection.type === 'diplomacy')?.tick ?? 'n/a'} ticks)`,
      pass: diplomacyResolved >= 1,
      detail: `responses=${diplomacyResolved}`,
    },
    {
      name: 'Raids exercised',
      applicable: HAS_SCHEDULED_RAIDS,
      skipReason: `no raid injections scheduled (run < ${INJECTION_SCHEDULE.find((e) => e.injection.type === 'raid')?.tick ?? 'n/a'} ticks)`,
      pass: raidsResolved >= 1,
      detail: `responses=${raidsResolved}`,
    },
    {
      name: 'Main-thread sync p95 < 16ms (playability)',
      applicable: true,
      pass: SIM_USE_WORKER ? syncOverall.p95 < 16 : overall.p95 < 16,
      detail: SIM_USE_WORKER
        ? `sync p95=${syncOverall.p95.toFixed(2)}ms (worker wait p95=${workerOverall.p95.toFixed(2)}ms informational)`
        : `p95=${overall.p95.toFixed(2)}ms`,
    },
    {
      name: `All building types built (${buildingTypesExpected})`,
      applicable: IS_FULL_BALANCE_RUN,
      skipReason: `smoke run — ${SIM_YEARS}-year test needs ${FULL_BALANCE_TICKS} ticks (have ${TOTAL_TICKS})`,
      pass: allBuildingTypesBuilt,
      detail: `${buildingTypesCompleted}/${buildingTypesExpected} types`
        + (missingBuildingTypes.length ? ` — missing: ${missingBuildingTypes.join(', ')}` : ''),
    },
  ];

  const applicableGates = gates.filter((g) => g.applicable);
  const skippedGates = gates.filter((g) => !g.applicable);
  const failedGateList: BalanceGate[] = [];

  for (const g of gates) {
    if (!g.applicable) {
      logger.log(`SKIP — ${g.name} (${g.skipReason})`);
      continue;
    }
    logger.log(`${g.pass ? 'PASS' : 'FAIL'} — ${g.name} (${g.detail})`);
    if (!g.pass) failedGateList.push(g);
  }

  const ecoInRange = state.ecosystemHealth >= profileCfg.ecoMin && state.ecosystemHealth <= profileCfg.ecoMax;
  logger.log(
    `INFO — Population target ${popGateMin}–${popGateMax} (pop=${humans.length}, ${popInRange ? 'in range' : 'out of range'}, not a pass gate)`,
  );
  logger.log(
    `INFO — Ecosystem ${profileCfg.ecoMin}–${profileCfg.ecoMax}% (eco=${state.ecosystemHealth}%, ${ecoInRange ? 'in range' : 'out of range'}, not a pass gate)`,
  );

  const failedGates = failedGateList.length;
  const profilePass = failedGates === 0;
  const failedGateSummary = failedGateList.map((g) => `${g.name} (${g.detail})`).join('; ');
  logger.section('VERDICT');
  logger.log(`${profilePass ? 'PASS' : 'FAIL'} — ${SIM_YEARS}-year ${SIM_PROFILE} balance test`);
  logger.log(
    `Gates: ${applicableGates.length} tested, ${skippedGates.length} skipped`
    + (IS_SMOKE_RUN ? ` (smoke run — official test is ${FULL_BALANCE_TICKS} ticks)` : ''),
  );
  if (!profilePass) {
    logger.log(`Failed ${failedGates}/${applicableGates.length} applicable gates:`);
    for (const g of failedGateList) {
      logger.log(`  • ${g.name} — ${g.detail}`);
    }
  }
  if (skippedGates.length > 0 && IS_SMOKE_RUN) {
    logger.log(`Skipped ${skippedGates.length} gates — run the full ${SIM_YEARS}-year test (unset SIM_MAX_TICKS).`);
  }
  const verdictLabel = IS_SMOKE_RUN
    ? `smoke run (${SIM_PROFILE}, ${TOTAL_TICKS} ticks — not the ${SIM_YEARS}-year test)`
    : `${SIM_YEARS}-year ${SIM_PROFILE} balance test`;
  logger.live(
    profilePass
      ? `\n✓ VERDICT: PASS — ${verdictLabel} (${applicableGates.length} gates tested)`
      : `\n✗ VERDICT: FAIL — ${verdictLabel} (${failedGates}/${applicableGates.length} gate failure${failedGates === 1 ? '' : 's'}: ${failedGateSummary})`,
  );

  const missingCategories = covReport(coverage, EXPECTED_OPTIONS).filter((l) => l.includes('missing:'));
  if (missingCategories.length > 0) {
    logger.log(`\nUntested options (${missingCategories.length} categories with gaps):`);
    for (const m of missingCategories) logger.log(`  ${m}`);
  }

  if (SIM_VERBOSE || actionLog.length < 200) {
    logger.section('Player action log');
    for (const a of actionLog) {
      logger.log(
        `tick ${a.tick} [${a.category}] ${a.action} ${a.ok ? 'OK' : 'SKIP'}${a.detail ? ` — ${a.detail}` : ''}`,
      );
    }
  } else {
    logger.log(`\n(Player action log: ${actionLog.length} entries — set SIM_VERBOSE=1 to print all)`);
  }

  const strictCoverageFail = SIM_STRICT_COVERAGE && missingCategories.length > 0;
  if (strictCoverageFail) {
    logger.log(`\nFAIL — strict coverage (${missingCategories.length} categories with gaps)`);
    for (const m of missingCategories) logger.log(`  • ${m}`);
  }

  const mainLogPath = logger.flush(SIM_PROFILE);
  logger.live(`Chronicle export: ${chroniclePath}${mainLogPath ? ` | Main log: ${mainLogPath}` : ''}`);

  disposeSimWorkerHost(workerHost);

  const exitCode = (failedGates > 0 || strictCoverageFail) ? 1 : 0;
  process.exit(exitCode);
}

runSimulation().catch((err) => {
  console.error(err);
  process.exit(1);
});