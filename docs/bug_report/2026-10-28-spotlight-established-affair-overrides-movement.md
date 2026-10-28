# Established affair movement steals spotlight gathering velocity

- Bug: an actor with an established mutual affair can abandon a spotlight slot because a later independent tryst movement branch overwrites the gathering vector.
- Status: resolved in code; CI verification pending
- Severity: medium (P2)
- Date discovered: 2026-10-28
- Version/build: 0.6.5.2 development, PR #91
- Reporter: Codex inline review #4401703334
- Area: human movement / spotlight lore
- Owner module: `src/game/humanTick.ts`
- Related PR: https://github.com/Rengerams/wilderfolk/pull/91

## Status history
- 2026-10-28 — investigating: reviewer traced the independent established-affair block in `humanTick.ts`, after the spotlight target velocity assignment.
- 2026-10-28 — resolved in code: the established-affair movement branch excludes `inSpotlightGathering`, consistent with the already guarded new-affair branch.

## Observed behavior
A chorus performer who has a mutual `affairPartnerId` and a distant lover can satisfy `canPursueSecretAffair` at 16:00. The existing established-affair branch then sets `vx/vy` toward their tryst site after the spotlight movement rule has set `vx/vy` toward the gathering. The scene can time out, consuming its cooldown without a performance.

## Expected behavior
Actors selected for the scene keep steering toward their assigned spotlight slots throughout the gathering, unless a higher-priority emergency interrupts the event. Outside the scene, established relationships and their normal tryst movement remain unchanged.

## Reproduction steps
1. Build a weekend 16:00 active spotlight scene with an adult performer at x ≈ 500 whose slot is x ≈ 425.
2. Establish a mutual affair between that performer and a lover at x ≈ 720 with no spouse nearby; verify `canPursueSecretAffair` is true.
3. Advance one real `gameTick`. Previously the later tryst branch redirected the performer to the right; after the fix the actor moves left toward their spotlight slot.

## Evidence
Codex inline thread #4401703334. Independently verified `humanTick.ts` branches: new-affair movement had a spotlight exclusion, established-affair movement did not. `tests/spotlightLore.test.ts` contains the real-tick regression.

## Root cause
An independent established-affair path lacked the actor-specific exclusion already used by the other ordinary home, job and new-affair decisions.

## Fix / proposed fix
Add `!inSpotlightGathering` to the established-affair steering branch. Do not disable the actual relationship model, alter the tryst target owner, rewrite velocities elsewhere, or affect nonparticipants. Remove an accidentally duplicated equivalent guard in the idle-stamina condition.

## Save/migration impact
None; no new saved state or migration.

## Verification result
- Source-level code fix and real-tick regression: committed on PR #91.
- CI targeted/full test: pending confirmation.
- In-game browser confirmation: NOT RUN.
