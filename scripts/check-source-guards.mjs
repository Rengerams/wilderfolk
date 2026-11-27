#!/usr/bin/env node
/**
 * Source-text guards migrated out of the vitest tier: "this rule has exactly one owner" assertions
 * that read `src` and match a regex. They are lint, not behavior, so they run once per gate here
 * instead of as one vitest process per file. `--self-test` proves each rule still reports a
 * violation on an overlay source tree, so a rule cannot silently stop guarding.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();

function readFromDisk(relative) {
  return readFileSync(path.resolve(REPO, relative), 'utf8');
}

function walkTypeScript(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkTypeScript(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** Block and line comments are stripped so a rule cannot be satisfied by prose about it. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** `overlay` maps a repo-relative path to replacement text; the self-test uses it for red-before proofs. */
function makeContext(overlay = {}) {
  return {
    read(relative) {
      return relative in overlay ? overlay[relative] : readFromDisk(relative);
    },
    code(relative) {
      return stripComments(this.read(relative));
    },
    /** Every `.ts` under a repo-relative directory, overlay files included. */
    sourceFiles(dir) {
      const fromDisk = walkTypeScript(path.resolve(REPO, dir)).map((full) =>
        path.relative(REPO, full).split(path.sep).join('/'),
      );
      const fromOverlay = Object.keys(overlay).filter(
        (relative) => relative.startsWith(`${dir}/`) && relative.endsWith('.ts'),
      );
      return [...new Set([...fromDisk, ...fromOverlay])].sort();
    },
    exists(relative) {
      return relative in overlay || existsSync(path.resolve(REPO, relative));
    },
  };
}

function requireText(ctx, file, needle, why) {
  return ctx.read(file).includes(needle) ? null : `${file}: ${why}`;
}

function requireMatch(ctx, file, pattern, why) {
  return pattern.test(ctx.read(file)) ? null : `${file}: ${why}`;
}

function forbidMatch(ctx, file, pattern, why) {
  return pattern.test(ctx.read(file)) ? `${file}: ${why}` : null;
}

/** A test file must not spell the day length as a bare literal; it must name the clock owner. */
const DAY_LENGTH_SITES = [
  { file: 'tests/displayYear.oneBased.test.ts', pattern: /90\s*\*\s*72/, spelling: '90 * 72 calendar day fixture' },
  { file: 'tests/spotlightLore.test.ts', pattern: /72\s*\*\s*200/, spelling: '72 * 200 day-200 fixture' },
  { file: 'tests/dayCycle.cadence.test.ts', pattern: /TICKS_PER_DAY=72|72 TPD/, spelling: '72-tick active clock description' },
  { file: 'tests/autoStaff.notify.test.ts', pattern: /72 \* 5/, spelling: '72 * 5' },
  { file: 'tests/demolish.roundtrip.test.ts', pattern: /3 \* 72/, spelling: '3 * 72' },
  { file: 'tests/dayCycle.tavern.test.ts', pattern: /72 \* 10/, spelling: '72 * 10' },
  { file: 'tests/humanNeeds.mealRule.test.ts', pattern: /MEAL_TICK = 72/, spelling: 'MEAL_TICK = 72' },
  { file: 'tests/humanGraduation.education.test.ts', pattern: /72 \* 10/, spelling: '72 * 10' },
  { file: 'tests/moonHowler.test.ts', pattern: /DAYS_PER_MOON_CYCLE \* 72|NIGHT_START \* 3/, spelling: 'DAYS_PER_MOON_CYCLE * 72 + NIGHT_START * 3' },
  { file: 'tests/medium-batch2.test.ts', pattern: /5 \* 72|\+= 72/, spelling: '5 * 72 / += 72' },
  { file: 'tests/rivalDiplomacy.test.ts', pattern: /14 \* 72/, spelling: '14 * 72' },
  { file: 'tests/weatherConsequences.test.ts', pattern: /let t = 72;|t <= 71;/, spelling: 'for (let t = 72; …) with the `t <= 71` run-up' },
  { file: 'tests/conceptionEvent.labelling.test.ts', pattern: /state\.tick = 72;/, spelling: 'state.tick = 72' },
  { file: 'tests/humanLifecycle.test.ts', pattern: /state\.tick = 72;/, spelling: 'state.tick = 72' },
  { file: 'tests/medium-B1-staffing.test.ts', pattern: /72 \+ (23|10) \* TICKS_PER_HOUR/, spelling: '72 + 23 * TICKS_PER_HOUR / 72 + 10 * TICKS_PER_HOUR' },
  { file: 'tests/affairAge.adultOnly.test.ts', pattern: /const TICK = 72;/, spelling: 'const TICK = 72' },
  { file: 'tests/dailyScheduleFatigue.test.ts', pattern: /tick: 72,/, spelling: 'tick: 72,' },
  { file: 'tests/famineDesperation.test.ts', pattern: /tick: 72,/, spelling: 'tick: 72,' },
  { file: 'tests/guidedCampaign.test.ts', pattern: /world\.tick \+= 72;/, spelling: 'world.tick += 72' },
  { file: 'tests/huntingSpot.cleanup.test.ts', pattern: /^\s*72,\s*$/m, spelling: '72, (the expected day-boundary tick)' },
  { file: 'tests/relationships.sharedHomeFriendship.test.ts', pattern: /tick: 72,/, spelling: 'tick: 72,' },
  { file: 'tests/relationships.feudCleanup.test.ts', pattern: /tick: 72,/, spelling: 'tick: 72,' },
];

