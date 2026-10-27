# Name of file: 2026-10-01

- Bug: Saving dereferences the sim host after a worker fault replaced it
- Status: resolved
- Date discovered: 2026-10-01
- Version/build: 0.6.5.0 (`GAME_VERSION`), reported by the owner as "the error comes when is save"
- Reporter: owner report + agent code trace
- Area: save/migration
- Owner module: `src/game/gameLoop.ts` (`exportAuthoritativeWorld`); host contract in `src/game/simWorker/GameWorkerHost.ts`
- Cadence: whenever a worker fault lands inside the save window

## Status history

- 2026-10-01 — open (owner report "the error comes when is save"; reproduced from the running game's console output)
- 2026-10-01 — resolved (host captured and identity-checked; regression test added and negative-controlled)

## Observed behavior

Two distinct failures appear on the save path, in this order:

```text
[GameLoop] Worker tick exceeded 10000ms (in-flight=4, observed=122ms)
[GameLoop] Worker tick stalled — falling back to main-thread ticks
[GameLoop] exportSave failed — using main shadow Error: Worker idle wait timed out
    at gameLoop.ts:747:37
[GameLoop] exportSave failed — using main shadow TypeError: Cannot read properties of null (reading 'exportSave')
    at GameLoop.exportAuthoritativeWorld (gameLoop.ts:753:27)
    at async persistGameOnce (useGamePersistence.ts:108:19)
    at async persistGame (useGamePersistence.ts:88:12)
```

1. `Error: Worker idle wait timed out` — a graceful degradation; the save still completes from the main-thread shadow world.
2. `TypeError: Cannot read properties of null (reading 'exportSave')` — a genuine dereference of a host that is no longer there. Same console warning prefix, so it reads as the same problem, but it is a different defect.

## Expected behavior

`exportAuthoritativeWorld` either returns the worker's authoritative world or falls back to the main-thread shadow world. It must not read a host it did not start with, and the fallback must not depend on a field that a fault handler may replace at any time.

## Reproduction steps

1. Load any colony and set speed to 5x or 10x (the state the owner was in — `[SpeedDiag] speed=5x achieved=0 ticks/s ... fps=0`).
2. Let the frame loop stop servicing the worker long enough for the stall detector to fire: `stallMs = max(WORKER_STALL_TIMEOUT_MS = 10_000, workerTickLatencyMs * 4)` (`gameLoop.ts:933`) — a main thread paused/blocked ~10 s, or a genuinely slow tick.
3. While that is happening, save the game (the owner used Save to file).
4. Observe the console: the `TypeError` appears when the fault lands between `whenIdle()` resolving and `exportSave()` being called.

## Evidence

The decisive lines, read in the tree before the fix:

`src/game/gameLoop.ts:733-755` — the guard is checked **once**, before two `await`s:

```ts
async exportAuthoritativeWorld(timeoutMs = 10_000): Promise<WorldState> {
    if (this.workerEnabled && this.workerHost?.isReady()) {
      const exportGen = this.sessionGen;
      try {
        await Promise.race([
          this.workerHost.whenIdle(),
          ...
        ]);
        if (exportGen !== this.sessionGen) return this.world;

        const exported = await Promise.race([
          this.workerHost.exportSave(),   // <-- reads the field again, after the await
```

`src/game/gameLoop.ts:433-444` — the fault handler that removes the host, reachable at any time from the frame loop:

```ts
  private fallbackFromWorker(reason: string): void {
    ...
    this.workerHost?.dispose();
    this.workerHost = null;
```

`src/game/gameLoop.ts:938-942` — the frame-loop trigger, on the same 10 s figure as the export timeout:

```ts
        if (stalled) {
          console.warn(
            `[GameLoop] Worker tick exceeded ${stallMs.toFixed(0)}ms ...
          );
          this.fallbackFromWorker('Worker tick stalled');
