# Returning army shows stale battle instructions

- Bug: Returning armies retain obsolete encounter instructions in the banner, focus hints and priority alerts.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-23
- Version/build: 0.6.5.2 development branch
- Reporter: player playtest (FoxGlen)
- Area: outgoing raid presentation
- Owner module: frontierCombat.ts (read-only status projection)

## Status history
- 2026-11-26 — investigating: confirmed by source trace; implementation and regression submitted, verification pending.

## Observed behavior
After the FoxGlen battle, the army was returning but the banner continued displaying battle and fight instructions.

## Expected behavior
Show homeward travel until survivors arrive. Retain battle history in the Chronicle and preserve deployment until arrival.

## Reproduction steps
1. Launch a raid against a rival and resolve its encounter, or recall the army.
2. Inspect the raid banner, hints and alerts while its phase is returning.
3. Before the change, these consumers displayed old encounter text despite the return phase.

## Evidence
The canonical beginRaidReturn transition sets the phase and return deadline but intentionally retains encounter history. App.tsx, focusHints.ts and priorityAlerts.ts previously consumed the old title, description or rival response directly. Original FoxGlen save not replayed.

## Root cause
Presentation failed to distinguish active combat from returning transit.

## Fix / proposed fix
Use getOutgoingRaidStatus in all three consumers. Hide obsolete combat copy, suppress duplicate live battle status, and display return timing without mutating combat or historical records.

## Save/migration impact
No schema change. Existing returning events with old encounter text are handled by the read-only projection.

## Verification result
NOT RUN: targeted hostility regression, full CI and browser replay. Existing hostility test extended to cover stale encounter text during actual return transition.
