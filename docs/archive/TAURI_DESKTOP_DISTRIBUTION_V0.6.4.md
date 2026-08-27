# Tauri Desktop Distribution — v0.6.4

## Purpose

Wilderfolk v0.6.4 introduces the first standalone Windows desktop distribution. The desktop application is packaged with **Tauri v2**, allowing players to run Wilderfolk in its own application window instead of launching it inside a regular Chrome session. The existing browser workflow remains available for development and quick playtesting.

> **Release:** [Wilderfolk v0.6.4 on GitHub](https://github.com/Rengerams/wilderfolk/releases/tag/v0.6.4)

## Player distribution

The published GitHub Release contains two Windows x64 installers.

| Package | Recommended use | Download |
|---|---|---|
| `Wilderfolk_0.6.4_x64-setup.exe` | Recommended installer for most Windows players. | [Download `.exe`](https://github.com/Rengerams/wilderfolk/releases/download/v0.6.4/Wilderfolk_0.6.4_x64-setup.exe) |
| `Wilderfolk_0.6.4_x64_en-US.msi` | Managed or manual MSI installation workflows. | [Download `.msi`](https://github.com/Rengerams/wilderfolk/releases/download/v0.6.4/Wilderfolk_0.6.4_x64_en-US.msi) |

The desktop window is configured to start maximized and uses the Wilderfolk application icon. Installer users do not need the repository source, Node.js, Rust, or a separate Chrome browser to launch the packaged application.

## Developer workflow

The repository continues to support browser development through the existing Vite commands. Developers who want to test the desktop shell can use the following commands from the repository root:

```text
npm install
npm run tauri:dev
```

`npm run tauri:dev` starts the Vite application inside a separate Tauri development window with hot reload. The command requires the normal Tauri development prerequisites, including Node.js, Rust, Cargo, and the Windows WebView2 environment.

For a single development log runner, use:

```text
npm run tauri:dev:log
```

The logger starts the desktop development workflow and writes a timestamped log under `logs/` while preserving the normal development output in the terminal.

The production desktop bundle is built with:

```text
npm run tauri:build
```

The build runs the browser production build first and then produces the Windows installer assets under `src-tauri/target/release/bundle/`.

## Configuration contract

The Tauri wrapper is intentionally thin. The simulation, worker transport, save compatibility, and browser application remain owned by the existing TypeScript/React code. Tauri supplies the native desktop window and packaging layer; it does not become a second simulation authority.

| Concern | Source of truth |
|---|---|
| Desktop application version | `src-tauri/tauri.conf.json` and `package.json` |
| Game version shown by the application | `src/game/version.ts` |
| Desktop window behavior | `src-tauri/tauri.conf.json` |
| Native application entry point | `src-tauri/src/main.rs` and `src-tauri/src/lib.rs` |
| Frontend application | `src/` and the Vite build output |
| Desktop icon assets | `src-tauri/icons/` |
| Development logging command | `scripts/run-tauri-dev-log.mjs` |

The v0.6.4 window is configured for maximized startup. Fullscreen mode remains a separate user-experience decision and should not be introduced by changing the desktop wrapper without testing keyboard access, window recovery, and player discoverability.

## Release validation

The v0.6.4 release worktree was validated before publication with the following checks:

| Check | Result |
|---|---|
| Source-integrity guard | Passed; no generated JavaScript shadow files under the protected source paths. |
| Oxlint | Passed with zero warnings and zero errors. |
| TypeScript checks | Passed. |
| Browser production build | Passed. |
| Tauri Windows x64 bundle build | Passed. |
| NSIS installer | Generated successfully. |
| MSI installer | Generated successfully. |

The published release is based on the scoped commit `e5918e3` on the `release/v0.6.4-tauri` branch. The release intentionally excludes unrelated terrain experiments and future UI work.

## Troubleshooting notes

If the application does not start, first confirm that the installer matches Windows x64 and that the installation completed successfully. If a development build fails, verify that `rustc` and `cargo` are available on `PATH`, then run `npm install` from the repository root. Installer users should use the browser build as a fallback for playtesting and report the Windows version, installer type, and visible error message.

For reports, include whether the problem occurred in the packaged desktop build or the browser build. This distinction helps separate Tauri shell problems from frontend, worker, rendering, or simulation problems.

## Scope and future work

Version 0.6.4 is a distribution and desktop-integration release. It does not claim to complete the terrain renderer overhaul, connected mountain and river formations, the non-mutating seasonal snow layer, the Settler Inspector, or the Oracle advice system. Those remain separate implementation tracks so that desktop packaging can be evaluated independently from simulation and rendering changes.
