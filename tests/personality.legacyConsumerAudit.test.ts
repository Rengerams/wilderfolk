/**
 * Transitional PR B → PR C audit of executable legacy DNA rule sites.
 *
 * This inventory is not a permanent exception. PR C MUST migrate every listed
 * site into traitEffectCatalog/traitEvaluation and change EXPECTED to {}.
 * The AST scan remains active afterwards: added legacy rules make CI fail.
 *
 * The scan excludes historical docs and the genetics owner's own structural
 * `traits.includes` allocation/inheritance checks, which are not gameplay bonuses.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';

const ROOT = process.cwd();
const GAME_SRC = join(ROOT, 'src', 'game');

/** Explicit finite debt list for the already-implemented pre-PR-C rules. */
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
  const record = (path: string, kind: string) => {
    const key = path + '|' + kind;
    findings[key] = (findings[key] ?? 0) + 1;
  };

  for (const full of sourcePaths(GAME_SRC)) {
    const path = relative(ROOT, full).split(sep).join('/');
    const source = ts.createSourceFile(
      path, readFileSync(full, 'utf8'), ts.ScriptTarget.Latest, true,
      path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node): void => {
      if (ts.isImportSpecifier(node)) {
        const imported = node.propertyName?.text ?? node.name.text;
        if (imported === 'traitMultiplier') record(path, 'legacyMultiplierImport');
        if (imported === 'hasTrait') record(path, 'legacyHasTraitImport');
      }
      if (ts.isFunctionDeclaration(node) && node.name) {
        if (node.name.text === 'traitMultiplier') record(path, 'legacyMultiplierDefinition');
        if (node.name.text === 'traitClashCount') record(path, 'legacyPairHelperDefinition');
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'TRAIT_CLASHES') {
        record(path, 'legacyPairTable');
      }
      if (ts.isCallExpression(node)) {
        if (ts.isIdentifier(node.expression)) {
          if (node.expression.text === 'traitMultiplier') record(path, 'legacyMultiplierCall');
          if (node.expression.text === 'hasTrait') record(path, 'legacyHasTraitCall');
          if (node.expression.text === 'traitClashCount') record(path, 'legacyPairHelperCall');
        }
        const method = node.expression;
        if (
          path !== 'src/game/settlerTraits.ts'
          && ts.isPropertyAccessExpression(method)
          && ts.isPropertyAccessExpression(method.expression)
          && method.expression.name.text === 'traits'
        ) {
          if (method.name.text === 'includes') record(path, 'directTraitIncludes');
          if (method.name.text === 'some') record(path, 'directTraitSome');
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return findings;
}

describe('no unregistered legacy DNA gameplay rules', () => {
  it('finds exactly the known PR C debt, never a new direct trait bonus or pair table', () => {
    expect(legacyInventory()).toEqual(EXPECTED);
  });
});
