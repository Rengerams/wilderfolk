/**
 * Dashboard data snapshot — a pure read-only projection of authoritative state
 * for the full-screen, dismissible game dashboard. It never mutates simulation
 * state. The food ledger and rolling history ride the worker delta so the
 * numbers shown here reflect the authoritative sim in both sim modes.
 *
 * It also owns the read-only **inspector explanations** (`explainSettler`, `explainBuildingStaffing`,
 * `explainSettlerMovement`): the selected-building and selected-entity panels render these lines
 * verbatim, so every value and every label is derived here, from the module that owns the rule, and
 * never recomputed in the view.
 */
import type { Building, Entity, Season, WorldState } from './gameTypes';
import { BUILDING_JOB_TYPES, EntityType } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { TICKS_PER_DAY } from './dayCycle';
import { getHourOfDay } from './dayCycleClock';
import { isOnWorkScheduleShift } from './workSchedule';
import { foodSharePct, summarizeFoodLedger } from './economyLedger';
import { isFoodCritical } from './resourceUtils';
import { getEcosystemHealth } from './dailyEcology';
import { computeVillageStats } from './uiSimSummary';
import {
  countHomelessSettlers,
  countResidentsInBuilding,
  getResidenceCapacity,
  hasWorkAssignment,
  isHomelessSettler,
  isResidenceBuildingType,
} from './residencyOccupancy';
import { findHumanWorkplace, isManualStaffingBuilding, isOnConstructionCrew } from './workforce';
import { getBuildingConfig } from './buildingConfig';
import { formatCitizenName } from './citizenId';
import type { HumanActivityTarget } from './humanStatus';
import { getHumanActivityProjection, isAtActivityTarget } from './humanStatus';
import { pickSocialImpulse } from './socialLife';
import { getRouteObstruction } from './pathfinding';
import type { WorkerAssignmentRefusal } from './buildingStaffingActions';
import {
  canAssignWorkerToBuilding,
  getWorkerAssignmentRefusal,
} from './buildingStaffingActions';

export interface DashboardResource {
  key: 'food' | 'wood' | 'stone' | 'gold' | 'iron';
  label: string;
  amount: number;
  cap: number;
}

/**
 * How full a capped resource is, as the 0–100 percentage the dashboard bar draws.
 *
 * Derived here rather than in the dashboard, per this module's contract — "the panel renders
 * numbers, it does not derive them". `GameDashboard` had its own copy of the formula, so a change to
 * what "full" means (headroom vs cap) would have updated the owner and not the bar
 * ("Resource fill %").
 */
export function resourceFillPercent(resource: Pick<DashboardResource, 'amount' | 'cap'>): number {
  if (!(resource.cap > 0)) return 0;
  return Math.min(100, Math.round((resource.amount / resource.cap) * 100));
}

export interface DashboardSettler {
  id: number;
  name: string;
  role: string;
  juvenile: boolean;
  /** Colony work-hours logged so far today (0..24). */
  hoursToday: number;
  energyPct: number;
  /** Adult without an assigned workplace. */
  noWork: boolean;
  /** No residence assigned (homeless). */
  noHome: boolean;
  status: 'working' | 'idle' | 'prison' | 'leader' | 'home' | 'none';
}

export interface HistoryPoint {
  day: number;
  humans: number;
  deer: number;
  rabbits: number;
  wolves: number;
  foxes: number;
  grass: number;
  food?: number;
}

export interface FoodSourceToday {
  label: string;
  amount: number;
  /**
   * This source's share of its side of the day's balance (0–100), computed here rather than in the
   * dashboard: the panel renders numbers, it does not derive them (`LIVE-FINDINGS-STATUS.md`, F2 —
   * "food can't be calculated at the UX").
   */
  sharePct: number;
}

export interface VillageConcern {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  /** Suggested next step (presentation-only; action links follow in a later slice). */
  hint: string;
}

export interface CouncilLine {
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}

export interface DashboardData {
  year: number;
  dayInYear: number;
  season: Season;
  resources: DashboardResource[];
  foodBySourceToday: FoodSourceToday[];
  foodProducedToday: number;
  foodBySourceConsumedToday: FoodSourceToday[];
  foodConsumedToday: number;
  /** Produced − consumed today (negative means the colony ate into stores). */
  netFoodToday: number;
  /** Finished calendar days of food produced by source (rolling, transient). */
  foodDays: Array<{ day: number; total: number; bySource: Record<string, number> }>;
  /** Read-only concern list for the operations overview. */
  concerns: VillageConcern[];
  /** Read-only "daily council" summary lines for the last finished/current day. */
  council: CouncilLine[];
  population: { humans: number; ecoHealth: number; pollution: number; biodiversity: number };
  valleyStage: WorldState['valleyStage'];
  settlers: DashboardSettler[];
  history: HistoryPoint[];
}

