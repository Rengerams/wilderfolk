/**
 * Wilderfolk 2026-09-13 simulation-audit report generator.
 *
 * Regenerates `BUG_REPORTS/2026-09-13-simulation-logic-audit.md` (the whole report: coverage,
 * per-finding tables with their post-audit status, the fix tables, corrections, follow-ups and
 * the final verification) plus the 14 individual high-severity reports.
 *
 *   node wf-report.mjs
 *
 * Edit the data maps in this file — `P1_FIXED_NEEDLES`, `MEDIUM_FIXED`, `LOW_FIXED`,
 * `LOW_INTENDED`, `CROSS_FIXED`, `LOW_BATCHES` and the report text — rather than the generated
 * markdown. Its input is `audit-joined.json` next to this script (the machine-readable audit
 * output; falls back to the original session temporary copy when that file is absent).
 * Everything it writes lives under `BUG_REPORTS/`, which is local-only (gitignored).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(fileURLToPath(import.meta.url));
const OUT = join(REPO, 'BUG_REPORTS');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const DATA_CANDIDATES = [
  join(REPO, 'audit-joined.json'),
  'C:\\Users\\renger\\AppData\\Local\\Temp\\audit-joined.json',
];
const dataPath = DATA_CANDIDATES.find((candidate) => existsSync(candidate));
if (!dataPath) {
  throw new Error(`audit-joined.json not found (looked in: ${DATA_CANDIDATES.join(', ')})`);
}

const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const confirmed = data.confirmed.map((f) => {
  if (String(f.impact || '').trim()) return f;
  // The verifier's title drifted from the audit candidate's title, so the long-form
  // detail could not be matched: the verification paragraph itself describes the
  // defect and its fix, so use it rather than publishing an empty entry.
  const v = String(f.verification || '');
  const m = v.match(/(?:Minimal fix|Fix|Recommended change|Recommended fix)\s*:\s*([\s\S]+)$/i);
  return {
    ...f,
    impact: v,
    fix: m ? m[1].trim() : '',
    detailFromVerification: true,
  };
});
const crossFindings = data.crossFindings;
const groupNotes = data.groupNotes;
const refuted = data.refuted;
const distinctVerdicts = confirmed.length + refuted.length;
const partlyCount = confirmed.filter((f) => f.verdict === 'partly-confirmed').length;
const confirmedOnly = confirmed.length - partlyCount;

const rank = { critical: 0, high: 1, medium: 2, low: 3 };

// --- explicit duplicate merge groups (same root cause reported by two audit groups) ---
const MERGE_GROUPS = [
  { match: ['getCounterAttackChance sums tiered adds', 'counter_attack research effects stack'] },
  { match: ['Civic petitions re-award every tick', 'Free-time civic petition is a per-day decision'] },
  { match: ['SimTickDelta never carries `visitorQuest`', 'visitorQuest is written by ticks but omitted'] },
  { match: ['LifetimeStats.totalHumansDied counts dead entities', 'YearlyStats.deaths subtracts a per-year count'] },
  { match: ['Vacancy-election due check runs only at the New Year', '0.25-year vacancy campaign is only evaluated on a year rollover'] },
  { match: ['resolveCombatLogKind has no event-type guard', 'Legacy combat-kind fallback is applied to every chronicle line'] },
  { match: ['needsMedicalCare compares griefUntilTick with 0', 'Grief window compared against 0'] },
  { match: ['Visitor position advanced twice per tick', 'steerVisitorToHotel moves a pathing visitor twice per tick'] },
  { match: ['re-pushes a fresh Demonstration card', 'The Demonstration card is re-queued every day'] },
  { match: ['Moon-Howler cooldown state is written every full moon', 'Rite cooldown and priest-flee window are written every full moon'] },
  { match: ['migrateTickTimeline scales some absolute-tick fields', 'Tick-timeline migration rescales'] },
  { match: ['Big News ids are re-minted from 1', 'nextBigNewsId is module-level state'] },
  { match: ['availableScripts uses eventLog.slice(-40)', 'availableScripts reads the 40 OLDEST'] },
  { match: ['chronicleChapters is written by the daily layer but carried by neither', 'chronicleChapters is written daily but is absent from the worker prep'] },
  { match: ['Third copy of UNBUILDABLE_TERRAIN', 'Exported UNBUILDABLE_TERRAIN is a second'] },
  { match: ['The \'split a married couple\' repair is unreachable', 'half-couple admission guard is unreachable'] },
  { match: ['NOTIFY_COOLDOWN_DAYS guard can never fire', 'Stage-notify cooldown guard can never fire'] },
  { match: ['Prisoner early-exit skips shared per-tick upkeep', 'pregnancy is frozen'] },
  { match: ['tickMoonHowlerCycle\'s injectable rng is not forwarded', 'Injected rng is not forwarded to the church exorcism'] },
  { match: ['Prep backup shallow-clones entities', 'Rollback snapshot shallow-copies object slices'] },
  { match: ['connectionsAt\'s \'lone crossing\' repair guard can never fire', 'connectionsAt\'s fallback for fewer than two connections'] },
];

const titleOf = (f) => String(f.title || '');
const groupOf = new Map();
for (const f of confirmed) {
  for (let i = 0; i < MERGE_GROUPS.length; i++) {
    if (MERGE_GROUPS[i].match.some((m) => titleOf(f).includes(m))) {
      groupOf.set(f, `merge-${i}`);
      break;
    }
  }
}

const clusters = new Map();
const merged = [];
for (const f of confirmed) {
  const key = groupOf.get(f);
  if (!key) {
    merged.push({
      severity: f.severity,
      file: f.file,
      lines: f.lines,
      category: f.category,
      title: f.title,
      evidence: f.evidence,
      impact: f.impact,
      fix: f.fix,
      verdict: f.verdict,
      verification: f.verification,
      alsoReportedAs: [],
      groups: [f.group],
    });
    continue;
  }
  if (clusters.has(key)) {
    const c = clusters.get(key);
    c.alsoReportedAs.push(`${titleOf(f)} (${f.group})`);
    c.groups.push(f.group);
    c.lines = [...new Set([c.lines, f.lines].join(' | ').split(' | '))].join(' | ');
    if ((rank[f.severity] ?? 4) < (rank[c.severity] ?? 4)) c.severity = f.severity;
    continue;
  }
  const rec = {
    severity: f.severity,
    file: f.file,
    lines: f.lines,
    category: f.category,
    title: f.title,
    evidence: f.evidence,
    impact: f.impact,
    fix: f.fix,
    verdict: f.verdict,
    verification: f.verification,
    alsoReportedAs: [],
    groups: [f.group],
  };
  clusters.set(key, rec);
  merged.push(rec);
}

merged.sort((a, b) => (rank[a.severity] ?? 4) - (rank[b.severity] ?? 4) || String(a.file).localeCompare(String(b.file)));

for (const m of merged) {
  if (!String(m.impact || '').trim()) m.impact = m.verification;
  if (!String(m.fix || '').trim()) m.fix = 'See the independent-verification paragraph below — it states the exact minimal change.';
  if (!String(m.verification || '').trim()) m.verification = 'Confirmed by the audit group; no separate verifier paragraph recorded.';
}

// Findings withdrawn after owner review: the code is intended behaviour and the
// document that contradicted it is the artifact that was corrected.
const WITHDRAWN_AT_REVIEW = [
  {
    needle: 'YOUTH_LOVE_MIN_AGE = 12',
    status: 'withdrawn — intended behaviour (documentation corrected)',
    resolution:
      'Owner decision (2026-09-13): the youth-love minimum age of 12 is intended, so `YOUTH_LOVE_MIN_AGE = 12` in `src/game/simulation/humanRelationships.ts` stays as it is. The defect was in the documents, which still described the older age-14 gate, and they were corrected to 12: `docs/archive/SIMULATION_AUTHORITY.md` §3 (ownership row) and §5 (youth-love invariant), `docs/archive/YOUTH_LOVE_FEATURE.md` (age timeline, start-eligibility age row, daily age-protection step, automated-coverage row) and the README feature table. The same decision then closed the other half of the same drift in **code** rather than in prose: youth conception now begins at 12 (`HUMAN_FERTILITY_START` = 12 with `YOUTH_CONCEPTION_MULTIPLIERS` 12: 0.25 and 13: 0.25, 14–17 unchanged), so ages 12–17 conceive only through the mutual youth-love gate, and an affair is now adult-only on **both** sides (`Relationship.AFFAIR_MIN_AGE` = 18) — which also resolves this report\'s affair-conception finding (M-tier, `humanRelationships.ts:789`). New regression tests: `tests/youthConception.ageFloor.test.ts` (4) and `tests/affairAge.adultOnly.test.ts` (4). No save field, format or migration change.',
  },
];
const withdrawn = [];
for (const w of WITHDRAWN_AT_REVIEW) {
  const i = merged.findIndex((m) => String(m.title).includes(w.needle));
  if (i >= 0) {
    const [rec] = merged.splice(i, 1);
    withdrawn.push({ ...rec, status: w.status, resolution: w.resolution });
  }
}

const counts = { critical: 0, high: 0, medium: 0, low: 0 };
for (const m of merged) counts[m.severity] = (counts[m.severity] ?? 0) + 1;
const byCat = {};
for (const m of merged) byCat[m.category] = (byCat[m.category] ?? 0) + 1;

const highs = merged.filter((m) => m.severity === 'high');
const meds = merged.filter((m) => m.severity === 'medium');
const lows = merged.filter((m) => m.severity === 'low');
/** High-severity findings fixed after the audit (see *Post-audit changes*). */
const P1_FIXED_NEEDLES = [
  'getCounterAttackChance sums tiered adds',
  'tryGraduateHumanChild is unreachable',
  'updateStorageCaps has no call site',
  'discards entities appended to state.entities',
  'Affair exposure reason ignores its inputs',
  'Civic petitions re-award every tick',
  'Opening-night answers are misrouted',
  'Event-log id allocator is per-realm',
  'merges adult children into the parents',
  'never checks whether the custodian',
  'Legacy Church migration runs on every load',
  'SimTickDelta never carries',
  'YearlyStats.deaths subtracts',
  'Vacancy-election due check runs only at the New Year',
];
/** Medium-tier findings fixed after the audit, keyed by the report's own M-number. */
const MEDIUM_FIXED = {
  M1: ['animalCare.ts', 'the animal-shortage warning fires once per episode instead of every colony day', 'medium-batch2', 'lead, wave 1'],
  M2: ['beautyGrid.ts', 'a beauty-free grid keeps the caller\'s position instead of the search window\'s corner', 'medium-batch3', 'lead, wave 1'],
  M3: ['buildingStaffingActions.ts', 'the construction-builder picker refuses a pregnant or imprisoned settler and only announces a builder `addToConstructionCrew` actually accepted', 'medium-B1-staffing', 'B1 staffing'],
  M4: ['buildingStaffingActions.ts', '`canAssignWorkerToBuilding` requires the job-free condition its assignment enforces, so the button no longer approves a builder the assignment then refuses', 'medium-B1-staffing', 'B1 staffing'],
  M5: ['dailyBuildingEconomy.ts', 'staffed Greenhouse output is recorded in the economy ledger under its own source row', 'medium-C1-economy', 'C1 economy'],
  M6: ['ecoBreakdown.ts', 'the Nature tab explains the recorded Health with the ecosystem-health owner (preserve bonus, all six species) instead of a drifted local formula', 'medium-C2-story', 'C2 story & UI'],
  M7: ['eventLog.ts', 'only `type === \'combat\'` entries can be classified as raids/defences', 'medium-batch2', 'lead, wave 1'],
  M8: ['gameLoop.ts', 'boot-window commands are flushed on the main thread when the worker never arrives', 'existing gameLoop suite', 'lead, wave 1'],
  M9: ['gameLoop.ts', '`frame` re-arms the animation frame in `finally`, so one throw no longer freezes the game', 'typecheck + existing suite', 'lead, wave 1'],
  M10: ['dailyBuildingEconomy.ts', 'Irrigation\'s `drought_resist` research effect is read by the drought farm multiplier, so the tech has an effect', 'medium-C1-economy', 'C1 economy'],
  M11: ['hospitalCare.ts', 'the grief window is compared with the current tick, not 0', 'medium-batch2', 'lead, wave 1'],
  M12: ['hotelStay.ts', 'the hotel walk applies exactly one step per tick — the path stepper only sets velocity (see the M12/M14/M27 correction below)', 'medium-A-movement', 'A movement'],
  M13: ['humanHospitalBehavior.ts', 'hospital treatment is a stateless per-settler daily gate (`isHospitalTreatmentTick`), so skill and food are granted once a day rather than every tick', 'medium-A-movement', 'A movement'],
  M14: ['humanHospitalBehavior.ts', 'hospital routing sets walk velocity only; the human loop applies the step (no double movement)', 'medium-A-movement', 'A movement'],
  M15: ['humanTick.ts', 'the throttled off-screen path calls the single energy-drain rule in `simulation/humanNeeds.ts` instead of a second modifier set', 'medium-B1-staffing', 'B1 staffing'],
  M16: ['humanTick.ts', 'the on-duty official path reaches `officialHandlePetitioners` for a Town Hall occupant, so official service can run (greeting only — petition resolution stays daily)', 'medium-B1-staffing', 'B1 staffing'],
  M17: ['inventionFair.ts', 'the Demonstration card is offered once per fair: the owner records that it was already offered instead of re-pushing it every colony day', 'medium-C2-story', 'C2 story & UI'],
  M18: ['leaderHouse.ts', 'the leader\'s household uses `collectMinorHousehold`, so married or grown children are no longer dragged into the manor and other residents stop being evicted daily', 'medium-B2-leadership', 'B2 leadership'],
  M19: ['migration.ts', 'autumn herd deer spawn on passable ground: the spawn search skips unpassable terrain instead of placing deer on it', 'medium-C1-economy', 'C1 economy'],
  M20: ['moonHowler.ts', 'rite cooldown + priest-fear window are saved, prepped and delta-carried', 'medium-persistence', 'lead, wave 1'],
  M21: ['moonHowler.ts', 'the rare replacement roll is decided once per moon, not on all three ticks of the hour', 'medium-persistence', 'lead, wave 1'],
  M22: ['pathfinding.ts', 'the path cache key includes the path origin, so a settler can no longer be steered back to a stale origin\'s waypoints', 'medium-A-movement', 'A movement'],
  M23: ['residencySelection.ts', 'every residence picker skips rival-camp housing', 'medium-batch2', 'lead, wave 1'],
  M24: ['saveLoad.ts', 'legacy-day-length migration scales `pregnancyDueProgress` and story-card deadlines', 'medium-persistence', 'lead, wave 1'],
  M25: ['saveSchema.ts', '`villageHappiness` (plus the Moon Howler fields) added to the save allow-list', 'medium-persistence', 'lead, wave 1'],
  M26: ['simEffects.ts', 'Big News ids derive from the world\'s own log, so a dismissed id is never re-issued', 'medium-persistence', 'lead, wave 1'],
  M27: ['simulation/humanMovement.ts', 'the commute leaves the single step to the human loop — the path stepper no longer moves the entity itself (see the M12/M14/M27 correction below)', 'medium-A-movement', 'A movement'],
  M28: ['humanRelationships.ts', 'affairs are 18+ on both sides, so 14–17 pregnancies cannot bypass the youth gate', 'affairAge.adultOnly', 'lead, wave 1'],
  M29: ['stripTopology.ts', '`replacesBuildingId` is written, so a gate dropped on a wall replaces it and refunds half the wall instead of silently placing nothing', 'medium-C2-story', 'C2 story & UI'],
  M30: ['stripTopology.ts', 'wall-run planning steps over an existing gate instead of refusing the whole run', 'medium-C2-story', 'C2 story & UI'],
  M31: ['tickLayerSystems.ts', 'the off-screen wildlife throttle counts layer pulses, so every id is reachable', 'medium-batch2', 'lead, wave 1'],
  M32: ['travelingTheatre.ts', 'the script list reads the newest 40 log entries, not the oldest', 'medium-batch3', 'lead, wave 1'],
  M33: ['tutorialCampaign.ts', 'the first-spring guide finishes instead of regressing and reappearing every year', 'medium-C2-story', 'C2 story & UI'],
  M34: ['valleyChronicle.ts', '`chronicleChapters` is carried by the worker prep payload and the tick delta', 'medium-persistence', 'lead, wave 1'],
  M35: ['villageLeadership.ts', 'a zero-candidate reveal steps the office down and schedules the successor election instead of clearing `villageLeaderId` silently', 'medium-B2-leadership', 'B2 leadership'],
  M36: ['watchtowerDetection.ts', 'only player watchtowers reveal raiders', 'medium-batch3', 'lead, wave 1'],
  M37: ['workforce.ts', '`removeWorkerTransition` clears workplaces and crews but leaves the residence occupants list intact, so the residence↔occupants invariant holds', 'medium-B2-leadership', 'B2 leadership'],
  M38: ['worldEvents.ts', 'storm damage never heals a building that is already at the HP floor', 'medium-batch2', 'lead, wave 1'],
};
const MEDIUM_FIXED_COUNT = Object.keys(MEDIUM_FIXED).length;
/**
 * Low-tier findings closed after the audit, keyed by the report's own L-number.
 * A low id that is absent here is still open; the batch label names the wave that fixed it.
 */
