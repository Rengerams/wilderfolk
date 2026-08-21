# Diagnostics and FPS Enhancement — v0.6.2.2

**Datum:** 2026-08-21  
**Status:** Implemented and validated

## Relationship diagnostics

`relationshipDiagnostics.ts` now preserves the existing interval-counter truth model and adds active-state counts for marriages, courtship pairs, youth-love pairs, affairs, and pregnancies. Active pairs are counted once by lower entity id, while interval counters continue to reset at the daily flush. A bounded history of the latest 30 snapshots is available through read-only accessors for future inspector tooling. The daily human tick supplies the summary from authoritative living player humans; diagnostics do not mutate gameplay state.

## Housing diagnostics

`housingDiagnostics.ts` provides a pure read-only report over completed player residences. It reports total, occupied and open beds, residence count, player-house capacity, reserved Leader House capacity, unassigned player humans, orphaned residence references, occupant-list mismatches, over-capacity residences, and a pressure classification. `isHousingDiagnosticsHealthy` reports only invariant-level reference problems; it does not repair or assign residents. The Village panel exposes these values in a collapsible Housing Diagnostics section.

## FPS presentation option

Settings now includes a persisted **Show FPS** toggle. When enabled, `useFpsMeter` samples browser `requestAnimationFrame` timing and the current estimate appears in the lower-right corner of the map. When disabled, the hook is inactive and the overlay is hidden. This is presentation-only and does not enter `WorldState`, worker commands, simulation cadence, or saves.

## Validation

The relationship diagnostics suite passed with **8 tests** and the housing diagnostics suite adds **3 tests**. TypeScript test compilation, production build, ESLint, and `git diff --check` passed. The existing Vite circular chunk warning (`game-render → game → game-render`) and large-chunk warning remain unchanged.

## Files

- `src/game/relationshipDiagnostics.ts`
- `src/game/humanTick.ts`
- `src/game/housingDiagnostics.ts`
- `src/components/tabPanels/VillageTabPanel.tsx`
- `src/game/preferences.ts`
- `src/hooks/useFpsMeter.ts`
- `src/components/GameMenu.tsx`
- `src/components/GameHeader.tsx`
- `src/App.tsx`
- `tests/housingDiagnostics.test.ts`