const RESOURCE_KEYS: Array<DashboardResource['key']> = ['food', 'wood', 'stone', 'gold', 'iron'];

/** Sum a string-keyed counter record. */
function sumRecord(record: Record<string, number>): number {
  let total = 0;
  for (const key in record) total += record[key] || 0;
  return total;
}

/** % energy of a settler, 0..100. */
function energyPct(e: Entity): number {
  return e.maxEnergy > 0 ? Math.round((e.energy / e.maxEnergy) * 100) : 0;
}

/** Work-hours logged today from the authoritative schedule-worked tick counter. */
function hoursToday(e: Entity): number {
  const ticks = e.scheduleWorkedTicksToday ?? 0;
  return Math.min(24, Math.round((ticks / (TICKS_PER_DAY / 24)) * 10) / 10);
}

function settlerStatus(e: Entity): DashboardSettler['status'] {
  if (e.prisonBuildingId != null) return 'prison';
  if ((e.scheduleWorkedTicksToday ?? 0) > 0) return 'working';
  return 'idle';
}

/** Read-only concern derivation from authoritative state (no simulation writes). */
function deriveConcerns(state: WorldState): VillageConcern[] {
  const concerns: VillageConcern[] = [];
  const food = state.resources?.food ?? 0;
  // The settler counters come from the labour-statistics owner (`uiSimSummary.computeVillageStats`),
  // which the top-bar HUD and the People screen also read; the housing gap comes from the residence
  // owner (`residencyOccupancy.countHomelessSettlers`), which applies the jail exclusion the council
  // report needed. This local scan keeps only the Moon Howler tally, which has no other reader.
  const village = computeVillageStats(state);
  const humans = village.total;
  const imprisoned = village.imprisoned;
  const idleAdults = village.idle;
  const homeless = countHomelessSettlers(state);
  let howlerCursed = 0;
  for (const e of state.entities) {
    if (!e.alive || e.type !== EntityType.Human || !isPlayerHuman(e)) continue;
    if (e.moonHowlerCursed) howlerCursed++;
  }

  if (food <= 0) {
    concerns.push({
      id: 'famine',
      severity: 'critical',
      title: 'No food',
      detail: 'The stores are empty.',
      hint: 'Assign farms/hunting or buy food from visitors before settlers starve.',
    });
  } else if (humans > 0 && isFoodCritical(state)) {
    concerns.push({
      id: 'low_food',
      severity: 'warning',
      title: 'Low food',
      detail: `${food} food for ${humans} settlers.`,
      hint: 'Grow production or ease consumption (work hours / tamed rations).',
    });
  }

  if (homeless > 0) {
    concerns.push({
      id: 'homeless',
      severity: homeless >= humans * 0.5 ? 'critical' : 'warning',
      title: `${homeless} settler${homeless === 1 ? '' : 's'} without a home`,
      detail: 'No completed residence assigned.',
      hint: 'Build and finish Houses (and a Manor for the leader later).',
    });
  }

  if (idleAdults > 0) {
    concerns.push({
      id: 'idle',
      severity: 'info',
      title: `${idleAdults} idle adult${idleAdults === 1 ? '' : 's'}`,
      detail: 'Not assigned to a workplace.',
      hint: 'Open a building and assign workers, or enable auto-staffing.',
    });
  }

  if (imprisoned > 0) {
    concerns.push({
      id: 'prison',
      severity: 'info',
      title: `${imprisoned} prisoner${imprisoned === 1 ? '' : 's'}`,
      detail: 'Held at the Prison.',
      hint: 'Nothing to do — sentences expire on their own.',
    });
  }

  if (howlerCursed > 0) {
    concerns.push({
      id: 'howler',
      severity: 'warning',
      title: 'Moon Howler curse active',
      detail: `${howlerCursed} settler${howlerCursed === 1 ? '' : 's'} will hunt on the next full moon.`,
      hint: 'Staff a Church and keep guards near on full-moon nights.',
    });
  }

  const wolves = state.wildlifeCounts?.wolves ?? 0;
  if (wolves > 8) {
    concerns.push({
      id: 'wolves',
      severity: 'warning',
      title: 'Wolf pressure high',
      detail: `${wolves} wolves in the valley.`,
      hint: 'Barracks soldiers reduce pressure; walls protect the village.',
    });
  }

  const eco = getEcosystemHealth(state);
  if (eco < 40) {
    concerns.push({
      id: 'ecology',
      severity: 'critical',
      title: 'Ecosystem damaged',
      detail: `Health ${eco}/100.`,
      hint: 'Ease hunting/grazing pressure and open the Nature tab for the breakdown.',
    });
  } else if (eco < 70) {
    concerns.push({
      id: 'ecology_soft',
      severity: 'warning',
      title: 'Ecosystem strained',
      detail: `Health ${eco}/100.`,
      hint: 'Balance hunting and farming or the valley stage may drop.',
    });
  }

  if ((state.valleyStage ?? 'stable') !== 'stable') {
    concerns.push({
      id: 'valley',
      severity: 'warning',
      title: `Valley ${state.valleyStage}`,
      detail: 'The valley stage is below stable.',
      hint: 'Restore grass and wildlife balance from the Nature tab.',
    });
  }

  const raids = state.pendingRaidEvents?.length ?? 0;
  const diplomacy = state.pendingDiplomacyEvents?.length ?? 0;
  if (raids > 0) {
    concerns.push({
      id: 'raid',
      severity: 'critical',
      title: `${raids} raid${raids === 1 ? '' : 's'} incoming`,
      detail: 'Rivals are on the way.',
      hint: 'Open the alert and choose a response from the frontier panels.',
    });
  }
  if (diplomacy > 0) {
    concerns.push({
      id: 'diplomacy',
      severity: 'warning',
      title: 'Diplomacy event pending',
      detail: 'A rival envoy awaits a response.',
      hint: 'Answer from the village/frontier overview before it escalates.',
    });
  }

  return concerns;
}

