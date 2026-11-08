# Personal mark provenance accepted impossible pairs

- Bug: `grantMark` and `normalizeMarks` validated a mark id and its source independently, so a born-only mark could carry an earned source and an earned mark could claim `born`.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit (DNA-03)
- Reporter: full-audit DNA/aptitudes pass
- Area: personal marks and save validation
- Owner module: `src/game/personalMarks.ts` (`grantMark`, `normalizeMarks`)
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: audit showed `lucky`/`born` and `pretty`/`raidVictory` passing both writers.
- 2026-11-07 — resolved: one per-mark allowed-source table rejects the impossible pairs in both writers.

## Observed behavior
`PERSONAL_MARK_DEFS` marks `pretty` and `sickly` as born and `lucky`/`scarred` as earned, but both writers only checked that the source was one of the four known strings. `normalizeMarks([{id:'lucky',source:'born'},{id:'pretty',source:'raidVictory'}])` returned both entries, and the inspector labels any `born` definition "from birth" regardless of the stored source.

## Expected behavior
A mark's provenance must match its definition: born marks come from birth, lucky from `raidVictory`/`rareWindfall`, scarred from `raidWound`.

## Reproduction steps
1. `normalizeMarks([{ id: 'lucky', day: 1, source: 'born' }])`.
2. Observe the accepted entry before the fix.
3. Same with `grantMark(settler, 'pretty', 0, 'raidVictory')`.

## Evidence
Audit `dna-aptitudes.md` §3 DNA-03; `personalMarks.ts` pre-fix source check; `PersonalityCareerDetails.tsx` label logic.

## Root cause
The writers validated id and source against separate global sets, so the pair was never checked.

## Fix / proposed fix
`MARK_ALLOWED_SOURCES` records the allowed source list per mark and `isAllowedMarkSource` validates the pair; `grantMark` and `normalizeMarks` both use it, so a corrupted save drops the impossible entry instead of showing a mislabelled mark.

## Save/migration impact
A save holding an impossible mark/source pair loses that mark on load; valid marks are unchanged.

## Verification result
- `npx vitest run tests/personalMarks.test.ts` — PASS (21 tests), including the new rejection and save-normalization cases.
- `npm run test:types`, `npm run lint` — PASS.
