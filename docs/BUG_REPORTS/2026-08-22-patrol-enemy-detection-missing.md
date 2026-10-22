# Bug: Soldier patrols do not yet provide the agreed enemy-detection response

- Status: deferred — will be done in later versions (visibility-only patrol for v0.6.3)
- Date discovered: 2026-08-22
- Version/build: Wilderfolk v0.6.3 development working tree
- Reporter: Simulation-role audit and updated Festivals en venues responsibility document
- Area: Play | Truth | performance
- Owner module: `src/game/humanTick.ts`, `src/game/frontierCombat.ts`, `src/game/defenseStructures.ts`
- Cadence: Realtime Soldier patrol tick and incoming-raid response cadence

## Status history

- 2026-08-22 — open (source audit found the agreed patrol information loop was absent)
- 2026-08-22 — investigating (runtime source now confirms bounded patrol visibility detection exists, but the documented raid-preparation and High Alert behavior remain unproven/missing)
- 2026-08-24 — deferred (roadmap decision point 2: keep patrol visibility-only for v0.6.3; no High Alert or raid-preparation benefit in this version. Will be revisited in a later version with a defined raid-owner consequence.)

## Observed behavior

The current implementation contains `detectRaidersForPatrol()` in `src/game/humanTick.ts`. During the ordinary Soldier patrol branch, a valid Barracks Soldier scans nearby marching rival entities, clears `hiddenFromPlayer`, sets `detectedByPatrol`, and emits an event/floating text for a newly detected group.

The agreed design document additionally requires active patrol counts to affect raid preparation time and requires increased patrol activity or detection under High Alert. The inspected runtime path does not show patrol detection changing the authoritative raid response/deadline field, and the Soldier patrol condition contains no High Alert modifier. Patrol activity is also limited by `goWorkTime` and higher-priority behavior branches.

## Expected behavior

Soldiers assigned to a Barracks should patrol the settlement and provide the player’s enemy-information loop. No active Soldier patrol should mean no patrol-based discovery. A patrol that discovers an incoming raid should produce the documented response benefit, including the defined guard-count bands and hard cap. High Alert should increase patrol coverage, patrol frequency, patrol area, or detection reliability according to one explicit rule.

Prison Guards must remain separate and must not participate in village patrol detection.

## Reproduction steps

1. Build and staff a Barracks with valid Soldier assignments.
2. Create or wait for an incoming marching rival group.
3. Observe that a Soldier patrol can reveal the group when within `PATROL_DETECTION_RADIUS`.
4. Inspect the authoritative raid event response/deadline before and after patrol detection.
5. Repeat with 0, 1, 2–3, and 4+ active Soldiers and with High Alert enabled.
6. Observe that the documented preparation-day bands and High Alert scaling are not established by the current patrol path.

## Evidence

- `src/game/humanTick.ts:106-131` — bounded patrol scan, `hiddenFromPlayer` clearing, `detectedByPatrol`, event, and floating text.
- `src/game/humanTick.ts:845-869` — patrol invocation requires `goWorkTime`, Soldier role, Barracks assignment, and no higher-priority branch.
- `src/game/gameTypes.ts` — `hiddenFromPlayer` and `detectedByPatrol` fields.
- `src/game/frontierCombat.ts` — authoritative incoming-raid event and response timing paths; no confirmed patrol timing mutation found during this audit.
- Updated `Festivals en venues` responsibility document — defines the guard-count preparation-day bands and High Alert expectation.

## Root cause

Patrol visibility detection was implemented as a realtime reveal state, but the broader security contract—patrol-to-raid response timing and High Alert scaling—was not connected to the same authoritative security owner.

## Fix

Pending. Choose one authoritative security/patrol transition that records discovery and applies the response benefit once. Add an explicit High Alert modifier. Preserve the existing bounded scan and avoid adding a second enemy system or presentation-only result.

## Regression test

Add tests for no patrol, one Soldier patrol, detection radius, multiple Soldiers, duplicate detection, patrol response timing, guard-count bands, hard cap, High Alert scaling, threat expiry, and Prison Guard exclusion.

## Invariants checked

- Only living player Soldiers assigned to a completed Barracks patrol.
- Prison Guards never provide Barracks patrol detection.
- Rival entities remain owned by the rival/raid system.
- Patrol detection writes authoritative visibility state once per group.
- Raid timing is changed only by the raid owner.

## Save/migration impact

No save change is required for a visibility-only fix. If patrol preparation modifiers are stored on raid events, add a save/migration review and preserve legacy pending-raid events.

## Verification result

- Existing related patrol/security tests pass.
- Runtime source confirms visibility detection exists.
- Patrol-to-preparation-time behavior and High Alert scaling remain open and require dedicated regression tests.

## Related commits or files

- `src/game/humanTick.ts`
- `src/game/frontierCombat.ts`
- `src/game/defenseStructures.ts`
- `src/game/gameTypes.ts`
- `tests/securityRoles.split.test.ts`
- `tests/festival.behavior.test.ts`
- `docs/PRISON_FUNCTION_AUDIT.md`
- `docs/WILDERFOLK_ONE_DOC_TO_FOLLOW.md`
- `BUG_REPORTS/Readme.md`

## Unique ID

`2026-08-22-patrol-enemy-detection-missing`

## Audit change references

- Change 1: preserve/complete Soldier patrol detection.
- Change 2: add High Alert patrol scaling.
- Change 3: connect patrol discovery to raid preparation timing.

## Practical advice

Do not mark this report resolved merely because raiders become visible. Resolution requires proof that the agreed player-facing response benefit and High Alert behavior work through the authoritative raid path without duplicate alerts or unbounded realtime scans.

## Sources

- `src/game/humanTick.ts`
- `src/game/frontierCombat.ts`
- `src/game/gameTypes.ts`
- `BUG_REPORTS/Readme.md`
- Updated `Festivals en venues` PDF

## Verification note

The 2026-08-22 focused related test run passed 7 files and 28 tests, but it did not prove patrol preparation timing or High Alert scaling.

## End

This report remains open until the agreed patrol contract is implemented and verified.

## Owner decision

The security/patrol owner must decide whether the documented extra preparation days are a true simulation effect or should be removed from the design document. The code and document must not claim different behavior.

## Related unique IDs

- `2026-08-22-prison-guard-occupant-fallback-missing`
- `2026-08-22-festival-override-extends-innkeeper-work`

## Review date

2026-08-22

## Report integrity

This report preserves the original unique filename ID and updates only its observed behavior and verification state.

## End of report