/** Read-only "daily council" summary — a compact day report for the dashboard. */
function deriveCouncil(state: WorldState): CouncilLine[] {
  const lines: CouncilLine[] = [];

  const humans = state.humanPopulation ?? 0;
  const pop = state.populationHistory ?? [];
  const cur = pop[pop.length - 1];
  // A real day ago, not whichever 10-tick sample the buffer happens to hold last.
  const prev = cur
    ? [...pop].reverse().find((s) =>
        s !== cur
        && (s.day != null && cur.day != null
          ? s.day < cur.day
          : s.tick <= cur.tick - TICKS_PER_DAY))
    : undefined;
  const delta = prev && cur ? (cur.humans ?? 0) - (prev.humans ?? 0) : 0;
  lines.push({
    label: 'Settlers',
    value: delta === 0 ? `${humans}` : `${humans} (${delta > 0 ? `+${delta}` : delta} vs yesterday)`,
    tone: delta < 0 ? 'bad' : 'good',
  });

  // Today's ledger balance (produced · consumed · net) is *not* a council line: the dashboard renders
  // those same three numbers in full, from this same ledger, in its "Net food flow today" card.
  // Printing them here as well showed one balance twice on one screen and invited the two to be read
  // as separate claims (`LIVE-FINDINGS-STATUS.md`, F2 — the audit's "contradicts another line in the
  // same panel"). The council keeps the two windows it is the only voice for: the last *finished* day,
  // and the stored level.
  const history = state.foodHistory ?? [];
  const lastDay = history[history.length - 1];
  if (lastDay) {
    const lastNet = sumRecord(lastDay.produced) - sumRecord(lastDay.consumed);
    lines.push({
      label: 'Food, last finished day',
      value: `net ${lastNet >= 0 ? `+${lastNet}` : lastNet}`,
      tone: lastNet < 0 ? 'warn' : 'good',
    });
  }

  if (prev && cur) {
    const foodDelta = (cur.food ?? 0) - (prev.food ?? 0);
    if (foodDelta !== 0 || prev.food !== undefined) {
      lines.push({
        label: 'Food stored',
        value: foodDelta === 0 ? 'unchanged' : `${foodDelta > 0 ? `+${foodDelta}` : foodDelta}`,
        tone: foodDelta < 0 ? 'warn' : 'good',
      });
    }
    const wildlifeBits = (['deer', 'rabbits', 'wolves', 'foxes'] as const)
      .map((key) => {
        const d = (cur[key] ?? 0) - (prev[key] ?? 0);
        return d !== 0 ? `${key} ${d > 0 ? `+${d}` : d}` : '';
      })
      .filter(Boolean);
    if (wildlifeBits.length > 0) {
      lines.push({ label: 'Wildlife', value: wildlifeBits.join(' · '), tone: 'neutral' });
    }
  }

  const day = Math.floor(state.tick / TICKS_PER_DAY);
  const prevStart = (day - 1) * TICKS_PER_DAY;
  const counts = { births: 0, conceptions: 0, deaths: 0, marriages: 0, scandals: 0, prisons: 0, combats: 0 };
  const latest: string[] = [];
  for (const e of state.eventLog) {
    if (e.tick < prevStart || e.tick >= day * TICKS_PER_DAY) continue;
    switch (e.type) {
      // A delivery only — expectations are counted separately so the council
      // report cannot claim more births than children were born.
      case 'birth': counts.births++; break;
      case 'conception': counts.conceptions++; break;
      case 'death': counts.deaths++; break;
      case 'marriage': counts.marriages++; break;
      case 'scandal': counts.scandals++; break;
      // Counted separately from `scandal` on purpose: an imprisonment is the consequence of a
      // scandal, not a second scandal, and the daily report used to show neither.
      case 'prison': counts.prisons++; break;
      case 'combat': counts.combats++; break;
      default: break;
    }
    // `GameEventLog` carries `message` (`eventLog.ts` is the only writer); the old `title` cast silenced
    // the compiler and read a field that never exists, so the "Notices" row below was dead
    // (`LIVE-FINDINGS-STATUS.md`, F24).
    if (e.message && latest.length < 3) latest.push(e.message);
  }
  const hasEvents =
    counts.births + counts.conceptions + counts.deaths + counts.marriages
    + counts.scandals + counts.prisons + counts.combats > 0;
  lines.push({
    label: 'Life events',
    value: hasEvents
      ? `Births ${counts.births} · Expecting ${counts.conceptions} · Deaths ${counts.deaths} · Marriages ${counts.marriages} · Scandals ${counts.scandals} · Jailed ${counts.prisons} · Combat ${counts.combats}`
      : 'quiet day',
    tone: counts.deaths > 0 || counts.scandals > 0 || counts.prisons > 0 ? 'warn' : 'neutral',
  });

  const concerns = deriveConcerns(state);
  const critical = concerns.filter((c) => c.severity === 'critical').length;
  const warnings = concerns.filter((c) => c.severity === 'warning').length;
  lines.push({
    label: 'Open concerns',
    value: `${critical} critical · ${warnings} warnings · ${concerns.length - critical - warnings} info`,
    tone: critical > 0 ? 'bad' : warnings > 0 ? 'warn' : 'good',
  });

  if (latest.length > 0) {
    lines.push({ label: 'Notices', value: latest.join(' · '), tone: 'neutral' });
  }

  return lines;
}

