# Contextual tips never fire: the detector compared the world against itself

- Bug: `useContextualTutorial` held the live `WorldState` as "the previous world", so `detectContextualTutorials(prev, curr)` compared one object with itself and every transition check was false — no transition-based tutorial tip could ever appear
- Status: resolved
- Date discovered: 2026-09-16 (UI-logic audit, finding F1)
- Date resolved: 2026-09-17
- Version/build: 0.6.4
- Reporter: UI-logic audit (`docs/private/audits/2026-09-16/ui-logic.md` F1), verified against the tree 2026-09-17
- Area: UI
- Owner module: `src/game/contextualTutorial.ts` (consumer: `src/hooks/useContextualTutorial.ts`)
- Cadence: presentation (per React commit)

## Status history

- 2026-09-16 — open (found by the UI-logic audit pass; never filed as a report, so it stayed open while the register read "nothing open")
- 2026-09-17 — resolved (detection is now a function of the current state alone; the "has happened" derivation is shared with the load path and pinned by tests)

## Observed behavior

The hook kept the world object it was handed:

```ts
const prevRef = useRef<WorldState | null>(null);
…
const discovered = detectContextualTutorials(prevRef.current!, world);
…
prevRef.current = world;
```

The game loop mutates **one** `WorldState` in place: `GameLoop.frame` calls
`gameTick(this.world, focus)` on the main thread (`gameLoop.ts:891`) and in worker mode the
host applies each tick delta into its single `worldRef` and hands that same object back.
`useVirtualPlayer.ts:110-115` documents exactly this — "the game loop mutates one
`WorldState` in place … so `world` keeps the same identity across ticks". Therefore
`prevRef.current === world`, and `detectContextualTutorials(prev, curr)` received the same
object twice.

Every transition check in the detector is then false by construction —
`currCompleted > prevCompleted`, `staffedBuildings(prev) === 0 && … > 0`,
`prev.visitorGroups.length === 0 && …`, `prev.season !== Winter && …`,
`!prev.activeResearch && …`, `currResearched > prevResearched`, the newly-ready trade
route, `!prevCursed && currCursed`, the low-food crossing,
`prev.ecosystemHealth >= 30 && … < 30`, the valley-stage change, `newBirth`. The only
surviving tip was the day-one `shelter_night` check, which reads the current state only.

The inverse also happened: because a **load** or a new game replaced the world object,
`prevRef` could briefly hold a genuinely different world, so a load could fire a burst of
irrelevant tips (loading a winter save mid-summer yielded "first winter").

## Expected behavior

A tip appears once, the first time its mechanic becomes true in the current world, and
never replays for a mechanic the player has already been told about or a fact that was
already true when the world was handed to them.

## Reproduction steps

1. Start a new game and play past the day-one shelter window.
2. Complete a building, assign the first worker, reach winter, start and finish research, open a trade route, or have a first child.
3. **Before the fix:** none of those tips appears — only the day-one `shelter_night` tip can ever show.
4. **After the fix:** each tip appears once, when the mechanic happens.

## Evidence

`tests/contextualTutorial.detection.test.ts` mutates a world in place — exactly as the game
loop does — and requires the tip to be reported. Static trace of the hook, the detector and
both world-advance paths (`gameLoop.ts:891` main thread, the worker host's `worldRef`).

## Root cause

Edge detection was implemented by holding a *reference* to the previous world, but the state
it needed to compare is mutated in place — so "previous" was never a previous value. The
engine already records what has happened: `seedTutorialSeenForExistingState` marks every
mechanic already true when a save loads (called from `saveLoad.restoreWorldMapFromSave`), and
`App.acknowledgeContextualTip` writes every shown tip back into `tutorialSeen`. "Already
happened and not yet told" is therefore fully expressed by the current state plus
`tutorialSeen`, and no previous world is needed.

## Regression test

`tests/contextualTutorial.detection.test.ts` (3 tests):

- a mechanic that becomes true while the world object is mutated in place is reported
  (`first_winter`, `valley_strained`);
- a mechanic already in `tutorialSeen` is suppressed;
- after `seedTutorialSeenForExistingState`, live detection returns nothing but the day-one
  shelter nudge — the invariant that every emitted id has a matching condition in the shared
  derivation, so a tip added without one fails the test.

Fail-before note, stated exactly: the previous implementation had no one-argument form, so
this test could not even call it; called the only way it could be called (with the single
world it had, `prev === curr`) every assertion above fails. A red run against the old code
was not performed because the API changed with the fix.

## Invariants checked

- Detection no longer depends on object identity anywhere.
- One definition of "this has happened": the detector consumes
  `seedTutorialSeenForExistingState`, the same function the load path uses.
- A new game and a loaded save both seed that derivation
  (`App.tsx` initial world and `beginNewGameSession`, `saveLoad.restoreWorldMapFromSave`), so
  pre-existing facts (a fresh colony already has `mining_1` researched) are never reported as
  news.
- Dismissal still marks the id in localStorage and in `tutorialSeen`, and the card
  auto-acknowledges after 20 s, so a curr-only detector cannot re-queue a tip in a loop.

## Save/migration impact

`world.tutorialSeen` is already a persisted field (`saveSchema.ts`) and is now written on new
games as well as on load. Save format unchanged; no migration needed. An existing save that
loads with an empty `tutorialSeen` gets the standard load-time seeding, so it cannot receive
a burst of stale tips.

## Verification result

- `npx vitest run tests/contextualTutorial.detection.test.ts` — passed (3 tests).
- `npx tsc -p tsconfig.app.json --noEmit` — passed (no output).
- `npm run audit:deps:cycles:strict` — no runtime import cycles (323 modules); the single
  reported type-only cycle is the pre-existing `WorldState`/grid one.
- `npm run test:all` — passed, see the batch summary in `SUMMARY.md`.
- The previous behaviour was confirmed by reading both world-advance paths, not by a browser
  run: this tier has no DOM, so a live tip card could not be observed.

## Related commits or files

- `src/game/contextualTutorial.ts` — the detector, and the shared derivation
- `src/hooks/useContextualTutorial.ts` — the consumer that held the previous world
- `src/App.tsx` — seeds history for a new world and for a new game session
- `src/game/saveLoad.ts:582` — the load-time seeding this now shares
- `tests/contextualTutorial.detection.test.ts` — the guard
- `docs/private/audits/2026-09-16/ui-logic.md` — finding F1

## Fix

`detectContextualTutorials(state)` takes the current world only. The ~110 lines of per-tip
transition comparisons are replaced by one derivation shared with the load path:

```ts
const happened = new Set<string>(seedTutorialSeenForExistingState(state));
for (const id of FIRST_TIME_TUTORIAL_IDS) {
  if (happened.has(id)) queue(id);
}
```

`valley_strained` was the one id the shared derivation did not cover, so it was added to it —
that is what the third regression test pins. `prevRef`/`seededRef` are gone from the hook.
