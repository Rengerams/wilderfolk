# Incremental function-overlap PR gate

The sole code-review implementation is `scripts/check-function-overlap.mjs`.
`npm test` and `npm test -- semantic` first regenerate the existing call graph from source, then compare functions touched by the Git diff against **all** indexed functions, not only changed files. No second function registry is introduced. A direct `node scripts/check-function-overlap.mjs` invocation also detects a tracked graph that still lists deleted source files and rebuilds the **existing** JSON and HTML artifacts through `scripts/build-call-graph.mjs` before checking; there is no independent graph owner.

## Enforcement

- The test runner executes `owners` then `semantic` as part of the existing standard/full CI. For a deliberate full refresh (including graph changes that do not involve removed files), run `node scripts/build-call-graph.mjs` first.
- Local branch comparison defaults to `origin/main`; set `--base <ref>` or `SEMANTIC_BASE_REF` to override. PR CI compares against the target branch; main push CI compares against the preceding commit.
- Newly added and edited functions are checked. Deletion-only hunks count. Existing untouched legacy similarities never block a PR.
- Candidates are found through source-token and token-neighbor similarity, accessed members, called functions, and probable state writes. Exact matches always count. This is **candidate discovery**, not a proof of semantic equivalence; different timing, RNG, return contracts, mutations, and edge cases must be inspected.
- An unresolved candidate fails the check. A justified difference requires a source-fingerprint-pinned pair, a descriptive reason (at least 40 characters), and a reference to an existing `tests/*.test.*` file that verifies the distinction. Missing evidence or a modified function invalidates the exception. The test runner does not accept undocumented global suppressions.

## Example exception (only after review)

```json
{
  "approvals": [
    {
      "key": "src/game/a.ts:17:foo@<sha256> <-> src/game/b.ts:80:bar@<sha256>",
      "reason": "These functions deliberately differ in the time window and allowed state writes; the regression test pins both outputs.",
      "tests": ["tests/someBehavior.test.ts"]
    }
  ]
}
```

Use the **exact** key emitted by the failed check. Never invent a fingerprint. An approval means a reviewer examined a suspected overlap; it must not be used to exempt a demonstrable duplicate.

## Limitations and branch protection

Similarity analysis can have false positives and false negatives, especially with renamed variables, dynamic dispatch, short helpers and identical-looking code with different effects. It cannot autonomously prove arbitrary TypeScript programs equivalent. Existing `jscpd`, ownership, cycle, type and behavioral tests remain authoritative independently.

To make failures prevent GitHub merges, configure the existing **Node.js CI / build** job as a *required* status check under branch protection or a ruleset for `main`. A repository CI workflow by itself is not a merge prohibition. Review permissions for changes to `AGENTS.md`, this script and the reviewed-exceptions file should also be protected.
