/**
 * Dashboard data snapshot — a pure read-only projection of authoritative state for the
 * full-screen dashboard; it also owns the inspector explanations panels render verbatim.
 */
import type { Building, Entity, Season, WorldState } from './gameTypes';
import { BUILDING_JOB_TYPES, EntityType } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { countActiveMoonHowlerCurses, isActiveMoonHowler } from './moonHowler';
import { TICKS_PER_DAY } from './dayCycle';
import { getHourOfDay } from './dayCycleClock';
import { isOnWorkScheduleShift } from './workSchedule';
import { dailyFoodNeedForSettlers, foodSharePct, summarizeFoodLedger } from './economyLedger';
import { isFoodCritical } from './resourceUtils';
import { getEcosystemHealth } from './dailyEcology';
import { computeVillageStats } from './uiSimSummary';
import {
  buildResidenceOccupancy,
  countHomelessSettlers,
  countResidentsInBuilding,
  getResidenceCapacity,
  hasWorkAssignment,
  isHomelessSettler,
  isResidenceBuildingType,
} from './housingModel';
import { findHumanWorkplace, isOnConstructionCrew, staffingCapFor } from './workforce';
import { BUILDING_TYPE_CODES } from './buildings';
import { getBuildingConfig } from './buildingConfig';
import { formatCitizenName } from './citizenId';
import type { HumanActivityTarget } from './humanStatus';
import { getHumanActivityProjection, isAtActivityTarget } from './humanStatus';
import type { SettlerWorkReason } from './workAbsence';
import { getSettlerWorkReason } from './workAbsence';
import { buildSchoolRosters, isSchoolTime } from './education';
import { SCHOOL_MIN_AGE } from './gameConstants';
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
 * Derived here per this module's contract: panels render numbers, they do not derive them.
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
  status: 'working' | 'idle' | 'at school' | 'going to school' | 'school off-hours' | 'no school place' | 'too young for school' | 'prison' | 'leader' | 'home' | 'none';
  /** Why this settler is, or is not, at their post — the work-absence owner's verdict. */
  workReason: SettlerWorkReason;
}

/** One village building as the dashboard's table lists it — both identities, level and occupancy. */
export interface DashboardBuilding {
  id: number;
  /** The append-only type number (`buildings.BUILDING_TYPE_CODES`). */
  typeCode: number;
  label: string;
  level: number;
  completed: boolean;
  /** Construction progress 0–100, as the building's own field holds it. */
  progressPct: number;
  /** Workers against their slots, or residents against beds; null when a building takes neither. */
  slots: { used: number; cap: number } | null;
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
   * This source's share of its side of the day's balance (0–100), computed here because
   * panels render numbers, they do not derive them.
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
  /** Total food the living settlers need per day at the standard ration. */
  foodNeedPerDay: number;
  /** Days the current store covers at {@link foodNeedPerDay}; null without settlers. */
  foodStoreDays: number | null;
  /** Finished calendar days of food produced and consumed, with production by source (rolling). */
  foodDays: Array<{
    day: number;
    total: number;
    consumed: number;
    net: number;
    bySource: Record<string, number>;
  }>;
  /** Read-only concern list for the operations overview. */
  concerns: VillageConcern[];
  /** Read-only "daily council" summary lines for the last finished/current day. */
  council: CouncilLine[];
  population: { humans: number; ecoHealth: number; pollution: number; biodiversity: number };
  valleyStage: WorldState['valleyStage'];
  settlers: DashboardSettler[];
  /** Every village building, ordered by type number and then by unique building id. */
  buildings: DashboardBuilding[];
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
  if (e.isJuvenile) return 0;
  const ticks = e.scheduleWorkedTicksToday ?? 0;
  return Math.min(24, Math.round((ticks / (TICKS_PER_DAY / 24)) * 10) / 10);
}

function settlerStatus(e: Entity): DashboardSettler['status'] {
  if (e.isJuvenile) return 'idle';
  if (e.prisonBuildingId != null) return 'prison';
  if ((e.scheduleWorkedTicksToday ?? 0) > 0) return 'working';
  return 'idle';
}