const LOW_FIXED = {
  L1: 'lead review',
  L2: 'lead review',
  L3: 'lead review',
  L4: 'lead review',
  L5: 'lead review',
  L6: 'lead review',
  L7: 'B1 staffing (with M4)',
  L9: 'low-9',
  L10: 'low-9 (same fix as L9)',
  L11: 'lead review',
  L12: 'low-4',
  L13: 'low-4',
  L14: 'low-4',
  L15: 'low-2',
  L16: 'low-6',
  L17: 'low-5',
  L18: 'low-5',
  L19: 'low-5',
  L20: 'low-5',
  L21: 'low-7',
  L22: 'low-7',
  L23: 'low-6',
  L24: 'low-6',
  L25: 'low-6',
  L26: 'low-5',
  L27: 'low-5',
  L28: 'low-7',
  L29: 'low-9',
  L30: 'lead review (follow-up)',
  L31: 'low-2',
  L32: 'low-2',
  L33: 'low-2',
  L34: 'low-2',
  L35: 'low-6',
  L36: 'low-6',
  L37: 'low-6',
  L38: 'low-6',
  L43: 'low-7',
  L44: 'low-7',
  L45: 'low-9',
  L46: 'low-9',
  L47: 'low-7',
  L48: 'low-3',
  L49: 'low-3',
  L50: 'low-9',
  L51: 'low-2',
  L52: 'low-6',
  L53: 'low-6',
  L54: 'low-7',
  L55: 'low-7',
  L56: 'low-5',
  L57: 'low-5',
  L58: 'low-6',
  L59: 'low-1',
  L63: 'low-7',
  L64: 'low-9',
  L65: 'low-1',
  L66: 'low-1',
  L67: 'low-1',
  L68: 'low-1',
  L69: 'low-5',
  L70: 'low-7',
  L71: 'low-7',
  L72: 'low-4',
  L73: 'low-4',
  L74: 'low-6',
  L77: 'low-7',
  L79: 'low-5',
  L80: 'low-4',
  L81: 'low-4',
  L82: 'low-4',
  L83: 'low-4',
  L8: 'low-8',
  L39: 'low-8',
  L40: 'low-8',
  L41: 'low-8',
  L42: 'low-8',
  L60: 'low-8',
  L61: 'low-8',
  L75: 'low-8',
  L76: 'low-8',
  L78: 'low-8',
};
/** Low findings investigated after the audit and deliberately left unchanged (not defects). */
const LOW_INTENDED = {
  L62: 'low-8 — investigated: intended behaviour after the 2026-09-13 exposure fix (gossip passes "rumor"; only a witnessed caught-in-the-act divorces at 1.0), pinned by test, no code change',
};
const LOW_FIXED_COUNT = Object.keys(LOW_FIXED).length;
const LOW_INTENDED_COUNT = Object.keys(LOW_INTENDED).length;
const LOW_BATCHES = [
  ['lead review', 'direct fixes by the lead across `adaptiveSpatialQuery`, `animalCare`, `buildingMaintenanceActions`, `buildingPlacementActions`, `buildings`, `buildingStaffingActions`, `dailyChallenges`', 'L1–L6, L11', 'existing suites + `tests/low-*.test.ts`'],
  ['low-1', 'worker persistence, delta transport, spatial-grid caches', 'L59, L65, L66, L67, L68, plus cross-cutting X4 (grass render grid) and X5 (HUD counters)', '`tests/low-1-worker-persistence.test.ts` (6)'],
  ['low-2', 'group events, visitor trade, defense structures, prison escape', 'L15, L31, L32, L33, L34, L51', '`tests/low-2-events-defense.test.ts` (11)'],
  ['low-3', 'Moon Howler, lifecycle, death cleanup', 'L48, L49, plus cross-cutting X2 (moon cadence), X3 (newborn residence, youth-love link) and X6 (duplicate window helpers, partner predicate)', '`tests/low-3-moon-lifecycle.test.ts` (9)'],
  ['low-4', 'save/load, world generation, calendar', 'L12, L13, L14, L72, L73, L80–L83', '`tests/low-4-save-worldgen.test.ts` (11)'],
  ['low-5', 'combat spoils, ecology stage, economy ledger, yearly stats', 'L17, L18, L19, L20, L26, L27, L56, L57, L69, L79, plus cross-cutting X6 (`countArmedMilitia`)', '`tests/low-5-combat-ecology.test.ts` (12)'],
  ['low-6', 'hospital care, chat/dialogue, chronicle filters', 'L16, L23, L24, L25, L35, L36, L37, L38, L52, L53, L58, L74', '`tests/low-6-care-chat.test.ts` (12)'],
  ['low-7', 'sim geometry, housing audit, render snapshot', 'L21, L22, L28, L43, L44, L47, L54, L55, L63, L70, L71, L77, plus cross-cutting X1/X2 on `tickLayerRealtime`', '`tests/low-7-sim-geometry.test.ts` (10)'],
  ['low-9', 'town-hall tax base, hunt research key, migration herds, path cache, invariants', 'L9, L10, L29, L45, L46, L50, L64', '`tests/low-9-simdata.test.ts` (6)'],
  ['lead follow-up', 'the L30 wiring the sim-data batch could not reach (its owner file was outside that batch\'s scope), and the L2 correction below', 'L30', '`tests/ecosystemPressure.winterDemand.test.ts` (2)'],
];
/**
 * Cross-cutting findings closed after the audit, keyed by a distinctive fragment of the
 * finding text. A fragment that is absent here is still open.
 */
