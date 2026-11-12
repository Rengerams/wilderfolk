# Shell, persistence and worker-host defects — audit remediation (2026-11-11)

- Bug: loading a colony kept the previous colony's build mode; the final-save export wrote the display shadow; imports had no size cap; a manual save during a background save was swallowed; a world upload was adopted before its ack; the error boundary had no retry; held keys repeated toggles; the menu's focus trap and ARIA contract were wrong; a strip release could eat the next click; hotkeys died in form controls; boot generated a Huge world; a hung command or recovery could freeze the colony for 30–74 s; the export race could double its budget.
- Status: resolved
- Severity: high (W-13/W-14/W-15/W-16), medium
- Date discovered: 2026-11-11
- Version/build: 0.6.5.1 → 0.6.5.2
- Reporter: full-code audit §4.5 and round-2 worker configuration findings
- Area: App shell, persistence, keyboard/pointer, worker transport and recovery
- Owner module: `App.tsx`, `hooks/useGamePersistence.ts`, `hooks/useGameSession.ts`, `hooks/useCanvasInteractions.ts`, `hooks/useKeyboardControls.ts`, `hotkeys.ts`, `gameLoop.ts`, `simWorker/GameWorkerHost.ts`, `GameMenu.tsx`, `GameErrorBoundary.tsx`, `MapSetupScreen.tsx`

## Status history
- 2026-11-11 — resolved: all shell/persistence/worker-host findings fixed at their owners; `vite.config.ts` worker plugin removed by the orchestrator (W-109), build verified.

## Observed behavior

- **W-08/W-144** `clearColonySessionState` cleared `selectedBuildingType` but not the save-restored `buildMode`/ghost/strip preview/rotation; loading a save written in build mode inherited a ghost and could place the previous colony's type on the first click.
- **W-13** The fallen-settlement export wrote the main-thread shadow directly, bypassing the authoritative export and its degraded check.
- **W-14** File import read the whole file before validating, doubling memory and accepting unbounded size.
- **W-15** A manual save during an in-flight background save was coalesced into it: no download, no toast.
- **W-16** `queueFullWorldUpload` assigned `worldRef` before the worker ack and only warned on failure.
- **W-17** The error boundary offered only "download recovery snapshot".
- **W-18** Holding Space/B re-toggled pause/build each repeat.
- **W-19** `GameMenu` re-implemented the focusable query (missing `select`/`textarea`/`[href]`) and set `aria-modal="false"` on a pointer-blocking dialog.
- **W-20** A strip gesture released outside the canvas left the placed flag set, swallowing the next map click.
- **W-141** Hotkeys were dead while any input — including a checkbox — held focus.
- **W-143** Boot generated a default Huge world and cloned it for the intro even though the real default is Medium.
- **W-107/W-108/W-117** A hung command blocked pipelining for 30 s (watchdog could not fire); recovery blocked both tick paths for up to ~74 s; `exportAuthoritativeWorld` raced twice with the same budget and leaked the losing timer.
- **W-109/W-110/W-114** Pipeline depth was misleading, the worker bundle used a React plugin it does not need, no test pinned any timing constant, and the menu copy claimed saves live only outside the browser.

## Expected behavior

A session replacement must not carry shell state from another colony; persistence must always produce the file the player asked for; the worker must only be trusted after its ack; the colony must never freeze past the stall threshold; gates must be able to fail.

## Reproduction steps

1. Save while in build mode, start a new colony, load: pre-fix a ghost appeared and the first click placed the old type.
2. Ctrl+S during an exit save: pre-fix no file downloaded.
3. Refuse a worker upload (fake ack failure): pre-fix the replica adopted the world anyway.
4. Hold Space: pre-fix pause flickered.
5. Click the log checkbox then press Escape: pre-fix nothing happened.
6. Hang a worker command: pre-fix the colony froze ~30 s.
7. `npx vitest run tests/gameWorker.uploadWatchdog.test.ts` on the pre-fix tree.

## Evidence

Audit traces (`App.tsx:2134/1101/1159-1173/195/402-411`, `useGameSession.ts:88`, `useGamePersistence.ts:81`, `GameWorkerHost.ts:417-453`, `GameErrorBoundary.tsx:58-78`, `useKeyboardControls.ts:100-113/129-135/193-200`, `GameMenu.tsx:263-293/330`, `useCanvasInteractions.ts:142-146/580/639`, `gameLoop.ts:830-846`, `GameWorkerHost.ts:90/327`) plus the new regression files.

## Root cause

Session replacement was split between the shell and the hook with different field lists; the export/import paths had convenience copies; transport deadlines exceeded the watchdog ceiling; and the recovery loop waited for a worker instead of ticking without one.

## Fix / proposed fix

- `clearTransientBuildView` runs from `useGameSession.replaceSession`, clearing buildMode/ghost/stripPreview/rotation on every session swap.
- Terminal export goes through `persistCurrentGame` → `exportAuthoritativeWorld` and honours `lastExportWasDegraded`.
- One `handleLoadFromFile(file)` path; `saveImportSizeRefusal(file.size)` refuses >64 MiB before reading.
- `persistGame` serializes saves: background saves coalesce, a manual save always chains and writes its own file.
- `queueFullWorldUpload` adopts the world only after `worldUploaded`; failure restores the previous replica and faults to fallback.
- Error boundary gained a real reload action; keyboard guards ignore auto-repeat and only text-entry controls block hotkeys.
- The menu uses the canonical focus utility and `aria-modal="true"`.
- Strip state resets with the gesture.
- Boot uses a cheap Medium placeholder (`skipTerrain`); the real map is generated when the colony starts.
- A command older than the stall threshold is a stall; the reply deadline equals the 15 s ceiling; recovery has a 20 s budget and the main-thread loop keeps ticking during recovery.
- One deadline promise covers the export; the losing timer is cleared.
- `MAX_PIPELINE_DEPTH` = 1 and `canPipelineTick` uses it; the worker `react()` plugin was removed (worker graph is `.ts`-only; `vite build` verified).
- A test pins the timing constants.

## Save/migration impact

None to file format. The import cap is a memory guard only; the refusal names the limit.

## Verification result

- Focused batch: **13 files / 190 tests passed**; additional worker suites 21 passed; save/load suites 29 passed.
- `npx tsc -p tsconfig.app.json --noEmit`: **PASS**; oxlint on 11 sources: **0**; strict cycles: **PASS**; comment check: **PASS**.
- `npx vite build` after removing the worker plugin: **PASS** (built in 5.78 s).
- Full `standard` suite: run after integration (see remediation log).
