# Dialogue content registry test incorrectly treats a writer as read-only

- Bug: The decision-registry test lists `dialogueContent` as a read-only projection despite its documented and implemented writes to `human.dialogueRecentScenes`.
- Status: investigating
- Severity: low
- Date discovered: 2026-11-02
- Version/build: PR #119 Node.js CI run 41324964638
- Reporter: GitHub Actions CI
- Area: Decision ownership tests
- Owner module: `src/game/simulation/decisionRegistry.ts` and its contract test
- Related PR/commit: PR #119

## Status history
- 2026-11-02 — investigating: Removed the incorrect read-only classification from the test, clarified the declared write contract; CI revalidation pending.

## Observed behavior
`tests/simulation.decisionRegistry.test.ts:110` expected empty writes but received `['human.dialogueRecentScenes']`.

## Expected behavior
The ownership test must require nonempty declared writes from an owner whose runtime changes persisted per-speaker rotation history. Pure projections remain restricted to `writes: []`.

## Reproduction steps
1. Read `dialogueTrees.ts` per-entity history assignment.
2. Read the `dialogueContent` registry row and the `READ_ONLY_DECISIONS` test set.
3. Run the registry test; it rejects the correct history write declaration.

## Evidence
GitHub Actions run 41324964638; `dialogueTrees.ts` writes `speaker.dialogueRecentScenes`.

## Root cause
The test's read-only set was not updated after dialogue variants began persisting history.

## Fix / proposed fix
Remove `dialogueContent` from the read-only set, retain its explicit write declaration and an owner description that explains it.

## Save/migration impact
None; preserves existing serialized dialogue histories.

## Verification result
- CI run 41324964638: FAIL before correction.
- Revised CI: pending; local repository test commands NOT RUN.
