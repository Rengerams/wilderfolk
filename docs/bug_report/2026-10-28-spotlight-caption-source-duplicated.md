# Spotlight captions bypass their canonical JSON source

- Bug: the Spotlight React overlay supplied its own hardcoded caption array instead of reading the event-keyed canonical JSON script.
- Status: resolved in branch source; verification pending
- Severity: medium
- Date discovered: 2026-10-28
- Version/build: PR #91 before choreography implementation
- Reporter: implementation source audit
- Area: spotlight presentation / dialogue data ownership
- Owner module: `src/components/SpotlightLoreOverlay.tsx`; data `src/game/data/dialogue/spotlight-lore.json`
- Related PR: https://github.com/Rengerams/wilderfolk/pull/91

## Status history
- 2026-10-28 — open: React maintained a 31-caption `LINES` copy, so JSON changes could not affect visible speech.
- 2026-10-28 — resolved in source: React now consumes validated `SPOTLIGHT_CAPTIONS` from one JSON 1.3 script via the Spotlight choreography adapter; new role and cue coverage added, but no CI/browser pass confirmed.

## Observed behavior
`SpotlightLoreOverlay.tsx` defined an independent literal `const LINES = [...]` and timed/assigned every caption from it. The separate `spotlight-lore.json` event tree therefore had no effect on that UI. The heroine could not be assigned her own cue/line without creating another bespoke frontend script. This was proven by inspection of both source files, not a browser reproduction.

## Expected behavior
A single `spotlight.lore` JSON 1.3 tree supplies every authored caption, stable ID, speaker role and scene cue. Six to ten distinct real adult participants plus the heroine are bound to their own entities; no JSX caption duplicates.

## Reproduction steps
1. Open PR #91 prior to its choreography commit and compare `src/components/SpotlightLoreOverlay.tsx` with `src/game/data/dialogue/spotlight-lore.json`.
2. Observe that `SpotlightLoreOverlay` indexed its local `LINES` and never imported or read the JSON tree.
3. Any JSON-only changes to the content would therefore not alter visible overlay captions.

## Evidence
Before: JSX `LINES` 31 entries plus separately authored JSON. After: JSX has no caption array; the `spotlightChoreography.ts` adapter statically imports one event tree, validates ten adult roles plus `heroine`, cue presence/ordering, and exposes timed steps.

## Root cause
Spotlight presentation predates PR #93's group presentation adapter and duplicated its textual source rather than reading event-keyed JSON.

## Fix / proposed fix
PR #91 changes the overlay to consume the single JSON event tree and adds stable cue metadata, heroine binding, two timed poses, a visual farewell and pure choreography tests. **Outstanding integration**: when PR #93's canonical presentation reader merges, route this JSON through that shared reader without reintroducing duplicate caption data.

## Save/migration impact
None. Visual cues, cast binding and timers stay in the presentation; no new persisted WorldState or Entity fields.

## Verification result
Source trace: confirmed. New pure regression tests authored in `tests/spotlightChoreography.test.ts`. `npm run test:types`, `npm run lint`, `npm run build`, targeted Vitest and browser/worker smoke: **NOT RUN**, no claim of pass.
