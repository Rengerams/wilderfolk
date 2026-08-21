/*
 * Protected simulation write-site audit — SIMULATION_AUTHORITY.md §§3, 5, 9.
 *
 * The decision registry proves every major decision has a declared owner, but
 * it cannot catch a later direct assignment to a protected field from an
 * unrelated module. This test scans the runtime TypeScript tree and freezes the
 * currently sanctioned direct writers. It deliberately permits documented
 * delegates: construction/restore paths, entity construction, faction cleanup,
 * and snapshot transport are not second gameplay decisions.
 *
 * If this test fails, do not simply expand the allowlist. First identify the
 * decision, cadence, and owner. Add a report and update the authority/registry
 * only when the new writer is a legitimate documented delegate.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GAME_ROOT = join(PROJECT_ROOT, 'src', 'game');

type ProtectedField =
  | 'pregnant'
  | 'pregnancyDueProgress'
  | 'homeBuildingId'
  | 'residenceBuildingId'
  | 'moonHowlerCursed'
  | 'huntTargetId'
  | 'villageLeaderId';

/**
 * Every direct `entity.field = …` write currently permitted by the domain
 * ownership contract. Paths are project-relative and use forward slashes so the
 * guard is platform-independent.
 */
const APPROVED_WRITERS: Record<ProtectedField, readonly string[]> = {
  // Constructor initialization is allowed; conception owns starting ordinary
  // pregnancies; lifecycle owns advancing/clearing them; Moon Howler form
  // transitions preserve an existing pregnancy without creating one.
  pregnant: [
    'src/game/entityFactory.ts',
    'src/game/moonHowler.ts',
    'src/game/simulation/humanLifecycle.ts',
    'src/game/simulation/humanRelationships.ts',
  ],
  pregnancyDueProgress: [
    'src/game/entityFactory.ts',
    'src/game/simulation/humanLifecycle.ts',
    'src/game/simulation/humanRelationships.ts',
  ],
  // workforce owns normal workplace assignment. The listed delegates perform
  // bounded cleanup/temporary reassignment for housing, transformations,
  // relationship events, or non-settler caravan lifecycle.
  homeBuildingId: [
    'src/game/dayCycle.ts',
    'src/game/leaderHouse.ts',
    'src/game/moonHowler.ts',
    'src/game/simulation/humanRelationships.ts',
    'src/game/tradeCaravans.ts',
    'src/game/workforce.ts',
  ],
  // dayCycle owns normal residence assignment. The listed delegates are the
  // sanctioned demolition, lifecycle, leader, transformation, relationship,
  // caravan, and worker-snapshot boundaries documented in the registry.
  residenceBuildingId: [
    'src/game/buildingActions.ts',
    'src/game/dayCycle.ts',
    'src/game/leaderHouse.ts',
    'src/game/moonHowler.ts',
    'src/game/simBuffers/applyKinematics.ts',
    'src/game/simulation/humanLifecycle.ts',
    'src/game/simulation/humanRelationships.ts',
    'src/game/tradeCaravans.ts',
  ],
  moonHowlerCursed: ['src/game/moonHowler.ts'],
  // Hunt targets are transient intent, not a single gameplay decision: human
  // free-roam, wildlife predators, Moon Howlers, event cleanup, and worker
  // snapshot application each have a bounded documented reason to update it.
  huntTargetId: [
    'src/game/groupEvents.ts',
    'src/game/humanTick.ts',
    'src/game/moonHowler.ts',
    'src/game/simBuffers/applyKinematics.ts',
    'src/game/simulation/simulationEntities.ts',
    'src/game/tickLayerSystems.ts',
    'src/game/worldEvents.ts',
  ],
  // villageLeadership owns gameplay election/vacancy decisions. Save and worker
  // buffer modules only hydrate or apply authoritative transported state.
  villageLeaderId: [
    'src/game/saveLoad.ts',
    'src/game/simBuffers/simDelta.ts',
    'src/game/simWorker/simPrep.ts',
    'src/game/villageLeadership.ts',
  ],
};

const REQUIRED_CANONICAL_WRITERS: Partial<Record<ProtectedField, readonly string[]>> = {
  pregnant: [
    'src/game/simulation/humanRelationships.ts',
    'src/game/simulation/humanLifecycle.ts',
  ],
  pregnancyDueProgress: [
    'src/game/simulation/humanRelationships.ts',
    'src/game/simulation/humanLifecycle.ts',
  ],
  homeBuildingId: ['src/game/workforce.ts'],
  residenceBuildingId: ['src/game/dayCycle.ts'],
  moonHowlerCursed: ['src/game/moonHowler.ts'],
  villageLeaderId: ['src/game/villageLeadership.ts'],
};

function projectPath(path: string): string {
  return relative(PROJECT_ROOT, path).split(sep).join('/');
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

function directWriterFiles(field: ProtectedField): string[] {
  // Assignment only: exclude `===`, `!==`, `=>`, and property declarations.
  const assignment = new RegExp(`\\.${field}\\s*=(?!=)`);
  return sourceFiles(GAME_ROOT)
    .filter((path) => assignment.test(readFileSync(path, 'utf8')))
    .map(projectPath)
    .sort();
}

describe('protected simulation write-site ownership', () => {
  it('keeps every protected direct write inside the approved ownership boundary', () => {
    for (const field of Object.keys(APPROVED_WRITERS) as ProtectedField[]) {
      const actual = directWriterFiles(field);
      const approved = [...APPROVED_WRITERS[field]].sort();
      expect(actual, `${field} direct writers`).toEqual(approved);
    }
  });

  it('retains the canonical gameplay owner for each non-transient protected decision', () => {
    for (const [field, requiredOwners] of Object.entries(REQUIRED_CANONICAL_WRITERS) as [
      ProtectedField,
      readonly string[],
    ][]) {
      const actual = directWriterFiles(field);
      for (const owner of requiredOwners) {
        expect(actual, `${field} canonical owner ${owner}`).toContain(owner);
      }
    }
  });

  it('keeps the legacy humanMovement entry point free of simulation writes', () => {
    const legacyPath = join(GAME_ROOT, 'humanMovement.ts');
    const legacySource = readFileSync(legacyPath, 'utf8');
    expect(legacySource).toMatch(/export\s*\{/);
    for (const field of Object.keys(APPROVED_WRITERS) as ProtectedField[]) {
      expect(legacySource, `legacy movement must not write ${field}`).not.toMatch(
        new RegExp(`\\.${field}\\s*=(?!=)`),
      );
    }
  });
});