const CROSS_FIXED = {
  'Every injectable-RNG owner is called without its rng': 'low-7',
  'Loading a save never restores the colony seed': 'low-4',
  'Conception and pregnancy duration': 'low-3 (already fixed by the determinism pass)',
  'Off-screen wildlife throttle gate can never fire': 'M31',
  "gameTick's `state.entities = allAlive` destroys entities": 'H5',
  'Realtime layer performs a full-population scan and rewrites residence': 'low-3 / low-7',
  'Hour-granular full-moon gate is evaluated on all three ticks': 'M21 + low-3',
  'Per-tick full-population scans feed a decision that can only fire at nightfall': 'low-3',
  'Prison escape clears prisonBuildingId but leaves the id in prison.occupants': 'L51 (low-2)',
  "spawnCaravan's carrier entity is discarded": 'H5',
  'Newborn gets residenceBuildingId but is invisible to the assign layer': 'low-3',
  "Death cleanup never clears the survivor's youthLovePartnerId": 'low-3',
  'Debug curse command can create a second living cursed Moon Howler': 'low-3',
  'Manual builder assignment omits the pregnancy/alive checks': 'M3 (B1 staffing)',
  'pruneDeadBarracksOccupants is never called': 'L15 (low-2)',
  'syncGrassRenderGrid never refreshes a reusable grid': 'low-1',
  'Tree and grass sim grids are never reconciled': 'L67 (low-1)',
  'extractSimPrep shallow-clones entities, so nested mutable state is aliased': 'L66 (low-1)',
  'extractSimPrep shallow-copies entities/elements, so rollback cannot undo nested mutations': 'L66 (low-1)',
  'SimPrepKeys omits simulation state that a tick writes': 'worker-tick-rollback fix (lead)',
  'simPrep omits fields the tick writes, so a failed tick is only partially rolled back': 'worker-tick-rollback fix (lead)',
  'Worker tick delta carries neither huntVisuals nor chronicleChapters': 'L59 (low-1) + M34',
  "Church 'one-time' migration runs on every load": 'H8',
  'visitorQuest is written by the sim but carried by neither': 'H9',
  'Moon Howler exorcism cooldown and priest-flee deadline are never persisted': 'M20',
  'Workforce/mood HUD fields written every tick are never transferred': 'low-1 (X5)',
  'chronicleChapters and huntVisuals are written in the worker but omitted from the tick delta': 'L59 (low-1) + M34',
  'All legacy save-migration branches are unreachable': 'low-4',
  'Missing _ticksPerDay defaults to the legacy 24-tick day': 'low-4',
  'updateStorageCaps is never called': 'H3',
  'Second Moon Howler spawn path: the debug command curses a settler': 'low-3',
  'Hand-rolled storage-cap clamps instead of addCappedResource': 'L26 (low-5)',
  'groupEvents privately re-implements the affordability, deduction and storage-headroom rules': 'L32/L33 (low-2)',
  'Seven unreferenced legacy chat/courtship implementations survive': 'low-6',
  'isLivingMarriagePartner duplicates moonHowler.isSettlerRelationshipEntity': 'low-3',
  'countArmedMilitia: dead militia-count rule that disagrees with the militia owner': 'low-5',
  'Dead/duplicated Moon Howler window helpers': 'low-3',
  'The simulation worker never receives or installs the run seed': 'worker seed adoption (`adoptSimSeedFromWorld` in `resetWorkerSession`)',
  'Seeded global Math.random is shared with the renderer/audio': 'resolved by construction — no `Math.random(` call remains in `src`, so the override is a third-party reach-through safety net only',
  "Leader-residency check has no exemption for the leader's temporary Moon Howler form": 'lead review (follow-up)',
  'Wildkin reproduces but is absent from REPRO_WILDLIFE_TYPES': 'lead review (follow-up)',
  'assignAllWorkers: dead second auto-staffing entry point': 'lead review (deleted)',
  'Second calendar definition: DAYS_PER_YEAR / MONTHS_PER_YEAR / DAYS_PER_MONTH re-declared locally': 'lead review (follow-up)',
  'RNG stream position is not part of any rollback/save snapshot': 'lead review (follow-up) — `simRng.snapshotSimRng`/`restoreSimRng` carried by the save file, the worker hand-off (`world.simRng`) and the prep payload',
  'Compact worldMap save discards in-play terrain edits': 'deferred — the terrain generator is being replaced next version (save-format decision)',
};
const crossStatus = (title) => {
  for (const [needle, batch] of Object.entries(CROSS_FIXED)) {
    if (String(title).includes(needle)) return batch;
  }
  return null;
};
const crossMatched = crossFindings.filter((f) => crossStatus(f.title));
const CROSS_FIXED_COUNT = crossMatched.filter((f) => {
  const st = crossStatus(f.title);
  return !/^(deferred|resolved)/.test(st);
}).length;
const CROSS_RESOLVED_COUNT = crossMatched.filter((f) => /^resolved/.test(crossStatus(f.title))).length;
const CROSS_DEFERRED_COUNT = crossMatched.filter((f) => /^deferred/.test(crossStatus(f.title))).length;
/** Cross-reference a high finding by a distinctive fragment of its title. */
const hN = (needle) => {
  const i = highs.findIndex((h) => String(h.title).includes(needle));
  return i >= 0 ? `H${i + 1}` : 'H?';
};

// findings personally re-verified by the lead against source in this session
const PERSONAL = [
  'getCounterAttackChance sums tiered adds',
  'counter_attack research effects stack',
  'tryGraduateHumanChild is unreachable',
  'updateStorageCaps has no call site',
  'Event-log id allocator is per-realm',
  'Wholesale `state.entities = allAlive` discards',
  'Legacy Church migration runs on every load',
  'Civic petitions re-award every tick',
  'Free-time civic petition is a per-day decision',
  'buildHousingUnits never checks whether the custodian',
  'YOUTH_LOVE_MIN_AGE = 12',
  'LifetimeStats.totalHumansDied counts dead entities',
  'YearlyStats.deaths subtracts a per-year count',
  'Opening-night answers are misrouted',
  'Vacancy-election due check runs only at the New Year',
  'Affair exposure reason ignores its inputs',
];
const isPersonal = (t) => PERSONAL.some((p) => String(t).includes(p));

const clean = (s) => String(s ?? '').replace(/\r?\n+/g, ' ').replace(/\|/g, '\\|').trim();
const esc = (s) => String(s ?? '').replace(/\r/g, '').trim();

