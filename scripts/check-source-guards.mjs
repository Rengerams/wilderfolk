#!/usr/bin/env node
/**
 * Source-text guards migrated out of the vitest tier: "this rule has exactly one owner" assertions
 * that read `src` and match a regex. They are lint, not behavior, so they run once per gate here
 * instead of as one vitest process per file. `--self-test` proves each rule still reports a
 * violation on an overlay source tree. Declarative clauses are mutated individually.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();

function readFromDisk(relative) {
  return readFileSync(path.resolve(REPO, relative), 'utf8');
}

function walkTypeScript(dir, extension = '.ts') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkTypeScript(full, extension);
    return entry.name.endsWith(extension) ? [full] : [];
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
    /** Every file with `extension` under a repo-relative directory, overlay files included. */
    sourceFiles(dir, extension = '.ts') {
      const fromDisk = walkTypeScript(path.resolve(REPO, dir), extension).map((full) =>
        path.relative(REPO, full).split(path.sep).join('/'),
      );
      const fromOverlay = Object.keys(overlay).filter(
        (relative) => relative.startsWith(`${dir}/`) && relative.endsWith(extension),
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
  { file: 'tests/animalCare.test.ts', pattern: /5 \* 72|\+= 72/, spelling: '5 * 72 / += 72' },
  { file: 'tests/rivalDiplomacy.test.ts', pattern: /14 \* 72/, spelling: '14 * 72' },
  { file: 'tests/weatherConsequences.test.ts', pattern: /let t = 72;|t <= 71;/, spelling: 'for (let t = 72; …) with the `t <= 71` run-up' },
  { file: 'tests/conceptionEvent.labelling.test.ts', pattern: /state\.tick = 72;/, spelling: 'state.tick = 72' },
  { file: 'tests/humanLifecycle.test.ts', pattern: /state\.tick = 72;/, spelling: 'state.tick = 72' },
  { file: 'tests/humanTick.hotPathIndexes.test.ts', pattern: /72 \+ (23|10) \* TICKS_PER_HOUR/, spelling: '72 + 23 * TICKS_PER_HOUR / 72 + 10 * TICKS_PER_HOUR' },
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

/**
 * Declarative rows: a rule is a list of checks against named files. `notContains`/`notMatches` rows
 * carry an `example` — the bad spelling — so the self-test can inject it and prove the row still
 * reports a violation instead of passing on a typo.
 */
const SOURCE_ROWS = [
  { id: 'terrain-fill-single-stamp', checks: [{ file: 'src/game/terrainLayer.ts', region: [{ from: 'function drawTerrainFill(', to: 'type Cardinal', counts: [{ needle: 'drawImage(', times: 1 }] }] }] },
  { id: "visitor-trade-formatter-owner", checks: [{ file: "src/game/groupEvents.ts", contains: "formatResourceAmounts(received)", notMatches: /receivedLabel\s*=\s*`\+\$\{added\}/, example: "receivedLabel = `+${added}`;" }] },
  { id: "yearly-marriage-statistics-owner", checks: [{ file: "src/game/stats.ts", contains: "filter(isMarriedOrExpecting)", notMatches: /relationshipStatus\s*===\s*'married'/, example: "relationshipStatus === 'married'" }] },
  { id: "active-marriage-predicate-single-owner", scan: { dir: "src", ext: [".ts", ".tsx"], except: ["src/game/relationships.ts"], notMatches: /function isActivelyMarried\s*\(/, example: "function isActivelyMarried(", minFiles: 1 } },
  { id: "marriage-status-read-owner", scan: { dir: "src", ext: [".ts", ".tsx"], except: ["src/game/relationships.ts"], notMatches: /relationshipStatus\s*(===|!==|==|!=)\s*'married'/, example: "relationshipStatus === 'married'", minFiles: 1 } },
  { id: "settler-display-name-owner-callers", checks: [{ files: ["src/game/workforce.ts", "src/game/villageLeadership.ts"], contains: "humanDisplayName(entity)", notMatches: /entity\.name \|\| '(Settler|Unknown)'/, example: "entity.name || 'Settler'" }] },
  { id: "settler-display-name-fallback-owner", scan: { dir: "src", ext: [".ts", ".tsx"], notMatches: /entity\.name \|\| '(Settler|Unknown|Unnamed)'/, example: "entity.name || 'Unnamed'", minFiles: 1 } },
  { id: "renderer-no-private-camp-anchor", checks: [{ file: "src/game/renderer/humans.ts", notMatches: /function getPlayerCampCenterFromBuildings/, example: "function getPlayerCampCenterFromBuildings", notContains: "getPlayerCampCenter" }] },
  { id: "terrain-tile-size-retired-aliases", scan: { dir: "src", ext: [".ts", ".tsx"], notMatches: /\b(PIXELS_PER_TILE|PLACEMENT_TILE_SIZE)\b/, example: "const PIXELS_PER_TILE = 32;", minFiles: 1 } },
  { id: "retired-frontier-world-event", checks: [{ file: "src/game/groupEvents.ts", notContains: ["id: 'rival_settlement'", "spawnRivalSettlement"] }] },
  { id: "yearly-world-event-no-biennial-gate", checks: [{ file: "src/game/dailyWorldEvents.ts", notMatches: /state\.year % 2 === 0/, example: "state.year % 2 === 0" }] },
  { id: "renderer-live-build-verdict", checks: [{ file: "src/game/renderer/entityComposite.ts", notMatches: /drawBuildSnapOverlay|drawBuildStripPreviewOverlay/, example: "drawBuildSnapOverlay(ctx, state, cw, ch)" }, { file: "src/game/renderer/overlay.ts", contains: ["drawBuildSnapOverlay(ctx, state, cw, ch)", "drawBuildStripPreviewOverlay(ctx, state, cw, ch)"] }] },
  { id: "renderer-live-construction-progress", checks: [{ file: "src/game/renderer/overlay.ts", contains: "drawConstructionProgressOverlay(ctx, state, cw, ch)" }, { file: "src/game/renderer/entityComposite.ts", notContains: "drawConstructionProgressOverlay" }, { file: "src/game/renderer/buildings.ts", notContains: "displayedConstructionProgress(building, state.tick)" }] },
  { id: "render-patch-presentation-only", checks: [{ file: "src/game/simBuffers/applyKinematics.ts", notMatches: [/entity\.size\s*=/, /entity\.huntTargetId\s*=/, /entity\.chatTicks\s*=/, /entity\.chatPhrase\s*=/], example: ["entity.size = 0", "entity.huntTargetId = 0", "entity.chatTicks = 0", "entity.chatPhrase = 0"] }] },
  { id: "walk-animation-simulation-owner", checks: [{ file: "src/game/humanSprites.ts", notMatches: /human\.animFrame\s*=/, example: "human.animFrame = 0" }, { file: "src/game/simulation/humanMovement.ts", contains: "export function advanceHumanWalkAnim" }] },
  { id: "renderer-live-hunt-arrows", checks: [{ file: "src/game/renderer/entityComposite.ts", notContains: "drawHuntVisuals(" }, { file: "src/game/renderer/overlay.ts", contains: "drawHuntVisuals(ctx, state, cw, ch)" }] },
  { id: "terrain-independent-shore-overlay", checks: [{ file: "src/game/terrainLayer.ts", notMatches: /if \(atlasPick\) \{\s*\n\s*const overlayPick/, example: "if (atlasPick) {\n const overlayPick", counts: [{ needle: "drawSandWaterOverlay(ctx", times: 3 }] }] },
  { id: "terrain-palette-canonical-consumers", checks: [{ file: "src/game/terrainAtlas.ts", counts: [{ needle: "0x5e7a3a", times: 1 }] }, { file: "src/game/renderer/terrain.ts", contains: "TERRAIN_PALETTE" }, { file: "src/components/MiniMap.tsx", contains: "terrainPaletteHex", notContains: "#5f8a48" }] },
  { id: "renderer-strip-index-once", checks: [{ file: "src/game/renderer/buildings.ts", notContains: "detectBuildingJunction(", counts: [{ needle: "collectStripCenters(", times: 2 }] }] },
  { id: "renderer-child-figure-normalization", checks: [{ file: "src/game/renderer/humans.ts", contains: "spriteH * getJuvenileFigureScale(human)" }] },
  { id: "renderer-procedural-decor-preview", checks: [{ file: "src/game/renderer/buildPreview.ts", contains: ["drawProceduralDecor(ctx, state.buildMode", "isDecorType(state.buildMode)", "const previewFrame = isDecor || !cfg.sprite ? null : getSpriteFrame(cfg.sprite)"] }] },
  { id: "renderer-live-leader-aura", checks: [{ file: "src/game/renderer/humans.ts", notContains: ["drawLeaderAura(ctx, human", "if (isLeader && cam.zoom > 0.22) {"], contains: "export function drawLeaderAuraOverlay" }, { file: "src/game/renderer/overlay.ts", contains: "drawLeaderAuraOverlay(ctx, state, cw, ch)" }] },
  { id: "renderer-preview-terrain-relief", checks: [{ files: ["src/game/renderer/buildPreview.ts", "src/game/renderer/buildings.ts"], contains: "footprintGroundRise(state.worldMap" }, { file: "src/game/renderer/grid.ts", counts: [{ needle: "terrainRiseAt(state.worldMap", times: 2 }] }] },
  { id: "renderer-snapped-verdict-position", checks: [{ file: "src/game/renderer/grid.ts", contains: "const px = worldToScreenX(cx, cam, cw);", notContains: "worldToScreenX(rawX," }] },
  { id: "renderer-bounded-progress-samples", checks: [{ file: "src/game/buildingProgressDisplay.ts", matches: [/if \(value >= 100\) \{\s*\n\s*samples\.delete\(building\.id\);/, /samples\.size >= MAX_PROGRESS_SAMPLES/] }] },
  { id: "renderer-shared-floating-text-fade", checks: [{ file: "src/game/renderer/markers.ts", contains: "FLOATING_TEXT_FADE_TICKS", notMatches: /ft\.life < 7/, example: "ft.life < 7" }, { file: "src/game/tickLayerRealtime.ts", contains: "FLOATING_TEXT_FADE_TICKS", notMatches: /ft\.life < 6/, example: "ft.life < 6" }] },
  { id: "grid-cell-clamp-single-owner", scan: { dir: "src", ext: [".ts", ".tsx"], except: ["src/game/spatialGrid.ts"], notMatches: /Math\.min\(\w+(\.\w+)? - 1, Math\.max\(0, Math\.floor\(/, example: "Math.min(cellCount - 1, Math.max(0, Math.floor(coord / cellSize)))", minFiles: 1 } },
  { id: "grid-cell-clamp-single-owner-owner", checks: [{ file: "src/game/spatialGrid.ts", matches: [/Math\.min\(\w+(\.\w+)? - 1, Math\.max\(0, Math\.floor\(/] }] },
  { id: "velocity-facing-single-owner", scan: { dir: "src", ext: [".ts", ".tsx"], except: ["src/game/simulation/movementSteering.ts"], notMatches: /spriteAngle\s*=\s*Math\.atan2\(\s*\w+\.vy,\s*\w+\.vx\s*\)/, example: "e.spriteAngle = Math.atan2(e.vy, e.vx)", minFiles: 1 } },
  { id: "velocity-facing-single-owner-owner", checks: [{ file: "src/game/simulation/movementSteering.ts", matches: [/spriteAngle\s*=\s*Math\.atan2\(\s*\w+\.vy,\s*\w+\.vx\s*\)/] }] },
  { id: "swept-behaviors-use-movement-owner", checks: [{ files: ["src/game/simulation/humanMovement.ts", "src/game/humanHospitalBehavior.ts", "src/game/humanLeisureBehavior.ts", "src/game/blueberryForaging.ts", "src/game/humanHuntingBehavior.ts", "src/game/pathfinding.ts", "src/game/tickLayerSystems.ts", "src/game/humanTick.ts"], matches: [/steerHumanToward\(|steerEntityToward\(|setVelocityToward\(|faceVelocity\(|commuteHumanToBuilding\(/] }] },
  { id: "retired-first-week-visitor-flag", checks: [{ files: ["src/game/gameTypes.ts", "src/game/worldGen.ts", "src/game/saveSchema.ts", "src/game/simWorker/simPrep.ts", "src/game/simBuffers/simDelta.ts"], notContains: "firstWeekVisitorSpawned" }] },
  { id: "retired-camp-view-stays-removed", checks: [{ files: ["src/game/viewState.ts", "src/game/renderSnapshot.ts", "src/App.tsx", "src/hooks/useCanvasInteractions.ts"], notContains: ["selectedCampKey", "highlightedCampKey", "focusCampOnMap"] }, { file: "src/game/renderer/markers.ts", notContains: ["drawCampMarkers", "drawCampHighlightRings"] }] },
  { id: "retired-hotel-movement-stays-removed", checks: [{ file: "src/game/hotelStay.ts", notContains: ["steerVisitorToHotel", "restAtHotel", "HOTEL_REST_ENERGY_PER_HOUR", "checkInVisitor", "pickHotelForVisitor", "checkoutVisitor", "hotelGuestIds", "commuteHumanToBuilding(", "applyHumanWalkStep("] }] },
  { id: "manual-staffing-controls-retired", checks: [{ file: "src/components/SelectedBuildingPanel.tsx", contains: "Employment is automatic", notContains: ["isManualStaffingBuilding", "onSetStaffingMode", "onAssignWorker"] }] },
  { id: "builder-eligibility-single-predicate", checks: [{ file: "src/game/buildingStaffingActions.ts", counts: [{ needle: "isEligibleBuilderForBuilding(", times: 3 }], contains: ["&& !constructionCrews.has(entity.id)", "if (buildConstructionCrewIndex(state.buildings).has(humanId)) return 'on-another-crew';"] }] },
  { id: "raid-deadline-runtime-owner", checks: [{ file: "src/game/frontierCombat.ts", order: [["export function tickPendingRaidEvents", "export function tickPendingOutgoingRaidEvents"]], region: [{ from: "export function tickPendingRaidEvents", to: "export function tickPendingOutgoingRaidEvents", contains: "getRaidExpiresAtTick(evt)" }, { from: "export function tickPendingOutgoingRaidEvents", contains: "getRaidExpiresAtTick(evt)", notMatches: [/state\.tick < evt\.expiresAtTick/], example: ["state.tick < evt.expiresAtTick"] }] }] },
  { id: "catalogue-rebuild-single-upsert", checks: [{ file: "src/game/entityCatalog.ts", notContains: "applyTickDelta", counts: [{ needle: "this.byId.set(", times: 1 }] }] },
  { id: "star-rng-uses-mulberry-step", checks: [{ file: "src/game/renffrStar.ts", notMatches: [/Math\.imul|0x6d2b79f5/], example: ["Math.imul(x, y);"], contains: ["mulberry32Advance(", "mulberry32Draw("] }, { file: "src/game/simRng.ts", contains: ["export function mulberry32Advance(", "export function mulberry32Draw("] }] },
  { id: "pregnancy-term-formula-single-owner", scan: { dir: "src/game", ext: [".ts", ".tsx"], except: ["src/game/pregnancy.ts"], notMatches: /Math\.round\(PREGNANCY_TICKS \* \(0\.85 \+/, example: "Math.round(PREGNANCY_TICKS * (0.85 + 0.1))", minFiles: 1 } },
  { id: "pregnancy-start-single-owner", scan: { dir: "src/game", ext: [".ts", ".tsx"], except: ["src/game/pregnancy.ts"], notMatches: /function startPregnancy\(/, example: "function startPregnancy() {}", minFiles: 1 } },
  { id: "pregnancy-owner-delegation", checks: [{ file: "src/game/pregnancy.ts", counts: [{ needle: "Math.round(PREGNANCY_TICKS * (0.85 +", times: 1 }, { needle: "function startPregnancy(", times: 1 }, { needle: "`pregnancy-due:", times: 1 }] }, { file: "src/game/simulation/humanRelationships.ts", notMatches: [/Math\.round\(PREGNANCY_TICKS \* \(0\.85 \+/], example: ["Math.round(PREGNANCY_TICKS * (0.85 + 0.1))"], notContains: "rollPregnancyDueProgress", counts: [{ needle: "resolveConception(", times: 4 }, { needle: "startPregnancy(", times: 1 }], region: [{ from: "function resolveConception(", to: "type ConceptionGateOutcome", contains: "startPregnancy(", notMatches: [/pregnancyDueProgress\s*=|pregnancyProgress\s*=|pregnantById\s*=|pregnancyFromYouthLove\s*=|\.pregnant\s*=/], example: ["entity.pregnancyProgress = 0;"] }] }, { file: "src/game/entityFactory.ts", counts: [{ needle: "startPregnancy(", times: 1 }], notMatches: [/Math\.round\(PREGNANCY_TICKS \* \(0\.85 \+/], example: ["Math.round(PREGNANCY_TICKS * (0.85 + 0.1))"] }] },
  {
    id: "overlay-window-keyboard-ownership",
    checks: [
      { file: "src/components/WorkHoursWindow.tsx", contains: ["from '../hooks/useOverlayKeyboard'", "useOverlayKeyboard('work-hours-window', onClose)"] },
      { file: "src/components/FamilyTreeWindow.tsx", contains: ["from '../hooks/useOverlayKeyboard'", "useOverlayKeyboard('family-tree-window', onClose)"] },
      { file: "src/hooks/useOverlayKeyboard.ts", contains: ["claimKeyboard(owner)"] },
    ],
  },
  {
    id: "bulk-strip-demolition-confirmation",
    checks: [
      { file: "src/hooks/useCanvasInteractions.ts", contains: ["setPendingStripDemolition(buildingIds)", "confirmStripDemolition"] },
    ],
  },
  {
    id: "overlay-window-stacking",
    checks: [
      { file: "src/components/WorkHoursWindow.tsx", contains: ["onClose={onClose} centered"] },
      { file: "src/components/ShortcutsOverlay.tsx", contains: ["z-[60]"] },
    ],
  },
  {
    id: "family-tree-visible-generation-bound",
    checks: [
      { file: "src/components/FamilyTreeWindow.tsx", contains: ["Math.max(1, ...tree.rows.map((row) => Math.abs(row.delta)))", "visibleRows.reduce"], notContains: ["[2, 3, 4, 5, 6]", "${tree.memberCount} people drawn"] },
    ],
  },
  {
    id: "camera-pan-preserves-selection",
    checks: [
      { file: "src/hooks/useCanvasInteractions.ts", contains: ["const pointerMovedRef = useRef(false);"], matches: [/const origin = clickOriginRef\.current;\n\s*if \(origin && e\) \{\n\s*const dx = e\.clientX - origin\.x;\n\s*const dy = e\.clientY - origin\.y;\n\s*pointerMovedRef\.current = dx \* dx \+ dy \* dy > 16;/, /if \(pointerMovedRef\.current\) \{\n\s*pointerMovedRef\.current = false;\n\s*return;\n\s*\}/, /pointerMovedRef\.current = false;\n\s*stripPlacedOnMouseUpRef\.current = false;\n\s*if \(gameplayActive && e\.button === 0\)/] },
    ],
  },
  {
    id: "catalogue-optional-sprite-fallback",
    checks: [
      { file: "src/components/BuildCatalogPanel.tsx", contains: ["(config.sprite || type === BuildingType.GroundReinforcement) ? (", "'/sprites/ground_soil.png' : config.sprite", ") : (", "{config.emoji}"] },
    ],
  },
  {
    id: "taming-picker-owner-and-all-candidates",
    checks: [
      { file: "src/components/SelectedEntityPanel.tsx", contains: ["{availableHumans.map(h => (", "{availableHumans.length} available:", "getTameEntityEligibility(state, entity.id, availableHumans[0].id).blockReason", "const tameDisabled = tameFoodCost != null && !canAffordTame;", "disabled={tameDisabled}", "{tameBlockReason && ("], notContains: ["availableHumans.slice(0, 4)"] },
    ],
  },
  {
    id: "settler-card-person-name",
    checks: [
      { file: "src/components/SelectedEntityPanel.tsx", contains: ["{citizenFullName(entity)}"], notContains: ["Citizen #{entity.id}"] },
    ],
  },
  {
    id: "collapsed-build-rail-hotkey",
    checks: [
      { file: "src/components/GameBuildRail.tsx", contains: ["<kbd className=\"rounded bg-stone-800 px-1 text-[10px] font-bold text-stone-400\">B</kbd>"], notContains: ["title=\"Build catalog on the left · press B\""] },
    ],
  },
  {
    id: "guide-shortcuts-wiring",
    checks: [
      { file: "src/components/tabPanels/MoreTabPanel.tsx", contains: ["onOpenShortcuts?: () => void;", "Open the shortcut sheet"] },
      { file: "src/components/CitizenOverviewScreen.tsx", contains: ["onOpenShortcuts={onOpenShortcuts}"] },
      { file: "src/App.tsx", contains: ["onOpenShortcuts={() => setShowShortcuts(true)}"] },
    ],
  },
  {
    id: "single-chapter-moment-card",
    checks: [
      { file: "src/hooks/useTransientGameFeedback.ts", contains: ["activeChapterMoment: pendingChapterCard,"], notContains: ["momentCard"] },
      { file: "src/App.tsx", contains: ["<MomentTitleCard moment={activeChapterMoment} onDone={dismissChapterCard} />"], notContains: ["dismissMomentCard"] },
    ],
  },
  {
    id: "inspector-diagnostics-and-regions",
    checks: [
      { file: "src/components/GameInspector.tsx", contains: ["role=\"region\" aria-label=\"Inspector (collapsed)\"", "role=\"region\" aria-label=\"Inspector (nothing selected)\"", "role=\"region\" aria-label=\"Inspector\""], region: [{ from: "if (!hasSelection)", to: "return (\n    <div role=\"region\" aria-label=\"Inspector\" className=\"flex flex-col\">", contains: "{diagnostics}" }] },
    ],
  },
  {
    id: "concern-log-intent-wiring",
    checks: [
      { file: "src/components/dashboard/GameDashboard.tsx", contains: ["raid: { subTab: 'combat', filter: 'combat' }", "howler: { subTab: 'chronicle', filter: 'event' }", "Log →"] },
      { file: "src/hooks/useGameShellState.ts", contains: ["setLogFilter(filter);"] },
      { file: "src/components/tabPanels/LogTabPanel.tsx", contains: ["initialFilter={logFilter}", "onFilterChange={setLogFilter}"] },
    ],
  },
  {
    id: "retired-sidebar-css",
    checks: [
      { file: "src/App.css", contains: [".game-view-drawer--build {", ".game-view-drawer--rail {", ".build-panel-toggle"], notMatches: [/\.sidebar-tab/, /sidebar-tabs/, /game-view-drawer--dock/], example: [".sidebar-tab {}", "sidebar-tabs {}", "game-view-drawer--dock {}"] },
    ],
  },
  {
    id: "biodiversity-index-scale",
    checks: [
      { file: "src/components/tabPanels/NatureTabPanel.tsx", contains: ["BIODIVERSITY_SCALE", "of {BIODIVERSITY_SCALE.max.toFixed(2)} max", "const BIODIVERSITY_SPECIES_COUNT = 6;", "Math.log(BIODIVERSITY_SPECIES_COUNT)"] },
    ],
  },
  {
    id: 'dynasty-panel-reads-chronicle-predicate',
    checks: [
      { file: 'src/components/tabPanels/DynastyPanel.tsx', notContains: 'generationsAlive >= 2', example: 'dynasty.generationsAlive >= 2' },
      { file: 'src/components/tabPanels/DynastyPanel.tsx', contains: 'filter(meetsDynastyThreshold)' },
      { file: 'src/game/familyLegacy.ts', contains: 'return computeDynasties(state).some(meetsDynastyThreshold);' },
    ],
  },
  {
    id: 'nature-bar-reads-ecosystem-health',
    checks: [
      { file: 'src/components/tabPanels/NatureTabPanel.tsx', contains: 'const ecosystemHealth = getEcosystemHealth(state);' },
      { file: 'src/components/tabPanels/NatureTabPanel.tsx', notContains: 'Math.round(state.ecosystemHealth)', example: 'const x = Math.round(state.ecosystemHealth);' },
    ],
  },
  {
    id: 'research-gate-reads-can-start-research',
    checks: [
      { file: 'src/components/tabPanels/ProgressTabPanel.tsx', contains: 'canStartResearch(state, node.id)' },
      { file: 'src/components/tabPanels/ProgressTabPanel.tsx', notContains: 'state.resources.wood >= node.cost.wood', example: 'if (state.resources.wood >= node.cost.wood) {}' },
    ],
  },
  {
    id: 'resource-bar-reads-fill-owner',
    checks: [
      { file: 'src/components/dashboard/GameDashboard.tsx', contains: 'resourceFillPercent(r)' },
      { file: 'src/components/dashboard/GameDashboard.tsx', notContains: '(r.amount / r.cap)', example: 'const pct = (r.amount / r.cap) * 100;' },
    ],
  },
  {
    id: 'toast-lifetime-single-owner',
    checks: [
      { file: 'src/hooks/useTransientGameFeedback.ts', notContains: 'NOTIFICATION_LIFETIME_MS', example: 'const NOTIFICATION_LIFETIME_MS = 4000;' },
      { file: 'src/hooks/useTransientGameFeedback.ts', contains: 'const cutoff = now - NOTIFICATION_DISPLAY_MS;' },
      { file: 'src/hooks/useTransientGameFeedback.ts', notContains: 'notificationTimersRef', example: 'const notificationTimersRef = useRef(new Map());' },
      { file: 'src/App.tsx', contains: 'visibleNotifications.map(' },
      { file: 'src/App.tsx', notContains: 'world.notifications ?? []).slice(-4)', example: 'const recent = (world.notifications ?? []).slice(-4);' },
    ],
  },
  {
    id: 'sidebar-tab-one-union',
    checks: [
      { file: 'src/game/hotkeys.ts', counts: [{ needle: 'export type SidebarTab =', times: 1 }] },
      { file: 'src/hooks/useGameShellState.ts', notContains: 'export type SidebarTab =', example: 'export type SidebarTab = SidebarTabId;' },
      { file: 'src/hooks/useGameShellState.ts', contains: "import type { SidebarTab } from '../game/hotkeys';" },
    ],
  },
  {
    id: 'overlay-focus-one-query',
    checks: [
      { file: 'src/hooks/useModalFocus.ts', contains: 'export function getFocusableElements(container: HTMLElement): HTMLElement[]' },
      { file: 'src/components/ShortcutsOverlay.tsx', contains: 'useModalFocus<HTMLDivElement>()' },
      { file: 'src/components/ShortcutsOverlay.tsx', notContains: 'getFocusableElements', example: 'const items = getFocusableElements(ref.current);' },
      { file: 'src/components/GameMenu.tsx', contains: 'getFocusableElements(panelRef.current)' },
      { files: ['src/components/ShortcutsOverlay.tsx', 'src/components/GameMenu.tsx'], notContains: "querySelectorAll<HTMLElement>(\n      'button", example: "const x = ref.current?.querySelectorAll<HTMLElement>(\n      'button');" },
      { file: 'src/components/ShortcutsOverlay.tsx', notContains: "'button, [href], input, select, textarea", example: "const q = 'button, [href], input, select, textarea';" },
    ],
  },
  {
    id: 'settler-name-fallback-owner',
    checks: [
      { file: 'src/components/SelectedEntityPanel.tsx', contains: 'citizenGivenName(' },
      { file: 'src/components/SelectedEntityPanel.tsx', notContains: "e.name || 'Unknown'", example: "const label = e.name || 'Unknown';" },
      { file: 'src/game/citizenId.ts', contains: 'if (!entity.name) return SETTLER_NAME_FALLBACK;' },
    ],
  },
  {
    id: 'menu-copy-reads-clock-owner',
    checks: [
      { file: 'src/components/GameMenu.tsx', contains: '${TICKS_PER_DAY} ticks = 1 day' },
      { file: 'src/components/GameMenu.tsx', notContains: '(72 ticks = 1 day)', example: '72 ticks = 1 day' },
      { file: 'src/components/GameMenu.tsx', notContains: 'Every 30 seconds when enabled', example: 'Every 30 seconds when enabled' },
      { file: 'src/components/GameMenu.tsx', contains: 'Save on exit' },
    ],
  },
  {
    id: 'building-hints-read-owners',
    checks: [
      { file: 'src/components/SelectedBuildingPanel.tsx', contains: 'function ownerOutputHint(building: Building, state: WorldState): string | null {' },
      { file: 'src/components/SelectedBuildingPanel.tsx', contains: 'getWallSegmentCap(state)' },
      { file: 'src/components/SelectedBuildingPanel.tsx', contains: 'SMITH_BONUS_PER_WORKER' },
      { file: 'src/components/SelectedBuildingPanel.tsx', notContains: 'max +72 from all wall pieces', example: 'max +72 from all wall pieces' },
      { file: 'src/components/SelectedBuildingPanel.tsx', notContains: '+25% per worker', example: '+25% per worker' },
      { file: 'src/components/SelectedBuildingPanel.tsx', notContains: '+600 food storage', example: '+600 food storage' },
      { file: 'src/components/SelectedBuildingPanel.tsx', notContains: '+800 wood storage', example: '+800 wood storage' },
    ],
  },
  {
    id: 'worker-skill-line-reads-owner',
    checks: [
      { file: 'src/components/SelectedBuildingPanel.tsx', contains: 'getWorkerSkillMultiplier(state, building)' },
      { file: 'src/components/SelectedBuildingPanel.tsx', notContains: 'Math.round(avgSkill * 2)', example: 'const pct = Math.round(avgSkill * 2);' },
    ],
  },
  {
    id: 'clone-chart-axis-block',
    checks: [
      {
        file: 'src/components/dashboard/GameDashboard.tsx',
        counts: [
          { needle: '<ChartGrid max={max} />', times: 2 },
          { needle: '<ChartXAxis days={', times: 2 },
          { needle: 'Array.from({ length: 5 }', times: 1 },
        ],
      },
    ],
  },
  {
    id: 'clone-hour-picker',
    checks: [
      {
        file: 'src/components/WorkSchedulePanel.tsx',
        counts: [
          { needle: '<HourSelect', times: 2 },
          { needle: 'Array.from({ length: HOURS_PER_DAY }', times: 1 },
        ],
      },
    ],
  },
  {
    id: 'clone-log-export-header',
    checks: [
      {
        file: 'src/components/tabPanels/LogTabPanel.tsx',
        counts: [
          { needle: 'meta={logMeta}', times: 2 },
          { needle: 'villageName: state.villageName', times: 1 },
        ],
      },
    ],
  },
  {
    id: 'clone-strip-commit-helper',
    checks: [
      {
        file: 'src/hooks/useCanvasInteractions.ts',
        counts: [
          { needle: "op: 'placeStripChain'", times: 1 },
          { needle: 'stripChainCommand(', times: 3 },
        ],
      },
    ],
  },
  {
    id: 'clone-settings-callback-contract',
    checks: [
      { file: 'src/components/GameMenu.tsx', contains: 'export interface GameMenuSettingsCallbacks {' },
      { file: 'src/components/GameHeader.tsx', contains: 'interface Props extends GameMenuSettingsCallbacks {' },
      { file: 'src/components/GameHeader.tsx', notContains: 'onToggleJuiceEffects: () => void;', example: 'onToggleJuiceEffects: () => void;' },
      { file: 'src/components/GameMenu.tsx', counts: [{ needle: 'onToggleJuiceEffects: () => void;', times: 1 }] },
    ],
  },
  {
    id: 'clone-raid-choice-buttons',
    checks: [
      { file: 'src/App.tsx', counts: [{ needle: 'respondToRaidEvent', times: 1 }] },
      {
        file: 'src/components/SelectedBuildingPanel.tsx',
        counts: [
          { needle: '<RaidChoiceButtons', times: 0 },
          { needle: 'text-[10px] font-bold ${colorClass}', times: 0 },
        ],
      },
    ],
  },
  {
    id: 'clone-frontier-props-forwarded',
    checks: [
      { file: 'src/components/FrontierPanel.tsx', contains: 'export interface FrontierPanelProps {' },
      { file: 'src/components/tabPanels/FrontierTabPanel.tsx', contains: 'export type FrontierTabPanelProps = FrontierPanelProps;' },
      { file: 'src/components/tabPanels/FrontierTabPanel.tsx', notContains: 'pendingOutgoingRaidCount: number;', example: 'pendingOutgoingRaidCount: number;' },
    ],
  },
  {
    id: 'clone-route-table',
    checks: [
      { file: 'src/hooks/useGameShellState.ts', contains: 'const OVERVIEW_ROUTES: Record<' },
      { file: 'src/hooks/useGameShellState.ts', contains: 'const OVERVIEW_NAV_RAIL: Record<OverviewNavId, SidebarTab>' },
      { file: 'src/hooks/useGameShellState.ts', contains: 'return OVERVIEW_ROUTES[tab];' },
      { file: 'src/hooks/useGameShellState.ts', contains: 'return OVERVIEW_ROUTES[OVERVIEW_NAV_RAIL[id]];' },
      { file: 'src/hooks/useGameShellState.ts', notContains: "? 'village'", example: "const t = id === 'village' ? 'village' : 'people';" },
    ],
  },
  {
    id: 'no-view-types-nameless-fallback',
    checks: [
      {
        files: [
          'src/components/SelectedEntityPanel.tsx',
          'src/components/SelectedBuildingPanel.tsx',
          'src/components/dashboard/GameDashboard.tsx',
          'src/game/PopulationPanel.tsx',
        ],
        notMatches: /\.name \|\| '(Settler|Unnamed|Unknown)'/,
        example: "const label = human.name || 'Settler';",
      },
    ],
  },
  {
    id: 'mill-rule-rendered-from-owner',
    checks: [
      { file: 'src/components/SelectedBuildingPanel.tsx', contains: 'MILL_FOOD_PRODUCTION_MULT' },
      { file: 'src/components/SelectedBuildingPanel.tsx', notContains: 'boosts all food +25%', example: 'boosts all food +25%' },
    ],
  },
  {
    id: 'upgrade-ceiling-asked-of-owner',
    checks: [
      { file: 'src/components/SelectedBuildingPanel.tsx', contains: 'getBuildingUpgradeEligibility(state, building.id)' },
      { file: 'src/components/SelectedBuildingPanel.tsx', notMatches: /building\.level\s*<\s*3/, example: 'if (building.level < 3) upgrade();' },
      { file: 'src/components/SelectedBuildingPanel.tsx', notContains: 'at Lv.3', example: 'available at Lv.3' },
    ],
  },
  {
    id: 'guide-version-from-owner',
    checks: [
      { file: 'src/components/tabPanels/MoreTabPanel.tsx', contains: 'v{GAME_VERSION}' },
      { file: 'src/components/tabPanels/MoreTabPanel.tsx', notContains: 'v0.4 is a playtest', example: 'v0.4 is a playtest' },
    ],
  },
  {
    id: 'simulation-decisions-use-adopted-seed',
    scan: {
      dir: 'src/game', ext: '.ts', minFiles: 1,
      except: ['src/game/simRng.ts', 'src/game/saveLoad.ts'],
      notMatches: /\bworldMap\??\.seed\b/, example: 'worldMap?.seed',
    },
  },
  {
    id: 'no-view-converts-ticks-to-days',
    scan: { dir: 'src', ext: '.tsx', notMatches: /\/\s*TICKS_PER_DAY/, example: 'const days = tick / TICKS_PER_DAY;' },
  },
  {
    id: 'no-view-derives-fill-percent',
    scan: { dir: 'src', ext: '.tsx', notMatches: /Math\.min\(100,/, except: ['src/game/IntroScreen.tsx'], example: 'const pct = Math.min(100, value);' },
  },
  {
    id: 'no-view-reads-raw-happiness',
    scan: { dir: 'src', ext: '.tsx', notMatches: /villageHappiness/, example: 'const h = state.villageHappiness;' },
  },
  {
    id: 'no-view-retests-unique-building',
    scan: { dir: 'src', ext: '.tsx', notMatches: /config\.unique/, example: 'if (config.unique) {}' },
  },
  {
    id: 'no-view-joins-surname',
    scan: { dir: 'src', ext: '.tsx', notMatches: /\.surname \?/, example: 'const name = human.surname ? human.surname : "";' },
  },
  {
    id: 'header-reads-population-owner',
    checks: [
      { file: 'src/components/GameHeader.tsx', contains: 'isPopulationNearCap(world)' },
      { file: 'src/components/GameHeader.tsx', notContains: '>= 0.9', example: 'const near = ratio >= 0.9;' },
      { file: 'src/game/populationGrowth.ts', contains: 'const POPULATION_NEAR_CAP_RATIO = 0.9;' },
      { file: 'src/game/populationGrowth.ts', contains: 'export function resolvePopulationCap(' },
    ],
  },
  {
    id: 'church-card-asks-moonhowler-owner',
    checks: [
      { file: 'src/components/SelectedBuildingPanel.tsx', contains: 'countStaffedPriests(state.buildings, ensureEntityByIdMap(state))' },
      { file: 'src/components/SelectedBuildingPanel.tsx', notContains: 'Math.max(1, priestCount)', example: 'const n = Math.max(1, priestCount);' },
    ],
  },
  {
    id: 'work-schedule-reads-fatigue-owner',
    checks: [
      { file: 'src/components/WorkSchedulePanel.tsx', contains: 'readVillageFatigue(state)' },
      { file: 'src/components/WorkSchedulePanel.tsx', notMatches: /averageFatigue >= \d/, example: 'const tired = averageFatigue >= 60;' },
      { file: 'src/game/dailyScheduleFatigue.ts', contains: 'const FATIGUE_BANDS' },
    ],
  },
  {
    id: 'cockpit-takes-idle-count-from-owner',
    checks: [
      { file: 'src/App.tsx', notContains: 'selectedBuildingIdleWorkerCount', example: 'const n = selectedBuildingIdleWorkerCount(building);' },
      { file: 'src/components/SelectedBuildingPanel.tsx', notContains: 'idleWorkers', example: 'const { idleWorkers } = props;' },
    ],
  },
  {
    id: 'browser-slot-loads-one-path',
    checks: [
      { file: 'src/App.tsx', contains: 'const loadFromSlot = useCallback(' },
      { file: 'src/App.tsx', counts: [{ needle: "outcome.reason === 'unrestorable' ? hasSave() : false", times: 1 }] },
    ],
  },
  {
    id: 'nameless-strings-owned-by-citizenid',
    checks: [
      { file: 'src/game/citizenId.ts', contains: "export const SETTLER_NAME_FALLBACK = 'A settler';" },
      { file: 'src/game/citizenId.ts', contains: "const SETTLER_LABEL_FALLBACK = 'Settler';" },
      { file: 'src/game/citizenId.ts', notMatches: /entity\.name \|\| '(Settler|Unnamed|Unknown|A settler)'/, example: "return entity.name || 'Settler';" },
      { file: 'src/game/citizenId.ts', contains: 'SETTLER_LABEL_FALLBACK' },
    ],
  },
  {
    id: 'terminal-export-through-save-owner',
    checks: [
      { file: 'src/App.tsx', contains: 'onExport={() => { void persistCurrentGame(' },
      { file: 'src/App.tsx', notMatches: /onExport=\{\(\) => \{ saveGame\(/, example: 'onExport={() => { saveGame(); }}' },
    ],
  },
  {
    id: 'frontier-panel-renders-projection',
    checks: [
      { file: 'src/components/FrontierPanel.tsx', counts: [{ needle: 'projectFrontierPanel(state,', times: 1 }] },
      { file: 'src/components/FrontierPanel.tsx', notMatches: /\.(?:filter|some|find|reduce|slice|sort|reverse)\(/, example: 'const a = view.rivals.filter(Boolean);' },
      {
        file: 'src/components/FrontierPanel.tsx',
        notMatches: /\b(?:computeMilitiaBreakdown|countCompletedDefenseBuildings|getBarracksGuardCount|getCombatPreview|canLaunchRaidOnRival|canProvokeRival|normalizeRivalProfile|getRivalPresenceSummary)\s*\(/,
        example: 'const m = computeMilitiaBreakdown(state);',
      },
      { file: 'src/components/FrontierPanel.tsx', contains: 'view.rivals.map(' },
      { file: 'src/components/FrontierPanel.tsx', contains: 'view.battleReports.map(' },
    ],
  },
  {
    id: 'overview-reads-many-adults-idle',
    checks: [
      { file: 'src/components/CitizenOverviewScreen.tsx', contains: 'hasManyAdultsIdle(overview)' },
      { file: 'src/components/CitizenOverviewScreen.tsx', notContains: 'overview.adults * 0.35', example: 'const many = overview.idle > overview.adults * 0.35;' },
    ],
  },
  {
    id: 'village-tooltip-names-reputation-bands',
    checks: [{ file: 'src/components/tabPanels/VillageTabPanel.tsx', contains: 'REPUTATION_FRIENDLY_MIN' }],
  },
  {
    id: 'reputation-bands-defined-once',
    checks: [
      {
        file: 'src/game/simHelpers.ts',
        counts: [
          { needle: 'REPUTATION_FRIENDLY_MIN = 80', times: 1 },
          { needle: 'REPUTATION_HARSH_MAX = 30', times: 1 },
        ],
      },
      { files: ['src/game/groupEvents.ts', 'src/game/frontierCombat.ts'], notMatches: /rep\w*\s*>=\s*80\b/, example: 'if (rep >= 80) {}' },
      { files: ['src/game/groupEvents.ts', 'src/game/frontierCombat.ts'], notMatches: /rep\w*\s*<=\s*30\b/, example: 'if (rep <= 30) {}' },
    ],
  },
  {
    id: 'farm-hint-uses-catalogue-cap',
    checks: [
      { file: 'src/components/SelectedBuildingPanel.tsx', contains: '(up to ${getBuildingConfig(type).maxOccupants})' },
      { file: 'src/components/SelectedBuildingPanel.tsx', notContains: 'up to 3)', example: '(up to 3)' },
    ],
  },
  {
    id: 'guard-preserve-bonuses-interpolated',
    checks: [
      { file: 'src/components/SelectedBuildingPanel.tsx', contains: 'MILITIA_BALANCE.guardBonusPerGuard' },
      { file: 'src/components/SelectedBuildingPanel.tsx', contains: 'PRESERVE_HEALTH_BONUS' },
      { file: 'src/components/SelectedBuildingPanel.tsx', notContains: '(+14 militia strength)', example: '(+14 militia strength)' },
      { file: 'src/components/SelectedBuildingPanel.tsx', notContains: 'ecosystem health +4', example: 'ecosystem health +4' },
      { file: 'src/game/buildings.ts', notContains: '+14 militia strength', example: '+14 militia strength' },
      { file: 'src/game/buildings.ts', notContains: 'ecosystem health +4', example: 'ecosystem health +4' },
    ],
  },
  {
    id: 'keyboard-claim-yields-game-handler',
    checks: [{ file: 'src/hooks/useKeyboardControls.ts', contains: 'if (isKeyboardClaimed()) return;' }],
  },
  {
    id: 'overlay-keyboard-hook-claims-releases-pays',
    checks: [
      {
        file: 'src/hooks/useOverlayKeyboard.ts',
        contains: ['claimKeyboard(', 'releaseKeyboard('],
        matches: /['"]Escape['"]/,
      },
    ],
  },
  {
    id: 'overlays-delegate-to-shared-keyboard-hook',
    checks: [
      {
        files: [
          'src/components/BattleReportScreen.tsx',
          'src/components/WarfareStatus.tsx',
          'src/components/GameMenu.tsx',
          'src/components/dashboard/GameDashboard.tsx',
          'src/components/CitizenOverviewScreen.tsx',
          'src/components/TutorialOverlay.tsx',
          'src/components/ShortcutsOverlay.tsx',
          'src/components/SpotlightLoreOverlay.tsx',
        ],
        contains: 'useOverlayKeyboard(',
        notContains: 'claimKeyboard(',
        example: 'claimKeyboard();',
      },
    ],
  },
  {
    id: 'fullscreen-dialogs-share-focus-owner',
    checks: [
      {
        files: ['src/components/BattleReportScreen.tsx', 'src/components/WarfareStatus.tsx'],
        contains: ['useModalFocus<', 'useOverlayKeyboard('],
      },
      { file: 'src/components/BattleReportScreen.tsx', contains: 'ref={dialogRef}' },
      { file: 'src/components/WarfareStatus.tsx', contains: 'ref={terminalRef}' },
    ],
  },
  {
    id: 'battle-commentary-focus-recovery',
    checks: [
      {
        file: 'src/components/BattleReportScreen.tsx',
        contains: [
          'data-autofocus aria-label="Close battle report"',
          'ref={stableCloseRef}',
          'stableCloseRef.current?.focus()',
          '[allSeen, finalReady, confirmExterminate, dialogRef]',
        ],
      },
    ],
  },
  {
    id: 'spotlight-escape-through-skip',
    checks: [
      {
        file: 'src/components/SpotlightLoreOverlay.tsx',
        contains: [
          "useOverlayKeyboard('spotlight-lore', skip)",
          'const skip = () => {',
          "callbacks.current.onFinish(scene.id, 'skipped');",
          'onClick={skip}',
        ],
      },
    ],
  },
  {
    id: 'raid-warfare-dialogs-trap-focus',
    checks: [
      {
        files: ['src/components/BattleReportScreen.tsx', 'src/components/WarfareStatus.tsx'],
        contains: 'useModalFocus<HTMLDivElement>(',
      },
    ],
  },
  {
    id: 'confirm-dialog-traps-focus',
    checks: [
      {
        file: 'src/components/ConfirmActionDialog.tsx',
        contains: ['useModalFocus<HTMLDivElement>()', 'useOverlayKeyboard(owner, onCancel)', 'data-autofocus'],
      },
    ],
  },
  {
    id: 'keyboard-claim-sites-only-in-shared-hook-ts',
    scan: {
      dir: 'src',
      ext: '.ts',
      notMatches: /claimKeyboard\(/,
      except: ['src/game/keyboardOwnership.ts', 'src/hooks/useOverlayKeyboard.ts'],
      example: 'claimKeyboard();',
    },
  },
  {
    id: 'keyboard-claim-sites-only-in-shared-hook-tsx',
    scan: { dir: 'src', ext: '.tsx', notMatches: /claimKeyboard\(/, example: 'claimKeyboard();' },
  },
  {
    id: 'hotkeys-stop-at-shortcuts-sheet',
    checks: [{ file: 'src/hooks/useKeyboardControls.ts', contains: 'if (showShortcutsRef.current) return;' }],
  },
  {
    id: 'gameplay-active-gate-precedes-building-hotkeys',
    checks: [
      {
        file: 'src/hooks/useKeyboardControls.ts',
        order: [['if (!gameplayActiveRef.current) return;', 'const hotBuild = HOTKEY_BUILDINGS[e.key];']],
      },
    ],
  },
  {
    id: 'save-and-help-above-gameplay-gate',
    checks: [
      {
        file: 'src/hooks/useKeyboardControls.ts',
        order: [
          ["e.key.toLowerCase() === 's'", 'if (!gameplayActiveRef.current) return;'],
          ["e.key === '?'", 'if (!gameplayActiveRef.current) return;'],
        ],
      },
    ],
  },
  {
    id: 'form-control-guard-precedes-sidebar-tabs',
    checks: [
      { file: 'src/hooks/useKeyboardControls.ts', order: [['if (inFormControl) return;', 'resolveSidebarTabFromKey(e)']] },
    ],
  },
  {
    id: 'keyup-never-skips-text-field',
    checks: [
      {
        file: 'src/hooks/useKeyboardControls.ts',
        region: [
          {
            from: 'const handleKeyUp',
            to: "window.addEventListener('keydown'",
            contains: 'keysRef.current.delete',
            notContains: 'isEditableTarget',
          },
        ],
      },
    ],
  },
  {
    id: 'focus-loss-releases-held-keys',
    checks: [
      {
        file: 'src/hooks/useKeyboardControls.ts',
        contains: ["window.addEventListener('blur', releaseHeldKeys)", "document.addEventListener('visibilitychange', releaseHeldKeys)", 'keysRef.current.clear();'],
      },
    ],
  },
  {
    id: 'key-repeat-guard-order',
    checks: [
      {
        file: 'src/hooks/useKeyboardControls.ts',
        order: [
          ['keysRef.current.add(', 'if (e.repeat) return;'],
          ['if (e.repeat) return;', 'togglePauseRef.current();'],
          ['if (e.repeat) return;', 'setBuildPanelOpen((open) => !open);'],
        ],
      },
    ],
  },
  {
    id: 'overview-nav-states-aria-current',
    checks: [
      {
        file: 'src/components/GameHeader.tsx',
        contains: ['aria-current={open}', 'aria-label={`Open ${subject.label.toLowerCase()} window`}'],
      },
    ],
  },
  {
    id: 'dashboard-tabs-state-aria-pressed',
    checks: [{ file: 'src/components/dashboard/GameDashboard.tsx', contains: 'aria-pressed={openTab === tab.id}' }],
  },
  {
    id: 'chronicle-chips-state-aria-pressed',
    checks: [{ file: 'src/game/EventLogPanel.tsx', contains: 'aria-pressed={filter === opt.id}' }],
  },
  {
    id: 'map-size-state-aria-pressed',
    checks: [{ file: 'src/game/MapSetupScreen.tsx', contains: 'aria-pressed={selected}' }],
  },
  {
    id: 'chronicle-subtabs-state-aria-pressed',
    checks: [{ file: 'src/components/tabPanels/LogTabPanel.tsx', contains: 'aria-pressed={logSubTab === id}' }],
  },
  {
    id: 'map-canvas-named-and-focusable',
    checks: [
      { file: 'src/components/GameMapStage.tsx', contains: ['role="img"', 'aria-label="Valley map"', 'tabIndex={0}'] },
    ],
  },
  {
    id: 'mini-map-keyboard-activatable',
    checks: [
      {
        file: 'src/components/MiniMap.tsx',
        contains: ['role="button"', 'aria-label="Mini-map', 'tabIndex={0}', 'onKeyDown=', 'navigateToVillage'],
      },
    ],
  },
  {
    id: 'strip-demolition-awaits-confirmation',
    checks: [
      {
        file: 'src/hooks/useCanvasInteractions.ts',
        order: [
          ['if (buildingIds.length > 0) setPendingStripDemolition(buildingIds);', 'const confirmStripDemolition = useCallback('],
          ['const confirmStripDemolition = useCallback(', "op: 'demolishStripBuildings'"],
        ],
        region: [
          {
            from: 'if (buildingIds.length > 0) setPendingStripDemolition(buildingIds);',
            to: 'const confirmStripDemolition = useCallback(',
            notContains: "op: 'demolishStripBuildings'",
          },
        ],
        contains: 'if (!ids?.length) return;',
      },
      {
        file: 'src/App.tsx',
        contains: [
          '{pendingStripDemolition && (',
          'owner="strip-demolition"',
          'onConfirm={confirmStripDemolition}',
          'onCancel={cancelStripDemolition}',
          'This cannot be undone.',
        ],
      },
    ],
  },
  {
    id: 'new-settlement-arms-confirmation',
    checks: [
      {
        file: 'src/game/MapSetupScreen.tsx',
        contains: ['if (hasSave && !confirmStartArmed)', 'Settle anyway', 'Starting a new settlement deletes your saved colony'],
      },
    ],
  },
  {
    id: 'name-field-enter-routes-through-confirmation',
    checks: [
      {
        file: 'src/game/MapSetupScreen.tsx',
        contains: "onKeyDown={(e) => e.key === 'Enter' && requestStart()}",
        notContains: "onKeyDown={(e) => e.key === 'Enter' && handleStart()}",
        example: "onKeyDown={(e) => e.key === 'Enter' && handleStart()}",
      },
    ],
  },
  {
    id: 'map-cursor-binds-and-advertises-keys',
    checks: [
      {
        file: 'src/components/GameMapStage.tsx',
        contains: ['useMapKeyboardCursor(', 'onKeyDown={keyboardCursor.onKeyDown}', 'aria-keyshortcuts={MAP_CURSOR_KEYSHORTCUTS}'],
      },
    ],
  },
  {
    id: 'map-cursor-announced',
    checks: [
      { file: 'src/components/GameMapStage.tsx', contains: 'aria-describedby="map-keyboard-cursor-status"' },
      {
        file: 'src/components/GameMapStage.tsx',
        region: [{ from: 'id="map-keyboard-cursor-status"', within: 200, contains: 'aria-live="polite"' }],
        contains: '{keyboardCursor.announcement}',
      },
    ],
  },
  {
    id: 'map-cursor-marker-decorative',
    checks: [
      { file: 'src/components/GameMapStage.tsx', contains: 'keyboardCursor.active &&' },
      {
        file: 'src/components/GameMapStage.tsx',
        region: [{ from: 'ref={cursorMarkerRef}', within: 240, contains: ['pointer-events-none', 'aria-hidden'] }],
      },
    ],
  },
  {
    id: 'map-cursor-reads-ownership-rule',
    checks: [
      {
        file: 'src/components/useMapKeyboardCursor.ts',
        contains: "from '../game/keyboardOwnership'",
        matches: /isKeyboardClaimed\s*\(/,
        notContains: ['claimKeyboard(', 'releaseKeyboard('],
        example: 'claimKeyboard();',
      },
    ],
  },
  {
    id: 'story-card-asks-owner-for-eligibility',
    checks: [
      {
        file: 'src/App.tsx',
        region: [
          {
            from: 'Signature story cards',
            to: 'Diplomacy event cards',
            contains: ['getStoryChoiceEligibility(world, evt, choice.id)', 'blocked={blocked}'],
            notContains: 'title={choice.detail}',
          },
        ],
      },
      { file: 'src/App.tsx', region: [{ from: 'function GatedChoiceButton', contains: 'disabled={blocked}' }] },
    ],
  },
  {
    id: 'story-card-renders-refusal-as-text',
    checks: [
      {
        file: 'src/App.tsx',
        region: [{ from: 'Signature story cards', to: 'Diplomacy event cards', contains: 'explanation={outcome.explanation}' }],
      },
      { file: 'src/App.tsx', region: [{ from: 'function GatedChoiceButton', contains: '{explanation && (' }] },
      {
        file: 'src/App.tsx',
        region: [
          {
            from: 'Diplomacy event cards',
            to: 'Favorite citizen follow banner',
            contains: ['actionOutcomeFromGate(', 'explanation={outcome.explanation}'],
          },
        ],
      },
    ],
  },
  {
    id: 'critical-chip-named-marker',
    checks: [
      {
        file: 'src/components/AlertBar.tsx',
        matches: /alert\.severity === 'critical'/,
        contains: 'aria-label={CRITICAL_MARKER.name}',
      },
    ],
  },
  {
    id: 'alert-strip-routes-through-collapse-owner',
    checks: [
      {
        file: 'src/components/AlertBar.tsx',
        matches: /visibleAlertChips\(alerts, expanded\)/,
        notMatches: /alerts\.slice\(/,
        example: 'const shown = alerts.slice(0, 2);',
      },
    ],
  },
  {
    id: 'build-ghost-derives-from-owner',
    checks: [
      { file: 'src/hooks/useCanvasInteractions.ts', contains: ['getPlaceBuildingFailureReason', 'createBuildGhost('] },
      { file: 'src/App.tsx', contains: 'getPlaceBuildingFailureReason' },
      {
        file: 'src/game/renderer/buildPreview.ts',
        contains: 'getPlaceBuildingFailureLabel(',
        notContains: '✗ Blocked',
        example: '✗ Blocked',
      },
    ],
  },
  {
    id: 'council-notice-reads-message-field',
    checks: [
      {
        file: 'src/game/dashboardData.ts',
        notMatches: /as \{ title\?: string \}\)\.title/,
        contains: 'latest.push(e.message)',
        example: 'const t = (line as { title?: string }).title;',
      },
    ],
  },
  {
    id: 'conception-helper-reads-stillborn-owner',
    checks: [
      {
        file: 'tests/conceptionEvent.labelling.test.ts',
        region: [
          {
            from: 'function liveBirthTick',
            to: "throw new Error('no tick produces a live birth')",
            contains: 'LIFECYCLE_CONFIG.STILLBORN_CHANCE',
            notMatches: />=\s*0\.\d/,
            example: 'roll >= 0.5',
          },
        ],
      },
    ],
  },
  {
    id: 'dashboard-economy-source-labels-single-source',
    checks: [
      {
        file: 'src/components/dashboard/GameDashboard.tsx',
        contains: 'ECONOMY_SOURCE_LABELS',
        notMatches: /const SOURCE_LABELS/,
        example: 'const SOURCE_LABELS = {',
      },
    ],
  },
  {
    id: 'dashboard-suggestion-keys-are-composite',
    checks: [
      {
        file: 'src/components/dashboard/GameDashboard.tsx',
        notMatches: /key=\{line\.label\}/,
        example: '<li key={line.label}>',
        counts: [{ needle: 'key={`${line.label}-${index}`}', times: 2 }],
      },
    ],
  },
  {
    id: 'worker-dialogue-install-payload',
    checks: [{ file: 'src/game/simWorker/gameWorker.ts', contains: 'installDialogueBankPayload(canonicalDialogueBank)' }],
  },
  {
    id: 'food-spend-through-owner',
    checks: [
      {
        files: [
          'src/game/groupEvents.ts',
          'src/game/tradeCaravans.ts',
          'src/game/townHall.ts',
          'src/game/settlerInteractionActions.ts',
          'src/game/frontierCombat.ts',
          'src/game/weddingDiplomacy.ts',
          'src/game/travelingTheatre.ts',
          'src/game/deerParliament.ts',
          'src/game/storyEvents.ts',
          'src/game/animalCare.ts',
          'src/game/worldEvents.ts',
        ],
        notMatches: /state\.resources\.food\s*-=/,
        contains: 'spendFood(',
        example: 'state.resources.food -= 5;',
      },
    ],
  },
  {
    id: 'militia-armament-projection',
    checks: [
      { file: 'src/game/frontierPanelView.ts', contains: 'getMilitiaArmamentLabel(state)' },
      { file: 'src/components/FrontierPanel.tsx', contains: ['projectFrontierPanel(state,', '{view.armament}'] },
      {
        files: ['src/components/FrontierPanel.tsx', 'src/game/frontierPanelView.ts'],
        notMatches: /hasIronSpears\(|hasStoneSpears\(/,
        example: 'const tier = hasIronSpears(state);',
      },
    ],
  },
  {
    id: 'visitor-camp-retired',
    checks: [
      { file: 'src/components/VisitorCampPanel.tsx', absent: true },
      { file: 'src/App.tsx', notContains: 'VisitorCampPanel', example: '<VisitorCampPanel />' },
      { file: 'src/hooks/useCanvasInteractions.ts', notContains: 'hitTestCamp(', example: 'if (hitTestCamp(x, y)) {}' },
      { file: 'src/components/FrontierPanel.tsx', notContains: 'view.visitors', example: 'view.visitors.map(renderVisitor)' },
      {
        file: 'src/game/groupEvents.ts',
        notContains: [
          'export function spawnVisitorGroup(',
          'export function tickVisitorGroups(',
          'export function tryMidYearVisitorEvent(',
          'export function tryFirstWeekVisitor(',
          'export function hitTestCamp(',
        ],
        example: 'export function spawnVisitorGroup(',
      },
    ],
  },
  {
    id: 'rpg-art-preload-and-render',
    checks: [
      {
        files: ['src/game/spriteLoader.ts', 'src/game/stripRender.ts'],
        contains: [
          '/sprites/oga_drummyfish/tile_pavement.png',
          '/sprites/oga_drummyfish/wall.png',
          '/sprites/oga_drummyfish/gate.png',
        ],
      },
      {
        file: 'src/game/stripRender.ts',
        contains: [
          'paintRpgPavementPattern(ctx, -cap / 2, -cap / 2, cap, cap,',
          'rotation === 90 ? sy : sx',
          'paintRpgStoneStrip(ctx, sx, sy, w, h, rotation, isGate, alpha)',
        ],
        notContains: 'https://opengameart.org/sites/default/files/',
        example: 'https://opengameart.org/sites/default/files/grass.png',
      },
    ],
  },
  {
    id: 'people-subject-titled-people',
    checks: [
      {
        file: 'src/hooks/useGameShellState.ts',
        notContains: "label: 'Village'",
        example: "label: 'Village',",
      },
    ],
  },
  {
    id: 'council-window-named-consistently',
    checks: [
      { file: 'src/components/dashboard/GameDashboard.tsx', contains: 'title="Daily council"' },
      { file: 'src/components/tabPanels/MoreTabPanel.tsx', contains: '🏘️ Daily council' },
      { file: 'src/components/ShortcutsOverlay.tsx', contains: "'C', description: 'Daily council" },
    ],
  },
  {
    id: 'population-chip-and-council-door-distinct',
    checks: [
      {
        file: 'src/components/GameHeader.tsx',
        contains: ['aria-label={`Open ${OVERVIEW_SUBJECTS.people.label.toLowerCase()} window`}', 'aria-label="Open daily council"'],
        notContains: ['aria-label="Open village overview"', 'aria-label="Open people overview"'],
        example: 'aria-label="Open village overview"',
      },
    ],
  },
  {
    id: 'window-named-by-visible-title',
    checks: [
      {
        file: 'src/components/GameWindow.tsx',
        contains: ['aria-labelledby={titleId}', 'id={titleId}'],
        notContains: 'aria-label={title}',
        example: 'aria-label={title}',
      },
    ],
  },
  {
    id: 'key-table-holds-no-door-name',
    checks: [
      { file: 'src/game/hotkeys.ts', notMatches: /label: '/, example: "label: 'Village'," },
    ],
  },
  {
    id: 'sheet-and-guide-read-vocabulary',
    checks: [
      {
        files: ['src/components/ShortcutsOverlay.tsx', 'src/components/tabPanels/MoreTabPanel.tsx'],
        contains: 'overviewSubjectForTab(',
        notMatches: /'Village'/,
        example: "description: 'Village'",
      },
    ],
  },
  {
    id: 'v-and-o-open-same-window',
    checks: [
      {
        files: ['src/components/ShortcutsOverlay.tsx', 'src/components/tabPanels/MoreTabPanel.tsx'],
        contains: 'V opens the same window',
      },
    ],
  },
  {
    id: 'guide-list-from-vocabulary',
    checks: [
      {
        file: 'src/components/tabPanels/MoreTabPanel.tsx',
        contains: [
          '{OVERVIEW_SUBJECTS.progress.icon} {OVERVIEW_SUBJECTS.progress.label}',
          '{OVERVIEW_SUBJECTS.help.icon} {OVERVIEW_SUBJECTS.help.label}',
        ],
        notContains: ['🎯 Progress', '☰ Menu'],
        example: '🎯 Progress',
      },
    ],
  },
  {
    id: 'chronicle-header-uses-filter-label',
    checks: [
      {
        file: 'src/game/EventLogPanel.tsx',
        contains: 'getEventLogFilterLabel(filter)',
        notContains: "${filter === 'all' ? '' : filter}",
        example: "${filter === 'all' ? '' : filter}",
      },
    ],
  },
  {
    id: 'resource-chip-accessible-name',
    checks: [{ file: 'src/components/ResourceBadge.tsx', contains: 'aria-label={title}' }],
  },
  {
    id: 'progress-subnav-pressed',
    checks: [{ file: 'src/components/tabPanels/ProgressTabPanel.tsx', contains: 'aria-pressed={progressSubTab === id}' }],
  },
  {
    id: 'build-rail-grid-toggle-pressed',
    checks: [{ file: 'src/components/GameBuildRail.tsx', contains: 'aria-pressed={showGrid}' }],
  },
  {
    id: 'menu-focus-enters-dialog',
    checks: [
      {
        file: 'src/components/GameMenu.tsx',
        contains: ['getFocusableElements(panelRef.current)[0]', 'first?.focus()'],
      },
    ],
  },
  {
    id: 'intro-ignores-tab-and-modifiers',
    checks: [
      {
        file: 'src/game/IntroScreen.tsx',
        contains: ["event.key === 'Tab'", 'event.ctrlKey || event.metaKey || event.altKey'],
      },
    ],
  },
  {
    id: 'mood-label-printed-once',
    checks: [
      {
        file: 'src/components/CitizenOverviewScreen.tsx',
        notContains: '{overview.moodLabel} — ',
        contains: '{overview.moodDetail}',
        example: '{overview.moodLabel} — {overview.moodDetail}',
      },
    ],
  },
  {
    id: 'save-banner-in-both-session-states',
    checks: [
      {
        file: 'src/App.tsx',
        counts: [{ needle: '<SaveToastBanner', times: 2 }],
        contains: 'className="z-[60]"',
      },
    ],
  },
  {
    id: 'map-cursor-acts-through-pointer-path',
    checks: [
      {
        file: 'src/components/useMapKeyboardCursor.ts',
        matches: /dispatchEvent\(new MouseEvent\(type/,
        notMatches: [/proto:\s*1/, /applyGameAction\s*\(/, /mutateWorld\s*\(/],
        example: ['proto: 1', 'applyGameAction(state, command);', 'mutateWorld(state);'],
      },
    ],
  },
  // Second migration increment: preserve the original source-only contracts.
  {
    id: "research-effect-walk-one-owner",
    checks: [
      { file: "src/game/simHelpers.ts", matches: /for \(let j = 0; j < node\.effects\.length/ },
      { file: "src/game/combat.ts", notMatches: [/for \(let j = 0; j < node\.effects\.length/, /function researchedEffect\s*\(/], example: ["for (let j = 0; j < node.effects.length; j++) {}", "function researchedEffect() {}"], contains: "resolveResearchEffect" },
    ],
  },
  {
    id: "render-transform-one-owner",
    checks: [
      { files: ["src/game/renderer/grid.ts", "src/game/renderer/scent.ts"], notMatches: [/\(\s*\w+\s*-\s*cam\.x\s*\)\s*\*\s*cam\.zoom\s*\+\s*cw\s*\/\s*2/, /\(\s*\w+\s*-\s*cam\.y\s*\)\s*\*\s*cam\.zoom\s*\+\s*ch\s*\/\s*2/], example: ["return (wx - cam.x) * cam.zoom + cw / 2;", "return (wy - cam.y) * cam.zoom + ch / 2;"] },
      { file: "src/game/renderer/scent.ts", contains: "worldToScreen" },
    ],
  },
  {
    id: "trade-route-reward-copy-owner",
    checks: [
      { file: "src/components/tabPanels/ProgressTabPanel.tsx", contains: "formatResourceAmounts(route.resourcesReceived)", notMatches: /resourcesReceived\.gold > 0 \?/, example: "resourcesReceived.gold > 0 ? gold : stone" },
    ],
  },
  {
    id: "schooling-breakdown-owner",
    checks: [
      { file: "src/components/tabPanels/VillageTabPanel.tsx", contains: ["summarizeSchooling(state, state.tick, getHourOfDay(state.tick))", "describeSchoolingSummary(", "{summary.headline}", "{line}", "attendance.adultEducation.map", "{row.count}"] },
    ],
  },
  {
    id: "trade-route-block-summary-owner",
    checks: [
      { file: "src/components/tabPanels/ProgressTabPanel.tsx", contains: ["summarizeTradeRouteBlocks(state)", "tradeBlocks.blocked.map"] },
    ],
  },
  {
    id: "save-load-outcome-one-owner",
    checks: [
      { file: "src/App.tsx", contains: "const loadFromSlot = useCallback(", counts: [{ needle: "loadGameOutcome()", times: 1 }, { needle: "loadFromSlot({", times: 2 }], notMatches: /loadGame\(\)/, example: "loadGame();", notContains: "could not be restored" },
    ],
  },
  {
    id: "save-menu-compatibility-owner",
    checks: [
      { file: "src/components/GameMenu.tsx", contains: "describeSaveCompatibility", notContains: "Saves may break between updates" },
    ],
  },
  {
    id: "shared-residence-relocation-owner",
    checks: [
      { file: "src/game/housingPipeline.ts", contains: "planRelocation(household, 'couple'", notContains: "const needed = 2;" },
    ],
  },
  {
    id: "obsolete-building-actions-facade-retired",
    checks: [
      { file: "src/game/buildingActions.ts", absent: true },
    ],
  },
  // Third increment: UI owner, production and Chronicle contracts.
  {
    id: "trade-route-ready-label-owner",
    checks: [
      { file: "src/components/tabPanels/ProgressTabPanel.tsx", contains: "'Ready to establish'", matches: /eligibility\.ok[\s\S]{0,80}'Ready to establish'/ },
    ],
  },
  {
    id: "defence-ratio-floor",
    checks: [
      { file: "src/game/CombatPreviewPanel.tsx", matches: /Math\.floor\(ratio \* 100\)/, notMatches: /Math\.round\(ratio \* 100\)/, example: "Math.round(ratio * 100)" },
    ],
  },
  {
    id: "leadership-vacancy-delay-owner",
    checks: [
      { file: "src/game/VillageLeadershipPanel.tsx", contains: "formatElectionDelay(VACANCY_ELECTION_DELAY_YEARS)", notMatches: /election is held 3 months later/, example: "election is held 3 months later" },
    ],
  },
  {
    id: "village-recruitment-price-owner",
    checks: [
      { file: "src/components/tabPanels/VillageTabPanel.tsx", contains: ["getRecruitSettlerEligibility(state)", "RECRUITMENT_COST.food", "RECRUITMENT_COST.gold"], notMatches: /food >= 30|gold >= 20|\(30🍖 20💰\)/, example: "food >= 30" },
    ],
  },
  {
    id: "population-aggregate-owner",
    checks: [
      { file: "src/game/PopulationPanel.tsx", contains: ["computeVillageStats(state)", "villageStats.beds"], notMatches: [/state\.workingSettlers|state\.idleSettlers/, /getOpenBeds\(/], example: ["state.workingSettlers", "getOpenBeds(state)"] },
    ],
  },
  {
    id: "production-cap-announcement-owner",
    checks: [
      { file: "src/game/dailyBuildingEconomy.ts", contains: "function addProductionOutput", notMatches: /if \(addResource\(/, example: "if (addResource(state, 'wood', 1)) {}" },
      { file: "src/components/GameHeader.tsx", contains: ["isResourceCapped(world, 'food')", "isResourceCapped(world, 'wood')", "isResourceCapped(world, 'gold')", "isResourceCapped(world, 'stone')", "isResourceCapped(world, 'iron')"] },
    ],
  },
  {
    id: "trade-panel-eligibility-owner",
    checks: [
      { file: "src/components/tabPanels/ProgressTabPanel.tsx", contains: "canEstablishTradeRoute(state, route.id)", notContains: ["marketOk && repOk", "'Need Market'"] },
    ],
  },
  {
    id: "trade-ready-count-owner",
    checks: [
      { file: "src/App.tsx", contains: "canEstablishTradeRoute(world, r.id)" },
    ],
  },
  {
    id: "chronicle-filter-handover",
    checks: [
      { file: "src/game/EventLogPanel.tsx", contains: "filterChoice.handedOver === initialFilter", notContains: "useEffect" },
    ],
  },
  {
    id: "chronicle-export-full-history",
    checks: [
      { file: "src/game/EventLogPanel.tsx", contains: ["downloadChronicleLog(events, meta)", "downloadChronicleJSON(events, meta)", "downloadChronicleCSV(events, meta)"], notContains: ["downloadChronicleLog(allFiltered, meta)", "downloadChronicleJSON(allFiltered, meta)", "downloadChronicleCSV(allFiltered, meta)"] },
    ],
  },
  // Fourth increment: whole-tree ownership and deterministic position math.
  { id: "reputation-single-writer", scan: { dir: "src", ext: [".ts", ".tsx"], minFiles: 301, except: ["src/game/simHelpers.ts", "src/game/simBuffers/simDelta.ts", "src/game/simWorker/simPrep.ts"], notMatches: /(?:state|world)\.villageReputation[^\S\r\n]*=[^\S\r\n]*[^=\r\n]/, example: "state.villageReputation = 50;" } },
  { id: "storage-gain-never-clamps-existing-stock", scan: { dir: "src", ext: [".ts", ".tsx"], minFiles: 301, notMatches: /state\.resources\.\w+\s*=\s*Math\.min\(\s*state\.storageMax\./, example: "state.resources.wood = Math.min(state.storageMax.wood, state.resources.wood + gain);" } },
  { id: "deterministic-tick-position-trigonometry", checks: [{ files: ["src/game/humanTick.ts", "src/game/tickLayerSystems.ts", "src/game/moonHowler.ts", "src/game/villageLeadership.ts", "src/game/simulation/humanMovement.ts", "src/game/simulation/humanLifecycle.ts", "src/game/worldEventSites.ts", "src/game/dailyGrassEcology.ts"], notMatches: /^(?![^\S\r\n]*(?:\/\/|\*|\/\*))[^\r\n]*Math\.(sin|cos)\(/m, example: "const dx = Math.cos(angle);" }] },
  // Consolidation batch 1: UI ownership.
  {
    id: "human-name-label-render-owner",
    checks: [
      { file: "src/game/renderer/humans.ts", contains: "formatHumanNameLabel(", notContains: ["· Head", "Village head"] },
    ],
  },
  {
    id: "taming-candidates-and-reach-owner",
    checks: [
      { file: "src/components/SelectedEntityPanel.tsx", contains: ["listTamingCandidates(state)", "hasNearbyPlayerTamingPost(state, entity)"], notMatches: /TamingPost && Math\.hypot/, example: "TamingPost && Math.hypot(dx, dy)" },
    ],
  },
  {
    id: "research-block-reason-owner",
    checks: [
      { file: "src/components/tabPanels/ProgressTabPanel.tsx", contains: ["const canResearch = canStartResearch(state, node.id);", "getResearchBlockReason(state, node.id)", "{blockReason}"] },
    ],
  },
  // Consolidation batch 2: Raid, Chronicle and social cadence.
  {
    id: "raid-deadline-single-render-owner",
    checks: [
      { file: "src/App.tsx", contains: "formatRaidDeadline(evt, world.tick)", notContains: "formatRaidDeadlineSafe" },
      { file: "src/components/SelectedBuildingPanel.tsx", notContains: "formatRaidDeadline(" },
      { file: "src/game/raidUtils.ts", absent: true },
    ],
  },
  {
    id: "festival-chronicle-message-shape",
    checks: [
      { file: "src/game/dailyWorldEvents.ts", counts: [{ needle: "began in the village`", times: 2 }], notMatches: [/festival began in the village/, /festival\$\{/], example: ["festival began in the village", "festival${name}"] },
    ],
  },
  {
    id: "social-pair-roll-not-id-added-salt",
    checks: [
      { file: "src/game/socialLife.ts", notMatches: /personDayRoll\([^)]*\+ Math\.abs/, example: "personDayRoll(id, salt + Math.abs(other));" },
    ],
  },
  // Consolidation batch 3: Logistics.
  {
    id: "logistics-overlay-per-frame-only",
    checks: [
      { file: "src/game/renderer/overlay.ts", matches: /drawLogisticsOverlay\(ctx, state, cw, ch\)/ },
      { file: "src/game/entityLayer.ts", notMatches: /logistics/i, example: "state.showLogistics ? 1 : 0," },
    ],
  },
  {
    id: "logistics-projection-owner",
    checks: [
      { file: "src/game/renderer/logistics.ts", contains: "state.logistics", notMatches: /GOOD_ROAD_ACCESS_DISTANCE|MAX_ROAD_ACCESS_DISTANCE|COMMUTE_WALK_BUDGET_TICKS|COMMUTE_EXTREME_DISTANCE|ROAD_CONNECT_GAP/, example: "if (nearest.distance > GOOD_ROAD_ACCESS_DISTANCE) {}", matches: /import type \{[\s\S]*?\} from '\.\.\/logisticsOverlayData';/ },
      { file: "src/game/renderSnapshot.ts", matches: /computeLogisticsOverlayCached\(world\)|computeLogisticsOverlay\(world\)/ },
    ],
  },
  // Consolidation batch 4: Dashboard aggregates.
  {
    id: "ecosystem-health-read-owner",
    checks: [
      { files: ["src/game/storyEvents.ts", "src/game/deerParliament.ts", "src/game/dashboardData.ts", "src/game/ecologyStage.ts", "src/game/villagePortrait.ts", "src/game/ecoBreakdown.ts"], matches: /EcosystemHealth/, notMatches: [/ecosystemHealth\s*\?\?/, /Math\.max\(0,\s*Math\.min\(100,\s*value\)\)/], example: ["state.ecosystemHealth ?? 50", "Math.max(0, Math.min(100, value))"] },
    ],
  },
  {
    id: "village-labour-aggregate-owner",
    checks: [
      { file: "src/game/citizenOverview.ts", matches: /computeVillageStats\(/, notMatches: /b\.faction !== 'rival'/, example: "b.faction !== 'rival'" },
      { file: "src/game/dashboardData.ts", matches: /computeVillageStats\(/, notMatches: /idleAdults\+\+/, example: "idleAdults++" },
    ],
  },
  // Consolidation batch 5: Shared simulation predicates.
  {
    id: "colony-human-predicate-owner",
    checks: [
      { files: ["src/App.tsx", "src/game/apprenticeships.ts", "src/game/relationships.ts", "src/game/electionVotes.ts", "src/game/housingModel.ts", "src/game/housingPipeline.ts", "src/game/workforce.ts", "src/game/scheduleFeedback.ts", "src/game/leaderHouse.ts", "src/game/moonHowler.ts", "src/components/SimulationDiagnosticsPanel.tsx"], matches: /isPlayerHuman|playerHumansFrom/, notMatches: /\.alive\s*&&\s*![\w.]+\.faction|\.type === EntityType\.Human\s*&&\s*![\w.]+\.faction/, example: "e.alive && !e.faction" },
      { files: ["src/components/SelectedBuildingPanel.tsx", "src/components/WorkSchedulePanel.tsx"], notMatches: /\.alive\s*&&\s*![\w.]+\.faction|\.type === EntityType\.Human\s*&&\s*![\w.]+\.faction/, example: "e.type === EntityType.Human && !e.faction" },
    ],
  },
  {
    id: "predator-set-audio-owner",
    checks: [
      { file: "src/audio/interactionDetect.ts", matches: /import \{[^}]*PREDATOR_TYPES[^}]*\} from '\.\.\/game\/combat'/, notMatches: /const PREDATOR_TYPES = new Set<EntityType>\(/, example: "const PREDATOR_TYPES = new Set<EntityType>();" },
      { file: "src/game/combat.ts", matches: /export const PREDATOR_TYPES: ReadonlySet<EntityType> = /, counts: [{ needle: "new Set<EntityType>(", times: 1 }] },
    ],
  },
  {
    id: "wall-predicate-strip-owner",
    checks: [
      { file: "src/game/stripJunction.ts", matches: /isWallBuildingType[^;]*from '\.\/defenseStructures'/, notMatches: /const WALL_TYPES = new Set<BuildingType>\(/, example: "const WALL_TYPES = new Set<BuildingType>();" },
      { file: "src/game/stripTopology.ts", matches: /isWallBuildingType[^;]*from '\.\/defenseStructures'/, notMatches: /WALL_STRIP_TYPES/, example: "const WALL_STRIP_TYPES = new Set();" },
    ],
  },
  {
    id: 'player-human-faction-union-exhaustive',
    checks: [{ file: 'src/game/playerHuman.ts', matches: /Record<NonNullable<Entity\['faction'\]>, boolean>/ }],
  },
  {
    id: 'map-canvas-no-fullscreen-filter',
    checks: [{ file: 'src/App.css', notMatches: /filter:\s*contrast\(/, example: '.map-canvas { filter: contrast(1.04) saturate(1.06); }' }],
  },
  {
    id: 'mini-map-no-private-raf',
    checks: [{ file: 'src/components/MiniMap.tsx', notMatches: /requestAnimationFrame/, example: 'animId = requestAnimationFrame(draw);' }],
  },
  {
    id: 'save-load-entity-index-before-resolvers',
    checks: [{ file: 'src/game/saveLoad.ts', order: [["rebuildEntityByIdMap(world);","migrateTickTimeline(world"],["rebuildEntityByIdMap(world);","syncMoonHowlerForms("],["rebuildEntityByIdMap(world);","reconcileDanglingReferencesOnLoad(world);"],["rebuildEntityByIdMap(world);","assignMissingResidences("],["rebuildEntityByIdMap(world);","assignMissingWorkers("],["rebuildEntityByIdMap(world);","repairJuvenileAssignmentsOnLoad(world);"]] }],
  },
];

const asArray = (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
const quote = (text) => JSON.stringify(text.length > 60 ? `${text.slice(0, 57)}…` : text);
const occurrences = (text, needle) => text.split(needle).length - 1;

function runCheck(ctx, check) {
  const violations = [];
  for (const file of check.files ?? [check.file]) {
    if (check.absent) {
      if (ctx.exists(file)) violations.push(`${file}: the retired file is back`);
      continue;
    }
    if (!ctx.exists(file)) {
      violations.push(`${file}: guarded file is gone — retarget or drop the rule`);
      continue;
    }
    const text = ctx.read(file);
    for (const needle of asArray(check.contains)) {
      if (!text.includes(needle)) violations.push(`${file}: no longer contains ${quote(needle)}`);
    }
    for (const needle of asArray(check.notContains)) {
      if (text.includes(needle)) violations.push(`${file}: still contains ${quote(needle)}`);
    }
    for (const pattern of asArray(check.matches)) {
      if (!pattern.test(text)) violations.push(`${file}: no longer matches ${pattern}`);
    }
    for (const pattern of asArray(check.notMatches)) {
      if (pattern.test(text)) violations.push(`${file}: still matches ${pattern}`);
    }
    for (const { needle, times } of check.counts ?? []) {
      const found = occurrences(text, needle);
      if (found !== times) violations.push(`${file}: ${quote(needle)} appears ${found} times, expected ${times}`);
    }
    for (const [before, after] of check.order ?? []) {
      const beforeAt = text.indexOf(before);
      const afterAt = text.indexOf(after);
      if (beforeAt < 0) violations.push(`${file}: no longer contains ${quote(before)}`);
      else if (afterAt < 0) violations.push(`${file}: no longer contains ${quote(after)}`);
      else if (beforeAt > afterAt) violations.push(`${file}: ${quote(before)} must precede ${quote(after)}`);
    }
    for (const region of check.region ?? []) {
      const start = text.indexOf(region.from);
      if (start < 0) {
        violations.push(`${file}: region anchor ${quote(region.from)} is gone`);
        continue;
      }
      const end = region.to
        ? text.indexOf(region.to, start)
        : region.within
          ? start + region.within
          : text.length;
      if (end < 0) {
        violations.push(`${file}: region end ${quote(region.to)} is gone`);
        continue;
      }
      const slice = text.slice(start, end);
      for (const { needle, times } of region.counts ?? []) {
        const found = occurrences(slice, needle);
        if (found !== times) violations.push(`${file}: the ${quote(region.from)} region ${quote(needle)} appears ${found} times, expected ${times}`);
      }
      for (const needle of asArray(region.contains)) {
        if (!slice.includes(needle)) violations.push(`${file}: the ${quote(region.from)} region lost ${quote(needle)}`);
      }
      for (const needle of asArray(region.notContains)) {
        if (slice.includes(needle)) violations.push(`${file}: the ${quote(region.from)} region still contains ${quote(needle)}`);
      }
      for (const pattern of asArray(region.notMatches)) {
        if (pattern.test(slice)) violations.push(`${file}: the ${quote(region.from)} region still matches ${pattern}`);
      }
    }
  }
  return violations;
}

function runScan(ctx, scan) {
  const violations = [];
  const except = scan.except ?? [];
  const files = [...new Set(asArray(scan.ext ?? '.ts').flatMap((ext) => ctx.sourceFiles(scan.dir, ext)))].sort();
  if (scan.minFiles !== undefined && files.length < scan.minFiles) {
    violations.push(`${scan.dir}: scanned ${files.length} files, expected at least ${scan.minFiles}`);
  }
  for (const file of files) {
    if (except.includes(file)) continue;
    if (scan.notMatches.test(ctx.read(file))) violations.push(`${file}: still matches ${scan.notMatches}`);
  }
  return violations;
}

function runRow(ctx, row) {
  return row.scan ? runScan(ctx, row.scan) : (row.checks ?? []).flatMap((check) => runCheck(ctx, check));
}

/** Mutate each declarative clause separately so another failing clause cannot mask a dead one. */
function* rowMutations(row) {
  if (row.scan) {
    const { dir, ext, example, notMatches, minFiles } = row.scan;
    if (!example || !notMatches.test(example)) throw new Error('invalid scan example');
    for (const extension of asArray(ext ?? '.ts')) {
      const file = dir + '/__guard_probe__' + extension;
      yield { file, text: example, expected: file + ': still matches ' + notMatches };
    }
    if (minFiles !== undefined) {
      yield { emptyScan: true, expected: dir + ': scanned 0 files, expected at least ' + minFiles };
    }
    return;
  }
  for (const check of row.checks) {
    for (const file of check.files ?? [check.file]) {
      if (check.absent) {
        yield { file, text: '', expected: file + ': the retired file is back' };
        continue;
      }
      const text = readFromDisk(file);
      const remove = (needle) => text.split(needle).join('');
      for (const needle of asArray(check.contains)) {
        yield { file, text: remove(needle), expected: file + ': no longer contains ' + quote(needle) };
      }
      for (const needle of asArray(check.notContains)) {
        yield { file, text: text + '\n' + needle, expected: file + ': still contains ' + quote(needle) };
      }
      for (const pattern of asArray(check.matches)) {
        const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
        yield { file, text: text.replace(global, ''), expected: file + ': no longer matches ' + pattern };
      }
      for (const [index, pattern] of asArray(check.notMatches).entries()) {
        const example = asArray(check.example)[index];
        if (!example || !pattern.test(example)) throw new Error(file + ': invalid example for ' + pattern);
        yield { file, text: text + '\n' + example, expected: file + ': still matches ' + pattern };
      }
      for (const { needle, times } of check.counts ?? []) {
        const found = occurrences(text, needle) + 1;
        yield { file, text: text + '\n' + needle, expected: file + ': ' + quote(needle) + ' appears ' + found + ' times, expected ' + times };
      }
      for (const [before, after] of check.order ?? []) {
        yield { file, text: remove(before), expected: file + ': no longer contains ' + quote(before) };
        yield { file, text: remove(after), expected: file + ': no longer contains ' + quote(after) };
        yield {
          file,
          text: after + '\n' + before + '\n' + text.split(before).join('').split(after).join(''),
          expected: file + ': ' + quote(before) + ' must precede ' + quote(after),
        };
      }
      for (const region of check.region ?? []) {
        const prefix = file + ': region anchor ' + quote(region.from);
        yield { file, text: remove(region.from), expected: prefix + ' is gone' };
        const start = text.indexOf(region.from);
        const end = region.to ? text.indexOf(region.to, start) : region.within ? start + region.within : text.length;
        if (start < 0 || end < 0) throw new Error(file + ': missing region in baseline');
        if (region.to) {
          yield { file, text: remove(region.to), expected: file + ': region end ' + quote(region.to) + ' is gone' };
        }
        const label = file + ': the ' + quote(region.from) + ' region';
        for (const { needle, times } of region.counts ?? []) {
          const found = occurrences(text.slice(start, end), needle);
          const insertion = start + region.from.length;
          yield {
            file,
            text: text.slice(0, insertion) + needle + text.slice(insertion),
            expected: label + ' ' + quote(needle) + ' appears ' + (found + 1) + ' times, expected ' + times,
          };
          if (found > 0) {
            const at = text.indexOf(needle, insertion);
            if (at < 0 || at >= end) throw new Error(file + ': counted needle not found inside region');
            yield {
              file,
              text: text.slice(0, at) + ' '.repeat(needle.length) + text.slice(at + needle.length),
              expected: label + ' ' + quote(needle) + ' appears ' + (found - 1) + ' times, expected ' + times,
            };
          }
        }
        for (const needle of asArray(region.contains)) {
          // Remove all occurrences without shortening the bounded region.
          yield {
            file,
            text: text.slice(0, start) + text.slice(start, end).split(needle).join(' '.repeat(needle.length)) + text.slice(end),
            expected: label + ' lost ' + quote(needle),
          };
        }
        const insertion = start + region.from.length;
        for (const needle of asArray(region.notContains)) {
          yield { file, text: text.slice(0, insertion) + '\n' + needle + text.slice(insertion), expected: label + ' still contains ' + quote(needle) };
        }
        for (const [index, pattern] of asArray(region.notMatches).entries()) {
          const example = asArray(region.example)[index];
          if (!example || !pattern.test(example)) throw new Error(file + ': invalid region example for ' + pattern);
          yield { file, text: text.slice(0, insertion) + '\n' + example + text.slice(insertion), expected: label + ' still matches ' + pattern };
        }
      }
    }
  }
}

function runRows(ctx) {
  return SOURCE_ROWS.flatMap((row) => runRow(ctx, row).map((message) => ({ id: row.id, message })));
}

function runGuards(ctx) {
  return GUARDS.flatMap((guard) =>
    guard.check(ctx).map((message) => ({ id: guard.id, message })),
  );
}

function main() {
  const selfTest = process.argv.includes('--self-test');
  if (selfTest) {
    const failures = [];
    const ids = [...GUARDS, ...SOURCE_ROWS].map((rule) => rule.id);
    if (new Set(ids).size !== ids.length) failures.push('duplicate source guard ID');
    for (const guard of GUARDS) {
      if (!guard.sample) {
        failures.push(`${guard.id}: no red-before sample`);
        continue;
      }
      const violations = guard.check(makeContext(guard.sample));
      if (violations.length === 0) failures.push(`${guard.id}: did not report a violation on its sample`);
    }
    let mutations = 0;
    for (const row of SOURCE_ROWS) {
      const baseline = runRow(makeContext(), row);
      if (baseline.length) {
        failures.push(...baseline.map((message) => row.id + ': baseline: ' + message));
        continue;
      }
      try {
        let cases = 0;
        for (const { file, text, expected, emptyScan } of rowMutations(row)) {
          cases++;
          mutations++;
          const context = emptyScan ? { ...makeContext(), sourceFiles: () => [] } : makeContext({ [file]: text });
          const violations = runRow(context, row);
          if (!violations.includes(expected)) failures.push(row.id + ': mutation missed: ' + expected);
        }
        if (!cases) failures.push(row.id + ': no red-before sample');
      } catch (error) {
        failures.push(row.id + ': ' + error.message);
      }
    }
    if (failures.length > 0) {
      process.stderr.write(`source guards self-test FAILED\n${failures.map((line) => `  ${line}`).join('\n')}\n`);
      process.exit(1);
    }
    const total = GUARDS.length + SOURCE_ROWS.length;
    process.stdout.write(`source guards self-test: PASS (${total} rules; ${mutations} declarative mutations)\n`);
    return;
  }

  const violations = [...runGuards(makeContext()), ...runRows(makeContext())];
  if (violations.length > 0) {
    process.stderr.write(`source guards FAILED (${violations.length})\n`);
    for (const { id, message } of violations) process.stderr.write(`  [${id}] ${message}\n`);
    process.exit(1);
  }
  process.stdout.write(`source guards: PASS (${GUARDS.length + SOURCE_ROWS.length} rules)\n`);
}

main();
