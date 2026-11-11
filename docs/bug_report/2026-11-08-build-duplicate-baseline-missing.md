# Build duplicate-code gate references an untracked baseline

- Bug: Build duplicate-code gate references an untracked baseline.
- Status: open
- Severity: medium
- Date discovered: 2026-11-08
- Version/build: PR #134, a3349fac
- Reporter: Codex review / verification
- Area: scripts/check-duplicate-code.mjs
- Owner module: scripts/check-duplicate-code.mjs
- Related PR/commit: https://github.com/Rengerams/wilderfolk/pull/134

## Status history
- 2026-11-08 — open: traced the production path and recorded the existing build blocker.

## Observed behavior
npm run build stops with duplicate-code baseline missing before bundling. The required docs/tools/duplicate-code-baseline.json is absent from HEAD.

## Expected behavior
Open: restore or deliberately review the baseline separately; do not accept current duplicates automatically to make this review pass.

## Reproduction steps
1. Inspect PR head a3349fac.
2. Exercise the condition described above using `npm run build`.
3. Observe the mismatch described in Observed behavior.

## Evidence
npm run build stops with duplicate-code baseline missing before bundling. The required docs/tools/duplicate-code-baseline.json is absent from HEAD. The focused tests cover the named regression through the actual owners.

## Root cause
The build invokes a checker whose baseline is not tracked. The separate semantic-duplicates check also stops on a missing baseline. The tracked .jscpd-baseline.json is a different path.

## Fix / proposed fix
Open: restore or deliberately review the baseline separately; do not accept current duplicates automatically to make this review pass.

## Save/migration impact
None. Existing world and worker fields are reused.

## Verification result
FAIL: npm run build — missing duplicate-code baseline; existing at inspected HEAD. FAIL: node scripts/check-semantic-duplicates.mjs — baseline missing. PASS: npm run build:ci (compilation and production bundle only).