const today = '2026-09-13';
const lines = [];
lines.push('# Simulation logic audit — Wilderfolk 0.6.4');
lines.push('');
lines.push(`- **Status:** resolved — audit complete and remediated; ${P1_FIXED_NEEDLES.length} of ${counts.high} high-severity, ${MEDIUM_FIXED_COUNT} of ${counts.medium} medium-severity, ${LOW_FIXED_COUNT} of ${counts.low} low-severity and ${CROSS_FIXED_COUNT} of ${crossFindings.length} cross-cutting findings fixed and verified (${LOW_INTENDED_COUNT} low finding investigated and left as intended behaviour, ${CROSS_RESOLVED_COUNT} cross-cutting finding resolved by construction, ${CROSS_DEFERRED_COUNT} deferred with the terrain-generator replacement; every table below carries a per-finding status, and the deferred item plus the recorded follow-ups are named in *Follow-ups*)`);
lines.push(`- **Date:** ${today}`);
lines.push(`- **Version/build:** 0.6.4 (\`package.json\`), commit workspace tree at audit time`);
lines.push(`- **Reporter:** full simulation-logic audit (36 audit/verification agents + lead review)`);
lines.push(`- **Area:** Truth (simulation correctness), Play (player-visible outcomes), save/migration, worker`);
lines.push(`- **Scope:** every simulation-owned module under \`src/game/\` reachable from \`gameTick()\`, \`applyWorkerCommand()\`, the four tick layers, and the save/worker transport paths`);
lines.push('');
lines.push('## Status history');
lines.push('');
lines.push(`- ${today} — open (the audit ran; findings recorded, no code changed by the audit itself)`);
lines.push(`- ${today} — investigating (owner review of the high tier: one finding withdrawn as intended behaviour, the rest confirmed)`);
lines.push(`- ${today} — resolved (all ${P1_FIXED_NEEDLES.length} high-severity findings fixed at their owning modules with regression tests and verified by the full suite, typecheck, lint and the 360-day invariant gate; see *Post-audit changes*)`);
lines.push(`- ${today} — remediation continued (the whole medium tier, ${LOW_FIXED_COUNT} of ${counts.low} low findings and ${CROSS_FIXED_COUNT} cross-cutting findings fixed by lead review and nine owner-scoped batches; every remaining open finding is marked \`open\` in the tables below)`);
lines.push('');
lines.push('## How this audit was performed');
lines.push('');
lines.push('1. **Reconnaissance (lead).** Tick-layer order and cadence law were read from `src/game/gameTick.ts`, the four `tickLayer*.ts` files, and the governing contract in `docs/archive/SIMULATION_AUTHORITY.md` (ownership table §3, cadence law §4, hard invariants §5, forbidden changes §6).');
lines.push('2. **Module audit — 22 parallel agents.** Every simulation file (230 non-test `.ts` files under `src/game`, excluding the presentation-only `renderer/**`, panels, sprites, `viewState.ts`, `dashboardData.ts` and content/tutorial files) was assigned to a group and read in full, function by function, against the contract and the existing tests in `tests/`. 180 files were explicitly in scope; each group reported at most its 12 most significant defects with exact line evidence.');
lines.push('3. **Adversarial verification — 8 parallel verifier agents.** Every candidate finding was re-checked against the actual source by a *different* agent instructed to falsify it (locate the code by content, find the caller guard, check whether an existing test locks the behaviour in, decide production reachability). Verdicts: confirmed / partly-confirmed / refuted / unverifiable, plus a corrected severity.');
lines.push('4. **Cross-cutting audit — 6 parallel agents** on determinism/RNG, tick cadence, state invariants, mutation-safety/caches/memory, save+worker persistence surface, and duplicate owners/dead code.');
lines.push('5. **Lead verification.** The highest-severity findings were re-opened in the source by the lead before publication; each such finding is marked **re-verified** below.');
lines.push('');
lines.push('**Baseline at audit time (measured, not assumed):** `npm run test:types` (tsc, `tsconfig.vitest.json`) passes, and `npm run test:standard` passes — **105 test files / 593 tests, 0 failures** (plus `check:source`). The repository is green; none of the defects in this report is currently caught by an existing test, which is why they can persist unnoticed.');
lines.push('');
lines.push('No file was modified **by the audit itself**, and no runtime reproduction was executed during it: **all evidence below is static code evidence** (exact file, line, and the failing call path). The fixes in *Post-audit changes* were applied afterwards. Where a fix needs a design decision it is stated as such.');
lines.push('');
lines.push('## Coverage and outcome');
lines.push('');
lines.push(`| Metric | Value |`);
lines.push(`|---|---|`);
lines.push(`| Module groups audited | 22 (plus 6 cross-cutting) |`);
lines.push(`| Files in scope | 180 |`);
lines.push(`| Candidate findings raised | ${distinctVerdicts} |`);
lines.push(`| Independently **confirmed** | ${confirmedOnly} |`);
lines.push(`| **Partly confirmed** (real defect, narrower or differently-described impact) | ${partlyCount} |`);
lines.push(`| **Refuted / unverifiable** (not reported as defects) | ${refuted.length} |`);
lines.push(`| Distinct defects after de-duplication | **${merged.length}** |`);
lines.push(`| — high | ${counts.high}${P1_FIXED_NEEDLES.length > 0 ? ` (all ${P1_FIXED_NEEDLES.length} fixed after the audit — see *Post-audit changes*)` : ''} |`);
lines.push(`| — medium | ${counts.medium}${MEDIUM_FIXED_COUNT > 0 ? ` (all ${MEDIUM_FIXED_COUNT} fixed after the audit — see *Post-audit changes*)` : ''} |`);
lines.push(`| — low | ${counts.low}${LOW_FIXED_COUNT > 0 ? ` (${LOW_FIXED_COUNT} fixed, ${LOW_INTENDED_COUNT} left as intended behaviour — see the status column)` : ''} |`);
lines.push(`| Cross-cutting findings (single-pass, not separately verified) | ${crossFindings.length}${CROSS_FIXED_COUNT > 0 ? ` (${CROSS_FIXED_COUNT} fixed, ${CROSS_RESOLVED_COUNT} resolved by construction, ${CROSS_DEFERRED_COUNT} deferred — see the status column)` : ''} |`);
lines.push(`| Withdrawn after owner review (intended behaviour; the document was corrected) | ${withdrawn.length} |`);
lines.push('');
lines.push('Findings by category (de-duplicated):');
lines.push('');
lines.push('| Category | Count | Meaning |');
lines.push('|---|---:|---|');
const CAT_MEANING = {
  'logic-error': 'a branch, guard, formula or ordering does not do what its name/comment/caller requires',
  'cadence-violation': 'work happens at the wrong cadence, or a per-tick rate is not scaled to its layer step',
  'authority-violation': 'a second owner/implementation of a decision the contract assigns to one module',
  'invariant-risk': 'a path that can leave a §5 hard invariant false',
  determinism: 'an outcome the run seed cannot reproduce',
  'mutation-safety': 'mutation while iterating, stale copy, aliasing, or a cache that is not invalidated',
  'resource-economy': 'resources double-counted, unaffordable, negative, or bypassing caps/ledger',
  'numeric-safety': 'NaN/Infinity/division hazards or a missing clamp',
  'memory-growth': 'collections that only grow',
  'dead-code': 'unreachable branch or a value computed and never used (usually a missing effect)',
  'save-persistence': 'simulation state written by a tick but not carried by save/prep/delta',
  'edge-case': 'empty/undefined/first-tick/demolition boundary not handled',
};
for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
  lines.push(`| \`${k}\` | ${v} | ${CAT_MEANING[k] ?? ''} |`);
}
lines.push('');
lines.push('## Prioritised remediation plan');
lines.push('');
lines.push('The audit found **no crash or save-corruption defect in normal play**, but it did find several defects that visibly change the simulation, and a large tail of dead or half-wired logic. Recommended order:');
lines.push('');
lines.push('**P1 — outcome-changing logic (fix first, each is a small bounded change):**');
lines.push(`1. \`combat.ts\` counter-attack research tiers stack to a guaranteed kill (${hN('getCounterAttackChance sums tiered adds')}).`);
lines.push(`2. The child→adult graduation path is unreachable, so the entire education payoff (\`educated\`, skill/energy bonus) never fires (${hN('tryGraduateHumanChild is unreachable')}).`);
lines.push(`3. \`updateStorageCaps\` is never called: barns/silos/storehouses confer no storage and spoilage never changes (${hN('updateStorageCaps has no call site')}).`);
lines.push(`4. Trade-caravan carriers are discarded by the end-of-tick entity rebuild, so caravans cannot travel (${hN('discards entities appended to state.entities')}).`);
lines.push(`5. Per-day civic-petition rolls are used as per-tick gates, inflating reputation/energy/gold/food (${hN('Civic petitions re-award every tick')}).`);
lines.push(`6. \`travelingTheatre\` stage-3 answers are routed to stage 2, so every opening-night choice cancels the show (${hN('Opening-night answers are misrouted')}).`);
lines.push(`7. Affair exposure uses a flat 22% roll and ignores whether the spouse/guard is actually present (${hN('Affair exposure reason ignores its inputs')}).`);
lines.push(`8. Youth love starts at 12 instead of the invariant's 14 (${hN('YOUTH_LOVE_MIN_AGE = 12')}).`);
lines.push('');
lines.push('**P2 — state that does not survive save/worker handoff** (the display copy silently loses simulation state):');
lines.push(`\`visitorQuest\` (${hN('SimTickDelta never carries')}), the event-log id allocator being per-realm (${hN('Event-log id allocator is per-realm')}), the Church priest stripped on every load (${hN('Legacy Church migration runs on every load')}), Moon-Howler rite cooldowns, \`chronicleChapters\`, \`huntVisuals\`, \`villageCanHeat\`.`);
lines.push('');
lines.push(`**P3 — assignment/residency correctness:** custodian double-claim in \`buildHousingUnits\` (${hN('never checks whether the custodian')}), adult children merged back into the parents' unit (${hN('merges adult children into the parents')}), \`removeWorkerTransition\` breaking the residence invariant, rival-camp housing accepted by the pickers.`);
lines.push('');
lines.push(`**P4 — cadence and calendar:** vacancy-election due date evaluated only at year rollover (${hN('Vacancy-election due check runs only at the New Year')}), off-screen wildlife throttle unit mismatch, Moon-Howler replacement roll repeated across the three ticks of hour 20.`);
lines.push('');
lines.push('**P5 — dead/unwired logic and duplicate owners:** the remaining low-severity items. These are cheap to fix and each one currently means a rule, refund, rate-limit, filter or repair that the player is promised but that never runs.');
lines.push('');
lines.push('**Status (2026-09-13):** P1–P5 are implemented and verified — **every high, medium and most low-severity finding in this report is now resolved** (see the fix tables under *Post-audit changes*), and the low and cross-cutting tables below carry a per-finding status. The entries still marked `open` are the remaining documented work.');
lines.push('');
lines.push('## Post-audit changes (applied after the audit ran, 2026-09-13)');
lines.push('');
lines.push('Recorded here so the findings below can be read against the state they were found in. Three owner decisions were taken after the audit and are already implemented:');
lines.push('');
lines.push('1. **The youth-love minimum age of 12 is intended** — the documents were the stale artifact, not the code. `SIMULATION_AUTHORITY.md` §3/§5, `YOUTH_LOVE_FEATURE.md` and the README feature table now say 12 (this report\'s H11 high finding is **withdrawn**; see the section below).');
lines.push('2. **The age rules were made coherent in code (audit findings H11 and the affair-conception finding)** — youth conception now starts at 12 (`HUMAN_FERTILITY_START` = 12; `YOUTH_CONCEPTION_MULTIPLIERS` gained 12: 0.25 and 13: 0.25, the base value 14 already used, with 14–17 unchanged at 0.25/0.35/0.50/0.70), and an affair now requires **18 on both sides** (`Relationship.AFFAIR_MIN_AGE` = 18, applied to the paramour and the cheater in `isValidAffairTarget` and to the daily owner in `tryDailyAffairEncounter`). Consequences for this report: ages 12–17 have exactly one relationship route and one conception route (the mutual youth-love gate), and the finding "Affair conception path creates ages 14–17 pregnancies without the documented youth-love gate" is **resolved by construction** — a 14–17-year-old can no longer hold an affair. Courtship eligibility and every other `HUMAN_ADULT_MIN_AGE` (16) use are unchanged.');
lines.push('');
lines.push('Regression tests added with those changes: `tests/youthConception.ageFloor.test.ts` (4 — the 12 boundary, 11 still rejected, conception at 12 and 13 with lineage, one-sided/absent links rejected) and `tests/affairAge.adultOnly.test.ts` (4 — 16/17 paramours and a 17-year-old cheater rejected, 18 accepted, lifespan ceiling intact).');
lines.push('3. **The terrain generator is being replaced wholesale in the next version** (owner decision) — so terrain-*generation* findings are **out of scope unless one is a showstopper** (the game fails to start, or a world cannot be generated at all). `worldGen.ts` L80–L83, `terrainGen.ts` L72 and the third `UNBUILDABLE_TERRAIN` copy at `buildingPlacementActions.ts` L4 were fixed only where the change was trivial and safe; do not re-audit, harden or extend the generator, and treat its remaining dead branches as moot. The only checks that still matter for it are the boot-level ones: compile, generate a world, run it (`npm run test:types`, `npm run build`, the suite, the 360-day gate) and the browser smoke test that boots the real build. Findings that only *read* terrain — passability for spawns, unbuildable checks, placement rules — remain in scope, because the replacement must satisfy the same contracts.');
lines.push('');
lines.push('**Verification of those changes** — `npm run test:all` (check:source, the standard suite, `tsc -p tsconfig.vitest.json`, and Oxlint) passes: **107 test files / 601 tests, 0 failures**, typecheck clean, **0 lint warnings / 0 errors on 320 files** (the audit-time baseline was 105 files / 593 tests). `npm run test:full-year` completes the 360-day / 25,920-tick headless gate on seed 12345 with its invariant assertions satisfied (`yearlyStats`/relationship/leadership invariants clean; 24 pregnancies started, 31 births, 29 affairs established). No save field, format or migration change in either edit, and no existing test was weakened.');
lines.push('');
lines.push('### P1 batch — the seven outcome-changing defects, fixed (2026-09-13)');
lines.push('');
lines.push('Each fix is a bounded change at the owning module, with a regression test that fails without it. Nothing else in this report was touched.');
lines.push('');
lines.push('| Finding | Fix | Test |');
lines.push('|---|---|---|');
lines.push('| H1 counter-attack tiers summed to a guaranteed kill | `researchedEffect(state, target, \'add\')` now takes the **strongest** matching tier instead of the sum, matching the project law "weapon/armor tiers replace lower ones — do not stack". Counter-attack is 0.45 / 0.55 and predator block 0.72, not 1.0 / 1.67. | `tests/combatTierEffects.test.ts` (3) |');
lines.push('| H2 no child ever graduated (education payoff dead) | `syncHumanAgeFromCalendar` no longer writes `isJuvenile`; the graduation transition (`tryGraduateHumanChild`, called every tick) owns the flag, so it fires exactly once and `applyEducationGraduation` runs. | `tests/humanGraduation.education.test.ts` (3) |');
lines.push('| H3 `updateStorageCaps` had no caller | Called first in `tickStaticDaily` (daily economy), before spoilage, so Barn/Silo/Wood Storehouse/Store/Market storage bonuses and the Silo spoilage cut reach play. | `tests/storageCaps.dailyWiring.test.ts` (2) |');
lines.push('| H5 the trade-caravan carrier was discarded in its own tick | `spawnCaravan` uses the canonical `pushNewEntity(state, ctx, carrier)` path (retained by the end-of-tick rebuild, indexed, in the mobile grid); `tickTradeCaravans`/`tickLayerSystems` thread `ctx`. | `tests/tradeCaravan.carrierRetention.test.ts` (2) |');
lines.push('| H10 affair exposure invented "caught" without a witness | The daily gossip path passes `\'rumor\'` unconditionally and `pickAffairExposureReason` (plus its `hasStaffedPrison` helper) is deleted; a caught-in-the-act verdict remains owned by the spatial `tryExposeCaughtAffair`, which requires the spouse or a walk-in to be present. Unwitnessed arrests and forced divorces stop. | `tests/affairExposure.rumour.test.ts` (1) |');
lines.push('| H12 civic petitions re-awarded every tick | The two realtime resolution callers are gone (the free-time helper is removed; the on-duty official only greets), leaving `tickTownHallAudiences` as the single daily resolver. The free-time walking motive is untouched. | `tests/civicPetition.cadence.test.ts` (2) |');
lines.push('| H13 every opening-night answer cancelled the show | `resolveTravelingTheatre` dispatches on the answered card first (the three stages use disjoint choice ids) before consulting the shared status flag, so stage-3 answers reach `resolveStage3`. | `tests/travelingTheatre.stageRouting.test.ts` (3) |');
lines.push('');
lines.push('**P1 verification** — `npm run test:all` passes with **118 test files / 628 tests** (31 new in total across both batches), typecheck clean, Oxlint 0 warnings / 0 errors; `npm run test:full-year` completes the 360-day gate with its invariants satisfied. Two behavioural consequences worth noting on purpose: the storage caps now follow the audited formula (base wood/food 800, gold 20 000) instead of the world-gen literals, and caught-in-the-act scandals are now gated on a physical witness, so a colony sees more rumours and fewer imprisonments/divorces for the same amount of gossip. The full-year harness needed the same treatment its subject got: its starter settlement survived on a 100 000-food larder with spoilage switched off, both of which `updateStorageCaps` now owns, so the harness builds Barns/Silos and maintains that larder at each checkpoint within the real cap (`scripts/run-full-year.mts`).');
lines.push('');
lines.push('### Remaining high-severity findings, fixed (2026-09-13)');
lines.push('');
lines.push('The rest of the high tier — state that never reached the display or the save, two housing-unit defects, the death statistics, and the leadership campaign date. Every fix is at the owning module with a regression test.');
lines.push('');
lines.push('| Finding | Fix | Test |');
lines.push('|---|---|---|');
lines.push(`| ${hN('Event-log id allocator is per-realm')} event-log ids were per realm, so the worker's Chronicle entries were dropped | \`logEvent\` derives the next id from the log it writes to (newest-first head + 1) instead of a module counter, so a realm that received a world cannot re-issue an id the log already holds — which is what made the delta's dedupe skip every new worker event. | \`tests/eventLog.idMonotonic.test.ts\` (3) |`);
lines.push(`| ${hN('merges adult children into the parents')} adult children were merged back into the parents' unit | The housing fallback unit uses a new \`collectMinorHousehold\` (settler + partner + **dependent** children), so a parent whose children have grown up no longer forms an unsatisfiable unit spanning two houses and the adult-child move-out can persist. | \`tests/housingUnits.composition.test.ts\` (3) |`);
lines.push(`| ${hN('never checks whether the custodian')} one settler could be claimed by two housing units | The custodian loop reuses the unit that already holds the custodian (tracked per member) instead of creating a competing unit, and the second custodian's children join that household rather than being dropped. | \`tests/housingUnits.composition.test.ts\` (3) |`);
lines.push(`| ${hN('Legacy Church migration runs on every load')} the Church migration stripped the player's priest on every load | The one-time pass is gated on its own marker, which is stamped on the first load even when nothing needed clearing; a later load can no longer release a hand-assigned priest. | save round-trip + \`tests/church.*.test.ts\` |`);
lines.push(`| ${hN('SimTickDelta never carries')} \`visitorQuest\` never reached the display world | Carried by the tick delta **and** the worker prep/rollback payload, and added to the save allow-list, so the smith quest card appears and the quest survives a reload. | \`tests/simPrep.rollbackClosure.test.ts\`, \`tests/workerCommand.roundtrip.test.ts\` |`);
lines.push(`| ${hN('YearlyStats.deaths subtracts')} death statistics were permanently zero | \`gameTick\` tallies deaths per tick from the entities alive at tick start that are not alive at tick end (exact, independent of the end-of-tick rebuild) into the new round-tripped \`deathsThisYear\` field; the yearly record reports it and the lifetime total sums the yearly records. | \`tests/deathStatistics.test.ts\` (3) |`);
lines.push(`| ${hN('Vacancy-election due check runs only at the New Year')} a three-month vacancy campaign could take a year | The daily layer evaluates the pending campaign every day instead of only at the year rollover, so it falls due on its date and no longer swallows that year's scheduled term election. | \`tests/vacancyElection.dueDate.test.ts\` (2) |`);
lines.push('');
lines.push('**Second-batch verification** — `npm run test:all`: **118 files / 628 tests**, typecheck clean, Oxlint 0 warnings / 0 errors; `npm run test:full-year`: exit 0, invariants clean at every 30-day checkpoint and at the end (68 settlers, 23 pregnancies, 30 births, 16 caught scandals). No save-format or migration change: the two new world fields (`visitorQuest`, `deathsThisYear`) round-trip through the existing allow-list, worker prep and tick delta, and older saves simply start them empty.');
lines.push('');
lines.push(`### Medium-tier findings, fixed (${MEDIUM_FIXED_COUNT} of ${counts.medium})`);
lines.push('');
lines.push('The whole medium tier. **Wave 1** (batches 1–3) was fixed by lead review; **wave 2** was five owner-scoped batches run in parallel — A movement, B1 staffing, B2 leadership, C1 economy, C2 story & UI — each restricted to the files its findings own. Each row names the module that owns the decision and the test file that pins the behaviour.');
lines.push('');
lines.push('| Id | Owner module | Fix | Batch | Regression test |');
lines.push('|---|---|---|---|---|');
for (const [id, [file, summary, test, batch]] of Object.entries(MEDIUM_FIXED)) {
  lines.push(`| ${id} | \`${file}\` | ${summary} | ${batch} | ${test === 'typecheck + existing suite' ? '*no new test (typecheck + existing suite)*' : `\`tests/${test}.test.ts\``} |`);
}
lines.push('');
lines.push('> **Report-text correction (M18) and the follow-up it exposed.** The audit\'s *Recommended change* text for M18 describes a **second, different** defect — a stale `moonHowlerSaved.occupation` left behind when a leader steps down (`moonHowler.ts:440`) — not the leader-household defect named in M18\'s heading, impact and verification. The household defect is fixed (row M18 above: `leaderHouse.ts` builds the manor household with `collectMinorHousehold`, pinned by `tests/medium-B2-leadership.test.ts`). The stale-label path was deliberately **not** changed while fixing M18, because it is a separate behaviour with no test; it stays open here as a follow-up so it is not lost.');
lines.push('');
lines.push(`**Medium-batch verification** — \`npm run test:all\`: typecheck clean, Oxlint 0 warnings / 0 errors, full suite green; \`npm run test:full-year\`: exit 0 with invariants clean at every checkpoint. Wave 1 added \`tests/medium-persistence.test.ts\` (7), \`tests/medium-batch2.test.ts\` (8) and \`tests/medium-batch3.test.ts\` (5); wave 2 added \`tests/medium-A-movement.test.ts\` (5), \`tests/medium-B1-staffing.test.ts\` (4), \`tests/medium-B2-leadership.test.ts\` (4), \`tests/medium-C1-economy.test.ts\` (4) and \`tests/medium-C2-story.test.ts\` (8). No medium finding is left open.`);
lines.push('');
lines.push(`### Low-tier findings, fixed (${LOW_FIXED_COUNT} of ${counts.low})`);
lines.push('');
lines.push('The low tier was closed by lead review plus seven owner-scoped batches, each restricted to the files its findings own. The table below lists what each batch closed; the low-findings table further down carries the resulting per-finding status, and any finding not marked `fixed` there is still open.');
lines.push('');
lines.push('| Batch | Owner scope | Findings closed | Regression test |');
lines.push('|---|---|---|---|');
for (const [batch, scope, ids, test] of LOW_BATCHES) {
  lines.push(`| ${batch} | ${scope} | ${ids} | ${test} |`);
}
lines.push('');
lines.push('> **Correction during remediation: the L2 fix over-reached and was corrected.** The first L2 fix filtered `countTamedAnimals` on the owner still being alive. That broke five existing `tests/animalCare.test.ts` cases (their fixture pins the plain contract: an alive animal with a `tamedBy` counts) and, worse, it would have left the stale link in place while `isValidHuntPrey` still refused tamed prey — an animal that is neither fed nor huntable. L2 is fixed at the removal owner instead: `reconcileFamilyReferencesAfterRemoval` clears the dead owner\'s `tamedBy`, so the pet becomes wild and huntable the moment the owner is removed. `countTamedAnimals` is back to its documented contract, and `tests/animalCare.orphanRelease.test.ts` (2) pins the release — both its tests fail with the release removed.');
lines.push('');
lines.push('> **Second correction: the calendar-constant dedupe broke a test import.** Removing `villageLeadership`\'s local `DAYS_PER_YEAR` (the cross-cutting "second calendar definition" item) left `tests/medium-B2-leadership.test.ts` importing a name the module no longer exports; Vitest transpiles without typechecking, so the helper silently evaluated to `NaN` and two M35 assertions failed only in the full suite. The test now imports `DAYS_PER_YEAR` from its owner (`dayCycle`), and the full suite is the check that caught it.');
lines.push('');
lines.push('> **Third correction: M12/M14/M27 were one defect, and it was not in the callers.** A 2026-09-13 change made `pathfinding.steerWithPath` write the entity\'s **position** as well as its velocity, while both callers still applied their own step in the same tick. The audit saw the resulting double movement and treated it as a caller defect: M12 deleted the hotel walk\'s own step and M27 made the commute subtract the stepper\'s step. Both callers were internally consistent afterwards, but the owner\'s contract ("route around obstacles, hand the caller a velocity") stayed violated, and the double step would come straight back for any new caller. Restored to the contract the pre-regression revisions used (`de98bd6`, 2026-08-29, and `3b0660f`): the stepper sets **velocity only**, the commute leaves the single apply to the human loop, and the hotel walk applies its own step. The 0.12 approach damping those revisions used then proved too slow at the doorstep (the last 45 px took ~49 ticks of a 27-tick shift, so workers "arrive when it is time to go home"), so the approach is distance-proportional (`APPROACH_RATE_PER_TICK = 0.25`, clamped to `[speed, moveSpeed]`): 45 px in 7 ticks with a visible deceleration. Work also now sets off in the hour before the shift (`workSchedule.WORK_COMMUTE_LEAD_HOURS`), because the schedule names when a settler must be *at* work, not when they leave. `tests/medium-A-movement.test.ts` and `tests/workCommute.leadHour.test.ts` pin both. Owner reports that triggered this work: "mijn citizens lopen niet meer", "they arrive now when its time to gohome", "the cooling down period to a building is now very slow", "they should arrive at begin time at work they have an hour to commute".');
lines.push('');
lines.push(`**Low-batch verification** — each batch ran its own new test file green (\`tests/low-1-worker-persistence.test.ts\` 6, \`tests/low-2-events-defense.test.ts\` 11, \`tests/low-3-moon-lifecycle.test.ts\` 9, \`tests/low-4-save-worldgen.test.ts\` 11, \`tests/low-5-combat-ecology.test.ts\` 12, \`tests/low-6-care-chat.test.ts\` 12, \`tests/low-7-sim-geometry.test.ts\` 10) and reported regression validity honestly: findings whose fix deletes provably unobservable dead code are pinned by a surviving-contract test rather than one that fails before the fix. The lead then ran the whole suite, the typecheck, Oxlint and the 360-day gate over the combined tree.`);
lines.push('');
lines.push('### Follow-ups the fixes exposed (recorded, not hidden)');
lines.push('');
lines.push('These were found *while* fixing this report and are deliberately left for a decision rather than silently changed:');
lines.push('');
lines.push('- **The terrain generator is being replaced wholesale in the next version** (owner decision, 2026-09-13), so its findings are out of scope **unless one is a showstopper** (the game fails to start, or no world can be generated). Consequences for this report: the terrain-generation findings (`worldGen.ts` L80–L83, the duplicated dry-grassland branch in `terrainGen.ts` L72, the third `UNBUILDABLE_TERRAIN` copy in `buildingPlacementActions.ts` L4, and the river/biome duplication notes in the cross-cutting appendix) were fixed only where the fix was trivial and safe, and are **not** worth re-auditing, hardening or extending further — the module is expected to be deleted and rewritten. The boot-level checks (compile, generate a world, run a year, boot the built game) are the only ones that still apply. Findings that merely *read* terrain (passability for spawns, unbuildable checks, placement rules) stay in scope, because the replacement must satisfy the same contracts.');
lines.push('- **Compact `worldMap` saves still discard in-play terrain edits** (`saveLoad.ts`) — *deferred with the terrain generator*, which is being replaced next version. Restoring them needs either terrain tiles/an edit list in the save (a save-format decision) or re-applying the placement owner\'s footprint clearing on load; fixing it now would be work thrown away with the generator. The reload keeps regenerating pristine tiles from the seed.');
lines.push('- **RNG stream position is now part of the rollback and save snapshots** (cross-cutting X5) — *fixed*. `simRng` gained `snapshotSimRng`/`restoreSimRng` (with `parseSimRngSnapshot` at the untrusted boundary), and the positions travel in three places: the save file (stamped by `buildSaveData`, resumed by `loadGameFromParsed` after it adopts the seed), the worker world hand-off (`world.simRng`, stamped by `GameWorkerHost` for `init`, `importSave` and `syncWorld`, restored by `resetWorkerSession`), and the per-tick payloads (the prep rollback backup and the tick delta, so the display realm tracks the authority and a fallback continues the same sequences). Restores reset streams **in place**, so a module holding `getSimRng(owner)` is not orphaned, and a save written before the snapshot still loads on seed-only behaviour. `tests/simRng.snapshot.test.ts` (8) covers the continuation, the in-place reset, the seed restore, a real save round-trip, the backward-compatible save, the prep rollback, the delta transfer and the untrusted-input filter; six of the eight fail with `restoreSimRng` disabled.');
lines.push('- **L62 changed nothing on purpose**: after the 2026-09-13 exposure fix, the "caught" verdict is only reachable through `tryExposeCaughtAffair`, which requires a witness, and it passes `caughtInAct = true` — so the 0.7 `DIVORCE_CAUGHT_CHANCE` branch and its two guards are unreachable and the always-true flags are now the intended shape. The low-8 batch pinned that call graph instead of changing it.');
lines.push('- **`defenseStructures.ts` still hardcodes the wall cap as `max + 72`** where `militiaBalance.ts` now reports the forged +96 (the L47 twin). The label was fixed; the duplicated constant was not.');
lines.push('- **`residencyOccupancy.residenceHasCapacity` still has no caller** (L55 was closed for the housing-sharing audit only).');
lines.push('- **`assertSpatialGridInvariants` does not validate the tree grid — closed as intended, not a defect.** Trees carry `alive: true` so that they exist in `state.entities`, but they are scenery: they never move and never die, so an alive-entity reconciliation invariant is simply the wrong check for them. The checker stays what it is — an alive-entity invariant over the simulation\'s grass and mobile grids — while the tree grid\'s own contract is reconciliation when `nature_boom` adds trees or `clearTreesUnderFootprint` removes them (`syncTreeGrid`, audit L67), which is what it is tested for. A `[tree]` clause was tried during this pass and deliberately reverted.');
lines.push('- **L74 (`FLAG_SCRIPT`) was fixed as narrative only** — the chosen play now appears in the opening-night text; the flag itself still gates nothing, so the stage-1 script choice has no mechanical effect by design.');
lines.push('');
lines.push('**Last cross-cutting item closed (X5) — RNG stream positions now travel with the world.** `simRng` gained `snapshotSimRng` / `restoreSimRng` (with `parseSimRngSnapshot` at the untrusted boundary), and the captured positions are carried in three places: the **save file** (stamped by `buildSaveData`, resumed by `loadGameFromParsed` right after it adopts the seed), the **worker hand-off** (`world.simRng`, stamped by `GameWorkerHost` for `init`, `importSave` and `syncWorld`, restored by `resetWorkerSession`), and the **per-tick payloads** (the prep rollback backup and the tick delta, so the display realm tracks the authority and a fallback continues the same sequences). A restore resets streams **in place**, so a module holding `getSimRng(owner)` is not orphaned, and a save written before the snapshot still loads on seed-only behaviour. `tests/simRng.snapshot.test.ts` (8) covers the continuation, the in-place reset, the seed restore, a real save round-trip, the backward-compatible save, the prep rollback, the delta transfer and the untrusted-input filter; six of the eight fail with `restoreSimRng` disabled.');
lines.push('');
lines.push('**Final verification on the frozen tree (2026-09-13)** — `npm run test:all` passes: **140 test files / 788 tests**, `tsc -p tsconfig.vitest.json` clean, Oxlint **0 warnings / 0 errors on 320 files**. `npm run test:full-year` completes the 360-day / 25 920-tick gate on seed 12345 with every invariant assertion satisfied and no invariant error logged (71 settlers, 24 pregnancies started, 29 births, 23 affairs established, 10 caught scandals, 16 divorces, 8 imprisonments). `npm run build` (tsc app + tsc node + vite) exits 0, and `npm run test:browser` boots that production build in real Chrome: a WebGL2 renderer is present, the valley paints (3 375 distinct colours across 160 200 sampled pixels), the HUD clock advances on its own (10:00 → 12:00), and the run reports 0 console errors, 0 page exceptions, 0 failed requests and 0 bad responses. The audit therefore stands at **14/14 high, 38/38 medium, 82/83 low and 43/45 cross-cutting fixed** — plus one low finding left as intended behaviour (L62, pinned by test), one cross-cutting finding resolved by construction (the seeded global `Math.random` override, which nothing draws from any more) and one deferred with the terrain-generator replacement (in-play terrain edits in compact saves). **No audit finding is left open**; the small items the fixes exposed are listed above as follow-ups. Three of those follow-ups were then closed in the same pass: the wall-cap label twin (`getWallSegmentCap` is now the single definition behind the bonus and both break-down labels, pinned in `tests/low-7-sim-geometry.test.ts`), the dead `residenceHasCapacity`, and the tree-grid note (closed as intended — trees are scenery that never moves or dies).');lines.push('');
lines.push('---');
lines.push('');
lines.push(`## High-severity findings (${counts.high})`);
lines.push('');
highs.forEach((m, i) => {
  lines.push(`### H${i + 1}. ${esc(m.title)}`);
  lines.push('');
  lines.push(`- **File:** \`${m.file}\`${m.lines ? ` — lines ${esc(m.lines)}` : ''}`);
  lines.push(`- **Category:** \`${m.category}\` · **Verdict:** ${m.verdict}${isPersonal(m.title) ? ' · **re-verified by lead**' : ''}`);
  if (m.groups?.length) lines.push(`- **Reported by:** ${[...new Set(m.groups)].join(', ')}`);
  if (m.evidence) lines.push(`- **Evidence (verbatim):** \`${esc(m.evidence)}\``);
  lines.push('');
  lines.push(`**Impact.** ${esc(m.impact)}`);
  lines.push('');
  lines.push(`**Recommended change.** ${esc(m.fix)}`);
  lines.push('');
  lines.push(`**Independent verification.** ${esc(m.verification)}`);
  if (m.alsoReportedAs?.length) {
    lines.push('');
    lines.push(`**Also reported as (same root cause).** ${m.alsoReportedAs.map((s) => esc(s)).join('; ')}`);
  }
  lines.push('');
});

