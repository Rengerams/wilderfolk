/**
 * Transitional PR B → PR C inventory of legacy DNA rules in executable source.
 *
 * This is a ratchet, not a permanent exception. PR C migrates the listed sites
 * into traitEffectCatalog/traitEvaluation and changes EXPECTED to {}.
 * The source scan remains active afterward, so reintroducing an inline DNA
 * multiplier, direct per-trait rule or duplicate compatibility table fails CI.
 *
 * Genetic allocation and inheritance in settlerTraits.ts are deliberately
 * excluded from the direct trait-check ban; they are not gameplay bonuses.
 *
 * Source-pattern scanning is intentional: it works with the repository's
 * TypeScript 7 package, which does not expose the legacy compiler AST API.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const GAME_SRC = join(ROOT, 'src', 'game');

/** Finite known pre-PR-C debt; the PR C exit value MUST be {}. */
const EXPECTED: Readonly<Record<string, number>> = {
  'src/game/settlerTraits.ts|legacyMultiplierDefinition': 1,
  'src/game/humanTick.ts|legacyMultiplierImport': 1,
  'src/game/humanTick.ts|legacyMultiplierCall': 3,
  'src/game/simulation/humanRelationships.ts|legacyMultiplierImport': 1,
  'src/game/simulation/humanRelationships.ts|legacyMultiplierCall': 2,
  'src/game/relationships.ts|legacyPairTable': 1,
  'src/game/relationships.ts|legacyPairHelperDefinition': 1,
  'src/game/relationships.ts|legacyPairHelperCall': 1,
  'src/game/socialLife.ts|directTraitIncludes': 1,
  'src/game/humanLifecycleCleanup.ts|directTraitIncludes': 1,
  'src/game/warPrisoners.ts|directTraitIncludes': 1,
  'src/game/warPrisoners.ts|directTraitSome': 1,
};

function sourcePaths(directory: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...sourcePaths(full));
    else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      result.push(full);
    }
  }
  return result;
}

function legacyInventory(): Record<string, number> {
  const findings: Record<string, number> = {};
  const record = (path: string, kind: string, count: number): void => {
    if (count > 0) findings[path + '|' + kind] = count;
  };

  for (const full of sourcePaths(GAME_SRC)) {
    const path = relative(ROOT, full).split(sep).join('/');
    const source = readFileSync(full, 'utf8');
    const count = (pattern: RegExp): number => source.match(pattern)?.length ?? 0;
    const multiplierDefinitions = count(/\bfunction\s+traitMultiplier\s*\(/g);
    const pairDefinitions = count(/\bfunction\s+traitClashCount\s*\(/g);
    const hasTraitDefinitions = count(/\bfunction\s+hasTrait\s*\(/g);

    record(path, 'legacyMultiplierDefinition', multiplierDefinitions);
    record(path, 'legacyMultiplierImport',
      count(/\bimport\s*(?:type\s*)?\{[^}]*\btraitMultiplier\b[^}]*\}\s*from\s*['"][^'"]+['"]/g));
    record(path, 'legacyMultiplierCall',
      count(/\btraitMultiplier\s*\(/g) - multiplierDefinitions);

    record(path, 'legacyHasTraitImport',
      count(/\bimport\s*(?:type\s*)?\{[^}]*\bhasTrait\b[^}]*\}\s*from\s*['"][^'"]+['"]/g));
    record(path, 'legacyHasTraitCall', count(/\bhasTrait\s*\(/g) - hasTraitDefinitions);

    record(path, 'legacyPairTable', count(/\b(?:const|let|var)\s+TRAIT_CLASHES\s*[:=]/g));
    record(path, 'legacyPairHelperDefinition', pairDefinitions);
    record(path, 'legacyPairHelperCall',
      count(/\btraitClashCount\s*\(/g) - pairDefinitions);

    if (path !== 'src/game/settlerTraits.ts') {
      record(path, 'directTraitIncludes', count(/\btraits\s*(?:\?\.|\.)\s*includes\s*\(/g));
      record(path, 'directTraitSome', count(/\btraits\s*(?:\?\.|\.)\s*some\s*\(/g));
    }
  }
  return findings;
}

describe('no unregistered legacy DNA gameplay rules', () => {
  it('pins known PR C debt and rejects any new inline trait multiplier or duplicate pair table', () => {
    expect(legacyInventory()).toEqual(EXPECTED);
  });
});
