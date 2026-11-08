# Interaction audio rescanned the whole roster for every death

- Bug: `detectInteractionSounds` located each dead entity with `currentEntities.find`, so one pass cost O(previous × current) roster reads on every tick that changed entities.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit (Phase 6 performance item)
- Reporter: full-audit codebase review
- Area: interaction audio / hot path
- Owner module: `src/audio/interactionDetect.ts` (`detectInteractionSounds`)
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: audit found the death loop searching the current roster per previous entity.
- 2026-11-07 — resolved: deaths now resolve through an id map built once per call.

## Observed behavior
The death loop iterated every previous entity and called `currentEntities.find((e) => e.id === prev.id)`. With 2,001 previous and 2,001 current entities the instrumented regression measured **2,009,004 array-index reads** for a single call. `useGameAudio` runs the detector whenever entities, buildings, tick or the map change, so a large colony paid that cost repeatedly.

## Expected behavior
One roster pass per call: the current entity for an id is looked up in O(1), and the cues still depend only on whether that entity died and which hunter stands near a dead prey.

## Reproduction steps
1. Build previous and current rosters of 2,001 entities sharing ids, with one human dead in the current roster.
2. Wrap the current roster in an index-counting proxy and call `detectInteractionSounds(previous, current)`.
3. Before the fix the counted reads were 2,009,004; the regression asserts fewer than 12,006.

## Evidence
- `tests/audio.interactionDetect.test.ts` — "resolves deaths without rescanning the roster per corpse".
- Pre-fix run: `AssertionError: expected 2009004 to be less than 12006` (1 failed, 3 passed).
- Post-fix run: 4/4 passed.

## Root cause
Linear id search inside a loop over the previous roster; the id maps already built for the earlier passes were not used for the death pass.

## Fix / proposed fix
Build `currentById` once beside the existing `prevById` and read the death target from it. Cue thresholds, hunter radius and precedence are unchanged.

## Save/migration impact
None.

## Verification result
- `npx vitest run tests/audio.interactionDetect.test.ts` — PASS (4/4).
- `npm run test:types`, `npm run lint`, `npm run build`, `npm run check:source` — PASS.
- Runtime audio cue unchanged: settler death, human hunt and silence paths are pinned by the new test.
