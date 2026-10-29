# Tauri desktop scripts could not resolve their command-line tool

- Bug: `npm run tauri:dev` and `npm run tauri:build` failed on a clean checkout because no package declared or installed the Tauri CLI.
- Status: resolved
- Severity: high
- Date discovered: 2026-10-29
- Version/build: 0.6.5.1, branch `node-beta-support`
- Reporter: owner observation while evaluating Node 27 nightly and npm 12.2.1
- Area: developer workflow / desktop build
- Owner module: package manifest and lockfile (no source module involved)
- Related PR/commit: this branch

## Status history
- 2026-10-29 — open: reproduced in an empty directory holding only the manifest and lockfile.
- 2026-10-29 — resolved: the CLI is declared as a development dependency and the lockfile was regenerated; clean install verified.

## Observed behavior
In a clean checkout, `npx tauri --version` printed `npm error could not determine executable to run`, and `npm ci` from the committed lockfile installed no `tauri` binary in `node_modules/.bin`. Only `@tauri-apps/api` and the Windows bundle helper were present under `@tauri-apps/`.

## Expected behavior
The two desktop scripts are `npx tauri dev` and `npx tauri build`, so the project's own dependency tree must contain the Tauri CLI at a version matching the Tauri 2 API package.

## Reproduction steps
1. Copy `package.json` and `package-lock.json` into an empty directory; install nothing else.
2. Run `npm ci`.
3. List `node_modules/.bin` and search for `tauri` — no entry.
4. Run `npx tauri --version` — fails with "could not determine executable to run".

## Evidence
- Before: `npm ci` exit 0, `node_modules/@tauri-apps/` contained `api` and `tauri-windows-bundle` only; `node_modules/.bin` had no `tauri`; `npx tauri --version` → `npm error could not determine executable to run`.
- The lockfile still carried a `node_modules/@tauri-apps/cli` record and the root entry listed `"@tauri-apps/cli": "^2.12.4"` and `"corepack": "^0.36.0"` under dependencies, while the manifest listed neither.
- After: `npm ci` in the same clean copy, then `npx tauri --version` → `tauri-cli 2.12.4`.

## Root cause
The manifest dropped `@tauri-apps/cli` while the scripts kept calling it. The lockfile kept a stale record, but npm builds its install tree from the manifest and prunes entries that are unreachable from it, so nothing installed a CLI. The leftover entry also classified the CLI as a runtime dependency rather than a development one.

## Fix / proposed fix
Declared `@tauri-apps/cli ^2.12.4` under devDependencies, matching the Tauri 2 API package version, and regenerated the lockfile. The unused `corepack` record fell out of the same regeneration; nothing in the repository references corepack and the `packageManager` field is empty.

## Save/migration impact
None.

## Verification result
- PASS `npm ci` in a clean copy of the manifest and lockfile, followed by `npx tauri --version` → `tauri-cli 2.12.4`.
- PASS `npm run test:types` in the sandbox container.
- NOT RUN `npm run tauri:build` (needs the Rust toolchain and a desktop target, not available in the sandbox).
