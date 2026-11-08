# Gazette labels week 0 as days 1–7 while it covers days 0–6

- Bug: The first weekly gazette issue reports the wrong colony-day range.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit
- Reporter: full-audit gameplay coverage (COV-G-03)
- Area: Chronicle newspaper
- Owner module: `weeklyGazette.ts`
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: audit found the one-day label drift.
- 2026-11-07 — resolved: zero-based inclusive range.

## Observed behavior
`gazetteWeekForTick` puts ticks 0–2015 in week 0, but the issue header printed `startDay: 1`, `endDay: 7`.

## Expected behavior
Week 0 covers colony days 0–6, so the header says 0–6.

## Reproduction steps
1. Build a gazette for week 0 from an event on day 0.
2. Read `startDay`/`endDay`; before the fix they were 1 and 7.

## Evidence
`tests/weeklyGazette.test.ts`.

## Root cause
The bucket is zero-based while the label added one to the start and kept an exclusive end as an inclusive label.

## Fix / proposed fix
`startDay: week * 7`, `endDay: (week + 1) * 7 - 1`.

## Save/migration impact
None.

## Verification result
- `npx vitest run tests/weeklyGazette.test.ts` — PASS.