```

`src/game/gameLoop.ts:71` — `const WORKER_STALL_TIMEOUT_MS = 10000;`, and `exportAuthoritativeWorld(timeoutMs = 10_000)` shares that value, so the stall fallback and the export timeout race each other by construction.

The guard style was the anomaly: `queueWorkerImport` in the same file (`:537-562`) already captured the host and re-checked it by identity after every await, and `fallbackFromWorker` does **not** bump `sessionGen` — so the identity test was the only one that could catch a host swap.

## Root cause

`exportAuthoritativeWorld` read `this.workerHost` **outside** the guard that established it was usable, on the far side of two `await`s.

1. The guard established `this.workerHost` present and ready.
2. It awaited `whenIdle()`.
3. During that await the frame loop's stall detector called `fallbackFromWorker('Worker tick stalled')`, which disposed the host and set `this.workerHost = null`.
4. The post-await re-check tested only `exportGen !== this.sessionGen`, which a fallback does not change.
5. The next line read the host again — `null` — and threw.

The `whenIdle()` timeout was a separate, benign symptom of the same stall: the worker was not finishing ticks, so `isIdle()` (`GameWorkerHost.ts:315-317`) stayed false until the 10 s race rejected.

**Retraction.** An earlier revision of this report claimed the post-await read was reached with a *null* host only, and proposed that throw as the sole defect. Instrumenting the function showed the null case is swallowed by the `catch` and still returns the display world; the same dereference with a **replacement** host is the one that silently reads from a host the save never started with. The fix covers both, and the regression test pins the replacement case because that is the observable one.

## Regression test

`tests/gameLoop.test.ts` → `gameLoop.exportAuthority.test.ts` → *"ignores a host that was replaced while the save waited"*.

The fake host resolves `whenIdle()` only *after* swapping in a replacement host, so the swap lands inside the await, past the opening guard. Two hosts rather than `null` is deliberate: the `null` dereference is swallowed by the catch, so a `null` seam cannot tell the broken and fixed paths apart — both return the display world. With a replacement host the distinction is observable: pre-fix the save calls the **replacement's** `exportSave` (count 1, and it returns that host's world); post-fix the identity guard fires and it is never called (count 0, display world returned).

- With the fix: 27/27 pass in the file.
- Negative control (fix reverted, guard weakened to the `sessionGen`-only test): the new test fails with `expected 1 to be +0` — it does reproduce the defect. Verified by reverting and re-running, then restoring.

## Invariants checked

- "Save never loses the colony": held. Both paths persist `this.world`, and `fallbackFromWorker` calls `syncAfterWorkerMutation()` (`:438`) before removing the host, so the display world is the worker's world at the moment of the fault. Falling back is correct; reading a replaced host is not.
- "The UI never mutates the world": held — `exportAuthoritativeWorld` is a read.

## Save/migration impact

No save-format impact and no data loss. The colony was still written; the cost was a thrown `TypeError` inside the export path, indistinguishable in the console from the handled timeout — which is why this was reported as one error instead of two.

## Verification result

- `npx tsc -p tsconfig.vitest.json --noEmit` — passed.
- `npx vitest run tests/gameLoop.test.ts` — 27 passed.
- Negative control as described above — failed as required, then restored.
- `node scripts/test.mjs all` — see the session report.

## Related commits or files

- `src/game/gameLoop.ts` — `exportAuthoritativeWorld` (`:733`), `fallbackFromWorker` (`:433`), stall detector (`:930-942`), `WORKER_STALL_TIMEOUT_MS` (`:71`), the identity-guard precedent in `queueWorkerImport` (`:537`)
- `src/game/simWorker/GameWorkerHost.ts` — `isIdle` (`:315`), `whenIdle` (`:319`), `exportSave` (`:492`), `dispose` (`:244`)
- `src/hooks/useGamePersistence.ts:102-109` — the only caller, reached from the menu's save, auto-save and the unmount save
- `tests/gameLoop.test.ts` — the regression test's owner suite
- `BUG_REPORTS/2026-09-16-loading-a-save-freezes-the-sim-worker.md` — the sibling hazard on this host (`whenReady` vs polling `workerBooting`)

## Fix

Applied. The host is captured once and re-checked by identity after each await, matching `queueWorkerImport`:

```ts
    const host = this.workerHost;
    if (this.workerEnabled && host?.isReady()) {
      const exportGen = this.sessionGen;
      try {
        await Promise.race([ host.whenIdle(), /* timeout */ ]);
        if (exportGen !== this.sessionGen || this.workerHost !== host || !host.isReady()) {
          return this.world;
        }

        const exported = await Promise.race([ host.exportSave(), /* timeout */ ]);
        if (exportGen !== this.sessionGen || this.workerHost !== host) return this.world;
```

Two follow-ups, deliberately **not** done here because they change behaviour beyond the defect and belong to the owner's call:

- `whenIdle()` can never resolve while `pendingExport` is set (`isIdle()` counts it), which is a latent deadlock if an export is ever left pending. `dispose()` rejects it, so today it is masked.
- `WORKER_STALL_TIMEOUT_MS` (10 s) and the export timeout are the same magnitude from two separate constants. Giving the export a longer budget than the stall detector would remove the timeout class entirely rather than degrading around it.

### Also noted, not part of this fix

A red "save failed" toast is a **different** path from the one above: `exportAuthoritativeWorld` failing is only a console warning, while the toast comes from `persistGameOnce` when `saveGame` itself refuses (`saveLoad.ts:415-427`, e.g. the `localStorage` quota) or from the auto-save failure handler (`useGamePersistence.ts:18`). The file-download path writes the browser slot as a side effect (`saveLoad.ts:227-231`), silently ignoring a quota failure there. The owner's exact toast text was not confirmed, so no change was made on that path.
