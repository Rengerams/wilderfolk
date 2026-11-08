# Rival growth cadence follows array position, not rival identity

- Bug: Removing or razing an earlier rival silently changes every later rival's growth schedule.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit
- Reporter: full-audit gameplay coverage (COV-G-05)
- Area: rival camps
- Owner module: `frontierCombat.ts` (rule) → `rivalEvents.ts` (day pulse)
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: growth used the loop index.
- 2026-11-07 — resolved: the cadence hashes the stable rival id.

## Observed behavior
`isRivalGrowthDay(index, colonyDay)` used the rival's position in `state.rivalSettlements`, so a removal shifted all later schedules.

## Expected behavior
A rival keeps its cadence when the list changes.

## Reproduction steps
1. Record a rival's growth days with it at index 1.
2. Remove the rival at index 0 and evaluate the same rival on the same colony day.
3. Before the fix the answer changed with its new index.

## Evidence
`tests/rivalProfiles.test.ts` — “keys the growth cadence on stable rival identity, not list position”.

## Root cause
Array position was used as a stand-in for identity.

## Fix / proposed fix
The rule takes the rival id and offsets the cadence with `hashSalt(rivalId)`; the day pulse passes `rival.id`.

## Save/migration impact
None; no new persisted field.

## Verification result
- `npx vitest run tests/rivalProfiles.test.ts` — PASS.
- `npm run test:types` — PASS.
