# Regional ground rebakes retain stale clearing fields

- Bug: Regional ground rebakes retain stale clearing fields.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-08
- Version/build: PR #134, a3349fac
- Reporter: Codex review / verification
- Area: src/game/renderer/terrain.ts
- Owner module: src/game/renderer/terrain.ts
- Related PR/commit: https://github.com/Rengerams/wilderfolk/pull/134

## Status history
- 2026-11-08 — resolved: traced the production path and verified the targeted regression.

## Observed behavior
After an override and regional revision, a rebaked chunk reads a clearingMask built before the override.

## Expected behavior
Key fields separately by terrain revision while retaining regional chunk keys.

## Reproduction steps
1. Inspect PR head a3349fac.
2. Exercise the condition described above using `tests/groundChunk.rebake.test.ts`.
3. Observe the mismatch described in Observed behavior.

## Evidence
After an override and regional revision, a rebaked chunk reads a clearingMask built before the override. The focused tests cover the named regression through the actual owners.

## Root cause
Fields and chunk-world identity shared a revision-free cache key.

## Fix / proposed fix
Key fields separately by terrain revision while retaining regional chunk keys.

## Save/migration impact
None. Existing world and worker fields are reused.

## Verification result
PASS: npx vitest run tests/groundChunk.rebake.test.ts.
