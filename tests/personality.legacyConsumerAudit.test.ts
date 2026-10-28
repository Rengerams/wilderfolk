// PR B → PR C legacy DNA ratchet: PR C migrates every site here and must set EXPECTED to {}.
// Token-level scan so comments, strings and the genetics owner's own allocation checks never count.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createScanner, LanguageVariant, SyntaxKind } from 'typescript/unstable/ast';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const GAME_SRC = join(ROOT, 'src', 'game');
const GENETICS_OWNER = 'src/game/settlerTraits.ts';

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

function inventory(path: string, tokens: Token[]): Record<string, number> {
  const findings: Record<string, number> = {};
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
      && path !== GENETICS_OWNER
    ) {
      record(token.text === 'includes' ? 'directTraitIncludes' : 'directTraitSome');
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

describe('no unregistered legacy DNA gameplay rules', () => {
  it('finds exactly the known PR C debt, never a new direct trait bonus or pair table', () => {
    const { files, findings } = legacyInventory();
    expect(files).toBeGreaterThan(100);
    expect(findings).toEqual(EXPECTED);
  });
});