/**
 * The bulk reason the settlers who hold a post are not at it, or `null` when every one of them is
 * working. Built from the same reasons the per-settler rows carry, so the summary cannot disagree.
 */
function summarizePostAbsences(reasons: readonly SettlerWorkReason[]): string | null {
  const counts = new Map<string, { label: string; count: number }>();
  let away = 0;
  for (const reason of reasons) {
    if (reason.code === 'working') continue;
    away++;
    const row = counts.get(reason.code) ?? { label: reason.label, count: 0 };
    row.count++;
    counts.set(reason.code, row);
  }
  if (away === 0) return null;
  const top = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 2);
  return `${away} more hold a post but are away — ${top.map((r) => `${r.label} (${r.count})`).join(', ')}.`;
}

/** Read-only concern derivation from authoritative state (no simulation writes). */
function deriveConcerns(state: WorldState, postAbsences: string | null = null): VillageConcern[] {
  const concerns: VillageConcern[] = [];
  const food = state.resources?.food ?? 0;
  // Settler counters come from the labour-statistics owner (`computeVillageStats`); the
  // housing gap from the residence owner (`countHomelessSettlers`). Only the Moon Howler tally is local.
  const village = computeVillageStats(state);
  const humans = village.total;
  const imprisoned = village.imprisoned;
  const idleAdults = village.idle;
  const homeless = countHomelessSettlers(state);
  const howlerCursed = countActiveMoonHowlerCurses(state.entities);
  const howlerTransformed = state.entities.filter(isActiveMoonHowler).length;

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
      detail: postAbsences
        ? `Not assigned to a workplace. ${postAbsences}`
        : 'Not assigned to a workplace.',
      hint: 'Staffing is automatic — build more workplaces or check the Village tab.',
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
      title: howlerTransformed > 0 ? 'Moon Howler transformed — hunting tonight' : 'Moon Howler curse persists — dormant',
      detail: howlerTransformed > 0
        ? `${howlerTransformed} Moon Howler${howlerTransformed === 1 ? '' : 's'} currently transformed; ${howlerCursed} living curse${howlerCursed === 1 ? '' : 's'} remain.`
        : `${howlerCursed} living settler${howlerCursed === 1 ? '' : 's'} cursed; human until the next full-moon night.`,
      hint: 'Staff a Church for full-moon cures; Moon Howlers transform from 22:00 to 06:00.',
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
function deriveCouncil(state: WorldState, postAbsences: string | null = null): CouncilLine[] {
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

  // Today's balance is not a council line: the "Net food flow today" card renders the same
  // numbers from this ledger. Council keeps the last finished day and the stored level.
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
      // Counted separately from `scandal`: an imprisonment is its consequence, not a second scandal.
      case 'prison': counts.prisons++; break;
      case 'combat': counts.combats++; break;
      default: break;
    }
    // `GameEventLog` carries `message` (`eventLog.ts` is the only writer), never `title`.
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

  const concerns = deriveConcerns(state, postAbsences);
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

/**
 * Village buildings with both identities — type number and unique building id — in type-then-id order.
 */
function deriveDashboardBuildings(state: WorldState): DashboardBuilding[] {
  const occupancy = buildResidenceOccupancy(state.entities);
  const rows: DashboardBuilding[] = [];
  for (const building of state.buildings) {
    if (building.faction === 'rival') continue;
    const residence = building.completed && isResidenceBuildingType(building.type);
    // A finished workplace's slot count is the staffing owner's: a Prison's occupants are guards ∪ prisoners.
    const staffing = !residence && building.completed && BUILDING_JOB_TYPES[building.type] !== undefined
      ? staffingCapFor(building, state.entities)
      : null;
    rows.push({
      id: building.id,
      typeCode: BUILDING_TYPE_CODES[building.type],
      label: getBuildingConfig(building.type).label,
      level: building.level,
      completed: building.completed,
      progressPct: Math.round(building.constructionProgress),
      slots: residence
        ? { used: countResidentsInBuilding(state.entities, building.id, occupancy), cap: getResidenceCapacity(building) }
        : staffing
          ? { used: staffing.staffed, cap: staffing.cap }
          : null,
    });
  }
  rows.sort((a, b) => a.typeCode - b.typeCode || a.id - b.id);
  return rows;
}

/** Single-pass read-only snapshot for the dashboard. */
export function collectDashboard(state: WorldState): DashboardData {
  const resources: DashboardResource[] = RESOURCE_KEYS.map((key) => ({
    key,
    label: key === 'iron' ? 'Iron' : key[0].toUpperCase() + key.slice(1),
    amount: state.resources?.[key] ?? 0,
    cap: state.storageMax?.[key] ?? 0,
  }));

  // The day's balance comes from the ledger owner; the view must not do food arithmetic.
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

  // Use the same roster and class-time rules as the school inspector, once per snapshot.
  const schoolRosters = buildSchoolRosters(state.buildings, state.entities, state.tick, getHourOfDay(state.tick));
  const inClassIds = new Set<number>();
  const onWayToSchoolIds = new Set<number>();
  for (const roster of schoolRosters.values()) {
    for (const pupil of roster.inClassNow) inClassIds.add(pupil.id);
    // A reserved seat is not evidence of attendance outside class hours.
    for (const pupil of roster.pupils) onWayToSchoolIds.add(pupil.id);
  }
  const classInSession = schoolRosters.size > 0 && isSchoolTime(state.tick, getHourOfDay(state.tick));
  const settlers: DashboardSettler[] = [];
  /** Absence reasons of the posted settlers, collected in the same pass that builds the rows. */
  const postedReasons: SettlerWorkReason[] = [];
  for (const e of state.entities) {
    if (!e.alive || e.type !== EntityType.Human || !isPlayerHuman(e)) continue;
    const role = e.isJuvenile ? 'Child' :
      e.occupation && e.occupation !== 'settler'
        ? e.occupation
        : (e.job ?? 'settler');
    const workReason = getSettlerWorkReason(state, e);
    if (!e.isJuvenile && e.prisonBuildingId == null
      && (hasWorkAssignment(e) || isOnConstructionCrew(state.buildings, e.id))) {
      postedReasons.push(workReason);
    }
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
      // A prisoner is neither homeless nor idle: imprisonment clears residence and workplace by design.
      noHome: isHomelessSettler(e),
      status: e.isJuvenile && classInSession && inClassIds.has(e.id)
        ? 'at school'
        : e.isJuvenile && classInSession && onWayToSchoolIds.has(e.id)
          ? 'going to school'
          : e.isJuvenile && e.age < SCHOOL_MIN_AGE
            ? 'too young for school'
            : e.isJuvenile && !onWayToSchoolIds.has(e.id)
              ? 'no school place'
              : e.isJuvenile
                ? 'school off-hours'
                : settlerStatus(e),
      workReason,
    });
  }
  settlers.sort((a, b) => Number(b.role === 'settler') - Number(a.role === 'settler'));
  const postAbsences = summarizePostAbsences(postedReasons);

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

  const foodNeedPerDay = dailyFoodNeedForSettlers(settlers.length);
  const foodStore = state.resources?.food ?? 0;

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
    foodNeedPerDay,
    foodStoreDays: foodNeedPerDay > 0 ? Math.round((foodStore / foodNeedPerDay) * 10) / 10 : null,
    population: {
      humans: state.humanPopulation ?? 0,
      ecoHealth: getEcosystemHealth(state),
      pollution: state.pollutionLevel ?? 0,
      biodiversity: state.biodiversityIndex ?? 0,
    },
    valleyStage: state.valleyStage ?? 'stable',
    foodDays: (state.foodHistory ?? []).map((sample) => {
      const total = Object.values(sample.produced).reduce((sum, amount) => sum + amount, 0);
      const consumed = Object.values(sample.consumed).reduce((sum, amount) => sum + amount, 0);
      return {
        day: sample.day,
        total,
        consumed,
        net: total - consumed,
        bySource: { ...sample.produced },
      };
    }),
    concerns: deriveConcerns(state, postAbsences),
    council: deriveCouncil(state, postAbsences),
    settlers,
    buildings: deriveDashboardBuildings(state),
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

  const workplace = settler.workerBuildingId != null
    ? state.buildings.find((b) => b.id === settler.workerBuildingId)
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
    // The absence owner's reason, so a posted worker is never told only that nobody logged work.
    const workReason = getSettlerWorkReason(state, settler);
    lines.push({
      label: 'Why idle',
      value:
        (state.resources?.food ?? 0) <= 0
          ? 'Stores are empty — a settler will hunt in a famine.'
          : workReason.code === 'no-post'
            ? 'Outside work hours or free time with nothing scheduled.'
            : `${workReason.label} — no work logged today.`,
      tone: 'neutral',
    });
  }

  if (!workplace && !settler.isJuvenile && settler.prisonBuildingId == null) {
    lines.push({
      // A distinct label from the housing suggestion: a jobless and homeless settler can
      // receive both rows, and duplicate keys would drop one.
      label: 'Suggested workplace',
      value: 'Assign them to a staffed building (Farm, Hunting Spot, Mill, …).',
      tone: 'warn',
    });
  }
  // As the workplace suggestion above: an arrest clears both links, so a prisoner's missing
  // residence is by design and this advice cannot be followed while the sentence runs.
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
 * Player-facing wording for the staffing owner's refusal vocabulary.
 * The key type derives from `getWorkerAssignmentRefusal`, so a new gate is a compile error here.
 */
