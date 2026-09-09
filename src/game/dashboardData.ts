/**
 * Dashboard data snapshot — a pure read-only projection of authoritative state
 * for the full-screen, dismissible game dashboard. It never mutates simulation
 * state. The food ledger and rolling history ride the worker delta so the
 * numbers shown here reflect the authoritative sim in both sim modes.
 */
import type { Entity, Season, WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { TICKS_PER_DAY } from './dayCycle';

export interface DashboardResource {
  key: 'food' | 'wood' | 'stone' | 'gold' | 'iron';
  label: string;
  amount: number;
  cap: number;
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
  let humans = 0;
  let homeless = 0;
  let idleAdults = 0;
  let imprisoned = 0;
  let howlerCursed = 0;
  for (const e of state.entities) {
    if (!e.alive || e.type !== EntityType.Human || !isPlayerHuman(e)) continue;
    humans++;
    if (e.residenceBuildingId == null) homeless++;
    if (e.prisonBuildingId != null) imprisoned++;
    if (!e.isJuvenile && e.homeBuildingId == null) idleAdults++;
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
  } else if (humans > 0 && food < humans * 3) {
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

  const eco = state.ecosystemHealth ?? 100;
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
  const prev = pop.length >= 2 ? pop[pop.length - 2] : undefined;
  const cur = pop[pop.length - 1];
  const delta = prev && cur ? (cur.humans ?? 0) - (prev.humans ?? 0) : 0;
  lines.push({
    label: 'Settlers',
    value: delta === 0 ? `${humans}` : `${humans} (${delta > 0 ? `+${delta}` : delta} vs yesterday)`,
    tone: delta < 0 ? 'bad' : 'good',
  });

  const ledger = state.economyLedger;
  const produced = ledger ? sumRecord(ledger.produced) : 0;
  const consumed = ledger ? sumRecord(ledger.consumed) : 0;
  const net = produced - consumed;
  lines.push({
    label: 'Food today',
    value: produced === 0 && consumed === 0
      ? 'no activity yet'
      : `produced +${produced} · consumed −${consumed} · net ${net >= 0 ? `+${net}` : net}`,
    tone: net < 0 ? 'warn' : produced === 0 && consumed === 0 ? 'neutral' : 'good',
  });

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
  const counts = { births: 0, deaths: 0, marriages: 0, scandals: 0, combats: 0 };
  const latest: string[] = [];
  for (const e of state.eventLog) {
    if (e.tick < prevStart || e.tick >= day * TICKS_PER_DAY) continue;
    switch (e.type) {
      case 'birth': counts.births++; break;
      case 'death': counts.deaths++; break;
      case 'marriage': counts.marriages++; break;
      case 'scandal': counts.scandals++; break;
      case 'combat': counts.combats++; break;
      default: break;
    }
    const title = (e as { title?: string }).title;
    if (title && latest.length < 3) latest.push(title);
  }
  const hasEvents =
    counts.births + counts.deaths + counts.marriages + counts.scandals + counts.combats > 0;
  lines.push({
    label: 'Life events',
    value: hasEvents
      ? `Births ${counts.births} · Deaths ${counts.deaths} · Marriages ${counts.marriages} · Scandals ${counts.scandals} · Combat ${counts.combats}`
      : 'quiet day',
    tone: counts.deaths > 0 || counts.scandals > 0 ? 'warn' : 'neutral',
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

  const ledger = state.economyLedger;
  const foodBySourceToday: FoodSourceToday[] = [];
  const foodBySourceConsumedToday: FoodSourceToday[] = [];
  let foodProducedToday = 0;
  let foodConsumedToday = 0;
  if (ledger) {
    for (const [src, amount] of Object.entries(ledger.produced ?? {})) {
      if (amount > 0) {
        foodBySourceToday.push({ label: src, amount });
        foodProducedToday += amount;
      }
    }
    for (const [src, amount] of Object.entries(ledger.consumed ?? {})) {
      if (amount > 0) {
        foodBySourceConsumedToday.push({ label: src, amount });
        foodConsumedToday += amount;
      }
    }
    foodBySourceToday.sort((a, b) => b.amount - a.amount);
    foodBySourceConsumedToday.sort((a, b) => b.amount - a.amount);
  }

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
      noWork: !e.isJuvenile && e.homeBuildingId == null && e.prisonBuildingId == null,
      noHome: e.residenceBuildingId == null,
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
    netFoodToday: foodProducedToday - foodConsumedToday,
    population: {
      humans: state.humanPopulation ?? 0,
      ecoHealth: state.ecosystemHealth ?? 0,
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
      label: 'Suggested',
      value: 'Assign them to a staffed building (Farm, Hunting Spot, Mill, …).',
      tone: 'warn',
    });
  }
  if (!residence) {
    lines.push({
      label: 'Suggested',
      value: 'Build and finish a House so they have somewhere to sleep.',
      tone: 'warn',
    });
  }

  return lines;
}
