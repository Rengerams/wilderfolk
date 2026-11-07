# 72→288 save migration leaves persisted tick fields unscaled

- Bug: A 0.6.5.0 save loads with cooldowns, remarriage bars and spotlight timings reading four times too long.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit
- Reporter: full-audit simulation pass (SIM-15, Q-03)
- Area: save/load migration
- Owner module: `saveLoad.ts` (allow-list: `saveSchema.ts`)
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: audit found unscaled fields beside the existing scaler.
- 2026-11-07 — resolved: typed tick-field table scales every listed group; migration test added.

## Observed behavior
`migrateTickTimeline` scaled the timeline by four but skipped Moon Howler cooldowns, `lastAutoJobTransferTick`, `pastPartnerTicks`, dialogue cooldown ticks, spotlight timings, graveyard ticks and the event-log tick. The unscaled event-log tick also let a live festival look more than 40 new days old and be cleared on load.

## Expected behavior
Every persisted tick-valued field moves with the calendar, so a migrated save keeps the same remaining cooldowns and the same live festival.

## Reproduction steps
1. Build a 0.6.5.0 save with `_ticksPerDay: 72` and values in the fields above.
2. Load it through `loadGameFromParsed`.
3. Before the fix the loaded values stayed at 72-tick scale while `world.tick` became 288-tick scale.

## Evidence
`tests/saveLoad.tickResolution.test.ts` — “scales every persisted tick field a 72-tick save carries” and “keeps a live festival when the event-log tick is scaled with it”.

## Root cause
The migration listed fields by hand through untyped string casts, so newly persisted tick fields were silently omitted.

## Fix / proposed fix
One typed table per persisted container (`WORLD_TICK_FIELDS`, `ENTITY_TICK_FIELDS`, needs, Moon Howler, spotlight) with a typed `scaleTickField`; tick-keyed maps are scaled through `scaleTickRecord`. The event log is scaled too, so the festival repair compares one time base.

## Save/migration impact
Only legacy 24- and 72-tick saves change; current-resolution saves are untouched.

## Verification result
- `npx vitest run tests/saveLoad.tickResolution.test.ts` — PASS.
- `npm run test:types` — PASS.
- `npm run lint` — PASS.