/** A direct write to the workplace pointer — not a read, a comparison or an object-literal key. */
const WORKPLACE_POINTER_WRITE = /\.workerBuildingId\s*=(?!=)/;
const WORKPLACE_WRITERS = ['src/game/workforce.ts', 'src/game/saveLoad.ts', 'src/game/moonHowler.ts', 'src/game/moonHowlerForm.ts'];
const WORKPLACE_DOOR_CALLERS = ['src/game/dayCycle.ts', 'src/game/leaderHouse.ts', 'src/game/humanLifecycleCleanup.ts', 'src/game/tradeCaravans.ts'];
const WORKPLACE_DOORS = [
  'export function assignWorkerTransition',
  'export function transferWorkerBetweenBuildings',
  'export function clearWorkerAssignment',
  'export function detachWorkplaceReference',
];

const GUARDS = [
  {
    id: 'strip-preview-never-empty',
    rule: 'an empty demolition or road-build preview is never published, and a click keeps its rotation',
    check(ctx) {
      const interactions = 'src/hooks/useCanvasInteractions.ts';
      return [
        requireText(ctx, interactions, 'buildStripPreview: segments.length > 0', 'an empty strip preview can be published again'),
        requireText(ctx, interactions, 'buildStripPreview: preview.segments.length > 0 ? preview : null', 'the empty preview is no longer filtered at the click'),
        requireText(ctx, interactions, 'const rotation = dragged', 'a click without pointer travel lost its selected rotation'),
        requireText(ctx, interactions, ': loop?.getView().buildRotation ?? 0;', 'the drag-less rotation no longer falls back to the selected one'),
        requireText(ctx, interactions, 'rotation, dragged ? stroke : undefined,', 'the rotation is no longer passed to the stroke'),
        requireText(ctx, 'src/game/renderSnapshot.ts', 'strip?.segments.length', 'the render dirty-key dereferences an empty preview again'),
        requireText(ctx, 'src/game/renderer/buildPreview.ts', 'preview.segments.length === 0', 'the preview renderer lost its empty guard'),
      ].filter(Boolean);
    },
    sample: { 'src/hooks/useCanvasInteractions.ts': 'buildStripPreview: preview.segments,\n' },
  },
  {
    id: 'workplace-reference-single-owner',
    rule: 'only workforce.ts, the save boundary and the moon forms write human.workerBuildingId',
    check(ctx) {
      const writers = ctx
        .sourceFiles('src')
        .filter((file) => WORKPLACE_POINTER_WRITE.test(ctx.read(file)));
      const violations = [];
      const expected = [...WORKPLACE_WRITERS].sort();
      const actual = [...writers].sort();
      if (actual.join('|') !== expected.join('|')) {
        const extra = actual.filter((file) => !expected.includes(file));
        const missing = expected.filter((file) => !actual.includes(file));
        if (extra.length > 0) violations.push(`a module outside the owner writes human.workerBuildingId: ${extra.join(', ')}`);
        if (missing.length > 0) violations.push(`the owner no longer writes human.workerBuildingId: ${missing.join(', ')}`);
      }
      for (const door of WORKPLACE_DOORS) {
        const missingDoor = requireText(ctx, 'src/game/workforce.ts', door, `workforce.ts no longer holds ${door}`);
        if (missingDoor) violations.push(missingDoor);
      }
      for (const file of WORKPLACE_DOOR_CALLERS) {
        const source = ctx.read(file);
        if (WORKPLACE_POINTER_WRITE.test(source)) violations.push(`${file}: writes the pointer instead of calling a door`);
        else if (!/clearWorkerAssignment|detachWorkplaceReference/.test(source)) violations.push(`${file}: neither writes the pointer nor calls a door`);
      }
      return violations;
    },
    sample: { 'src/game/__guard_probe__.ts': 'export function probe(human) { human.workerBuildingId = 5; }\n' },
  },
  {
    id: 'frontier-window-layout',
    rule: 'the Frontier world map window keeps its documented size budget and the other subject windows keep theirs',
    check(ctx) {
      const report = 'src/components/BattleReportScreen.tsx';
      const window = 'src/components/CitizenOverviewScreen.tsx';
      return [
        requireText(ctx, report, 'max-h-[92vh] w-full max-w-5xl', 'the battle report lost the documented overlay height budget'),
        requireMatch(ctx, window, /widthClassName=\{activeNav === 'frontier'\s*\? 'w-\[calc\(100vw-2rem\)\] max-w-3xl'/, 'the Frontier window lost its larger match width'),
        requireMatch(ctx, window, /maxBodyClassName=\{activeNav === 'frontier' \? 'max-h-\[calc\(92vh-4rem\)\]'/, 'the Frontier window body lost its height budget'),
        requireText(ctx, window, "'w-[min(58rem,calc(100vw-3rem))] max-w-[calc(100vw-3rem)]'", 'the non-Frontier subject windows changed size'),
        requireText(ctx, window, " : 'max-h-[70vh]'", 'the non-Frontier subject window body changed size'),
      ].filter(Boolean);
    },
    sample: { 'src/components/BattleReportScreen.tsx': '<div className="w-full" />\n' },
  },
  {
    id: 'intro-ready-prompt',
    rule: 'the intro prompt names the keys the handler accepts instead of promising "any key"',
    check(ctx) {
      const screen = 'src/game/IntroScreen.tsx';
      const text = ctx.read(screen);
      const violations = [];
      if (text.includes('Press any key or click to continue')) violations.push(`${screen}: the prompt promises "any key" again`);
      const reservation = requireText(ctx, screen, "if (event.key === 'Escape' || event.key === 'Tab') return;", 'Escape and Tab are no longer reserved');
      if (reservation) violations.push(reservation);
      const prompt = text.match(/Click anywhere[^<]*/)?.[0] ?? '';
      if (prompt === '') violations.push(`${screen}: the ready prompt vanished`);
      else {
        if (!prompt.includes('Escape')) violations.push(`${screen}: the prompt does not name Escape`);
        if (!prompt.includes('Tab')) violations.push(`${screen}: the prompt does not name Tab`);
      }
      return violations;
    },
    sample: { 'src/game/IntroScreen.tsx': 'Press any key or click to continue\n' },
  },
  {
    id: 'selected-building-panel-keyed',
    rule: 'SelectedBuildingPanel is keyed per building so an armed demolish cannot leak',
    check(ctx) {
      return [
        requireMatch(ctx, 'src/App.tsx', /<SelectedBuildingPanel\s+key=\{selectedBuilding\.id\}/, 'the panel is no longer keyed per building'),
      ].filter(Boolean);
    },
    sample: { 'src/App.tsx': '<SelectedBuildingPanel building={selectedBuilding} />\n' },
  },
  {
    id: 'test-tier-day-length-literals',
    rule: 'no test spells a day boundary as a bare literal; it names TICKS_PER_DAY / ticksForDays / tickAtDailyPhase',
    check(ctx) {
      const violations = [];
      if (DAY_LENGTH_SITES.length < 19) violations.push(`the guard table shrank to ${DAY_LENGTH_SITES.length} sites`);
      for (const { file, pattern, spelling } of DAY_LENGTH_SITES) {
        if (!ctx.exists(file)) {
          violations.push(`${file}: guarded test file is gone; retarget or drop its row`);
          continue;
        }
        const source = ctx.read(file);
        if (pattern.test(source)) violations.push(`${file}: still drives the clock with the literal \`${spelling}\`; import TICKS_PER_DAY/ticksForDays from src/game/dayCycle`);
        else if (!/TICKS_PER_DAY|ticksForDays|tickAtDailyPhase/.test(source)) violations.push(`${file}: no longer names the clock owner at all — the literal was removed without using it`);
      }
      return violations;
    },
    sample: { 'tests/displayYear.oneBased.test.ts': 'const day = 90 * 72;\n' },
  },
  {
    id: 'debug-mode-gate',
    rule: 'debug-only tooling is gated in code (not in a comment) and the debug flag has one definition',
    check(ctx) {
      const moreTab = 'src/components/tabPanels/MoreTabPanel.tsx';
      const overview = 'src/components/CitizenOverviewScreen.tsx';
      const app = 'src/App.tsx';
      const violations = [];
      if (!/debugMode\s*:\s*boolean/.test(ctx.code(moreTab))) violations.push(`${moreTab}: the Guide no longer declares a debugMode prop`);
      if (!/\{\s*debugMode\s*&&\s*\(/.test(ctx.code(moreTab))) violations.push(`${moreTab}: the Testing card is no longer behind the debug flag`);
      if (!/debugMode=\{debugMode\}/.test(ctx.code(app))) violations.push(`${app}: the shell no longer passes the debug flag down`);
      if (!/debugMode=\{debugMode\}/.test(ctx.code(overview))) violations.push(`${overview}: the overview no longer forwards the debug flag`);
      if (!/debugMode\s*:\s*boolean/.test(ctx.code(overview))) violations.push(`${overview}: the overview no longer declares the debugMode prop`);
      const parses = ctx.code(app).match(/URLSearchParams/g)?.length ?? 0;
      if (parses !== 1) violations.push(`${app}: the debug flag has ${parses} URLSearchParams parses, expected exactly one`);
      for (const file of [moreTab, overview]) {
        if (/URLSearchParams|location\.search/.test(ctx.code(file))) violations.push(`${file}: a second source of truth for "is this a debug session"`);
      }
      return violations;
    },
    sample: {
      'src/components/tabPanels/MoreTabPanel.tsx': '// debugMode: boolean, gated behind {debugMode && (\nexport function MoreTabPanel() { return null; }\n',
      'src/App.tsx': 'export function App() { return null; }\n',
      'src/components/CitizenOverviewScreen.tsx': 'export function CitizenOverviewScreen() { return null; }\n',
    },
  },
  {
    id: 'calendar-day-length-owner',
    rule: 'the calendar day length has one owner (gameConstants.Time)',
    check(ctx) {
      return [
        forbidMatch(ctx, 'src/game/gameConstants.ts', /^\s*TICKS_PER_DAY:/m, 'gameConstants.Time declares TICKS_PER_DAY again, a literal nothing reads'),
        forbidMatch(ctx, 'src/game/dayCycleClock.ts', /^export const TICKS_PER_HOUR = \d/m, 'dayCycleClock restates the tick rate instead of reading the owner'),
        requireText(ctx, 'src/game/dayCycleClock.ts', 'Time.TICKS_PER_HOUR', 'dayCycleClock no longer reads Time.TICKS_PER_HOUR'),
      ].filter(Boolean);
    },
    sample: { 'src/game/dayCycleClock.ts': 'export const TICKS_PER_HOUR = 12;\n' },
  },
  {
    id: 'catalogue-copy-and-day-index-owners',
    rule: 'the build catalogue states no static barricade numbers and the day index comes from getColonyDay',
    check(ctx) {
      const violations = [];
      for (const file of ['src/game/rivalEvents.ts', 'src/game/temperature.ts']) {
        if (/\*\s*360\b/.test(ctx.read(file))) violations.push(`${file}: restates the day index as 360`);
        if (!/getColonyDay/.test(ctx.read(file))) violations.push(`${file}: does not use getColonyDay`);
      }
      return violations;
    },
    sample: { 'src/game/temperature.ts': 'const day = tick / (360 * TICKS_PER_DAY);\n' },
  },
  {
    id: 'food-threshold-owner',
    rule: 'no surface re-derives a food threshold; each calls the resourceUtils owner',
    check(ctx) {
      const sites = [
        ['src/game/priorityAlerts.ts', /Math\.max\(15,/],
        ['src/game/contextualTutorial.ts', /Math\.max\(15,/],
        ['src/game/focusHints.ts', /Math\.max\(20,/],
        ['src/game/citizenOverview.ts', /Math\.max\(20,/],
        ['src/game/dashboardData.ts', /humans \* 3/],
        ['src/components/CitizenOverviewScreen.tsx', /Math\.max\(20,/],
      ];
      const violations = [];
      for (const [file, restated] of sites) {
        if (restated.test(ctx.read(file))) violations.push(`${file}: re-derives a food threshold`);
        if (!/isFood(Alert|Critical|AlertAmount|CriticalAmount|Low)/.test(ctx.read(file))) violations.push(`${file}: does not call the food-threshold owner at all`);
      }
      return violations;
    },
    sample: { 'src/game/focusHints.ts': 'const critical = Math.max(20, humans * 1.5);\n' },
  },
  {
    id: 'hospital-reputation-owner',
    rule: 'both hospital UI sites render the owner description and the economy issues the grant through the owner',
    check(ctx) {
      const violations = [];
      for (const site of ['src/components/SelectedBuildingPanel.tsx', 'src/components/tabPanels/MoreTabPanel.tsx']) {
        if (!/describeHospitalReputation\(\)/.test(ctx.read(site))) violations.push(`${site}: does not render the owner's description`);
        if (/reputation every 5 days/.test(ctx.read(site))) violations.push(`${site}: restates the interval amount`);
      }
      const economy = 'src/game/dailyBuildingEconomy.ts';
      if (/addReputation\(state, 2\)/.test(ctx.read(economy))) violations.push(`${economy}: issues the hospital grant directly again`);
      if (!/grantHospitalIntervalReputation\(/.test(ctx.read(economy))) violations.push(`${economy}: does not call the hospital reputation owner`);
      return violations;
    },
    sample: { 'src/game/dailyBuildingEconomy.ts': 'addReputation(state, 2);\n' },
  },
  {
    id: 'building-focus-centre',
    rule: 'no focus caller adds half a footprint; every caller asks getBuildingCenter',
    check(ctx) {
      const violations = [];
      for (const file of ['src/game/priorityAlerts.ts', 'src/game/focusHints.ts', 'src/components/tabPanels/VillageTabPanel.tsx']) {
        if (/\.(x|y) \+ \w+\.(width|height) \/ 2/.test(ctx.read(file))) violations.push(`${file}: focuses a corner again`);
        if (!ctx.read(file).includes('getBuildingCenter(')) violations.push(`${file}: does not ask for the centre`);
      }
      return violations;
    },
    sample: { 'src/game/focusHints.ts': 'focus(building.x + building.width / 2, building.y);\n' },
  },
  {
    id: 'intro-cta-scheduled-from-duration',
    rule: 'the intro CTA is scheduled from the whole duration, not from an offset beat',
    check(ctx) {
      return [
        requireText(ctx, 'src/game/IntroScreen.tsx', 'scheduleIntroBeat(INTRO_DURATION_MS, () =>', 'the CTA is no longer scheduled from the whole duration'),
      ].filter(Boolean);
    },
    sample: { 'src/game/IntroScreen.tsx': 'scheduleIntroBeat(INTRO_READY_DELAY_MS, () => {});\n' },
  },
  {
    id: 'diagnostics-console-wiring',
    rule: 'App.tsx switches diagnostics console logging from the debug flag',
    check(ctx) {
      return [
        requireText(ctx, 'src/App.tsx', 'setRelationshipDiagnosticsConsoleLoggingEnabled(debugMode)', 'the app no longer switches diagnostics console logging'),
        requireText(ctx, 'src/App.tsx', "get('debug') === '1'", 'the switch is no longer tied to the debug flag'),
      ].filter(Boolean);
    },
    sample: { 'src/App.tsx': 'setRelationshipDiagnosticsConsoleLoggingEnabled(true);\n' },
  },
];

function runGuards(ctx) {
  return GUARDS.flatMap((guard) =>
    guard.check(ctx).map((message) => ({ id: guard.id, message })),
  );
}

function main() {
  const selfTest = process.argv.includes('--self-test');
  if (selfTest) {
    const failures = [];
    for (const guard of GUARDS) {
      if (!guard.sample) {
        failures.push(`${guard.id}: no red-before sample`);
        continue;
      }
      const violations = guard.check(makeContext(guard.sample));
      if (violations.length === 0) failures.push(`${guard.id}: did not report a violation on its sample`);
    }
    if (failures.length > 0) {
      process.stderr.write(`source guards self-test FAILED\n${failures.map((line) => `  ${line}`).join('\n')}\n`);
      process.exit(1);
    }
    process.stdout.write(`source guards self-test: PASS (${GUARDS.length} rules still catch a violation)\n`);
    return;
  }

  const violations = runGuards(makeContext());
  if (violations.length > 0) {
    process.stderr.write(`source guards FAILED (${violations.length})\n`);
    for (const { id, message } of violations) process.stderr.write(`  [${id}] ${message}\n`);
    process.exit(1);
  }
  process.stdout.write(`source guards: PASS (${GUARDS.length} rules)\n`);
}

main();
