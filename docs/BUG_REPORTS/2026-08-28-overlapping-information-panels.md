# Bug: Information panels stack into a cramped gameplay corner

- Status: resolved
- Date discovered: 2026-08-28
- Version/build: Wilderfolk 0.6.4
- Reporter: Developer visual review
- Area: Play | UI
- Owner module: `useGameShellState.ts`, `GamePlayLayout.tsx`, `GameBuildRail.tsx`
- Cadence: Not applicable — presentation-only layout

## Status history

- 2026-08-28 — investigating: the live game screenshot showed build, village, tutorial, minimap, zoom controls, and alerts competing for the available play space.
- 2026-08-28 — fixed: focused views are mutually exclusive, map overlays no longer reserve permanent side-column width, and the Village view has an at-a-glance settlement summary.

## Observed behavior

Sidebar tabs allow multiple information panels to remain open simultaneously. Each panel is rendered into one narrow right-side column, while the build catalogue permanently consumes space on the left. On a normal desktop view, information becomes vertically compressed and difficult to scan.

## Expected behavior

Opening an information category presents one clear, labelled, closable view. Opening another category replaces the previous information view. The build catalogue overlays rather than shrinks the map and does not remain open beside an information view.

## Reproduction steps

1. Start a game at desktop width.
2. Open two or more of Village, Frontier, Nature, Progress, Log, or More.
3. Open the build catalogue.
4. Observe stacked right-panel sections and reduced map space.

## Evidence

Developer-provided screenshot `screen3.JPG`, reviewed 2026-08-28.

## Root cause

`useGameShellState` stores open sidebar tabs as an unconstrained set, while `App.tsx` renders every selected tab in one scrollable narrow sidebar and the layout reserves both side panels in the main flex row.

## Fix

Use a single-active information view, move opened panels into a right overlay drawer, and move the build catalogue into a left overlay drawer. Keep selection inspection and menu navigation available, but prevent independent information panels from stacking.

## Regression test

Manual UI check: open each view, switch directly between views, close the active view, open and close build, select an object, and verify the map does not shrink under open drawers.

## Invariants checked

Not applicable — contained presentation-only defect. The UI continues to send typed commands and does not mutate authoritative simulation state.

## Save/migration impact

Not applicable — presentation-only local shell state.

## Verification result

Focused sidebar-state regression tests pass (3 tests). TypeScript checking, linting, and the production build pass. The attempted remote browser preview timed out because the connected desktop development server is not routable from the sandbox browser; implementation was based on the supplied live screenshots and source-level layout validation.

## Related files

- `src/hooks/useGameShellState.ts`
- `src/components/GamePlayLayout.tsx`
- `src/components/GameBuildRail.tsx`
- `src/App.tsx`
- `src/App.css`
