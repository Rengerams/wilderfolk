# Bug: Performer revelry can shorten an already longer festival

- Status: resolved — focused validation passed; full suite green 2026-08-25 (85 files / 464 tests)
- Date discovered: 2026-08-22
- Version/build: Wilderfolk v0.6.3 unreleased
- Reporter: v0.6.3 Festivals and Venues Implementation Audit
- Area: Play | Truth
- Owner module: `src/game/groupEvents.ts`, daily festival lifecycle
- Cadence: Visitor performer revelry event

## Status history

- 2026-08-22 — open (source audit found the visitor extension can reduce remaining festival days)
- 2026-08-23 — resolved with focused validation: retained the existing 14-day visitor-revelry cap while preserving any already-larger remaining festival duration.

## Observed behavior

When performers resolve revelry while a festival is already active, `groupEvents.ts` applies `state.festival.daysLeft = Math.min(14, state.festival.daysLeft + 2)`. If the active festival has more than 14 days remaining, this reduces its duration instead of extending it. For example, 30 days remaining becomes 14 days.

## Expected behavior

A visitor revelry bonus must not shorten an active festival. It should preserve the existing remaining duration and apply the approved extension/cap policy.

## Reproduction steps

1. Start a random or other festival with more than 14 days remaining.
2. Activate a performers group.
3. Resolve the performer revelry event.
4. Inspect `state.festival.daysLeft` before and after the event.
5. Observe the remaining duration can decrease to 14 days.

## Evidence

- `src/game/groupEvents.ts` around the performer revelry transition.
- v0.6.3 Festivals and Venues Implementation Audit, P1 finding: performer revelry can shorten an active festival.

## Root cause

The cap is applied as an absolute maximum without first preserving the existing duration. The code assumes the active festival is always shorter than the cap.

## Fix

Retained the existing 14-day visitor-revelry cap for ordinary revelry extensions. When a festival already has more than 14 days remaining from another source, performer revelry now preserves that greater remaining duration rather than reducing it. This avoids choosing a new balance number while enforcing the monotonic positive-effect invariant.

## Regression test

`tests/festival.behavior.test.ts` exercises `talkToVisitorLeader()` directly. It proves performer revelry preserves a 30-day active festival and still extends a 13-day festival to the existing 14-day cap.

## Invariants checked

- Festival duration never decreases because of a positive revelry extension.
- Only the approved lifecycle owner changes `daysLeft`.
- Festival expiry remains daily-layer owned.
- Visitor events do not create a second festival state.

## Save/migration impact

No save schema change is expected. Verify malformed/legacy `daysLeft` before applying arithmetic.

## Verification result

Focused Festival/Tavern/venue/fatigue coverage passed after source-tree shadow artifacts were removed: **4 files / 18 tests**. TypeScript, ESLint for `src`, `tests`, and `scripts`, production build, and source-integrity guard passed. The full Vitest suite was started but did not complete after three bounded waits while repeatedly printing relationship diagnostics; it was stopped without a final pass/fail result. Full-suite completion remains pending.

## Simulation Change Record

- **Owner module:** `src/game/groupEvents.ts` remains the sole performer-revelry transition owner; daily expiry remains in the existing daily lifecycle owner.
- **Decision changed:** Positive performer revelry must never reduce `festival.daysLeft`.
- **Cadence:** Existing player visitor-leader action only; no new cadence or tick layer.
- **State fields written:** Existing `festival.daysLeft`, reputation, and ordinary event-feedback fields only.
- **Player-visible behavior before:** Toasting performers could cut a longer festival down to 14 days.
- **Player-visible behavior after:** A longer festival remains long; a shorter festival still receives the existing bounded revelry extension.
- **Performance impact:** Constant-time arithmetic only.
- **Save/migration impact:** None. Malformed/legacy festival normalization remains F3.
- **Rollback plan:** Restore the old capped assignment; no data migration required.

## Related commits or files

- `src/game/groupEvents.ts`
- `src/game/tickLayerDaily.ts`
- Festival tests
- `docs/PRISON_FUNCTION_AUDIT.md`
- `BUG_REPORTS/Readme.md`

## Unique ID

`2026-08-22-performer-revelry-shortens-active-festival`

## Audit change references

- Change 14: named festival lifecycle/policy selectors.
- Change 15: complete festival behavior matrix.

## Practical advice

Do not silently pick a new cap during the bug fix. Record the cap as a design decision, then test the monotonic-duration invariant separately from festival balance tuning.