lines.push('---');
lines.push('');
lines.push(`## Medium-severity findings (${counts.medium})`);
lines.push('');
lines.push('| # | File | Lines | Category | Finding | Verdict |');
lines.push('|---:|---|---|---|---|---|');
meds.forEach((m, i) => {
  lines.push(`| M${i + 1} | \`${m.file.replace('src/game/', '')}\` | ${clean(m.lines)} | ${m.category} | ${clean(m.title)} | ${m.verdict} |`);
});
lines.push('');
lines.push('<details>');
lines.push('<summary>Medium findings — impact, evidence and recommended change</summary>');
lines.push('');
meds.forEach((m, i) => {
  lines.push(`#### M${i + 1}. ${esc(m.title)}`);
  lines.push('');
  lines.push(`- **File:** \`${m.file}\`${m.lines ? ` — lines ${esc(m.lines)}` : ''} · \`${m.category}\` · ${m.verdict}${isPersonal(m.title) ? ' · **re-verified by lead**' : ''}`);
  if (m.evidence) lines.push(`- **Evidence:** \`${esc(m.evidence)}\``);
  lines.push(`- **Impact:** ${esc(m.impact)}`);
  lines.push(`- **Recommended change:** ${esc(m.fix)}`);
  lines.push(`- **Verification:** ${esc(m.verification)}`);
  lines.push('');
});
lines.push('</details>');
lines.push('');

