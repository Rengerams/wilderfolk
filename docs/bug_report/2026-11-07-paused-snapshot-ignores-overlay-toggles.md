# Paused view ignored the logistics overlay and juice toggles

- Bug: The render snapshots cache key omitted the F4 logistics overlay and the juice-effects preference, so toggling either while paused changed nothing until the next tick.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit (A6 render cache, GFX-02/GFX-03)
- Reporter: full-audit codebase review
- Area: renderer / snapshot identity
- Owner module: `src/game/renderSnapshot.ts` (`renderSnapshotDirtyKey`)
- Related PR/commit: d2b85e44

## Status history
- 2026-11-07 — open: audit found both preferences read by the snapshot but absent from its key.
- 2026-11-07 — resolved: the key carries both, so a paused view rebuilds when either changes.

## Observed behavior
The snapshot key was a hand-enumerated string of world and view fields. `showLogistics` was missing, and so was the persisted juice-effects preference. A paused world does not advance its tick, so the key stayed equal and the renderer reused the previous snapshot: the overlay toggle and the reduced-effects preference produced no visible change until the player unpaused.

## Expected behavior
Every input the snapshot reads appears in its identity; a preference change alone rebuilds the snapshot even while paused.

## Reproduction steps
1. Load a colony and pause.
2. Press F4 to toggle the logistics overlay.
3. Observe the overlay is unchanged; unpause and observe it appear.

## Evidence
- `src/game/renderSnapshot.ts` — `renderSnapshotDirtyKey` now includes `view.showLogistics` and `loadJuiceEffectsEnabled()`.
- `tests/renderSnapshot.dirtyKey.test.ts` — the two paused-world cases assert the key differs for each toggle.

## Root cause
Hand-maintained cache key drifted from the fields the snapshot reads.

## Fix / proposed fix
Add both preferences to the enumerated key. The plan's typed key object remains a follow-up; the enumerated form is kept because it is the existing contract.

## Save/migration impact
None — the juice preference serialization is unchanged.

## Verification result
- `npx vitest run tests/renderSnapshot.dirtyKey.test.ts` — PASS (2/2).
- `npm run test:types` — PASS; `npm run lint` — PASS.
- Paused overlay pixel check (76 → 122 → 76 overlay pixels) recorded in the audit ledger; not re-run in this documentation pass.