/** Single-pass read-only snapshot for the dashboard. */
export function collectDashboard(state: WorldState): DashboardData {
  const resources: DashboardResource[] = RESOURCE_KEYS.map((key) => ({
    key,
    label: key === 'iron' ? 'Iron' : key[0].toUpperCase() + key.slice(1),
    amount: state.resources?.[key] ?? 0,
    cap: state.storageMax?.[key] ?? 0,
  }));

  // The day's balance comes from the ledger owner, which is the only place that sums it — the view
  // must not do food arithmetic, and the village panel renders the same function
  // (`LIVE-FINDINGS-STATUS.md`, F2).
  const foodLedger = summarizeFoodLedger(state);
  const foodBySourceToday: FoodSourceToday[] = foodLedger.produced.map((row) => ({
    label: row.source,
    amount: row.amount,
    sharePct: foodSharePct(row.amount, foodLedger.producedTotal),
  }));
  const foodBySourceConsumedToday: FoodSourceToday[] = foodLedger.consumed.map((row) => ({
    label: row.source,
    amount: row.amount,
    sharePct: foodSharePct(row.amount, foodLedger.consumedTotal),
  }));
  const foodProducedToday = foodLedger.producedTotal;
  const foodConsumedToday = foodLedger.consumedTotal;

  const settlers: DashboardSettler[] = [];
  for (const e of state.entities) {
    if (!e.alive || e.type !== EntityType.Human || !isPlayerHuman(e)) continue;
    const role =
      e.occupation && e.occupation !== 'settler'
        ? e.occupation
        : (e.job ?? 'settler');
    settlers.push({
      id: e.id,
      name: [e.name, e.surname].filter(Boolean).join(' '),
      role,
      juvenile: e.isJuvenile,
      hoursToday: hoursToday(e),
      energyPct: energyPct(e),
      // A settler stationed on an unfinished site is working, not idle — the same crew predicate the
      // counters above use (`buildingStaffingActions.isOnConstructionCrew`).
      noWork: !e.isJuvenile && !hasWorkAssignment(e) && !isOnConstructionCrew(state.buildings, e.id) && e.prisonBuildingId == null,
      // A prisoner is neither homeless nor idle: imprisonment clears residence and workplace on
      // purpose, so that absence is not a player-actionable gap (same rule as `noWork` above, and the
      // residence owner's own {@link isHomelessSettler}).
      noHome: isHomelessSettler(e),
      status: settlerStatus(e),
    });
  }
  settlers.sort((a, b) => Number(b.role === 'settler') - Number(a.role === 'settler'));

  const history: HistoryPoint[] = (state.populationHistory ?? []).slice(-30).map((p) => ({
    day: p.day ?? Math.floor(p.tick / TICKS_PER_DAY),
    humans: p.humans ?? 0,
    deer: p.deer ?? 0,
    rabbits: p.rabbits ?? 0,
    wolves: p.wolves ?? 0,
    foxes: p.foxes ?? 0,
    grass: p.grass ?? 0,
    food: p.food,
  }));

  return {
    year: state.year,
    dayInYear: state.dayInYear,
    season: state.season,
    resources,
    foodBySourceToday,
    foodProducedToday,
    foodBySourceConsumedToday,
    foodConsumedToday,
    netFoodToday: foodLedger.net,
    population: {
      humans: state.humanPopulation ?? 0,
      ecoHealth: getEcosystemHealth(state),
      pollution: state.pollutionLevel ?? 0,
      biodiversity: state.biodiversityIndex ?? 0,
    },
    valleyStage: state.valleyStage ?? 'stable',
    foodDays: (state.foodHistory ?? []).map((sample) => ({
      day: sample.day,
      total: Object.values(sample.produced).reduce((sum, amount) => sum + amount, 0),
      bySource: { ...sample.produced },
    })),
    concerns: deriveConcerns(state),
    council: deriveCouncil(state),
    settlers,
    history,
  };
}

