// PR B → PR C legacy DNA ratchet: PR C migrates every site here and must set EXPECTED to {}.
// Token-level scan so comments, strings and the genetics owner's own allocation checks never count.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createScanner, LanguageVariant, SyntaxKind } from 'typescript/unstable/ast';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const GAME_SRC = join(ROOT, 'src', 'game');
/** The DNA pipeline itself: allocation owner, catalog data and evaluator are its only legitimate readers. */
const DNA_PIPELINE: ReadonlySet<string> = new Set([
  'src/game/settlerTraits.ts',
  'src/game/personality/traitEffectCatalog.ts',
  'src/game/personality/traitEvaluation.ts',
]);
const inPipeline = (path: string): boolean => DNA_PIPELINE.has(path);

/** PR C migrated every legacy consumer, so the inventory must stay empty. */
const EXPECTED: Readonly<Record<string, number>> = {};

/** Tokens after which a `/` opens a regular expression literal rather than division. */
const REGEX_PRECEDERS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.OpenParenToken,
  SyntaxKind.OpenBracketToken,
  SyntaxKind.OpenBraceToken,
  SyntaxKind.CommaToken,
  SyntaxKind.ColonToken,
  SyntaxKind.SemicolonToken,
  SyntaxKind.EqualsToken,
  SyntaxKind.ReturnKeyword,
]);

interface Token {
  kind: SyntaxKind;
  text: string;
}

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

function tokenize(text: string): Token[] {
  const scanner = createScanner(true, LanguageVariant.Standard, text);
  const tokens: Token[] = [];
  const templateDepths: number[] = [];
  let previousKind: SyntaxKind | undefined;
  let kind = scanner.scan();
  while (kind !== SyntaxKind.EndOfFile) {
    if (kind === SyntaxKind.SlashToken && previousKind !== undefined && REGEX_PRECEDERS.has(previousKind)) {
      kind = scanner.reScanSlashToken();
    }
    if (kind === SyntaxKind.TemplateHead) templateDepths.push(0);
    const templateDepth = templateDepths.length - 1;
    if (kind === SyntaxKind.OpenBraceToken && templateDepth >= 0) templateDepths[templateDepth] += 1;
    if (kind === SyntaxKind.CloseBraceToken && templateDepth >= 0) {
      if (templateDepths[templateDepth] > 0) templateDepths[templateDepth] -= 1;
      else {
        // `}` closes a `${…}` substitution, so the scanner must resume the template tail.
        kind = scanner.reScanTemplateToken(false);
        if (kind === SyntaxKind.TemplateTail) templateDepths.pop();
      }
    }
    const start = scanner.getTokenStart();
    tokens.push({ kind, text: scanner.getTokenText() });
    previousKind = kind;
    kind = scanner.scan();
    if (kind !== SyntaxKind.EndOfFile && scanner.getTokenStart() <= start) {
      // A bare `#` outside a private name is zero-length; skip it so the scan cannot stall.
      scanner.setText(text, start + 1);
      kind = scanner.scan();
    }
  }
  return tokens;
}

const isDot = (token: Token | undefined): boolean =>
  token?.kind === SyntaxKind.DotToken || token?.kind === SyntaxKind.QuestionDotToken;

const isDeclarationKeyword = (token: Token | undefined): boolean =>
  token?.kind === SyntaxKind.ConstKeyword ||
  token?.kind === SyntaxKind.LetKeyword ||
  token?.kind === SyntaxKind.VarKeyword;

/** Local names assigned from a `.traits` read, so `const dna = e.traits; dna?.includes(...)` cannot hide. */
function traitAliases(tokens: Token[]): ReadonlySet<string> {
  const aliases = new Set<string>();
  for (let index = 0; index + 2 < tokens.length; index += 1) {
    if (!isDeclarationKeyword(tokens[index])) continue;
    const name = tokens[index + 1];
    if (name.kind !== SyntaxKind.Identifier) continue;

    let equalsAt = -1;
    for (let cursor = index + 2; cursor < tokens.length && cursor < index + 10; cursor += 1) {
      const kind = tokens[cursor].kind;
      if (kind === SyntaxKind.EqualsToken) {
        equalsAt = cursor;
        break;
      }
      if (kind === SyntaxKind.SemicolonToken || isDeclarationKeyword(tokens[cursor])) break;
    }
    if (equalsAt < 0) continue;

    for (let cursor = equalsAt + 1; cursor < tokens.length && cursor < equalsAt + 40; cursor += 1) {
      const token = tokens[cursor];
      if (token.kind === SyntaxKind.SemicolonToken || isDeclarationKeyword(token)) break;
      if (token.kind === SyntaxKind.Identifier && token.text === 'traits' && isDot(tokens[cursor - 1])) {
        aliases.add(name.text);
        break;
      }
    }
  }
  return aliases;
}

