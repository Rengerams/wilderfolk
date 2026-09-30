/**
 * Simulation decision registry — SIMULATION_AUTHORITY.md §3.
 *
 * The registry is the machine-checkable ownership contract: every major
 * decision has exactly one owner row with a declared cadence, written fields,
 * scheduling point, and test file. Adding or renaming a decision key must
 * happen together with an authority-document update — this test pins the set
 * so a new major decision cannot be introduced silently.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DECISION_CADENCES,
  DECISION_KEYS,
  SIMULATION_DECISIONS,
  getDecisionsByCadence,
} from '../src/game/simulation/decisionRegistry';

/** The decision keys required by NEXT_AGENT_OBJECTIVES.md Objective 2 (+ housing, 2026-08-20). */
const REQUIRED_DECISIONS = [
  'workforce',
  'housing',
  'construction',
  'production',
  'villageRequests',
  'socialFeedback',
  'courtship',
  'affairs',
  'conception',
  'pregnancyBirth',
  'moonHowler',
  'leadership',
  'commands',
] as const;

describe('simulation decision registry', () => {
  it('contains exactly the required decision keys', () => {
    expect(DECISION_KEYS.sort()).toEqual([...REQUIRED_DECISIONS].sort());
  });

  it('files every decision under exactly one cadence, through the registry accessor', () => {
    // `DECISION_CADENCES` is the source of the `DecisionCadence` union, and the table is
    // `satisfies Record<DecisionKey, DecisionOwner>`, so the old assertion here —
    // `expect(DECISION_CADENCES).toContain(row.cadence)` — was guaranteed by the type system and
    // could only have failed with a compile error. What is worth pinning is the accessor's
    // behaviour: it is the query a scheduler or a linter would use, and a filter that reads the
    // wrong field would silently return nothing for every cadence.
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
      expect(row.writes.length, `writes of "${key}"`).toBeGreaterThan(0);
      for (const field of row.writes) {
        expect(field.trim().length, `write field of "${key}"`).toBeGreaterThan(0);
      }
    }
  });

  it('assigns each decision to a distinct owner (no two owners for one decision)', () => {
    const owners = REQUIRED_DECISIONS.map((key) => SIMULATION_DECISIONS[key].owner);
    expect(new Set(owners).size).toBe(owners.length);
  });

  it('names test files that exist — the registry is the ownership contract, so a stale pointer lies', () => {
    // The `pregnancyBirth` row pointed at `tests/phase678.regression.test.ts`, which does not exist,
    // and four rows still said a test was "to be added in Objective N" long after those objectives
    // shipped. A reader (or a linter) following a pointer that 404s learns nothing about coverage.
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

    // The registry itself must not carry "to be added" promises any more.
    const source = readFileSync(resolve(process.cwd(), 'src/game/simulation/decisionRegistry.ts'), 'utf8');
    expect(source, 'a stale "to be added" note is back').not.toMatch(/to be added/i);
  });
});