export interface SettlerExplanationLine {
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'neutral';
}

/**
 * Read-only "why is this settler where/what they are" explanation. Uses only
 * authoritative WorldState — no writes, no commands.
 */
export function explainSettler(state: WorldState, id: number): SettlerExplanationLine[] {
  const lines: SettlerExplanationLine[] = [];
  const settler = state.entities.find((e) => e.id === id && e.alive && isPlayerHuman(e));
  if (!settler) {
    return [{ label: 'Settler', value: 'Not found or no longer alive.', tone: 'warn' }];
  }

  const schedule = state.workSchedule;
  lines.push({
    label: 'Schedule',
    value: schedule
      ? `${schedule.startHour}:00 – ${schedule.endHour}:00`
      : 'default 07:00 – 16:00',
    tone: 'neutral',
  });

  const workplace = settler.homeBuildingId != null
    ? state.buildings.find((b) => b.id === settler.homeBuildingId)
    : undefined;
  const residence = settler.residenceBuildingId != null
    ? state.buildings.find((b) => b.id === settler.residenceBuildingId)
    : undefined;

  if (settler.prisonBuildingId != null) {
    const prison = state.buildings.find((b) => b.id === settler.prisonBuildingId);
    lines.push({
      label: 'Prison',
      value: `Detained at ${prison?.type ?? 'the Prison'}${settler.prisonerUntilTick != null ? ` until tick ${settler.prisonerUntilTick}` : ''}.`,
      tone: 'warn',
    });
  } else if (settler.isJuvenile) {
    lines.push({
      label: 'Stage',
      value: `Child${settler.motherId != null || settler.fatherId != null ? ' — lives with family' : ' — no parents at home'}.`,
      tone: 'neutral',
    });
  } else if (workplace) {
    lines.push({
      label: 'Workplace',
      value: workplace.completed
        ? `${workplace.type}${workplace.occupants.length > 1 ? ` with ${workplace.occupants.length} occupants` : ''}`
        : `${workplace.type} (still under construction)`,
      tone: workplace.completed ? 'good' : 'warn',
    });
  } else {
    lines.push({
      label: 'Workplace',
      value: 'Not assigned to a workplace.',
      tone: (state.resources?.food ?? 0) <= 0 ? 'warn' : 'neutral',
    });
  }

  lines.push({
    label: 'Home',
    value: residence ? `Lives at ${residence.type}.` : 'No home assigned.',
    tone: residence ? 'good' : 'warn',
  });

  const workedToday = hoursToday(settler);
  lines.push({
    label: 'Work today',
    value: workedToday > 0 ? `${workedToday}h logged` : 'no work logged yet',
    tone: workedToday > 0 ? 'good' : 'neutral',
  });

  lines.push({
    label: 'Energy',
    value: `${energyPct(settler)}%`,
    tone: energyPct(settler) < 30 ? 'warn' : 'neutral',
  });

  const status = settlerStatus(settler);
  if (status === 'idle' && !settler.isJuvenile) {
    lines.push({
      label: 'Why idle',
      value:
        (state.resources?.food ?? 0) <= 0
          ? 'Stores are empty — a settler will hunt in a famine.'
          : 'Outside work hours or free time with nothing scheduled.',
      tone: 'neutral',
    });
  }

  if (!workplace && !settler.isJuvenile && settler.prisonBuildingId == null) {
    lines.push({
      // Distinct from the housing suggestion below: both fired for a jobless *and* homeless settler
      // under the same label, which made the two rows a duplicate React key and could drop one
      // (`LIVE-FINDINGS-STATUS.md`, F25).
      label: 'Suggested workplace',
      value: 'Assign them to a staffed building (Farm, Hunting Spot, Mill, …).',
      tone: 'warn',
    });
  }
  // The same guard the workplace suggestion above carries: an arrest clears both links, so a
  // prisoner has no residence by design and this advice cannot be followed while the sentence runs
  // (BUG_REPORTS/2026-09-17-prisoners-count-as-idle-and-homeless.md).
  if (!residence && settler.prisonBuildingId == null) {
    lines.push({
      label: 'Suggested home',
      value: 'Build and finish a House so they have somewhere to sleep.',
      tone: 'warn',
    });
  }

  return lines;
}