function inventory(path: string, tokens: Token[]): Record<string, number> {
  const findings: Record<string, number> = {};
  const aliases = traitAliases(tokens);
  const record = (kind: string): void => {
    const key = path + '|' + kind;
    findings[key] = (findings[key] ?? 0) + 1;
  };

  let inImportClause = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind === SyntaxKind.ImportKeyword) {
      inImportClause = true;
      continue;
    }
    if (
      inImportClause
      && (
        token.kind === SyntaxKind.FromKeyword
        || token.kind === SyntaxKind.SemicolonToken
        || token.kind === SyntaxKind.StringLiteral
        || token.kind === SyntaxKind.OpenParenToken
      )
    ) {
      inImportClause = false;
      continue;
    }
    if (token.kind !== SyntaxKind.Identifier) continue;

    const previous = tokens[index - 1];
    const declared = previous?.kind === SyntaxKind.FunctionKeyword;
    const called = !declared && tokens[index + 1]?.kind === SyntaxKind.OpenParenToken;

    if (token.text === 'traitMultiplier') {
      if (inImportClause) record('legacyMultiplierImport');
      else if (declared) record('legacyMultiplierDefinition');
      else if (called) record('legacyMultiplierCall');
    }
    if (token.text === 'hasTrait') {
      if (inImportClause) record('legacyHasTraitImport');
      else if (called) record('legacyHasTraitCall');
    }
    if (token.text === 'traitClashCount') {
      if (declared) record('legacyPairHelperDefinition');
      else if (called) record('legacyPairHelperCall');
    }
    if (token.text === 'TRAIT_CLASHES' && isDeclarationKeyword(previous)) record('legacyPairTable');

    const subject = tokens[index - 2];
    if (
      (token.text === 'includes' || token.text === 'some')
      && called
      && isDot(previous)
      && subject?.kind === SyntaxKind.Identifier
      && subject.text === 'traits'
      && isDot(tokens[index - 3])
      && !inPipeline(path)
    ) {
      record(token.text === 'includes' ? 'directTraitIncludes' : 'directTraitSome');
    }
    if (
      (token.text === 'includes' || token.text === 'some')
      && called
      && isDot(previous)
      && subject?.kind === SyntaxKind.Identifier
      && !inPipeline(path)
    ) {
      const aliased = aliases.has(subject.text);
      const destructured = !aliased && subject.text === 'traits' && !isDot(tokens[index - 3]);
      if (aliased) record(token.text === 'includes' ? 'aliasedTraitIncludes' : 'aliasedTraitSome');
      if (destructured) record(token.text === 'includes' ? 'destructuredTraitIncludes' : 'destructuredTraitSome');
    }
  }
  return findings;
}

function legacyInventory(): { files: number; findings: Record<string, number> } {
  const findings: Record<string, number> = {};
  const paths = sourcePaths(GAME_SRC);
  for (const full of paths) {
    const path = relative(ROOT, full).split(sep).join('/');
    for (const [key, count] of Object.entries(inventory(path, tokenize(readFileSync(full, 'utf8'))))) {
      findings[key] = (findings[key] ?? 0) + count;
    }
  }
  return { files: paths.length, findings };
}

const findingsFor = (path: string, source: string): Record<string, number> => inventory(path, tokenize(source));

