# Armed "Confirm demolish" survives a building switch, so one click destroys a building the player never armed

- Bug: `SelectedBuildingPanel` keeps its demolish-arm state across selections; returning to an armed building shows the destructive confirm panel with no intervening click
- Status: resolved
- Date discovered: 2026-09-16 (UI-logic audit, finding F8)
- Date resolved: 2026-09-17
- Version/build: 0.6.4
- Reporter: UI-logic audit (`docs/private/audits/2026-09-16/ui-logic.md` F8), verified against the tree 2026-09-17
- Area: UI
- Owner module: `src/components/SelectedBuildingPanel.tsx` (call site: `src/App.tsx`)
- Cadence: player-command

## Status history

- 2026-09-16 — open (found by the UI-logic audit pass; never filed as a report, so it stayed open while the register read "nothing open")
- 2026-09-17 — resolved (the panel is keyed per building; regression guard added)

## Observed behavior

`SelectedBuildingPanel` arms its destructive action in component state and compares the armed id
against the **current** building:

```tsx
// src/components/SelectedBuildingPanel.tsx
const [demolishArmId, setDemolishArmId] = useState<number | null>(null);
const confirmDemolish = demolishArmId === building.id;
…
{confirmDemolish ? ( … '🗑 Confirm demolish' … ) : ( <button onClick={() => setDemolishArmId(building.id)}>🗑 Demolish</button> )}
```

`App.tsx` rendered the panel with no `key`:

```tsx
<SelectedBuildingPanel
  building={selectedBuilding}
  state={world}
```

`selectedBuilding` arrives through the same `selectedBuilding ? (…) : null` branch, at the same
element position, whether the inspected building is A or B. React therefore **reuses the component
instance**, so `demolishArmId` is not reset by the switch — it is merely not compared while another
building is selected.

The in-code comment asserted the opposite and is the reason the defect survived review:

```tsx
// Demolish confirmation is armed for the current building only, so switching
// to another building automatically resets it (no effect required).
```

The same non-remount also defeated `CollapsibleSection`'s per-building
`storageKey={`building-advanced-${building.id}`}`, whose open state is read only at mount, so
"Advanced actions" behaved as shared state across buildings.

## Expected behavior

Switching the inspected building discards any armed destructive action. Destroying a building
requires a deliberate arm on *that* building in the current selection.

## Reproduction steps

1. Select building A and open Advanced actions.
2. Click 🗑 Demolish — the panel now shows "🗑 Confirm demolish" (armed).
3. Without clicking anything in the panel, select building B.
4. Select building A again.
5. **Before the fix:** A already shows "🗑 Confirm demolish" armed. A single click destroys A.
   **After the fix:** A shows the plain 🗑 Demolish button and must be armed again.

## Evidence

Static trace of the three sites (`SelectedBuildingPanel.tsx` arm state and comparison,
`App.tsx` call site without a key, `CollapsibleSection` mount-time read) plus the audit's
independent read. Not reproduced in a browser: this tier has no DOM environment.

## Root cause

State that is scoped to a *building* was stored in state scoped to a *component instance*, and the
instance is reused across buildings. `key={building.id}` makes the two scopes the same thing again —
React unmounts and remounts the panel when the inspected building changes.

An effect keyed on `building.id` would also have worked, but it runs after paint, so the armed
confirm panel would flash for a frame on returning to the armed building. The key removes that
frame *and* fixes the `CollapsibleSection` half of the defect, so it is the smaller correct change.

## Regression test

`tests/selectedBuildingPanel.perBuildingState.test.ts` asserts that `App.tsx` still renders the
panel with `key={selectedBuilding.id}`.

This is a **source guard, not a render test**: `vitest.config.ts` is `environment: 'node'` with
`include: tests/**/*.test.ts`, so there is no DOM to mount into, and React's instance reuse cannot
be observed without one. The guard proves the key is still present; it cannot prove the leak.
That limitation is stated in the test file rather than hidden behind a name that implies rendering.
It follows the same pattern and disclosure as `tests/tradeRoutes.eligibility.test.ts`.

## Invariants checked

- No simulation state is involved; nothing in `src/game/**` is touched.
- The panel is the only call site of `SelectedBuildingPanel` (`src/App.tsx`), so the key cannot be
  bypassed by another renderer.
- `demolishArmId` is the panel's only `useState`, so remounting on a building switch resets nothing
  else the player had chosen inside the panel.

## Save/migration impact

None.

## Verification result

- `npx vitest run tests/selectedBuildingPanel.perBuildingState.test.ts` — passed (1 test).
- `npx tsc -p tsconfig.app.json --noEmit` — passed (no output).
- `npm test` (standard tier) — passed, see the batch summary in `SUMMARY.md`.
- Static trace of the call site and of React's reconciliation branch (same element position, same
  type, no key) confirmed the reuse before the change.

## Related commits or files

- `src/App.tsx` — the `<SelectedBuildingPanel>` call site (key added)
- `src/components/SelectedBuildingPanel.tsx` — arm state, comparison, corrected comment
- `tests/selectedBuildingPanel.perBuildingState.test.ts` — the guard
- `docs/private/audits/2026-09-16/ui-logic.md` — finding F8

## Fix

`src/App.tsx`:

```tsx
<SelectedBuildingPanel
  key={selectedBuilding.id}
  building={selectedBuilding}
  state={world}
```

`src/components/SelectedBuildingPanel.tsx`: the misleading "no effect required" comment now records
that the reset comes from the App-level key and must not be removed.