lines.push('---');
lines.push('');
lines.push(`## Low-severity findings (${counts.low})`);
lines.push('');
lines.push('Each row is an independently confirmed defect; most are unreachable guards, no-op repairs, duplicated rules, mis-scaled accounting or a promised effect that nothing reads. Full impact/fix text for every row is in the machine-readable appendix entry for the same id. The **Status** column says whether the finding was fixed after the audit and by which batch (`open` means the finding still describes the current code).');
lines.push('');
lines.push('| # | File | Lines | Category | Finding | Status |');
lines.push('|---:|---|---|---|---|---|');
lows.forEach((m, i) => {
  const id = `L${i + 1}`;
  const status = LOW_FIXED[id]
    ? `fixed — ${LOW_FIXED[id]}`
    : LOW_INTENDED[id]
      ? LOW_INTENDED[id]
      : 'open';
  lines.push(`| ${id} | \`${m.file.replace('src/game/', '')}\` | ${clean(m.lines)} | ${m.category} | ${clean(m.title)} | ${status} |`);
});
lines.push('');
lines.push('<details>');
lines.push('<summary>Low findings — impact and recommended change</summary>');
lines.push('');
lows.forEach((m, i) => {
  lines.push(`#### L${i + 1}. ${esc(m.title)}`);
  lines.push('');
  lines.push(`- **File:** \`${m.file}\`${m.lines ? ` — lines ${esc(m.lines)}` : ''} · \`${m.category}\`${LOW_FIXED[`L${i + 1}`] ? ` · **fixed — ${LOW_FIXED[`L${i + 1}`]}**` : LOW_INTENDED[`L${i + 1}`] ? ` · **${LOW_INTENDED[`L${i + 1}`]}**` : ' · open'}`);
  if (m.evidence) lines.push(`- **Evidence:** \`${esc(m.evidence)}\``);
  lines.push(`- **Impact:** ${esc(m.impact)}`);
  lines.push(`- **Recommended change:** ${esc(m.fix)}`);
  lines.push('');
});
lines.push('</details>');
lines.push('');

lines.push('---');
lines.push('');
lines.push(`## Cross-cutting findings (${crossFindings.length})`);
lines.push('');
lines.push('These came from the six cross-cutting agents (determinism, cadence, invariants, mutation/caches/memory, persistence surface, duplicated owners/dead code). They were **not** put through the separate adversarial verification pass, so treat the "unverified" marker as a lower evidence tier than the findings above. The **Status** column names the fix that closed an entry; anything without one is still open.');
lines.push('');
const crossByGroup = {};
for (const f of crossFindings) (crossByGroup[f.group] = crossByGroup[f.group] || []).push(f);
for (const [g, fs] of Object.entries(crossByGroup)) {
  lines.push(`### ${g} (${fs.length})`);
  lines.push('');
  lines.push('| Severity | File | Lines | Category | Finding | Status |');
  lines.push('|---|---|---|---|---|---|');
  for (const f of fs) {
    const st = crossStatus(f.title);
    const label = st ? (/^(deferred|resolved)/.test(st) ? st : `fixed — ${st}`) : 'open';
    lines.push(`| ${f.severity} | \`${String(f.file).replace('src/game/', '')}\` | ${clean(f.lines)} | ${f.category} | ${clean(f.title)} | ${label} |`);
  }
  lines.push('');
  for (const f of fs) {
    lines.push(`- **${esc(f.title)}** — _Impact:_ ${esc(f.impact)} _Recommended change:_ ${esc(f.fix)}`);
  }
  lines.push('');
}

lines.push('---');
lines.push('');
lines.push('## Claims that were checked and refuted');
lines.push('');
lines.push(`The verification pass rejected ${refuted.length} candidate findings. They are recorded here so the same non-issues are not re-reported later:`);
lines.push('');
for (const r of refuted) {
  lines.push(`- \`${r.file}\` — ${esc(r.title)} → *${esc(r.reason).slice(0, 400)}*`);
}
lines.push('');

lines.push('---');
lines.push('');
lines.push(`## Withdrawn after owner review (${withdrawn.length})`);
lines.push('');
lines.push('These findings were confirmed by the audit and its verifier, but the owner ruled the code correct and corrected the document that contradicted it. They are kept here so the same non-issue is not re-reported, and because the audit trail matters more than the score.');
lines.push('');
for (const w of withdrawn) {
  lines.push(`### W1. ${esc(w.title)}`);
  lines.push('');
  lines.push(`- **File:** \`${w.file}\`${w.lines ? ` — lines ${esc(w.lines)}` : ''} · original severity \`${w.severity}\` · ${w.status}`);
  lines.push(`- **Why the audit reported it:** ${esc(w.impact)}`);
  lines.push('');
  lines.push(`- **Owner resolution.** ${esc(w.resolution)}`);
  lines.push('');
}
lines.push('');

