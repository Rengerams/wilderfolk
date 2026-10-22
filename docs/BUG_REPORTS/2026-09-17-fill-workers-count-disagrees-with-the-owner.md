# "Fill workers (N)" counted settlers the staffing owner would refuse

- Bug: the bulk-fill button printed a count computed in `App.tsx` from a local restatement of the eligibility rule — idle adults without a workplace — while the assignment itself uses `buildingStaffingActions.isEligibleIdleWorker`, which also excludes pregnant, imprisoned and construction-crew settlers; the button only renders when the owner lists *no* assignable worker, so the number promised workers that could not be assigned
- Status: resolved
- Date discovered: 2026-09-16 (UI-logic audit, finding F7)
- Date resolved: 2026-09-17
- Version/build: 0.6.4
- Reporter: UI-logic audit (`docs/private/audits/2026-09-16/ui-logic.md` F7), verified against the tree 2026-09-17
- Area: UI (single-source-of-truth: the count)
- Owner module: `src/game/buildingStaffingActions.ts` (`isEligibleIdleWorker`)
- Cadence: player-command (panel render)

## Status history

- 2026-09-16 — open (found by the UI-logic audit pass; never filed as a report)
- 2026-09-17 — resolved (the duplicate count was removed from the panel and from `App.tsx`)

## Observed behavior

`App.tsx` computed the label's number with its own predicates:

```ts
return humans.filter(
  (human) => !human.isJuvenile && human.homeBuildingId == null && !human.faction,
).length;
```

The assignment path uses the owner's rule:

```ts
function isEligibleIdleWorker(entity: Entity, state: WorldState): boolean {
  return (isPlayerHuman(entity) && entity.alive && !entity.isJuvenile && !entity.pregnant
    && !hasWorkAssignment(entity) && !isImprisoned(entity) && !isOnConstructionCrew(state, entity.id));
}
```

The App copy omitted `!pregnant`, `!isImprisoned` and `!isOnConstructionCrew`, and its
construction branch additionally omitted `!hasWorkAssignment`. `SelectedBuildingPanel` renders
the count only in the branch where the owner's `listAssignableWorkersForBuilding` returned an
empty list, so the label read "Fill workers (3)" precisely when three settlers existed that the
owner would not assign — the player clicked, fewer settlers were assigned than promised, or
none, with only a "No idle workers!" floating text on the map.

## Expected behavior

The number on the button and the set the assignment uses are the same rule, or the button shows
no number.

## Reproduction steps

1. Have a colony where the only unemployed settlers without a workplace are pregnant, imprisoned, or on a construction crew.
2. Select a completed job building with a free slot.
3. **Before the fix:** the button reads "+ Fill workers (N)" with N > 0; clicking assigns fewer or nobody.
4. **After the fix:** the button reads "+ Fill workers" and promises nothing the owner will not do.

## Evidence

Static trace of the three definitions — `App.tsx`'s counter, `buildingStaffingActions.isEligibleIdleWorker`, and the panel's branch guards — plus `listAssignableWorkersForBuilding`, which wraps the owner rule and returns `[]` in exactly the branch that renders the count.

## Root cause

A restated rule: the number was recomputed locally instead of asked of the owner. The fix removes
the restatement rather than re-deriving it, because within the only branch that renders the
count the owner-derived value is *structurally* zero — the branch is guarded by
`assignableWorkers.length === 0`. Any number there is therefore a promise the owner contradicts.
Removing the count also removes `selectedBuildingIdleWorkerCount`, `idleWorkers` and the prop that
carried it (which `knip` would otherwise see as a dead prop), leaving one definition of who may
be assigned. The alternative — exporting `isEligibleIdleWorker` and counting with it — was
rejected because it would render "Fill workers (0)".

## Regression test

None added, and this is a deliberate gap rather than an oversight. The observable behaviour is a
button label in a DOM the standard tier cannot mount (`vitest.config.ts` is
`environment: 'node'`), and the interesting half — "does the label agree with the owner?" — is now
true by construction, since the label no longer contains a number at all. Asserting the absence of
a string in a JSX file would be choreography, not behaviour. `tests/medium-B1-staffing.test.ts`
already pins the owner's own eligibility rule, which is the rule the assignment uses.

## Invariants checked

- `idleWorkers` had exactly one consumer (the label) and `selectedBuildingIdleWorkerCount` exactly
  one consumer (`idleWorkers`), so nothing else lost a value.
- `resolveBuilding` is still used by `App.tsx` for the selected building; only the now-unused
  `resolveAliveHumans` import was removed.
- The button's visibility, its `onAssign` handler and `canAssignWorker` are untouched.

## Adjacent defect observed, not fixed (out of scope)

`canAssignWorkerToBuilding`'s completed-building branch also returns true when
`findOverstaffedDonorBuilding` matches but no eligible idle worker exists
(`buildingStaffingActions.ts:343-346`). In that state the bulk button still renders and its
`assignWorker` command finds nobody to assign — the same false-promise shape as the 2026-09-13
M4/L7 findings, which fixed only the unfinished-building branch. It is a distinct defect from
this one and was left alone.

## Save/migration impact

None.

## Verification result

- `npx tsc -p tsconfig.app.json --noEmit` — passed (no output), including the prop removal.
- `npm run lint` — 0 warnings / 0 errors.
- `npm run test:all` — passed, see the batch summary in `SUMMARY.md`.
- Not verified in a browser (no DOM tier): the button was not clicked in a live colony.

## Related commits or files

- `src/components/SelectedBuildingPanel.tsx` — the label and the removed `idleWorkers` prop
- `src/App.tsx` — the removed counter and prop, and the removed import
- `src/game/buildingStaffingActions.ts` — the owner rule
- `docs/private/audits/2026-09-16/ui-logic.md` — finding F7

## Fix

The label is `+ {!building.completed ? 'Fill builders' : 'Fill workers'}` with a comment recording
why it carries no count; `idleWorkers`, the `selectedBuildingIdleWorkerCount` memo and the
`resolveAliveHumans` import are gone.