/**
 * Player-facing wording for the staffing owner's refusal vocabulary (`Roadmap_V0_6.4.1.MD` line 25).
 *
 * The key type is derived from `getWorkerAssignmentRefusal`, so adding a gate there is a missing entry
 * here — a compile error — rather than an `undefined` on screen. Same split as
 * `buildingPlacementLabels`: the owner decides *why*, this decides how to say it.
 */
const STAFFING_REFUSAL_LABELS: Record<WorkerAssignmentRefusal, string> = {
  'unknown-building': 'That building no longer exists.',
  'unknown-settler': 'That settler is no longer in the valley.',
  'rival-building': 'A rival camp is not yours to staff.',
  'residence-building': 'Homes fill themselves — build a House and people move in.',
  'building-full': 'Every slot here is taken.',
  'building-has-no-job': 'This building takes no workers.',
  'not-a-settler': 'Only your own settlers take a job here.',
  'settler-dead': 'They are dead.',
  juvenile: 'Children do not take jobs.',
  'already-assigned': 'Already working elsewhere — free them from that post first.',
  imprisoned: 'In prison — the post opens when the sentence ends.',
  'on-another-crew': 'Already on another construction crew.',
};

/** One settler the staffing owner refuses, with the owner's own reason and its player-facing label. */
export interface StaffingRefusal {
  settlerId: number;
  name: string;
  /** The owner's answer, verbatim — never re-derived by the projection or the view. */
  reason: WorkerAssignmentRefusal;
  label: string;
}

/** Read-only staffing answer for the selected building (`Roadmap_V0_6.4.1.MD` line 25). */
export interface BuildingStaffingExplanation {
  /** 'auto' when the daily staffing pass fills this building, 'manual' when only the player does. */
  mode: 'auto' | 'manual';
  /** Worker/resident slots the cap applies to — the same number the staffing command checks. */
  capacity: number;
  workerCount: number;
  /** True when the staffing owner would accept somebody (`canAssignWorkerToBuilding`). */
  acceptsWorker: boolean;
  /** One entry per requested settler the owner refuses. */
  refusals: StaffingRefusal[];
  lines: SettlerExplanationLine[];
}

function buildingLabel(building: Building): string {
  return getBuildingConfig(building.type).label;
}

/** The settler ids holding this building's slots, in roster order. */
function buildingWorkerIds(state: WorldState, building: Building): number[] {
  if (building.completed && isResidenceBuildingType(building.type)) {
    return state.entities
      .filter((entity) => entity.alive && isPlayerHuman(entity) && entity.residenceBuildingId === building.id)
      .map((entity) => entity.id);
  }
  return building.occupants;
}

function settlerName(state: WorldState, id: number): string {
  const entity = state.entities.find((candidate) => candidate.id === id);
  return entity ? formatCitizenName(entity) : `#${id}`;
}

/**
 * Read-only staffing explanation for one building: auto/manual mode, capacity, the current workers,
 * and — for any settler the caller names — the staffing owner's own reason for refusing them.
 *
 * Every rule comes from its owner: the mode from `workforce.isManualStaffingBuilding`, the cap from
 * `BUILDING_CONFIGS` / `residencyOccupancy.getResidenceCapacity`, the roster from
 * `residencyOccupancy` / the building's occupant list, and the refusals from
 * `buildingStaffingActions.getWorkerAssignmentRefusal`. The panel only renders {@link lines}.
 */