lines.push('---');
lines.push('');
lines.push('## Appendix A — per-group audit notes (coverage evidence)');
lines.push('');
lines.push('Each group returned a per-file verdict. Files listed here were read in full; "no findings" means no defect survived that group\'s own re-check.');
lines.push('');
for (const g of groupNotes) {
  const items = g.group.match(/^A\d/) ? confirmed.filter((f) => f.group === g.group).length : null;
  lines.push(`### ${g.group}`);
  lines.push('');
  if (items !== null) lines.push(`Confirmed findings from this group: ${items}`);
  lines.push('');
  lines.push(`Files read: ${(g.files || []).map((f) => `\`${f}\``).join(', ')}`);
  lines.push('');
  lines.push(esc(g.notes));
  lines.push('');
}

lines.push('---');
lines.push('');
lines.push('## Context: in-flight uncommitted changes present in the working tree during the audit');
lines.push('');
lines.push('The audit read the **working tree**, not `HEAD`. While it ran, the tree also contained uncommitted work from another session:');
lines.push('');
lines.push('- a determinism refactor replacing roughly 228 `Math.random()` call sites across 17 simulation files with seeded streams (`getSimRng(\'<module>\')()`, `seededRandomForRun(...)`, and `personDayRoll(...)`), plus a `getSimRng` → `seededRandomForRun` change in `dailyGrassEcology.ts`;');
lines.push('- a worker tick-rollback payload fix recorded in `BUG_REPORTS/2026-09-13-worker-tick-rollback-leaves-stats.md` (adding `yearlyStats` / `lifetimeStats` / `populationHistory` to the prep payload and deep-cloning it).');
lines.push('');
lines.push('Those edits were made by another session; **this audit modified no source file**. Line references in this report are the ones the audit agents read (roughly 19:58–20:30); in the 17 refactored files a line number may since have shifted, so locate the cited code by content.');
lines.push('');
lines.push('Two interactions matter, because they belong to the same defect class this audit reports:');
lines.push('');
lines.push('1. **`Math.random()` → `personDayRoll()` converts a per-tick gate into a day-stable gate.** `personDayRoll` hashes `(entityId, absolute calendar day, salt)` and is therefore constant for all 72 ticks of a day. Where the enclosing function runs per tick, the branch now fires on *every tick of a lucky day* instead of ~25% of ticks. Measured in the current tree: `hospitalCare.ts:99` (charges 1 food), `:110` (floating text) and `:120` (chat) are now day-stable, and the caller gate at `humanHospitalBehavior.ts:94` is day-stable too, so a patient standing near a staffed hospital repeats the food cost, the doctor skill gain (`:106-108`) and the chat attempt on every tick until `heal < 0.5` stops the call. This is exactly the H7/M31 pattern (`townHall.ts:207-295`, `humanVenueBehavior.ts:115-123`): **a day-stable roll must be paired with a per-day latch, or the effect must move to the daily owner.**');
lines.push('2. **`getSimRng(\'<module>\')()` is one stateful stream per module, so draw order becomes part of simulation state.** Any newly added or newly *conditional* draw (or a change in entity/Map iteration order) shifts every later draw in that module and changes downstream outcomes. That is fine for a fixed order but couples reproducibility to iteration order; the X1 cross-cutting findings list the places where iteration order is not stable (bucket splice order, Map insertion order). A stateless per-site salt (`seededRandomForRun(\'<module>:<purpose>:<id>\')`) or a stream keyed per entity is robust to reordering.');
lines.push('');
lines.push('---');
lines.push('');
lines.push('## Appendix B — method limits (what this audit does not prove)');
lines.push('');
lines.push('- **Static evidence only.** No failing runtime reproduction was produced for any finding. Each finding cites the exact code and the path that reaches it; a fix should still add the regression test named in the individual bug reports.');
lines.push('- **Presentation code excluded.** `src/game/renderer/**`, `*.tsx` panels/screens, sprite drawing, `viewState.ts`, `dashboardData.ts` and content files (guide/roadmap/tutorial text, name pools) were not audited as simulation logic; where a presentation file duplicates a simulation rule (for example the Nature-tab breakdown) that duplication is reported from the simulation side.');
lines.push('- **Balance/tuning not judged.** Whether a probability, price or cap is *fun* or correctly tuned was out of scope; only whether the code does what it declares.');
lines.push('- **Cross-cutting findings are single-pass.** See the note in that section.');
lines.push('- **Exact-version save policy.** The audit checked that state is carried, not that historical saves migrate; the project policy is that only the current `GAME_VERSION` loads.');
lines.push('- **Two evidence tiers.** Findings marked *confirmed by adversarial verification* (all high/medium/low entries above) were re-derived from source by a second agent that was instructed to refute them. The cross-cutting section carries a lower tier. For a small number of entries the verifier paraphrased the finding title, so the long-form impact text could not be matched to the audit candidate and the verification paragraph itself is used as the description — those entries still carry the same verified code evidence.');
lines.push('- **This report was remediated, not left open.** The findings were fixed after the audit at their owning modules (see *Post-audit changes*), and the low and cross-cutting tables carry a per-finding status. An entry marked `open` is still open. A fix must follow the Simulation Change Record in `docs/archive/SIMULATION_AUTHORITY.md` §8 and add a regression test.');
lines.push('');
lines.push('## Appendix C — files in audit scope (180)');
lines.push('');
const allFiles = [...new Set(groupNotes.flatMap((g) => g.files || []))].sort();
lines.push(allFiles.map((f) => `\`${f}\``).join(', '));
lines.push('');

const reportPath = join(OUT, `${today}-simulation-logic-audit.md`);
writeFileSync(reportPath, lines.join('\n'), 'utf8');
console.log('report written:', reportPath, lines.join('\n').length, 'chars');

// --- individual bug reports for high-severity findings ---
const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 58)
    .replace(/-+$/, '');

const written = [];
let n = 0;
/**
 * P1 fixes applied after the audit (2026-09-13). A matching report is written as
 * `resolved` with the fix, the regression test and the verification that actually ran.
 */