const STAFFING_REFUSAL_LABELS: Record<WorkerAssignmentRefusal, string> = {
  'unknown-building': 'That building no longer exists.',
  'unknown-settler': 'That settler is no longer in the valley.',
  'rival-building': 'A rival camp is not yours to staff.',
  'residence-building': 'Homes fill themselves — build a House and people move in.',
  'building-full': 'Every slot here is taken.',
  'building-has-no-job': 'This building takes no workers.',
  'automatic-job': 'Employment is automatic; individual worker selection is unavailable.',
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
  /** Every workplace is automatically staffed; the field is retained for UI consumers. */
  mode: 'auto';
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
 * Read-only staffing explanation for one building: automatic mode, capacity, current workers,
 * and the owner's refusal reason per named settler; the panel only renders {@link lines}.
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
  /**
   * A finished workplace's cap and count come from the staffing owner: a Prison's occupant list is
   * guards ∪ prisoners, so that list against the config cap counts cells as guard posts.
   */
  const staffing = !isResidence && building.completed ? staffingCapFor(building, state.entities) : null;
  const capacity = staffing?.cap
    ?? (isResidence ? getResidenceCapacity(building) : getBuildingConfig(building.type).maxOccupants);
  const workerIds = buildingWorkerIds(state, building);
  const workerCount = staffing?.staffed
    ?? (isResidence ? countResidentsInBuilding(state.entities, building.id) : workerIds.length);

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
      : 'Auto — jobs persist and vacant posts are filled automatically.',
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
  if (takesStaff && !building.completed && !isResidence && workerCount < capacity && !acceptsWorker) {
    lines.push({
      label: 'Cannot add workers',
      value: 'No settler is free to take this post — recruit, or free someone from another job.',
      tone: 'warn',
    });
  }

  return { mode: 'auto', capacity, workerCount, acceptsWorker, refusals, lines };
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
 * The stop the activity owner is sending this settler to, or `null` when none of the day's
 * stops is that destination. Standing at it is not a leg — that test is the owner's.
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
 * The free-time venue the social owner names for this settler, if any: only outside the
 * work shift, and never for a child.
 */
function settlerVenue(state: WorldState, settler: Entity): Building | undefined {
  if (settler.isJuvenile) return undefined;
  if (isOnWorkScheduleShift(state, getHourOfDay(state.tick))) return undefined;
  return pickSocialImpulse(settler, state, state.buildings, [], []).building;
}

/**
 * Read-only movement explanation for one settler: the day's named stops in order, the leg
 * they are on, and the path owner's blocked/rerouting state. Nothing here writes state.
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