export function explainBuildingStaffing(
  state: WorldState,
  buildingId: number,
  settlerIds: readonly number[] = [],
): BuildingStaffingExplanation {
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building) {
    return {
      mode: 'auto',
      capacity: 0,
      workerCount: 0,
      acceptsWorker: false,
      refusals: [],
      lines: [{ label: 'Staffing', value: 'That building no longer exists.', tone: 'warn' }],
    };
  }

  const isResidence = building.completed && isResidenceBuildingType(building.type);
  const takesStaff = !building.completed || BUILDING_JOB_TYPES[building.type] !== undefined;
  const mode: 'auto' | 'manual' = isManualStaffingBuilding(building) ? 'manual' : 'auto';
  const capacity = isResidence
    ? getResidenceCapacity(building)
    : getBuildingConfig(building.type).maxOccupants;
  const workerIds = buildingWorkerIds(state, building);
  const workerCount = isResidence
    ? countResidentsInBuilding(state.entities, building.id)
    : workerIds.length;

  const refusals: StaffingRefusal[] = [];
  for (const settlerId of settlerIds) {
    const reason = getWorkerAssignmentRefusal(state, buildingId, settlerId);
    if (!reason) continue;
    refusals.push({
      settlerId,
      name: settlerName(state, settlerId),
      reason,
      label: STAFFING_REFUSAL_LABELS[reason],
    });
  }

  const slotWord = isResidence ? 'residents' : building.completed ? 'workers' : 'builders';
  const lines: SettlerExplanationLine[] = [];
  lines.push({
    label: 'Mode',
    value: isResidence
      ? 'Auto — residents move in on their own.'
      : mode === 'manual'
        ? 'Manual — only you assign workers here.'
        : 'Auto — the daily staffing pass fills this building.',
    tone: 'neutral',
  });
  lines.push({
    label: 'Capacity',
    value: `${workerCount} / ${capacity} ${slotWord}`,
    tone: workerCount >= capacity && capacity > 0 ? 'warn' : 'neutral',
  });
  lines.push({
    label: 'Assigned',
    value: workerCount > 0
      ? workerIds.map((id) => settlerName(state, id)).join(' · ')
      : 'Nobody assigned yet.',
    tone: workerCount > 0 ? 'good' : 'neutral',
  });
  for (const refusal of refusals) {
    lines.push({ label: `Cannot assign ${refusal.name}`, value: refusal.label, tone: 'warn' });
  }
  // The owner's "nobody can be taken" verdict, in the owner's terms: the building wants staff and has
  // an open slot, yet no settler is free for it.
  const acceptsWorker = canAssignWorkerToBuilding(state, buildingId);
  if (takesStaff && !isResidence && workerCount < capacity && !acceptsWorker) {
    lines.push({
      label: 'Cannot add workers',
      value: 'No settler is free to take this post — recruit, or free someone from another job.',
      tone: 'warn',
    });
  }

  return { mode, capacity, workerCount, acceptsWorker, refusals, lines };
}

export type SettlerRouteStopKind = 'home' | 'workplace' | 'venue';

/** One named stop on a settler's day route. Names come from `BUILDING_CONFIGS`, never from the view. */
export interface SettlerRouteStop {
  kind: SettlerRouteStopKind;
  label: string;
  buildingId: number;
}

export type SettlerMovementStatus =
  /** No leg in progress — nothing for the path owner to report. */
  | 'none'
  /** The straight line is walkable. */
  | 'clear'
  /** The line is blocked but the walk is routed around it. */
  | 'rerouting'
  /** The line is blocked and no route exists. */
  | 'blocked';

/** Read-only movement answer for the selected settler (`Roadmap_V0_6.4.1.MD` line 27). */
export interface SettlerMovementExplanation {
  /** The day's stops in the order the simulation takes them: home → workplace → venue → home. */
  stops: SettlerRouteStop[];
  /** Index in {@link stops} of the stop being walked to, or `null` when no leg is in progress. */
  legIndex: number | null;
  /** `"House → Lumber Mill"` for the current leg, or `null` when there is none. */
  legLabel: string | null;
  status: SettlerMovementStatus;
  lines: SettlerExplanationLine[];
}

/** Index of the last stop matching `predicate`, or -1. */
function lastStopIndex(stops: SettlerRouteStop[], predicate: (stop: SettlerRouteStop) => boolean): number {
  for (let i = stops.length - 1; i >= 0; i--) {
    if (predicate(stops[i]!)) return i;
  }
  return -1;
}