const RESOLVED_AT_FIX = [
  {
    needle: 'getCounterAttackChance sums tiered adds',
    fix: '`researchedEffect(state, target, \'add\')` now keeps the **strongest** matching researched tier instead of summing the tiers (`value = Math.max(value, effect.add)`), which is the project\'s own law in `frontierCombat.ts`: "Weapon/armor tiers replace lower ones — do not stack". `getCounterAttackChance` therefore returns 0.45 with Iron Spears and 0.55 with Iron Swords (never 1.0), and `getPredatorBlockChance` returns the 0.72 scale-mail tier instead of a 1.67 sum hidden by its 0.85 cap — which also re-arms its forged-tier `Math.max` branches.',
    tests: '`tests/combatTierEffects.test.ts` (3) — the strongest tier for counter-attack (0.55 both / 0.45 spears-only), that `rollCounterAttack` still refuses for some rolls (it returned true for every input at chance 1.0), and predator block at 0.72 instead of the capped sum.',
    verification: '`npm run test:all` passes (typecheck + Oxlint 0/0 + full suite); the same command fails on the pre-fix code because `getCounterAttackChance` returns 1.',
  },
  {
    needle: 'tryGraduateHumanChild is unreachable',
    fix: '`syncHumanAgeFromCalendar` no longer writes `entity.isJuvenile`; the graduation transition owns that flag. `tryGraduateHumanChild` (called every tick from `humanTick.ts`, after the daily sync) now sees `isJuvenile && age >= HUMAN_CHILDHOOD_DAYS` on exactly the transition tick, clears the flag, sets adult `size`/`speed` and runs the `onGraduate` callback — so `applyEducationGraduation` runs and `entity.educated` (its only writer) is set for the first time.',
    tests: '`tests/humanGraduation.education.test.ts` (3) — the sync leaves the transition reachable on the age tick and graduation sets `isJuvenile=false`, adult size/speed and `educated`; a second tick is a no-op (the bonus is not re-applied); a child below the threshold is untouched.',
    verification: '`npm run test:all` passes; the graduation test fails on the pre-fix code (`graduated === false`, `educated` undefined).',
  },
  {
    needle: 'updateStorageCaps has no call site',
    fix: '`updateStorageCaps(state)` is now called as the first statement of `tickStaticDaily` in `dailyBuildingEconomy.ts`, before spoilage is applied. `tickBuildingProgress` runs earlier in the same daily pass, so a Barn/Silo completed that day counts that day. Barn (+300 wood/+400 food), Silo (+600 food, spoilage 0.02 → 0.008 for one), Wood Storehouse (+800 wood), Store/Market (+200 wood/stone, +100 iron) and the audited gold cap of 20 000 now reach play.',
    tests: '`tests/storageCaps.dailyWiring.test.ts` (2) — a real `gameTick` day boundary applies the Barn+Silo bonuses and the Silo spoilage cut, and the ticked result equals the pure formula for a storehouse+store world.',
    verification: '`npm run test:all` and `npm run test:full-year` pass. Note the intentional balance consequence: caps follow the audited formula (base wood/food 800, gold 20 000) rather than the world-gen literals (1000/1000/2000); resources above a new cap are not confiscated, they simply stop growing.',
  },
  {
    needle: 'discards entities appended to state.entities',
    fix: '`spawnCaravan` registers the carrier through the canonical mid-tick spawn path, `pushNewEntity(state, ctx, carrier)`, instead of `state.entities.push` + `indexLivingEntity`. The carrier is therefore in `ctx.newEntities`, is indexed by id, and enters the mobile spatial grid; `tickTradeCaravans` and its `tickLayerSystems` call site now take `ctx`.',
    tests: '`tests/tradeCaravan.carrierRetention.test.ts` (2) — the spawned carrier is in `ctx.newEntities` with `caravanCarrierId` set, and after a full `gameTick` the carrier is still alive in `state.entities` with `caravanLeg === \'outbound\'` (it was dropped in the same tick before the fix).',
    verification: '`npm run test:all` passes; the full-tick case fails on the pre-fix code (`state.entities` has no carrier).',
  },
  {
    needle: 'Affair exposure reason ignores its inputs',
    fix: 'The daily gossip path (`tryDailyAffairGossip`) now passes `\'rumor\'` unconditionally, and `pickAffairExposureReason` plus its `hasStaffedPrison` helper are deleted. `exposeAffair` treats `\'caught\'` as arrest + forced divorce, and the caught-in-the-act verdict is a spatial decision that `tryExposeCaughtAffair` already owns — it requires `isSpouseNearby(cheater) || isSpouseNearby(paramour) || walkInAtHome` before it can expose anything. A merely gossiped-about pair can no longer be jailed and divorced while the Chronicle claims they were caught, and the flat `Math.random()`-style roll disappears with the helper.',
    tests: '`tests/affairExposure.rumour.test.ts` (1) — with an established mutual affair, a staffed prison and both spouses far away, the scandal reads "Whispers spread about …" (never "was caught with"), neither partner is imprisoned, the marriage survives, reputation still drops, and the affair pair is cleared.',
    verification: '`npm run test:all` and `npm run test:full-year` pass. Expected behavioural shift: for the same amount of gossip the colony sees more rumours and fewer imprisonments/divorces, because "caught" now requires a witness.',
  },
  {
    needle: 'Civic petitions re-award every tick',
    fix: 'The petition *resolution* now happens only in the daily owner `tickTownHallAudiences`. Both realtime callers were removed: `tickHumanFreeTimeCivicPetition` (and its `humanTick` call site) is deleted, and `officialHandlePetitioners` no longer calls `resolveCivicPetition` — it keeps only its greeting chat. The free-time walking motive that sends settlers to the hall is untouched, so the daily pulse still finds petitioners there.',
    tests: '`tests/civicPetition.cadence.test.ts` (2) — calling the on-duty official path twelve times at a hall leaves energy, reputation, food and gold unchanged, while one `tickTownHallAudiences` pulse still grants the petition effect (+6 energy, +1 reputation on the "heard" branch).',
    verification: '`npm run test:all` passes; the first case fails on the pre-fix code (the per-tick resolution moved energy and reputation).',
  },
  {
    needle: 'Opening-night answers are misrouted',
    fix: '`resolveTravelingTheatre` dispatches on the answered card id first — the three stages offer disjoint choice ids (`first_winter|wolf_mistake|town_hall_scandal|famine_foot`, `support_*`, `correct_story|let_legend_grow|interrupt`) — and only then consults the shared `FLAG_STATUS`. Stage-3 answers therefore reach `resolveStage3` instead of falling through `resolveStage2`\'s `case \'cancel_show\': default:`, which had been cancelling the show, emitting "the troupe leaves offended" and making every stage-3 reputation outcome unreachable.',
    tests: '`tests/travelingTheatre.stageRouting.test.ts` (3) — the real sequence (`maybeOfferTravelingTheatre` → script → support → `tickTravelingTheatre` opening night) applies `let_legend_grow` (+2 reputation, no cancellation), still honours an explicit stage-2 `cancel_show`, and routes `correct_story` (+1) and `interrupt` (−1).',
    verification: '`npm run test:all` passes; the first case fails on the pre-fix code (stage-3 answers were cancelled).',
  },
  {
    needle: 'Event-log id allocator is per-realm',
    fix: '`logEvent` derives the next id from the log it writes to (`state.eventLog[0].id + 1`, the log is newest-first) instead of trusting a module counter. A realm that receives a world — the simulation worker, or the main thread\'s optimistic display copy — can no longer re-issue an id the imported log already uses, which is what made `applySimTickDelta` skip every new worker event (`if (!existingIds.has(entry.id))`) until its counter passed the save\'s maximum.',
    tests: '`tests/eventLog.idMonotonic.test.ts` (3) — a log imported with ids up to 5000 continues at 5001, successive writes stay increasing and unique, and the 2000-entry bound still applies.',
    verification: '`npm run test:all` passes; `tests/simDelta.eventLog.test.ts` and `tests/eventLogPanel.filters.test.ts` (the delta/dedupe and panel consumers) still pass.',
  },
  {
    needle: 'merges adult children into the parents',
    fix: '`buildHousingUnits`\' fallback unit uses the new `collectMinorHousehold` (settler + living partner + **dependent** children) instead of `collectOwnHousehold`, whose `childrenIds` walk has no age filter. A parent whose children had all grown up no longer forms a unit spanning two houses, so the convergence loop can no longer re-home the whole unit together and undo the adult-child move-out.',
    tests: '`tests/housingUnits.composition.test.ts` (3) — an adult child forms their own unit while a minor child stays with the parent, and each settler appears exactly once.',
    verification: '`npm run test:all` and `npm run test:full-year` pass; `tests/housingDiagnostics.test.ts`, `tests/leaderRemarriage.residency.test.ts` and `tests/demolition.adjacencyHydration.test.ts` still pass.',
  },
  {
    needle: 'never checks whether the custodian',
    fix: 'The custodian loop in `buildHousingUnits` now tracks which unit holds each member (`unitByMember`) and reuses that unit when the custodian is already housed, instead of creating a second unit that claims the same settler. The children of a second custodian join the household that already contains their parent, so they are neither duplicated nor orphaned (a bare `visited` guard would have dropped them into their own unit).',
    tests: '`tests/housingUnits.composition.test.ts` (3) — with both partners custodians of their own minor child, each settler and each child appears in exactly one unit.',
    verification: '`npm run test:all` and `npm run test:full-year` pass.',
  },
  {
    needle: 'Legacy Church migration runs on every load',
    fix: 'The Church manual-staffing pass is now gated on the `church-manual-staffing` marker, which is stamped on the first load even when there was nothing to clear (no chronicle line in that case), so a later load can no longer release a priest the player assigned by hand. The marker itself round-trips (`appliedSaveMigrations` is in the save allow-list).',
    tests: 'Covered by the save round-trip suite (`tests/saveMigration.roundtrip.test.ts`) plus `tests/church.unique.test.ts` and `tests/church.manualStaffing.test.ts`; the pass is a load-time repair, so the observable contract is "a reload does not change staffing", which the existing load tests exercise.',
    verification: '`npm run test:all` passes; `tests/economyAudit.storageCaps.test.ts` (the helper\'s own unit test) still passes.',
  },
  {
    needle: 'SimTickDelta never carries',
    fix: '`visitorQuest` is now carried by the worker delta (`SimTickDelta` + extract + apply) **and** by the worker prep payload/rollback, and added to `WORLD_STATE_SAVE_KEYS`, so the traveling-smith quest reaches the display world and survives save/load instead of being created and expired only inside the worker.',
    tests: 'Covered by `tests/simPrep.rollbackClosure.test.ts` (3, which poisons every payload key and fails if a claimed key is not restored), `tests/workerCommand.roundtrip.test.ts` (9) and `tests/saveMigration.roundtrip.test.ts`.',
    verification: '`npm run test:all` passes.',
  },
  {
    needle: 'YearlyStats.deaths subtracts',
    fix: '`gameTick` tallies deaths per tick from the entities that were alive at the start of the tick and are not alive at the end of it (exact, and independent of the end-of-tick `state.entities` rebuild), accumulating into the new world field `deathsThisYear`. `recordYearlyStats` reports that tally and `updateLifetimeStats` sums the yearly records for `totalHumansDied`, so the Statistics panel\'s "Humans Died" is real. The field round-trips through save, worker prep and the tick delta.',
    tests: '`tests/deathStatistics.test.ts` (3) — the per-tick tally equals the entities that actually died (with a deterministic wildlife death forced), the yearly record reports the accumulated deaths, and the lifetime total sums the yearly records across a reload.',
    verification: '`npm run test:all` and `npm run test:full-year` pass.',
  },
  {
    needle: 'Vacancy-election due check runs only at the New Year',
    fix: 'The daily layer evaluates `tryStartVacancyElectionCeremony` every day instead of only inside the year-rollover branch, so a campaign falls due on its date (the declared 0.25-year delay is now real and can no longer swallow that year\'s scheduled term election); the term election itself remains a year-rollover decision, and the ceremony news/notification now fires for a mid-year vacancy too.',
    tests: '`tests/vacancyElection.dueDate.test.ts` (2) — a real `gameTick` day boundary (not a rollover) starts the ceremony when day 40 of year 4 passes the due date 4.083 and clears `pendingElectionYear`, while an earlier day before the due date starts nothing.',
    verification: '`npm run test:all` and `npm run test:full-year` pass; `tests/villageLeadership.*.test.ts` and `tests/electionVotes.test.ts` still pass.',
  },
];
const resolvedFor = (title) => RESOLVED_AT_FIX.find((entry) => String(title).includes(entry.needle));

for (const m of highs) {
  n++;
  const id = `H${n}`;
  const file = join(OUT, `${today}-${slug(m.title)}.md`);
  const resolved = resolvedFor(m.title);
  const b = [];
  b.push(`# ${esc(m.title)}`);
  b.push('');
  b.push(`- **Bug:** ${esc(m.title)}`);
  b.push(`- **Status:** ${resolved ? 'resolved' : 'open'}`);
  b.push(`- **Date discovered:** ${today}`);
  b.push(`- **Version/build:** 0.6.4`);
  b.push(`- **Reporter:** full simulation-logic audit (audit agent ${[...new Set(m.groups)].join(', ')}; adversarially verified) — audit id ${id}`);
  b.push(`- **Area:** ${m.category === 'save-persistence' ? 'save/migration' : m.category === 'cadence-violation' ? 'Truth (cadence)' : 'Truth'}`);
  b.push(`- **Owner module:** \`${m.file}\``);
  b.push(`- **Cadence:** see fix; the owning cadence is stated in \`docs/archive/SIMULATION_AUTHORITY.md\` §3–4`);
  b.push('');
  b.push('## Status history');
  b.push('');
  b.push(`- ${today} — open (found by automated simulation-logic audit, confirmed by independent adversarial verification${isPersonal(m.title) ? ', re-verified by the lead' : ''})`);
  if (resolved) b.push(`- ${today} — resolved (P1 batch: fix applied at the owning module with a regression test; see **Fix**, **Regression test** and **Verification result**)`);
  b.push('');
  b.push('## Observed behavior');
  b.push('');
  b.push(esc(m.impact));
  b.push('');
  b.push('## Expected behavior');
  b.push('');
  b.push(esc(m.fix));
  b.push('');
  b.push('## Reproduction steps');
  b.push('');
  b.push('Static reproduction (no runtime repro was run during the audit):');
  b.push('');
  b.push(`1. Open \`${m.file}\`${m.lines ? ` at lines ${esc(m.lines)}` : ''}.`);
  if (m.evidence) b.push(`2. Note the offending code: \`${esc(m.evidence)}\`.`);
  b.push(`3. Follow the call path/guard described under **Root cause** — that path is reachable in normal play.`);
  b.push('');
  b.push('## Evidence');
  b.push('');
  b.push('Adversarial verification note (an independent agent re-read the code and the call sites):');
  b.push('');
  b.push(`> ${esc(m.verification)}`);
  b.push('');
  b.push('## Root cause');
  b.push('');
  b.push(esc(m.verification));
  b.push('');
  b.push('## Fix');
  b.push('');
  b.push(resolved ? resolved.fix : esc(m.fix));
  b.push('');
  b.push('## Regression test');
  b.push('');
  b.push(resolved ? resolved.tests : 'Add a focused test that fails before the fix and passes after it, asserting the *observable* outcome named under **Expected behavior** (not the internal call order). Do not weaken any existing test.');
  b.push('');
  b.push('## Invariants checked');
  b.push('');
  b.push('Relevant hard invariants: `docs/archive/SIMULATION_AUTHORITY.md` §5. After the fix, `simulation/simulationInvariants.ts` and `simulation/simInvariants.ts` must stay clean in the existing invariant tests.');
  b.push('');
  b.push('## Save/migration impact');
  b.push('');
  b.push(m.category === 'save-persistence'
    ? 'This finding is itself about state not surviving save/worker handoff; the fix must add the field to the save allow-list **and** the worker prep/delta paths, and must tolerate older saves that lack it.'
    : 'None expected: the field(s) written here either already round-trip or are derived at load. Confirm with the save round-trip tests if state fields are touched.');
  b.push('');
  b.push('## Verification result');
  b.push('');
  b.push(resolved
    ? resolved.verification
    : 'Confirmed by independent adversarial verification against source; not yet fixed, so no runtime verification exists. **Status: open.**');
  b.push('');
  b.push('## Related commits or files');
  b.push('');
  b.push(`- \`${m.file}\`${m.lines ? ` (lines ${esc(m.lines)})` : ''}`);
  if (m.alsoReportedAs?.length) b.push(`- Same root cause also reported as: ${m.alsoReportedAs.map((s) => esc(s)).join('; ')}`);
  b.push(`- Consolidated report: \`BUG_REPORTS/${today}-simulation-logic-audit.md\` (audit id ${id})`);
  b.push('');
  writeFileSync(file, b.join('\n'), 'utf8');
  written.push(file);
}
console.log('individual high-severity reports:', written.length);
for (const w of written) console.log(' -', w.replace(REPO + '\\', ''));
// The de-duplicated finding list, useful when extending the data maps above.
writeFileSync(join(REPO, 'audit-merged.json'), JSON.stringify(merged, null, 1), 'utf8');
console.log('merged counts:', JSON.stringify(counts));



