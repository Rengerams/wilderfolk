/**
 * Social systems health check — village life, prison, leadership, frontier relations.
 * Run: npm run simulate:social
 *
 * Env:
 *   SOCIAL_DAYS=360   — game-days to simulate (default 1 year)
 *   SIM_LOG_LIFE=1    — stream pregnancies/births/deaths to -life.txt (via run-sim.mjs)
 *   SIM_USE_WORKER=0  — legacy main-thread gameTick (default: worker_threads)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initGame,
  recruitSettler,
  assignIdleWorkerToBuilding,
  assignAllWorkers,
  BuildingType,
} from '../src/game/gameEngine';
import { tryPlaceBuilding } from './simBuildUtils';
import type { WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY, isImprisoned } from '../src/game/dayCycle';
import {
  isPlayerHuman,
  respondToDiplomacyEvent,
  getDiplomacyChoiceEligibility,
} from '../src/game/groupEvents';
import { formatSettlerName } from '../src/game/villageLeadership';
import { getNamePoolInfo, loadNames } from '../src/game/nameLoader';
import { startResearch, syncResearchUnlocks } from '../src/game/research';
import { getSimFocus } from './simFocus';
import {
  advanceSimTick,
  disposeSimWorkerHost,
  initSimWorkerHost,
  simUsesWorker,
} from './simWorkerRuntime';
import {
  buildChronicleMeta,
  chroniclePathFromSimLog,
  formatEventSummaryLines,
  writeChronicleFile,
} from './simEventLog';

const SOCIAL_DAYS = Number(process.env.SOCIAL_DAYS ?? 360);
const TOTAL_TICKS = SOCIAL_DAYS * TICKS_PER_DAY;
const SNAPSHOT_EVERY = TICKS_PER_DAY * 30;

const here = dirname(fileURLToPath(import.meta.url));
const logsDir = join(here, 'logs');

type Gate = { name: string; pass: boolean; detail: string; note?: string };

type ScheduledAction = {
  at: number;
  label: string;
  run: (s: WorldState) => WorldState;
};

function place(state: WorldState, type: BuildingType, cx: number, cy: number): WorldState {
  const { state: next, ok } = tryPlaceBuilding(state, type, cx, cy);
  return ok ? next : state;
}

function tryResearch(state: WorldState, techId: string): WorldState {
  syncResearchUnlocks(state);
  const node = state.researchNodes.find((n) => n.id === techId);
  if (!node || node.researched || state.activeResearch) return state;
  if (!node.unlocked) return state;
  const next = startResearch(state, techId);
  return next.activeResearch === techId ? next : state;
}

function countBuildingWorkers(state: WorldState, buildingId: number): number {
  const building = state.buildings.find((b) => b.id === buildingId);
  if (!building) return 0;
  return building.occupants.filter((id) => {
    const worker = state.entities.find((e) => e.id === id && e.alive);
    return worker != null && !isImprisoned(worker);
  }).length;
}

function staffFirst(state: WorldState, type: BuildingType): WorldState {
  const building = state.buildings.find((b) => b.completed && b.type === type && b.faction !== 'rival');
  if (!building || countBuildingWorkers(state, building.id) > 0) return state;
  return assignIdleWorkerToBuilding(state, building.id);
}

function countAffairPairs(humans: WorldState['entities']): number {
  const seen = new Set<number>();
  let pairs = 0;
  for (const h of humans) {
    if (seen.has(h.id)) continue;
    if (h.affairPartnerId != null) {
      const lover = humans.find((p) => p.id === h.affairPartnerId);
      if (lover?.alive) {
        seen.add(h.id);
        seen.add(lover.id);
        pairs++;
        continue;
      }
    }
    if ((h.affairProgress ?? 0) >= 45) {
      const lover = humans.find(
        (p) => p.id !== h.id
          && p.alive
          && p.gender
          && h.gender
          && p.gender !== h.gender
          && (p.affairProgress ?? 0) >= 45
          && Math.min(h.affairProgress ?? 0, p.affairProgress ?? 0) >= 45,
      );
      if (lover) {
        seen.add(h.id);
        seen.add(lover.id);
        pairs++;
      }
    }
  }
  return pairs;
}

function countMarriedPairs(humans: WorldState['entities']): number {
  const seen = new Set<number>();
  let pairs = 0;
  for (const h of humans) {
    if (!h.partnerId || seen.has(h.id)) continue;
    const partner = humans.find((p) => p.id === h.partnerId);
    if (partner?.alive) {
      seen.add(h.id);
      seen.add(partner.id);
      pairs++;
    }
  }
  return pairs;
}

function autoDiplomacy(state: WorldState): WorldState {
  const events = state.pendingDiplomacyEvents ?? [];
  if (events.length === 0) return state;
  for (const evt of events) {
    for (const choice of evt.choices) {
      if (getDiplomacyChoiceEligibility(state, evt, choice.id).ok) {
        return respondToDiplomacyEvent(state, evt.id, choice.id);
      }
    }
  }
  return state;
}

function section(lines: string[], title: string) {
  lines.push('');
  lines.push(`── ${title} ${'─'.repeat(Math.max(0, 52 - title.length))}`);
}

async function main() {
  await loadNames();
  const namePool = getNamePoolInfo();

  const lines: string[] = [];
  const startRep = { value: 0 };

  let state = initGame();
  state.resources.wood = 5000;
  state.resources.stone = 2500;
  state.resources.food = 2000;
  state.resources.gold = 400;
  startRep.value = state.villageReputation;

  const foundingLeaderId = state.villageLeaderId;
  let hadLeaderEver = foundingLeaderId != null;
  let maxVisitorsOnMap = state.visitorGroups.length;
  let maxRivalsOnMap = state.rivalSettlements.length;

  const cx = state.width / 2;
  const cy = state.height / 2;

  const schedule: ScheduledAction[] = [
    { at: 1, label: 'House A', run: (s) => place(s, BuildingType.House, cx, cy) },
    { at: 12, label: 'Research Fine Construction', run: (s) => tryResearch(s, 'architecture_1') },
    { at: 24, label: 'Farm', run: (s) => place(s, BuildingType.Farm, cx + 60, cy) },
    { at: 48, label: 'House B', run: (s) => place(s, BuildingType.House, cx - 80, cy + 40) },
    { at: 72, label: 'Well', run: (s) => place(s, BuildingType.Well, cx - 30, cy - 60) },
    { at: 96, label: 'Church', run: (s) => place(s, BuildingType.Church, cx - 60, cy + 80) },
    { at: 200, label: 'Staff priest', run: (s) => staffFirst(s, BuildingType.Church) },
    { at: 120, label: 'Recruit 1', run: recruitSettler },
    { at: 180, label: 'Recruit 2', run: recruitSettler },
    { at: 240, label: 'House C', run: (s) => place(s, BuildingType.House, cx + 20, cy + 100) },
    { at: 300, label: 'Recruit 3', run: recruitSettler },
    { at: 360, label: 'Prison', run: (s) => place(s, BuildingType.Prison, cx + 35, cy + 15) },
    { at: 600, label: 'Staff prison guard', run: (s) => staffFirst(s, BuildingType.Prison) },
    { at: 900, label: 'Staff prison guard (retry)', run: (s) => staffFirst(s, BuildingType.Prison) },
    { at: 1500, label: 'Staff prison guard (retry)', run: (s) => staffFirst(s, BuildingType.Prison) },
    { at: 480, label: 'Recruit 4', run: recruitSettler },
    { at: 540, label: 'House D', run: (s) => place(s, BuildingType.House, cx + 100, cy + 60) },
    { at: 660, label: 'Recruit 5', run: recruitSettler },
    { at: 720, label: 'Farm B', run: (s) => place(s, BuildingType.Farm, cx - 100, cy + 20) },
    { at: 840, label: 'Recruit 6', run: recruitSettler },
    { at: 960, label: 'Research Urban Planning', run: (s) => tryResearch(s, 'architecture_2') },
    { at: 1080, label: 'Town hall', run: (s) => place(s, BuildingType.TownHall, cx, cy - 90) },
    { at: 1200, label: 'Recruit 7', run: recruitSettler },
    { at: 1320, label: 'Recruit 8', run: recruitSettler },
    { at: 1560, label: 'Recruit 9', run: recruitSettler },
  ];

  const milestones: string[] = [];
  const courtshipPeaks: number[] = [];
  let maxAffairs = 0;
  let peakPopulation = state.entities.filter((e) => e.alive && isPlayerHuman(e)).length;

  const simFocus = getSimFocus(state);
  const workerBoot = await initSimWorkerHost(state);
  const workerHost = workerBoot.host;
  state = workerBoot.state;
  const t0 = performance.now();
  for (let t = 1; t <= TOTAL_TICKS; t++) {
    const action = schedule.find((s) => s.at === t);
    if (action) state = action.run(state);

    state = autoDiplomacy(state);
    assignAllWorkers(state.entities.filter(isPlayerHuman), state.buildings);
    state = (await advanceSimTick(state, simFocus, workerHost)).state;

    if (state.villageLeaderId != null) hadLeaderEver = true;
    maxVisitorsOnMap = Math.max(maxVisitorsOnMap, state.visitorGroups.length);
    maxRivalsOnMap = Math.max(maxRivalsOnMap, state.rivalSettlements.length);

    if (t % SNAPSHOT_EVERY === 0) {
      const humans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
      peakPopulation = Math.max(peakPopulation, humans.length);
      const courting = humans.filter((h) => (h.courtshipProgress ?? 0) > 0).length;
      courtshipPeaks.push(courting);
      const affairs = countAffairPairs(humans);
      maxAffairs = Math.max(maxAffairs, affairs);
      const prisonBuilt = state.buildings.some((b) => b.completed && b.type === BuildingType.Prison);
      const prisonBuilding = state.buildings.find((b) => b.completed && b.type === BuildingType.Prison);
      const prisonStaffed = prisonBuilding != null && countBuildingWorkers(state, prisonBuilding.id) > 0;
      milestones.push(
        `Day ${Math.floor(t / TICKS_PER_DAY)}: pop=${humans.length} couples=${countMarriedPairs(humans)}`
        + ` courting=${courting} rep=${state.villageReputation}`
        + ` visitors=${state.visitorGroups.length} rivals=${state.rivalSettlements.length}`
        + ` leader=${state.villageLeaderId ?? '—'} prison=${prisonBuilt ? (prisonStaffed ? 'staffed' : 'empty') : '—'}`,
      );
    }
  }
  disposeSimWorkerHost(workerHost);
  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

  const log = state.eventLog;
  const humans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
  const adults = humans.filter((h) => !h.isJuvenile);
  const children = humans.filter((h) => h.isJuvenile);
  const singles = adults.filter((h) => h.relationshipStatus === 'single' && !h.pregnant);
  const expecting = adults.filter((h) => h.relationshipStatus === 'expecting' || h.pregnant);
  const couples = countMarriedPairs(humans);
  const affairs = countAffairPairs(humans);
  const bastards = humans.filter((h) => h.isBastard).length;
  const imprisoned = humans.filter((h) => isImprisoned(h)).length;

  const marriages = log.filter((e) => e.type === 'marriage');
  const births = log.filter((e) => e.type === 'birth');
  const humanBirths = births.filter((e) => !e.message.includes('Wildkin'));
  const bastardBirths = births.filter((e) => e.message.includes('bastard'));
  const deaths = log.filter((e) => e.type === 'death');
  const humanDeaths = deaths.filter((e) => !e.message.includes('Wildkin'));
  const scandals = log.filter((e) => e.type === 'scandal');
  const caughtScandals = scandals.filter((e) => e.message.includes('was caught'));
  const rumorScandals = scandals.filter((e) => e.message.includes('Whispers spread'));
  const imprisonEvents = log.filter((e) => e.type === 'event' && e.message.includes('imprisoned for scandal'));
  const releaseEvents = log.filter((e) => e.type === 'event' && e.message.includes('released from prison'));
  const gossipEvents = log.filter(
    (e) => e.type === 'event' && /gossip|whispers/i.test(e.message),
  );
  const reputationDelta = state.villageReputation - startRep.value;

  const visitorArrivals = log.filter(
    (e) => e.type === 'migration' && e.message.includes('arrived near'),
  ).length;
  const visitorKinds = new Set(state.visitorGroups.map((g) => g.kind));
  const rivalNames = state.rivalSettlements.map((r) => `${r.name} (${r.relationship})`);
  const diplomacyReceived = log.filter((e) => e.type === 'diplomacy' || e.message.includes('diplomacy')).length;
  const diplomacyPending = state.pendingDiplomacyEvents?.length ?? 0;
  const diplomacyResolved = log.filter((e) => e.type === 'diplomacy').length;

  const leader = state.villageLeaderId != null
    ? humans.find((h) => h.id === state.villageLeaderId)
    : undefined;
  const leaderName = leader ? formatSettlerName(leader) : '(none)';

  const prison = state.buildings.find((b) => b.completed && b.type === BuildingType.Prison);
  const prisonStaffed = prison != null && countBuildingWorkers(state, prison.id) > 0;

  const chatty = humans.filter((h) => (h.chatTicks ?? 0) > 0 || h.chatPhrase).length;

  section(lines, 'Wilderfolk social simulation');
  lines.push(
    `Tick engine: ${simUsesWorker() ? 'worker_threads (live-game standard)' : 'main-thread gameTick (SIM_USE_WORKER=0)'}`,
  );
  lines.push(`Ran ${SOCIAL_DAYS} game-days (${TOTAL_TICKS} ticks) in ${elapsed}s`);
  lines.push(`Calendar end: Year ${state.year}, Day ${state.dayInYear}`);
  lines.push(
    `Name pool: ${namePool.male} male / ${namePool.female} female / ${namePool.last} surnames`
    + (namePool.full ? ' (full lists)' : ' (embedded fallback)'),
  );

  section(lines, 'Village life — families & drama');
  lines.push(`Population: ${humans.length} (${adults.length} adults, ${children.length} children) — peak ${peakPopulation}`);
  lines.push(`Married couples: ${couples} | Singles: ${singles.length} | Pregnant/expecting: ${expecting.length}`);
  lines.push(`Active affairs: ${Math.floor(affairs)} | Living bastards: ${bastards} | Imprisoned now: ${imprisoned}`);
  lines.push('');
  lines.push('Chronicle events:');
  lines.push(`  Marriages ........ ${marriages.length}`);
  lines.push(`  Human births ..... ${humanBirths.length} (${bastardBirths.length} bastard)`);
  lines.push(`  Human deaths ..... ${humanDeaths.length}`);
  lines.push(`  Scandals ......... ${scandals.length} (${caughtScandals.length} caught, ${rumorScandals.length} rumor)`);
  lines.push(`  Imprisonments .... ${imprisonEvents.length}`);
  lines.push(`  Prison releases .. ${releaseEvents.length}`);
  lines.push(`  Gossip events .... ${gossipEvents.length}`);
  if (marriages.length > 0) {
    lines.push('');
    lines.push('Sample marriages:');
    for (const m of marriages.slice(0, 5)) {
      lines.push(`  · Y${m.year} D${m.day}: ${m.message}`);
    }
  }
  if (scandals.length > 0) {
    lines.push('');
    lines.push('Sample scandals:');
    for (const s of scandals.slice(-5)) {
      lines.push(`  · Y${s.year} D${s.day}: ${s.message}`);
    }
  }
  if (imprisonEvents.length > 0) {
    lines.push('');
    lines.push('Imprisonments:');
    for (const e of imprisonEvents.slice(0, 5)) {
      lines.push(`  · Y${e.year} D${e.day}: ${e.message}`);
    }
  }
  lines.push('');
  lines.push(`Courtship activity: peak ${Math.max(0, ...courtshipPeaks)} settlers courting at once`);
  lines.push(`Affair peak: ${maxAffairs} simultaneous pairs`);
  lines.push(`Settlers with speech bubbles: ${chatty}`);

  section(lines, 'Prison & guard');
  lines.push(`Prison built: ${prison ? 'yes' : 'no'} | Guard staffed: ${prisonStaffed ? 'yes' : 'no'}`);
  if (scandals.length > 0) {
    const caughtPct = Math.round((caughtScandals.length / scandals.length) * 100);
    lines.push(`Scandal mix: ${caughtPct}% caught (target ~5–45% with rumors for the rest)`);
  }
  lines.push('Staffed prison: village gossip can escalate to caught (~22%); only caught scandals jail (~60% arrest).');

  section(lines, 'Leadership & reputation');
  lines.push(`Founding leader id: ${foundingLeaderId ?? '—'} | Had leader this run: ${hadLeaderEver ? 'yes' : 'no'}`);
  lines.push(`Village head now: ${leaderName} (id ${state.villageLeaderId ?? '—'})`);
  if (state.pendingElectionYear != null) {
    lines.push(`Succession election scheduled: Year ${state.pendingElectionYear}`);
  }
  lines.push(`Reputation: ${startRep.value} → ${state.villageReputation} (${reputationDelta >= 0 ? '+' : ''}${reputationDelta})`);
  if (state.electionCeremony) {
    lines.push(`Election ceremony: phase=${state.electionCeremony.phase}`);
  } else {
    lines.push('Election ceremony: none this run');
  }

  section(lines, 'Frontier — visitors, rivals, diplomacy');
  lines.push(`Visitor arrivals (migration log): ${visitorArrivals}`);
  lines.push(`Peak visitors on map: ${maxVisitorsOnMap} | Now: ${state.visitorGroups.filter((g) => g.daysLeft > 0).length}`);
  lines.push(`Visitor kinds seen: ${visitorKinds.size > 0 ? [...visitorKinds].join(', ') : 'none'}`);
  lines.push(`Peak rivals on map: ${maxRivalsOnMap}`);
  lines.push(`Rivals now: ${rivalNames.length > 0 ? rivalNames.join('; ') : 'none'}`);
  lines.push(`Diplomacy events in log: ${diplomacyReceived} | Resolved (type=diplomacy): ${diplomacyResolved} | Still pending: ${diplomacyPending}`);

  section(lines, 'Chronicle summary');
  for (const row of formatEventSummaryLines(log)) lines.push(`  ${row}`);

  section(lines, 'Timeline (every 30 days)');
  for (const m of milestones) lines.push(`  ${m}`);

  const caughtRate = scandals.length > 0 ? caughtScandals.length / scandals.length : 0;
  const scandalMixBalanced = scandals.length >= 3
    && rumorScandals.length >= 1
    && caughtScandals.length >= 1
    && caughtRate >= 0.05
    && caughtRate <= 0.45;
  const dramaActive = scandals.length >= 1 || maxAffairs >= 1;
  const prisonPipelineOk = prison != null
    && prisonStaffed
    && caughtScandals.length >= 1
    && imprisonEvents.length >= 1;

  const gates: Gate[] = [
    {
      name: 'Name pool loaded',
      pass: namePool.full,
      detail: `${namePool.male}+${namePool.female}+${namePool.last} names`,
      note: namePool.full ? undefined : 'Headless sim should load full lists from disk',
    },
    {
      name: 'Courtship → marriage pipeline',
      pass: marriages.length >= 1,
      detail: `${marriages.length} marriage(s)`,
      note: marriages.length === 0 ? 'Singles may not be meeting — check houses/church/evening social' : undefined,
    },
    {
      name: 'Marriage → children pipeline',
      pass: humanBirths.length >= 1,
      detail: `${humanBirths.length} human birth(s)`,
      note: humanBirths.length === 0 ? 'Married couples may not be cohabiting or fertility blocked' : undefined,
    },
    {
      name: 'Population sustained',
      pass: humans.length >= 4,
      detail: `${humans.length} living settlers (peak ${peakPopulation})`,
    },
    {
      name: 'Drama — scandal mix',
      pass: scandalMixBalanced,
      detail: `scandals=${scandals.length} caught=${caughtScandals.length} rumor=${rumorScandals.length}`
        + ` (${scandals.length > 0 ? `${Math.round(caughtRate * 100)}% caught` : 'n/a'}) peakAffairs=${maxAffairs}`,
      note: !dramaActive
        ? 'No affairs or scandals — married pairs may not be crossing paths'
        : scandals.length > 0 && caughtScandals.length === 0
          ? 'All rumor, no caught — prison range or caught-gossip rate too low'
          : scandals.length > 0 && rumorScandals.length === 0
            ? 'All caught, no rumor — mix should include whispers'
            : scandals.length > 0 && caughtRate > 0.45
              ? 'Too many caught scandals — most village talk should stay rumor'
              : scandals.length > 0 && scandals.length < 3
                ? 'Need at least 3 scandals to judge mix'
                : undefined,
    },
    {
      name: 'Leadership lifecycle',
      pass: hadLeaderEver,
      detail: foundingLeaderId != null
        ? `founding id ${foundingLeaderId}${state.pendingElectionYear != null ? ` → election Year ${state.pendingElectionYear}` : ''}`
        : 'no founding leader',
      note: state.villageLeaderId == null && state.pendingElectionYear != null
        ? 'Founder may have died — succession election is scheduled (normal in 1-year runs)'
        : undefined,
    },
    {
      name: 'Speech / chat bubbles',
      pass: chatty >= 1,
      detail: `${chatty} settlers chatted`,
    },
    {
      name: 'Prison pipeline',
      pass: prisonPipelineOk,
      detail: prison
        ? `built, guard=${prisonStaffed ? 'yes' : 'no'}, caught=${caughtScandals.length}, imprisonments=${imprisonEvents.length}`
        : 'no prison placed',
      note: !prison
        ? 'Prison never placed'
        : !prisonStaffed
          ? 'Guard not staffed on prison'
          : caughtScandals.length === 0
            ? 'No caught scandals — rumors do not trigger arrest'
            : imprisonEvents.length === 0
              ? 'Caught scandals fired but no imprisonments — check arrest chance/capacity'
              : undefined,
    },
    {
      name: 'Frontier social contact',
      pass: visitorArrivals >= 1 || maxVisitorsOnMap >= 1 || maxRivalsOnMap >= 1,
      detail: `arrivals=${visitorArrivals} peakVisitors=${maxVisitorsOnMap} peakRivals=${maxRivalsOnMap}`,
      note: maxRivalsOnMap === 0 && visitorArrivals <= 1
        ? 'Rivals are random world events — quiet year is OK'
        : undefined,
    },
  ];

  const required = gates.filter((g) => g.name !== 'Frontier social contact');
  const requiredPass = required.every((g) => g.pass);
  const optionalPass = gates.filter((g) => !required.includes(g)).every((g) => g.pass);

  section(lines, 'Verdict');
  for (const g of gates) {
    const mark = g.pass ? 'PASS' : 'FAIL';
    const optional = !required.includes(g);
    lines.push(`  [${mark}]${optional ? ' (opt)' : ''} ${g.name} — ${g.detail}`);
    if (g.note) lines.push(`         ↳ ${g.note}`);
  }
  lines.push('');
  if (requiredPass) {
    lines.push('✓ Social systems OK (life, drama mix, prison arrests, leadership)');
    if (!optionalPass) {
      lines.push('△ Frontier contact quiet this run — timing-dependent');
    }
  } else {
    lines.push('✗ Social check FAILED — see notes above');
  }

  const report = lines.join('\n');
  console.log(report);

  mkdirSync(logsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = join(logsDir, `sim-social-${stamp}.txt`);
  writeFileSync(logPath, report, 'utf8');
  const chroniclePath = writeChronicleFile(log, buildChronicleMeta(state), chroniclePathFromSimLog(logPath));
  console.log(`\nLog written: ${logPath}`);
  console.log(`Chronicle: ${chroniclePath}`);

  process.exit(requiredPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});