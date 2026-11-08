/**
 * The decision registry is the machine-checkable ownership contract: every major decision has one
 * owner row with declared cadence, writes, scheduling point and test file.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DECISION_CADENCES,
  DECISION_KEYS,
  SIMULATION_DECISIONS,
  getDecisionsByCadence,
  isPropertyWritePermitted,
} from '../src/game/simulation/decisionRegistry';

/** The decision keys the ownership contract requires, including housing. */
const REQUIRED_DECISIONS = [
  'workerMotionPresentation',
  'virtualPlayer',
  'chronicleProseNames',
  'dailyPersonRoll',
  'traitInfluence',
  'personalMarks',
  'careerHistory',
  'careerProgression',
  'workerFit',
  'humanPhysiology',
  'humanMeals',
  'workSchedule',
  'workforce',
  'immigration',
  'school',
  'buildingAccess',
  'housing',
  'construction',
  'production',
  'villageRequests',
  'visitorLifecycle',
  'idleSkillDecay',
  'socialFeedback',
  'dialogueContent',
  'dialogueSessions',
  'spotlightLore',
  'courtship',
  'affairs',
  'conception',
  'pregnancyBirth',
  'moonHowler',
  'leadership',
  'raidCombat',
  'raidRecovery',
  'raidCaptivity',
  'raidTerminalPresentation',
  'valleyChronicle',
  'terrainRiverSurface',
  'commands',
] as const;

/** Pure projections only; dialogueContent persists speaker scene history and is not read-only. */
const READ_ONLY_DECISIONS = new Set<string>([
  'terrainRiverSurface',
  'buildingAccess',
  'traitInfluence',
  'workerFit',
  'raidTerminalPresentation',
  'chronicleProseNames',
  'dailyPersonRoll',
  'workerMotionPresentation',
  'virtualPlayer',
]);

/** The read-only owners that run inside the render loop rather than on a demand query. */
const RENDER_ONLY_DECISIONS = new Set<string>(['terrainRiverSurface', 'workerMotionPresentation']);

