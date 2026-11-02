# Changelog guard misclassifies slash-separated prose

- Bug: The documentation gate treats ordinary prose such as `Skip/restore.` as a repository file.
- Status: investigating
- Severity: low
- Date discovered: 2026-11-02
- Version/build: main, version 0.6.5.1
- Reporter: user-supplied `npm run test:standard` and `npm run test:all` diagnostics
- Area: documentation integrity
- Owner module: `scripts/check-docs.mjs`
- Related PR/commit: fix/docs-check-and-unused-meal-export-20261102 (pending PR)

## Status history
- 2026-11-02 — investigating: targeted source inspection confirmed the false-positive pattern; patch committed, CI not yet verified.

## Observed behavior
The documentation gate reports `CHANGELOG.md:5 entry names a file ("Skip/restore.")` even though the text describes a UI action, not a file.

## Expected behavior
Changelog entries remain concise and real source/document filename references remain restricted, without flagging ordinary prose containing a slash.

## Reproduction steps
1. On the recorded main revision, inspect the latest changelog section's entry containing `Skip/restore.`.
2. Run `npm run test:standard` or `npm run test:all`.
3. The documentation guard reports a nonexistent file reference at line 5 (reported by user; not independently executed here).

## Evidence
The original `PATH_LIKE` branch `\\S*\\/\\S*` matches any slash-separated string regardless of whether it is a filename.

## Root cause
The overly broad slash pattern interprets `Skip/restore.` as a file path.

## Fix / proposed fix
Match known source and document extensions, with optional directory segments, rather than treating any slash as a file path. Keep the concise-entry limit unchanged.

## Save/migration impact
None.

## Verification result
Source inspection: PASS. `npm run test:standard`, `npm run test:all`, CI: NOT RUN at report creation.
