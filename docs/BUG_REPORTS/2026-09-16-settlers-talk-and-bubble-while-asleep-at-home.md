# Settlers kept talking — and drawing a speech bubble — while they were asleep at home

- **Bug:** a settler who had gone home for the night could still start (and keep) ambient chatter, so a speech bubble hovered over somebody in bed — and in a large village that is the single loudest source of on-screen noise
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** reported from play by the owner ("i notice they also talk when they sleep ... keep the mouth shut lol and also can disappear for the time")
- **Area:** Truth (simulation state) with a UI consequence (the bubble)
- **Owner module:** `src/game/humanSchedule.ts` (the at-home/asleep rule), `src/game/humanTick.ts` (ambient chatter gate), `src/game/humanChat.ts` (ending an ambient chat), `src/game/renderer/humans.ts` (sleeper cull)
- **Cadence:** per tick, inside `tickHumans`; the ambient roll is a `SOCIAL_STAGGER`-aligned per-tick roll

## Status history

- 2026-09-16 — open (reported from play: talking while sleeping)
- 2026-09-16 — investigating (code review found no `sleeping`/`sleep` entity flag; the observable is *at home during the night*. The ambient roll at `humanTick.ts` gated on activity/faction/`chatTicks`/stagger but never on being home, and it even fed `night: prefersHomeTonightFor(...)` into the picker, which pushes `'home'`/`'sleep'` lines into the pool — so night-time sleep-talk was the picker's *preferred* outcome)
- 2026-09-16 — resolved (one shared predicate in the schedule owner gates chatter and hides sleepers; regression test added; suite, long-run gate and browser tier green)

## Observed behavior

Settlers who were at home during the night spoke, and the speech bubble was drawn over them indoors. The owner also noted the obvious follow-up: they are not doing anything on screen, so they can be hidden for the duration.

## Expected behavior

A settler who is at home during the night is asleep: they keep their mouth shut, and since they are indoors they are not drawn at all for that period. Everybody else — tavern keepers, night-shift workers, visitors, settlers still walking home, and anyone the player has selected — is unaffected: awake settlers still chat, and a scripted dialogue session is never cut.

## Reproduction steps

1. Start a colony, build a House, let settlers move in.
2. Advance to night (20:00–06:00) and watch the houses: settlers that have gone home still show speech bubbles.
3. Deterministic reproduction (the regression test): at a night tick whose ambient roll passes, the same settler speaks at `(700, 600)` and stays silent at the residence at `(120, 120)`.

## Evidence

- `humanTick.ts` — the ambient roll requires `active && isPlayerHuman && !faction && chatTicks <= 0 && (tick + id) % SOCIAL_STAGGER === 0`; there is no home/sleep check.
- `humanTick.ts` (same call) — `night: prefersHomeTonightFor(workSchedule, entity.id, state.tick, hourOfDay)`.
- `humanChat.ts` — `if (extra?.night) pool.push('home', 'sleep', 'sleep');` so at night the picker *prefers* sleep/home lines: the bubble over a sleeping settler was the designed-in outcome, not a stray line.
- `humanSchedule.ts` — `shouldBeAtHomeFor` ("true at night, before the configured shift start, or from the configured shift end onward") owns the at-home window; `isNightHour` is 20:00–06:00 (`NIGHT_START`/`NIGHT_END`).
- `residencyOccupancy.ts:48` — `isNearResidence(human, buildings, maxDist = 55)` owns the proximity rule.
- `socialLife.ts:152,169,187,196,230` sets `stayHome` for rest motives and `humanLeisureBehavior.ts:106-112` commutes a stay-home settler to `residenceBuildingId`, which is what puts them near the house at night.
- `humanNeeds.ts:147-164` already treats "near home during a resting period" as resting for energy, i.e. the same real-world state the player describes as sleeping.
- Reproduction before the fix: the regression test's control case (settler away from home) starts a chat on the very tick the at-home case must stay silent; before the gate both spoke.

## Root cause

The simulation has no `sleeping` flag: "asleep" is an emergent state (the night routine has walked the settler to their residence). The ambient-chatter roll never consulted that state, and the dialogue picker actively biased toward sleep/home lines at night, so a resting settler kept producing bubbles until `chatTicks` ran out — a line lasts `DIALOGUE_LINE_BASE_HOURS` (2.5) plus 0.08 h per character, i.e. hours of in-game time.

## Regression test

`tests/humanChat.sleepAtHome.test.ts` (6 tests):
- `isAsleepAtHome` — true only for a resident near their house at 20:00/05:00, false at 06:00, in daylight, when away, without a residence, and for an unfinished house;
- `endAmbientHumanChat` — ends an ordinary chat and its pair link, never cuts a scripted dialogue session, no-ops on a silent settler;
- tick level — on a night tick whose ambient roll passes, a settler at home stays silent while the same settler away from home speaks (the control that pins the gate as the cause);
- tick level — a chat already running when the settler is home for the night is stopped.

## Invariants checked

`npm run test:full-year` — 360 days / 25,920 ticks on seed 12345 completes with its invariant assertions satisfied; the change only suppresses presentation-state chatter, so pregnancy/relationship/leadership/economy invariants are untouched. `npm run audit:deps:cycles` — no circular dependencies after the new `humanSchedule → residencyOccupancy` edge.

## Save/migration impact

None. No field, key, format or migration changed: the predicate is derived from `residenceBuildingId`, building geometry, tick and the existing hour. A settler's chat state is transient by design and is not persisted.

## Verification result

- `npx vitest run tests/humanChat.sleepAtHome.test.ts` — passed (6 tests).
- `npm test` — passed: 146 files / 810 tests, 0 failures.
- `npm run test:full-year` — passed (exit 0, 360 days / 25,920 ticks, invariants satisfied).
- `npm run build`, `npm run test:types`, `npm run lint` — passed (0 warnings / 0 errors on 321 files).
- `npm run test:browser` — passed (verdict pass, 0 console errors, 0 page exceptions, 0 bad responses).

## Related commits or files

- `src/game/humanSchedule.ts` — new `isAsleepAtHome` (night window + residence proximity)
- `src/game/humanTick.ts` — ambient roll gated on `!isAsleepAtHome`; an in-progress ambient chat is ended when they turn in
- `src/game/humanChat.ts` — new `endAmbientHumanChat` (dialogue sessions exempt)
- `src/game/renderer/humans.ts` — sleeper cull (selected settlers stay visible)
- `tests/humanChat.sleepAtHome.test.ts` — new

## Fix

`isAsleepAtHome(human, buildings, hour)` = `isNightHour(hour) && isNearResidence(human, buildings)` lives in the schedule owner, composed from the two existing rules. `humanTick` now computes it once per settler: an asleep settler is not eligible for the ambient roll and has any running *ambient* chat ended (`endAmbientHumanChat` leaves `chatDialogueSessionKey` alone). `renderer/humans.ts` skips drawing an asleep settler — body, shadow and bubble — unless the player has them selected. The nightly crowd therefore leaves the map instead of milling about, which is also the first slice of the readability work for 200+ citizen colonies.
