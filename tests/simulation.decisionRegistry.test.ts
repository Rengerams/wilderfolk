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
import {
  DECISION_CADENCES,
  DECISION_KEYS,
  SIMULATION_DECISIONS,
} from '../src/game/simulation/decisionRegistry';

/** The decision keys required by NEXT_AGENT_OBJECTIVES.md Objective 2 (+ housing, 2026-08-20). */
const REQUIRED_DECISIONS = [
  'workforce',
  'housing',
  'construction',
  'production',
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

  it('declares a valid cadence for every decision', () => {
    for (const key of REQUIRED_DECISIONS) {
      const row = SIMULATION_DECISIONS[key];
      expect(DECISION_CADENCES, `cadence of "${key}"`).toContain(row.cadence);
    }
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
});
