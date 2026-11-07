# CB-13 — Unused Tauri shell permission remains enabled

- Bug: The desktop bundle enabled Tauri's shell plugin and default shell permissions without a product caller.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-07
- Version/build: PR #131 before follow-up commits
- Area: desktop capabilities / Rust
- Owner module: src-tauri/src/lib.rs, src-tauri/Cargo.toml and src-tauri/capabilities/default.json
- Related PR: #131

## Status history
- 2026-11-07 — open: source configuration grants shell:default and initializes tauri_plugin_shell.
- 2026-11-07 — source fixed: removed the unused permission, initialization, direct dependency and lockfile entry. Native build verification pending.

## Observed behavior
The app registered tauri_plugin_shell and enabled shell:default despite no observed shell use in frontend or Rust application code.

## Expected behavior
The desktop capability list and loaded Rust plugins include only used privileges.

## Reproduction steps
1. Inspect src-tauri/capabilities/default.json and src-tauri/src/lib.rs.
2. Observe shell:default and tauri_plugin_shell::init().
3. Search the command/frontend source for a required shell invocation; none was found in the targeted repository search.

## Evidence
src-tauri/Cargo.toml, src-tauri/src/lib.rs, src-tauri/capabilities/default.json and Cargo.lock before the change.

## Root cause
A redundant plugin was retained merely to suppress an unused dependency warning.

## Fix / proposed fix
Remove the shell plugin and capability; retain core:default and the logging plugin. Ensure Cargo.lock matches the manifest and run a native desktop build.

## Save/migration impact
None.

## Verification result
NOT RUN — native Cargo/Tauri build in this environment; CI and desktop testing pending.