describe('simulation decision registry', () => {
  it('contains exactly the required decision keys', () => {
    expect(DECISION_KEYS.sort()).toEqual([...REQUIRED_DECISIONS].sort());
  });

  it('requires a real gameTick integration file for midnight-owned decisions', () => {
    // Metadata alone is not a test: the named file runs as an explicit required CI step.
    for (const key of ['leadership', 'idleSkillDecay', 'visitorLifecycle'] as const) {
      expect(SIMULATION_DECISIONS[key].testFile).toContain('tests/calendarPhase.auditRegressions.test.ts');
      expect(SIMULATION_DECISIONS[key].scheduledFrom).toContain('tickLayerDaily.ts');
      expect(SIMULATION_DECISIONS[key].cadenceNote).toContain('calendar-scheduler');
    }
  });

  it('files every decision under exactly one cadence, through the registry accessor', () => {
    // `DECISION_CADENCES` is the source of the `DecisionCadence` union and the table is typed, so what
    // is worth pinning is the accessor's behaviour, not membership the type system already guarantees.
    const filedUnder = new Map<string, number>();
    for (const cadence of DECISION_CADENCES) {
      for (const key of getDecisionsByCadence(cadence)) {
        filedUnder.set(key, (filedUnder.get(key) ?? 0) + 1);
      }
    }

    for (const key of REQUIRED_DECISIONS) {
      expect(filedUnder.get(key), `"${key}" is not filed under exactly one cadence`).toBe(1);
      expect(
        getDecisionsByCadence(SIMULATION_DECISIONS[key].cadence),
        `"${key}" is not returned by its own declared cadence`,
      ).toContain(key);
    }

    // The accessor's union is the registry, with nothing invented and nothing dropped.
    expect([...filedUnder.keys()].sort()).toEqual([...DECISION_KEYS].sort());
  });

  it('gives every decision one owner with written fields, scheduling, and tests', () => {
    for (const key of REQUIRED_DECISIONS) {
      const row = SIMULATION_DECISIONS[key];
      expect(row.owner.trim().length, `owner of "${key}"`).toBeGreaterThan(0);
      expect(row.scheduledFrom.trim().length, `scheduledFrom of "${key}"`).toBeGreaterThan(0);
      expect(row.testFile.trim().length, `testFile of "${key}"`).toBeGreaterThan(0);
      if (READ_ONLY_DECISIONS.has(key)) {
        expect(row.cadence).toBe(RENDER_ONLY_DECISIONS.has(key) ? 'render' : 'on-demand');
        expect(row.writes).toEqual([]);
      } else {
        expect(row.writes.length, `writes of "${key}"`).toBeGreaterThan(0);
      }
      for (const field of row.writes) {
        expect(field.trim().length, `write field of "${key}"`).toBeGreaterThan(0);
      }
    }
  });

  it('registers every exported player-human physiology and meal function in both ownership inventories', () => {
    const overview = readFileSync(resolve(process.cwd(), 'OWNERSHIP_OVERVIEW.md'), 'utf8');
    const owners = [
      ['humanPhysiology', 'src/game/simulation/humanPhysiology.ts'],
      ['humanMeals', 'src/game/simulation/humanNeeds.ts'],
    ] as const;

    for (const [key, path] of owners) {
      const source = readFileSync(resolve(process.cwd(), path), 'utf8');
      const names = [...source.matchAll(/export function\s+([A-Za-z_$][\w$]*)\s*\(/g)]
        .map((match) => match[1]);
      expect(names.length, `No exported functions found in ${path}`).toBeGreaterThan(0);
      const registration = SIMULATION_DECISIONS[key].owner;
      for (const name of names) {
        expect(registration, `Unregistered ${path} export ${name} in decisionRegistry`).toContain(name);
        expect(overview, `Unregistered ${path} export ${name} in OWNERSHIP_OVERVIEW`).toContain(name);
      }
    }
  });

  it('assigns each decision to a distinct owner (no two owners for one decision)', () => {
    const owners = REQUIRED_DECISIONS.map((key) => SIMULATION_DECISIONS[key].owner);
    expect(new Set(owners).size).toBe(owners.length);
  });

  it('keeps qualified property writes distinct across simulation owners', () => {
    expect(isPropertyWritePermitted('traitInfluence', 'human.skills')).toBe(false);
    expect(isPropertyWritePermitted('traitInfluence', 'human.traits')).toBe(false);
    expect(isPropertyWritePermitted('workforce', 'building.occupants')).toBe(true);
    expect(isPropertyWritePermitted('workforce', 'building.staffingMode')).toBe(true);
    expect(isPropertyWritePermitted('workforce', 'human.job')).toBe(true);
    expect(isPropertyWritePermitted('workforce', 'job')).toBe(true);
    expect(isPropertyWritePermitted('workforce', 'human.occupants')).toBe(false);
    expect(isPropertyWritePermitted('workforce', 'entity.job')).toBe(false);
    expect(isPropertyWritePermitted('workforce', 'villageLeaderId')).toBe(false);
    expect(isPropertyWritePermitted('production', 'building.occupants')).toBe(false);
    expect(isPropertyWritePermitted('raidCombat', 'raidBattleReports')).toBe(true);
    expect(isPropertyWritePermitted('raidRecovery', 'raidRecovery')).toBe(true);
    expect(isPropertyWritePermitted('raidCaptivity', 'raidPrisonerHistory')).toBe(true);
    expect(isPropertyWritePermitted('valleyChronicle', 'chronicleChapters')).toBe(true);
    expect(isPropertyWritePermitted('terrainRiverSurface', 'worldMap.riverDist')).toBe(false);
    expect(isPropertyWritePermitted('dialogueContent', 'chatPhrase')).toBe(false);
    expect(isPropertyWritePermitted('socialFeedback', 'chatTicks')).toBe(false);
    expect(isPropertyWritePermitted('dialogueSessions', 'human.chatPhrase')).toBe(true);
    expect(isPropertyWritePermitted('dialogueSessions', 'human.chatTicks')).toBe(true);
    expect(isPropertyWritePermitted('dialogueSessions', 'human.chatPartnerId')).toBe(true);
    expect(isPropertyWritePermitted('dialogueSessions', 'human.chatDialogueSessionKey')).toBe(true);
  });

  it('names test files that exist — the registry is the ownership contract, so a stale pointer lies', () => {
    // A registry pointer must name a real file: a reader or linter following a 404 learns nothing
    // about coverage.
    const named: string[] = [];
    for (const key of REQUIRED_DECISIONS) {
      const matches = SIMULATION_DECISIONS[key].testFile.match(/tests\/[A-Za-z0-9_.-]+\.test\.ts/g) ?? [];
      for (const match of matches) named.push(match);
    }

    // Guard the guard: a regex that stopped matching would otherwise pass this case vacuously.
    expect(named.length, 'the registry must name real test files').toBeGreaterThan(10);

    for (const testFile of new Set(named)) {
      expect(existsSync(resolve(process.cwd(), testFile)), `registry points at a missing file: ${testFile}`)
        .toBe(true);
    }

    // The registry itself must carry no "to be added" promise.
    const source = readFileSync(resolve(process.cwd(), 'src/game/simulation/decisionRegistry.ts'), 'utf8');
    expect(source, 'a stale "to be added" note is back').not.toMatch(/to be added/i);
  });
});