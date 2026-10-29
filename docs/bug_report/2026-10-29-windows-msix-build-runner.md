# Windows MSIX packaging script started a build runner the project does not have

- Bug: `npm run tauri:windows:build` never reached the desktop build on a machine whose Tauri command-line tool comes from the project's own dependencies.
- Status: resolved
- Severity: medium
- Date discovered: 2026-10-29
- Version/build: 0.6.5.1, branch `node-beta-support`
- Reporter: owner request to run the Windows packaging script
- Area: developer workflow / desktop packaging
- Owner module: package manifest (no source module involved)
- Related PR/commit: this branch

## Status history
- 2026-10-29 — open: reproduced in the sandbox container.
- 2026-10-29 — resolved: the script names its runner; the runner's own command verified up to the Rust step.

## Observed behavior
The packaging helper builds the app through a runner it defaults to `cargo`, running `cargo tauri build --target x86_64-pc-windows-msvc --no-bundle`. That subcommand exists only when the Cargo Tauri CLI is installed globally, which the project never requires; the project declares the Node Tauri CLI instead and every other desktop script calls it as `npx tauri`.

Choosing the npm runner does not help on this manifest: it runs `npm run tauri build -- …`, and there is no `tauri` script.

## Expected behavior
The packaging script wraps the Tauri build the project actually ships, so it works from a clean install of the committed manifest.

## Reproduction steps
1. In a checkout with dependencies installed from the lockfile, run `npm run tauri:windows:build`.
2. Observe the runner the helper picks (default `cargo`), or pass the npm runner to see the script resolution fail.

## Evidence
- `tauri-windows-bundle build --help` reports the runner default as `cargo`; its build step formats `<runner> tauri build --target <arch>-pc-windows-msvc --no-bundle`.
- `npm run tauri build -- --target x86_64-pc-windows-msvc --no-bundle` → `npm error Missing script: "tauri"`.
- The manifest declares `@tauri-apps/cli` and no `tauri` script; `npx tauri --version` → `tauri-cli 2.12.4`.
- The MSIX packager itself is Windows-only (`@choochmeque/msixbundle-cli-win32`), so the Linux sandbox stops at its "msixbundle-cli is required" prompt before any runner is chosen.

## Root cause
The packaging script did not name a runner, so it fell back to a globally installed Cargo subcommand that this project does not depend on; the runner that would fit the manifest, npm, cannot resolve the missing `tauri` script either.

## Fix / proposed fix
`tauri:windows:build` now passes `--runner npx`, so the packager runs `npx tauri build --target x86_64-pc-windows-msvc --no-bundle` against the declared Node CLI.

## Save/migration impact
None.

## Verification result
- PASS `npm run tauri:windows:build -- --help` in the sandbox container: the script resolves and the helper accepts the runner flag.
- PASS `npx tauri build --target x86_64-pc-windows-msvc --no-bundle` reaches the Tauri build and fails only on the missing Rust toolchain in the Linux container (`cargo metadata` not found) — the runner command itself is accepted.
- NOT RUN the full MSIX packaging: it needs Windows and the `msixbundle-cli` sidecar.
