# Spotlight intro repeatedly schedules the same caption state

- Bug: the intro/applause frames scheduled a React state update on every animation frame even when the caption index did not change.
- Status: resolved in PR #91 source; runtime verification pending
- Severity: low
- Date discovered: 2026-10-28
- Version/build: PR #91 choreography after implementation
- Reporter: source-level choreography audit
- Area: presentation timeline / React
- Owner module: `src/components/SpotlightLoreOverlay.tsx`
- Related PR: https://github.com/Rengerams/wilderfolk/pull/91

## Status history
- 2026-10-28 — open: `null !== -1` on every intro/applause frame repeatedly called `setLineIndex(-1)`.
- 2026-10-28 — resolved in source: normalize null to -1 **before** comparing the next caption index with the prior one.

## Observed behavior
The timeline returns `lineIndex:null` during introduction and applause, while the component's previous caption index is `-1`. Comparing the unnormalized null to the previous -1 was always true, causing unnecessary React dispatches.

## Expected behavior
Only transition between distinct visible captions should schedule React updates; 60Hz projection itself stays a direct DOM/canvas presentation operation.

## Reproduction steps
1. Enter Spotlight's 2.4-second intro or 2.8-second applause phase.
2. Inspect the previous `step.lineIndex !== previousIndex` comparison and observe that the null branch never settles.
3. On every frame it attempted to set the unchanged index -1.

## Evidence
Direct source trace; no performance profiler or browser result claimed.

## Root cause
Comparison occurred before normalizing absence of caption to -1.

## Fix / proposed fix
Compute `nextIndex = step.lineIndex ?? -1`, compare once with `previousIndex`, and call `setLineIndex` only if it actually changes.

## Save/migration impact
None. Local React state only.

## Verification result
Code diff inspected. Browser profiler, TypeScript and regression suite **NOT RUN**.
