# Two renderer hex parsers disagree on short colours

- Bug: A short hex or named colour fed to the building shade helper produces `rgb(NaN,NaN,NaN)`.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit
- Reporter: full-audit infrastructure coverage (COV-I-03)
- Area: renderer colour utilities
- Owner module: `renderer/shared.ts`
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: two parsers with different rules.
- 2026-11-07 — resolved: the shade path uses the documented parser.

## Observed behavior
`hexToRgb('#abc')` read `0x0abc`, giving r=0, g=10, b=188 instead of `#aabbcc`; non-hex input produced `NaN`. `parseHexRgb` handled both forms and returned a fallback.

## Expected behavior
One colour parser for both call paths.

## Reproduction steps
1. Call `hexToRgb('#abc')`.
2. Before the fix it did not equal `parseHexRgb('#abc')`; `darkerColor` inherited the bad channels.

## Evidence
`tests/renderer.shared.hex.test.ts`.

## Root cause
A second, weaker parser survived beside the documented one.

## Fix / proposed fix
`hexToRgb` delegates to `parseHexRgb`; `darkerColor` is unchanged.

## Save/migration impact
None.

## Verification result
- `npx vitest run tests/renderer.shared.hex.test.ts` — PASS.
- `npm run lint` — PASS.
