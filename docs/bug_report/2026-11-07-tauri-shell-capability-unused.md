# Desktop shell granted an unused Tauri shell capability

- Bug: The Tauri shell plugin and `shell:default` permission were enabled although no frontend code used them.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit
- Reporter: full-audit codebase review (CB-13 / UX-07)
- Area: desktop packaging
- Owner module: `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `src-tauri/Cargo.toml`
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: audit found the plugin, permission and unused direct `serde` dependencies.
- 2026-11-07 — resolved: plugin, permission and direct dependencies removed.

## Observed behavior
The capability file granted `shell:default`; `lib.rs` initialized `tauri_plugin_shell`; `Cargo.toml` carried the shell crate and unused `serde`/`serde_json` direct deps.

## Expected behavior
The desktop capability contains only what the app uses.

## Reproduction steps
1. Inspect `src-tauri/capabilities/default.json` and `src-tauri/src/lib.rs`.
2. Scan the frontend for `@tauri-apps/plugin-shell`; there are no callers.

## Evidence
Source scan returns no shell consumer.

## Root cause
The plugin was added to silence an unused-dependency warning.

## Fix / proposed fix
Remove `.plugin(tauri_plugin_shell::init())`, `shell:default`, and the shell/serde direct dependencies.

## Save/migration impact
None.

## Verification result
- `npx tsc -p tsconfig.app.json --noEmit` — PASS.
- `npm run build` — PASS.
- Rust build was not run in this environment.
