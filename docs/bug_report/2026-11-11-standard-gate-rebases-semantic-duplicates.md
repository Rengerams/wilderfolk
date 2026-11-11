# Standard test script silently overwrites the semantic-duplicate baseline

- Bug: Standard test script silently overwrites the semantic-duplicate baseline.
- Status: investigating — fix committed on fix/audit-ci-gates-20261111, verification pending
- Severity: high
- Date discovered: 2026-11-11
- Version/build: 0.6.5.2 development, main 926eb5f
- Reporter: 2026-11-11 code audit
- Area: test and CI infrastructure
- Owner module: package.json (`test:standard` script), scripts/check-semantic-duplicates.mjs
- Related branch: fix/audit-ci-gates-20261111

## Status history
- 2026-11-11 — investigating: reproduced by a source-level control-flow trace; targeted configuration patch committed, CI pending.

## Observed behavior
`npm run test:standard` executes `node scripts/check-semantic-duplicates.mjs --update-baseline` immediately before the standard gate. The checker writes all current groups to `docs/tools/semantic-duplicates-baseline.json` in that mode. Consequently newly introduced overlaps can be accepted instead of reported.

## Expected behavior
Normal test commands check the reviewed baseline without mutating it. Baseline refresh must be an explicit, separate maintenance decision.

## Reproduction steps
1. Read the pre-patch `package.json` script `test:standard`.
2. Follow `UPDATE` handling in `scripts/check-semantic-duplicates.mjs`, where baseline groups are written and the checker returns success.
3. The following standard gate reads this newly written baseline and loses its ratchet for new duplicate groups.

## Evidence
The named exact source paths and step conditions above were read at main `926eb5f`; no runtime outcome is invented.

## Root cause
The convenience test script conflates baseline maintenance with verification.

## Fix / proposed fix
Point `test:standard` directly to `node scripts/test.mjs standard`, whose `owners` step prepares the call graph and whose `semanticDup` step only verifies it.

## Save/migration impact
None. No gameplay or persisted-state code changes.

## Verification result
NOT RUN as a local npm command; PR CI will exercise the same standard runner. The explicit update mode in the checker remains available.
