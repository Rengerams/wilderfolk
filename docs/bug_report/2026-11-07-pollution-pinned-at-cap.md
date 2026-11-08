# Pollution pinned every mid-size colony at 100

- Bug: The population pollution term was `humans / 3` against a 0-100 scale, so any colony over 300 settlers sat at the cap and paid a permanent 50-point health penalty, with no difference between 300 and 2,500 people.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-07
- Version/build: V0.6.5.1 audit (SIM-22)
- Reporter: full-audit needs/ecology pass
- Area: simulation / ecology
- Owner module: `src/game/dailyEcology.ts` (`calculateEcosystemMetrics`)
- Related PR/commit: this branch (`master-approach-buglist`)

## Status history
- 2026-11-07 — open: audit found the linear term saturating the clamp at 300 settlers.
- 2026-11-07 — resolved: the population term grades to the top of the scale near 2,500, and preserves damp it.

## Observed behavior
A 300-settler colony and a 2,500-settler colony both reported `pollutionLevel 100` and the same `pollutionPenalty 50`. Growth stopped telling the player anything, and Wildlife Preserves could only offset health, never the pollution score.

## Expected behavior
Pollution grades with settlement size across the 0-100 scale, and a preserve lowers the score rather than only repairing health.

## Reproduction steps
1. Call `calculateEcosystemMetrics` with 300, 1,000 and 2,500 settlers and no industry.
2. Observe 100, 100, 100 before the change.

## Evidence
- `tests/dailyEcology.pollutionGrading.test.ts` — 300 / 1,000 / 2,500 now read 12 / 40 / 100, and two preserves lower the 1,000-settler score.

## Root cause
One point per three settlers on a 100-point scale, clamped, so the curve was flat past 300.

## Fix / proposed fix
`HUMAN_POLLUTION_PER_POINT = 25` grades the population term; each Wildlife Preserve damps the whole score by 5% down to a 50% floor. Industry and the forestry tech keep their existing multipliers.

## Save/migration impact
None; `pollutionLevel` stays a derived 0-100 value.

## Verification result
- `npx vitest run tests/dailyEcology.pollutionGrading.test.ts` — PASS (2/2).
- `npx vitest run ecology` — PASS with the wider regression set.
- `npm run test:types`, `npm run lint`, `npm run build` — PASS.
- 2,500-settler ecology measurement — NOT RUN.
