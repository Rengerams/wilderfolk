# Unchecked dialogue event keys and mutable indexed bank

- Bug: The migration accepted arbitrary event-key strings and exposed mutable canonical scene data.
- Status: investigating (patch committed; final CI pending)
- Severity: medium
- Date discovered: 2026-10-28
- Version/build: Wilderfolk 0.6.5.2 PR #93
- Reporter: code/architecture review
- Area: dialogue source contract, event routing and worker bank
- Owner module: `src/game/dialogueTrees.ts`
- Related PR: https://github.com/Rengerams/wilderfolk/pull/93

## Status history
- 2026-10-28 — investigating: direct source audit found `DialogueRequest.eventKey: string`, optional `DialogueTree.eventKey`/`mode`, and mutable bank arrays and scene objects. Patch and regression tests committed, final CI not yet confirmed.

## Observed behavior
A misspelled authored event key compiled as a valid `DialogueRequest`; unknown events failed only at runtime. The active bank was copied shallowly into mutable arrays and its nested scene/line content was not frozen. A deserialized bank could index an arbitrary nonempty event key, so it was possible to install content outside the defined event contract.

## Expected behavior
Every authored event key must be represented by one compile-time union member and a validated canonical JSON scene. A script must select only a matching event key, mode and optional explicit treeId. Every loaded tree, speaker array, line array and canonical bank is read-only at runtime. Main and worker install the same content; no silent fallback to another event.

## Reproduction
1. Inspect `src/game/dialogueTrees.ts` before the PR #93 hardening: `DialogueRequest.eventKey: string` and `DialogueTree.eventKey?: string`.
2. Observe that `indexDialogueBank` checked only whether `eventKey` was truthy and copied arrays without freezing nested trees.
3. Verify the before/after contract with `tests/dialogue.eventRouting.test.ts` and `tests/dialogue.workerSaveParity.test.ts`. Actual final-head CI result: pending at report creation.

## Evidence and root cause
The initial version-1.3 migration retained permissive transitional TypeScript interfaces and a mutable indexed payload. Indexed matching correctly rejected many bad requests, but could not reject misspelled keys at compile time or protect exported canonical data from mutation.

## Fix
PR #93 defines a finite `DialogueEventKey` union matching the authored JSON event keys; routes contextual social, visitor and election events through that type; requires a discriminated solo/pair `DialogueTree`; validates keys on both source compilation and payload installation; and freezes the bank and its nested arrays/lines. Tests cover each registered event key, event-specific tree selection, invalid explicit tree IDs, invalid worker payload keys and worker/main serialized-bank parity.

## Save/migration impact
None: no new saved fields, clocks, game-event outcomes, speaker pools, worker messages or content wording. The worker continues installing the bundled canonical bank on initialization. Actual browser Worker-thread execution is not asserted by the headless parity test.

## Verification result
- Source-level code inspection: confirmed pre-fix contract gaps.
- New regression tests: committed, final-head result pending.
- Final TypeScript, lint, build, full standard and 120-day CI: pending at report creation.
