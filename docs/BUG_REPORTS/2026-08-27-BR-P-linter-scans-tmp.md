# Bug: Linter scans generated temporary fixtures

- Status: resolved
- Date discovered: 2026-08-27
- Version/build: 0.6.3 development
- Reporter: Developer observation during lint run
- Area: performance
- Owner module: `package.json` lint scripts
- Cadence: Developer lint/check command

## Status history

- 2026-08-27 — open (Oxlint was traversing generated files under the repository `tmp/` directory)
- 2026-08-27 — investigating (lint scripts invoked Oxlint without explicit project paths)
- 2026-08-27 — resolved (lint scripts restricted to source, scripts, and configuration entrypoints)
- 2026-09-30 — correction to the analysis, not the fix: the premise recorded under "Evidence" — *"Git ignore rules do not restrict Oxlint traversal"* — is wrong. **Oxlint does honour `.gitignore`.** That is why naming `scripts` in the explicit scope did not lint it: the directory was gitignored, so the gate reported `0 warnings and 0 errors` for a month while never reading any of the 70 files. Tracking `scripts/` on 2026-09-30 made Oxlint read it for the first time and surfaced 134 pre-existing findings across 40 files. The `tmp/` fix above still holds and was correct for its own purpose — explicit paths do exclude `tmp/` — but the stated reason was inverted, and the inverted reason is what hid the hole. See `scripts/test.mjs` for the current scope and the measured numbers.

## Observed behavior

Running the broad Oxlint command allowed generated temporary fixtures under `tmp/` to enter the lint traversal. The repository contained many temporary test/index fixtures, including JavaScript and Python files, which caused unnecessary work and could contribute to high CPU usage during repeated automated iterations.

## Expected behavior

Project linting should inspect Wilderfolk source and supported configuration files only. Local generated fixtures under `tmp/` must not be traversed.

## Reproduction steps

1. Run the previous `oxlint --type-aware --type-check` command from the repository root.
2. Observe that the command uses the entire working directory as its implicit input scope.
3. Inspect the generated `tmp/` directory containing many temporary fixtures.

## Evidence

The repository contained an untracked `tmp/` directory with many generated fixture trees. `.gitignore` already excludes `./tmp/`, but Git ignore rules do not restrict Oxlint traversal.

## Root cause

The `lint`, `lint:fix`, and `test:all` scripts invoked Oxlint without explicit input paths. Oxlint therefore treated the repository root as its lint scope.

## Fix

Changed the scripts to pass explicit inputs:

```text
src scripts vite.config.ts vitest.config.ts
```

This preserves linting for application source, project scripts, and active Vite/Vitest configuration while excluding `tmp/`, `dist/`, agent fixtures, and unrelated generated content.

## Regression test

Run:

```bash
npm run lint
npm run check:source
```

## Invariants checked

- Source files remain linted with type-aware Oxlint checks.
- Generated temporary fixtures are outside the lint scope.
- Source shadow-file protection remains active.
- No simulation behavior or worker authority path changes were made.

## Save/migration impact

None.

## Verification result

Passed on 2026-08-27:

```text
npm run lint
Found 0 warnings and 0 errors.

npm run check:source
Source-integrity guard passed: no .js/.mjs shadow files under src/ or scripts.

Focused worker/GameLoop tests
2 files passed, 11 tests passed.
```

## Related commits or files

- `package.json`
- `.oxlintrc.json`
- `.gitignore`
- `tmp/` (local generated fixtures; not linted)