/**
 * The stop the activity owner is sending this settler to, or `null` when none of the day's stops is
 * that destination (hunting, combat, an errand to a building outside the route).
 *
 * A settler already standing at the destination is not on a leg — that test is the activity owner's
 * own ({@link isAtActivityTarget}), so "Working at X" and "has a current leg into X" cannot disagree.
 */
function resolveLegIndex(
  settler: Entity,
  stops: SettlerRouteStop[],
  target: HumanActivityTarget | null,
): number | null {
  if (!target || isAtActivityTarget(settler, target)) return null;
  if (target.kind === 'home') {
    const index = lastStopIndex(stops, (stop) => stop.kind === 'home');
    return index > 0 ? index : null;
  }
  if (target.buildingId != null) {
    const index = stops.findIndex((stop) => stop.kind !== 'home' && stop.buildingId === target.buildingId);
    if (index > 0) return index;
  }
  if (target.kind === 'nearby-building') {
    const index = stops.findIndex((stop) => stop.kind === 'venue');
    if (index > 0) return index;
  }
  return null;
}

/**
 * The free-time venue the social owner names for this settler right now, if any.
 *
 * Only outside the work shift — during the shift the workplace is the destination, whatever the
 * free-time impulse would prefer — and never for a child, who plays with other children rather than
 * walking to a venue.
 */
function settlerVenue(state: WorldState, settler: Entity): Building | undefined {
  if (settler.isJuvenile) return undefined;
  if (isOnWorkScheduleShift(state, getHourOfDay(state.tick))) return undefined;
  return pickSocialImpulse(settler, state, state.buildings, [], []).building;
}

/**
 * Read-only movement explanation for one settler: the day's named stops in order, the leg they are on,
 * and — when the path owner reports one — the blocked or rerouting state of that leg.
 *
 * Stops come from their owners (`findHumanWorkplace` for the workplace, `pickSocialImpulse` for the
 * free-time venue, the residence link for home); the leg and its state come from `humanStatus` and
 * `pathfinding`. Nothing here writes simulation state.
 */
export function explainSettlerMovement(state: WorldState, settlerId: number): SettlerMovementExplanation {
  const settler = state.entities.find((e) => e.id === settlerId && e.alive && isPlayerHuman(e));
  if (!settler) {
    return {
      stops: [],
      legIndex: null,
      legLabel: null,
      status: 'none',
      lines: [{ label: 'Movement', value: 'Settler not found or no longer alive.', tone: 'warn' }],
    };
  }

  const residence = settler.residenceBuildingId != null
    ? state.buildings.find((building) => building.id === settler.residenceBuildingId) ?? null
    : null;
  const homeStop: SettlerRouteStop | null = residence
    ? { kind: 'home', label: buildingLabel(residence), buildingId: residence.id }
    : null;
  const workplace = findHumanWorkplace(settler, state.buildings);
  const venue = settlerVenue(state, settler);

  const stops: SettlerRouteStop[] = [];
  if (homeStop) stops.push(homeStop);
  if (workplace) stops.push({ kind: 'workplace', label: buildingLabel(workplace), buildingId: workplace.id });
  if (venue) stops.push({ kind: 'venue', label: buildingLabel(venue), buildingId: venue.id });
  // The walk home closes the day — only worth a stop once there is somewhere to walk back from.
  if (homeStop && stops.length > 1) stops.push(homeStop);

  const activity = getHumanActivityProjection(state, settler);
  const legIndex = resolveLegIndex(settler, stops, activity.target);
  const legLabel = legIndex != null && legIndex > 0
    ? `${stops[legIndex - 1]!.label} → ${stops[legIndex]!.label}`
    : null;

  const lines: SettlerExplanationLine[] = [];
  lines.push({
    label: 'Route today',
    value: stops.length === 0
      ? 'No home or workplace assigned yet.'
      : stops.length === 1
        ? `${stops[0]!.label} — no other stop assigned.`
        : stops.map((stop) => stop.label).join(' → '),
    tone: 'neutral',
  });

  let status: SettlerMovementStatus = 'none';
  if (legIndex != null && legLabel != null && activity.target) {
    const obstruction = getRouteObstruction(state.worldMap, state.buildings, settler, activity.target);
    status = obstruction;
    lines.push({ label: 'Current leg', value: legLabel, tone: 'neutral' });
    lines.push({
      label: 'Path',
      value: obstruction === 'clear'
        ? 'Clear — nothing blocks this leg.'
        : obstruction === 'rerouting'
          ? 'Rerouting — the direct line is blocked, so they walk around.'
          : 'Blocked — no route exists; they walk into the obstacle.',
      tone: obstruction === 'clear' ? 'good' : 'warn',
    });
  }

  return { stops, legIndex, legLabel, status, lines };
}