describe('no unregistered legacy DNA gameplay rules', () => {
  it('keeps the migrated inventory empty across the whole game source tree', () => {
    const { files, findings } = legacyInventory();
    expect(files).toBeGreaterThan(100);
    expect(findings).toEqual(EXPECTED);
  });

  it('still catches a reintroduced direct trait multiplier', () => {
    const source = "export function f(e) { return traitMultiplier(e, 'lucky', 1.15); }";
    expect(findingsFor('src/game/regressionFixture.ts', source))
      .toEqual({ 'src/game/regressionFixture.ts|legacyMultiplierCall': 1 });
    expect(findingsFor('src/game/regressionFixture.ts', "function traitMultiplier() { return 1; }"))
      .toEqual({ 'src/game/regressionFixture.ts|legacyMultiplierDefinition': 1 });
    expect(findingsFor('src/game/regressionFixture.ts', "import { traitMultiplier } from './settlerTraits';"))
      .toEqual({ 'src/game/regressionFixture.ts|legacyMultiplierImport': 1 });
  });

  it('still catches an inlined per-trait gameplay check', () => {
    expect(findingsFor('src/game/regressionFixture.ts', "if (e.traits?.includes('intuitive')) return 0.11;"))
      .toEqual({ 'src/game/regressionFixture.ts|directTraitIncludes': 1 });
    expect(findingsFor('src/game/regressionFixture.ts', "if (e.traits?.some((t) => t === 'fierce')) return 1;"))
      .toEqual({ 'src/game/regressionFixture.ts|directTraitSome': 1 });
  });

  it('still catches a legacy trait check behind a local alias', () => {
    expect(findingsFor('src/game/regressionFixture.ts', ["const dna = entity.traits;", "if (dna?.includes('lucky')) return 1.15;"].join('\n')))
      .toEqual({ 'src/game/regressionFixture.ts|aliasedTraitIncludes': 1 });
    expect(findingsFor('src/game/regressionFixture.ts', ["const dna = entity.traits ?? [];", "if (dna.some((t) => t === 'fierce')) return 1;"].join('\n')))
      .toEqual({ 'src/game/regressionFixture.ts|aliasedTraitSome': 1 });
    expect(findingsFor('src/game/regressionFixture.ts', ["let dna: SettlerTrait[] = entity.traits;", "return dna.includes('stoic');"].join('\n')))
      .toEqual({ 'src/game/regressionFixture.ts|aliasedTraitIncludes': 1 });
    expect(findingsFor('src/game/regressionFixture.ts', ["const { traits } = entity;", "return traits?.includes('intuitive');"].join('\n')))
      .toEqual({ 'src/game/regressionFixture.ts|destructuredTraitIncludes': 1 });
  });

  it('never mistakes an unrelated array for a DNA read', () => {
    expect(findingsFor('src/game/regressionFixture.ts', 'const list = building.occupants; if (list.includes(3)) return 1;'))
      .toEqual({});
    expect(findingsFor('src/game/regressionFixture.ts', "if (TRAIT_POOL.includes('brave')) return 1;")).toEqual({});
  });

  it('still catches a reintroduced pair table or pair helper', () => {
    const source = [
      "const TRAIT_CLASHES = [['brave', 'timid']];",
      'function traitClashCount(a, b) { return TRAIT_CLASHES.length; }',
      'const n = traitClashCount(a, b);',
    ].join('\n');
    expect(findingsFor('src/game/regressionFixture.ts', source)).toEqual({
      'src/game/regressionFixture.ts|legacyPairTable': 1,
      'src/game/regressionFixture.ts|legacyPairHelperDefinition': 1,
      'src/game/regressionFixture.ts|legacyPairHelperCall': 1,
    });
  });

  it('never counts comments or string literals as rules', () => {
    const source = [
      "// traitMultiplier(entity, 'lucky', 1.15) and entity.traits?.includes('intuitive')",
      "const note = 'traitClashCount(a, b) and traits?.includes(';",
    ].join('\n');
    expect(findingsFor('src/game/regressionFixture.ts', source)).toEqual({});
  });

  it('leaves the DNA pipeline its own reads', () => {
    for (const path of DNA_PIPELINE) {
      expect(findingsFor(path, "if (e.traits?.includes('brave')) return true;"), path).toEqual({});
      expect(findingsFor(path, ["const dna = e.traits;", "if (dna?.includes('brave')) return true;"].join('\n')), path)
        .toEqual({});
    }
    expect(findingsFor('src/game/regressionFixture.ts', "if (e.traits?.includes('brave')) return true;"))
      .toEqual({ 'src/game/regressionFixture.ts|directTraitIncludes': 1 });
  });
});
