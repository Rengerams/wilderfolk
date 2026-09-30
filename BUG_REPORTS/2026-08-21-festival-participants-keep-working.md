# Bug: Festival participants keep ordinary work schedules and do not visibly gather

- Status: resolved
- Date discovered: 2026-08-21
- Version/build: 0.6.1.1
- Reporter: Live player feedback
- Area: Play | Truth | social simulation
- Owner module: `src/game/tickLayerRealtime.ts` through `src/game/humanTick.ts`
- Cadence: realtime movement and schedule selection; festival lifecycle remains daily in `tickLayerDaily.ts`

## Observed behavior

When `state.festival.active` is true, settlers retain their ordinary daytime workplace, guard, school, and innkeeper routing. Festival state currently increases production, immigration, courtship, and tavern hours, but it only influences village-green movement as one low-probability leisure choice after work routing has already won.

## Expected behavior

A festival must create a visible daily communal gathering. During a declared festival gathering window, eligible settlers should leave ordinary workplaces, school, patrol, and free hunting; travel to the festival venue; socialize there; and automatically resume valid normal schedules when the window or festival ends. Critical danger behavior and Moon-Howler priest duty remain higher priority.

## Reproduction steps

1. Start or host a festival.
2. Observe active workers during the weekday work shift.
3. Confirm that villagers continue commuting to work instead of gathering at the Town Hall, performer camp, or village green.

## Evidence

`tickFestivals()` creates and expires festival state in the daily layer. `humanTick.ts` passes festival state to chat hints, affair multipliers, and innkeeper hours, but its normal work branches still route eligible humans to guard patrol, school, tavern duty, and workplaces before the festival/leisure branch is reached.

## Root cause

Festival behavior has no realtime participant-schedule transition. The current village-green target exists only as `leisureKind === 7`, a random idle choice available after ordinary job scheduling.

## Fix

Festival creation, duration, rewards, and expiry remain owned by `tickLayerDaily.ts`. The existing realtime human owner now reads that authoritative festival state through `isFestivalGatheringHour()` in `dayCycle.ts`.

From **15:00 through 21:59** on an active festival day, non-innkeeper settlers leave ordinary work, guard patrol, school, home-stay, commute snapping, and free hunting. They move to a performer camp when present, otherwise to a staffed Town Hall, otherwise to the village center. Once nearby they drift, chat, and visibly form a crowd. Moon Howler fear and priest duty, as well as election ceremony movement, remain higher priority. Innkeepers continue operating the festival tavern.

The repair does not mutate assignments, building occupants, jobs, festival state, or production state. The normal schedule automatically resumes at 22:00 or when the daily owner expires the festival.

## Regression test

- `tests/dayCycle.tavern.test.ts` pins the 15:00–21:59 active-festival gathering window and preserves the existing innkeeper festival shift contract.
- `tests/festival.behavior.test.ts` runs the real `gameTick()` at 15:00 and proves a weekday farmer moves away from the farm toward the staffed Town Hall during an active festival, while `homeBuildingId` and workplace occupants remain unchanged.
- `tests/humanMovement.test.ts` remains green to preserve the consolidated movement owner contract.

## Invariants checked

- The daily layer remains the sole festival lifecycle owner.
- The realtime layer only consumes existing festival state to set movement vectors.
- Workforce assignments, `homeBuildingId`, jobs, and building occupants remain unchanged.
- Moon Howler fear, priest duty, and election ceremony retain higher movement priority.
- Festival end restores ordinary work automatically because no persistent work-suspension field is written.

## Save/migration impact

None. No world-state schema or persistent festival field changed.

## Verification result

- Focused festival/movement tests: **3 files / 9 tests passed**.
- Focused ESLint: passed for `dayCycle.ts`, `humanTick.ts`, and both festival tests.
- TypeScript: `npm run test:types` passed.
- Full suite: **52 test files / 341 tests passed**.
- Production build: passed; existing circular `game-render → game → game-render` and large-chunk warnings remain.
- Project-wide `npm run lint`: blocked by **38 pre-existing errors under `skills/`**, outside the festival files. Focused lint on every changed festival file passed.

## Simulation Change Record

- Owner module: `tickLayerRealtime.ts` through `humanTick.ts`; daily festival lifecycle remains `tickLayerDaily.ts`.
- Decision changed: whether a normal eligible settler follows ordinary work or a festival gathering target.
- Cadence: realtime movement; calendar window derived by `dayCycle.ts`.
- State fields written: existing entity velocity and sprite angle only.
- Why the change is needed: festivals previously advertised revelry but left workers on ordinary jobs, making the event visually and behaviorally empty.
- Player-visible behavior before: festivals changed multipliers and tavern hours but villagers kept working.
- Player-visible behavior after: the village visibly gathers from 15:00 through 21:59; innkeepers keep the festival tavern open; normal work returns afterward.
- Performance impact: constant-time per-human time/window check; no new global scan or spatial query.
- New or updated tests: `tests/festival.behavior.test.ts`; `tests/dayCycle.tavern.test.ts`.
- Invariants checked: listed above.
- Save/migration impact: none.
- Rollback plan: remove the realtime `festivalGathering` routing branch and its shared clock helper; no migration is needed.

## Status history

- 2026-08-21 — reported from a live playtest; investigation confirmed festival state affected multipliers and optional leisure only, not work scheduling.
- 2026-08-21 — fixed with a bounded realtime gathering window in the existing human movement owner.
- 2026-08-21 — verified by focused tests, ESLint, TypeScript, and the full 52-file regression suite.

## Related files

- `src/game/tickLayerDaily.ts`
- `src/game/humanTick.ts`
- `src/game/dayCycle.ts`
- `tests/dayCycle.tavern.test.ts`
- `tests/festival.behavior.test.ts`
