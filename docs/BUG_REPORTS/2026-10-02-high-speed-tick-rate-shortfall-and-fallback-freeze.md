# Name of file: 2026-10-02

- Bug: High speed multipliers cannot reach their tick rate, and the worker-stall fallback freezes the frame
- Status: investigating
- Date discovered: 2026-10-02
- Version/build: 0.6.5.0, dev server session (console shows `@react-refresh`)
- Reporter: owner (console log pasted into the session) + agent trace of the loop
- Area: performance / worker
- Owner module: `src/game/gameLoop.ts` (`frameBody`, the stall detector, `fallbackFromWorker`); `src/game/simWorker/GameWorkerHost.ts` (pipeline depth, tick results)
- Cadence: whenever the demanded tick rate exceeds what one tick costs on the machine

## Status history

- 2026-10-02 — investigating (owner's log attributed to its numbers: the shortfall is tick cost, not the
  catch-up budget; two further defects — an unbounded tick accumulator and a diagnostic that reports
  clamped frame time — turn one slow tick into seconds of frozen UI. No fix applied.)

## Observed behavior

A three-minute log at **10×** on a developed colony. Target is `10 ticks/s`; the game delivers 0–5:

```text
[SpeedDiag] speed=10x  achieved=2 ticks/s  target=10  ratio=0.17  fps=13  frameMs=71.9  msPerTick=100.0
[SpeedDiag] speed=10x  achieved=0 ticks/s  target=10  ratio=0.00  fps=17  frameMs=58.0  msPerTick=100.0
[SpeedDiag] speed=10x  achieved=0 ticks/s  target=10  ratio=0.00  fps=21  frameMs=45.4  msPerTick=100.0
[GameLoop] Worker tick exceeded 10000ms (in-flight=4, observed=344ms)
[GameLoop] Worker tick stalled — falling back to main-thread ticks
[SpeedDiag] speed=10x  achieved=2 ticks/s  target=10  ratio=0.16  fps=3   frameMs=45.1  msPerTick=100.0
[SpeedDiag] speed=10x  achieved=4 ticks/s  target=10  ratio=0.44  fps=0   frameMs=100.0 msPerTick=100.0
[GameLoop] Sim worker recovered automatically
[SpeedDiag] speed=10x  achieved=0 ticks/s  target=10  ratio=0.00  fps=20  frameMs=50.3  msPerTick=100.0
[GameLoop] Worker tick exceeded 10000ms (in-flight=4, observed=142ms)
[GameLoop] Worker tick stalled — falling back to main-thread ticks
[SpeedDiag] speed=10x  achieved=4 ticks/s  target=10  ratio=0.36  fps=0   frameMs=100.0 msPerTick=100.0
```

The cycle — slow, stall, fall back, recover, stall again — repeats twice in the log.

## Expected behavior

At 10× a day takes `72 ticks ÷ 10 ticks/s = 7.2 s`, and `msPerTick` already says `100.0`. The world
clock should not fall permanently behind wall time, and losing the sim worker should never cost the
player the renderer.

## Reproduction steps

1. Load a developed colony (the owner's save).
2. Set speed to 10× (5× shows the same shape — `BUG_REPORTS/2026-10-01-save-crashes-after-worker-stall.md`
   recorded `speed=5x achieved=0 ticks/s … fps=0` in its own reproduction steps).
3. Watch the console for `[SpeedDiag]`; wait for `Worker tick exceeded 10000ms`.

## Evidence

The numbers are the owner's own diagnostic (`gameLoop.ts:1050`) against the constants in the tree:

| quantity | value | source |
|---|---|---|
| `BASE_TICKS_PER_SECOND` | `1` → target 10 ticks/s at 10×, `msPerTick = 100 ms` | `gameLoop.ts:42`, `:958` |
| frame intake | `dtMs = Math.min(gap, 100)` → **at most one tick's worth per frame** | `gameLoop.ts:945` |
| pipeline depth | `RENDER_BUFFER_POOL_SIZE (5) − 1 = 4` → matches `in-flight=4` | `renderBufferPool.ts:5`, `GameWorkerHost.ts:79` |
| catch-up budget at 10× | `min(240, max(12, 20)) = 20` steps/frame → **not** the limit | `gameLoop.ts:47`, `:63-67` |
| in-game tick EWMA | `344 ms` then `142 ms` → drain `1000/344 = 2.9` and `1000/142 = 7.0` results/s | `gameLoop.ts:381-383`, log |
| achieved in the log | `2`, `2`, `0`, `0`, `0`, then `2`, `4`, then `5`, `1`, `0`, `3` | log |

The achieved rate tracks `min(fps, 1000 / latency, pipeline slots)`:

- **`achieved=0 ticks/s` with `fps=13…21` is not a stall** — four ticks are in flight, so
  `canPipelineTick()` is false and the loop posts nothing (`gameLoop.ts:981-993`). The worker is simply
  still working.
- **`achieved=2` with `observed=344 ms`** is the drain ceiling: `1000/344 = 2.9` ticks/s.
- After recovery the EWMA is `142 ms` → `1000/142 = 7.0` → the log shows `achieved=5`.

So the answer to the question `SpeedDiag`'s own docstring poses (*"the per-frame catch-up budget … or
the raw cost of one tick"*, `gameLoop.ts:162-173`) is unambiguous in these numbers: **the cost of one
tick**. The budget is 20/frame and is never reached on the worker path, because intake is capped at one
tick per frame.

**Why a "stall" is declared while the EWMA reads 344 ms.** `frameBody` fires the watchdog on
`hasTickInFlight() && performance.now() - lastWorkerActivity > stallMs` (`gameLoop.ts:971-973`), i.e. on
**silence**, with `stallMs = min(15000, max(10000, latency × 4))` (`:789-794`). Four in-flight ticks at
344 ms each is 1.4 s of work, so 10 s of silence is not "a slow tick" — either one tick hung, or the
worker thread was starved of CPU. The log line cannot tell those apart, because `observed=` prints the
**EWMA** (`gameLoop.ts:977`), not the elapsed silence it actually measured.

**Why the fallback freezes the frame.** `fallbackFromWorker` (`:442-453`) sets `workerEnabled = false`,
and the *same* `frameBody` then falls into the main-thread branch (`:1002-1022`), which runs up to
`catchUpBudgetFor(10) = 20` ticks on the thread that must also draw — at 142–344 ms each, a 3–7 second
frame — and drops the worker's render buffers on the way (`:1023-1024`, `renderSoA = null`), so drawing
also reverts to its slow path. The log's `fps=0 frameMs=100.0` lines are exactly this: **one frame per
three-second window**, reported as `100.0 ms` because `diagFrameMs += dtMs` accumulates the *clamped*
`dtMs` (`:945` vs `:1043`). The diagnostic cannot show the freeze it is measuring.

**Why it never recovers.** `tickAccumulator` (`:159`) is added to every frame (`:957`), decremented per
step (`:988`, `:1008`) and **never clamped** — only reset on pause (`:1028`) and on a session reset
(`:825`). At 10× the intake is 10 ticks/s of wall time while the drain is 2.9–7 ticks/s, so the bank
grows without bound; every slow frame and every fallback win leaves it deeper in debt, and the debt is
replayed 20 ticks at a time for as long as it takes. That is the difference between "10× is a bit slow"
and "the UI locks up for seconds".

## Root cause

Four defects, in the order they bite:

1. **Tick cost above the multiplier's budget.** For speed `S`, a tick must cost ≤ `1000/S` ms: **100 ms at
   10×**. Measured: 142–344 ms, i.e. a sustainable ~3–7×, before any rendering. The repository's own
   per-tick budget (`PACING_TICK_BUDGET_MS = 1000` ms, `scripts/colonyHealth.ts:58`) is the **1×**
   budget, which is why no harness reports this: a 344 ms tick is comfortably "fine".
2. **A frame can bank at most one tick** (`dtMs` clamped to 100 ms) while `msPerTick` is also 100 ms at
   10×, so the sim worker's rate is additionally capped by the frame rate — `achieved ≤ fps`.
3. **The accumulator has no debt cap**, so time the engine cannot replay is kept and replayed later at
   up to 20 ticks per frame. A hiccup becomes permanent lag and multi-second frames.
4. **The stall response is worse than the stall**: the fallback moves the simulation onto the render
   thread, keeps the debt, and discards the worker's render buffers — turning a slow worker into a
   frozen game. The recovery (`WORKER_RECOVERY_INITIAL_DELAY_MS = 2000`, `:346-352`) then re-arms the
   worker and the cycle repeats, which is what the log's two cycles are.

Plus one diagnostic defect that hid all of it: `SpeedDiag` reports clamped frame time, and the stall
warning prints the tick EWMA where a reader expects the measured silence.

## Regression test

None yet — a fix changes pacing and needs the owner's decision first (below). The natural guard is a
`gameLoop` unit test in the shape of `tests/gameLoop.test.ts`: a fake host whose ticks are slow/never
arrive, asserting that (a) banked time is clamped after the fallback and (b) `SpeedDiag`'s reported
frame time is the raw gap, not the clamped one.

## Invariants checked

- *"The world clock keeps up with wall time"* — **violated** at 10× (the accumulator is
  monotonically behind and cannot catch up while intake > drain). `[verified]`
- *"The UI never mutates the world"* — held; nothing here writes state outside the tick layers.
  `[verified]`
- *"One owner per rule"* — the reverse: `msPerTick` exists in `frameBody` (`:958`) and in the diagnostic
  (`:1051`), and the per-tick budget exists again as `PACING_TICK_BUDGET_MS` in the harness. `[verified]`

## Save/migration impact

None.

## Verification result

- Not reproduced by me: no game or browser session was started, and no fix was applied. The evidence is
  the owner's in-game diagnostic plus the constants read in the tree.
- The public gates at this revision are unaffected by this report (types, lint, docs guards, unit, dup,
  cycles pass; `knip` is red for unrelated, pre-existing reasons).

## Related commits or files

- `src/game/gameLoop.ts` — `dtMs` clamp (`:945`), `msPerTick` (`:958`), intake and budget (`:981-999`),
  main-thread fallback burst (`:1002-1026`), stall detector (`:970-979`), `workerStallThresholdMs`
  (`:789-794`), `SpeedDiag` (`:1040-1063`), `fallbackFromWorker` (`:442-453`), accumulator (`:159`)
- `src/game/simWorker/GameWorkerHost.ts` — `MAX_PIPELINE_DEPTH` (`:79`), `canPipelineTick` (`:320-322`),
  `getTicksInFlight`
- `src/game/simBuffers/renderBufferPool.ts:5` — `RENDER_BUFFER_POOL_SIZE = 5`
- `scripts/colonyHealth.ts:58` — `PACING_TICK_BUDGET_MS = 1000`, the harness's 1× tick budget
- `BUG_REPORTS/2026-10-01-save-crashes-after-worker-stall.md` — the same stall signature on the save
  path; its reproduction steps already record `speed=5x achieved=0 ticks/s … fps=0`
- `src-tauri/tauri.conf.json` — the recent `additionalBrowserArgs` that disable WebView2 background
  throttling: evidence the owner has already fought one source of worker silence

## Fix

Not applied — every option below changes pacing or UX, which is the owner's call.

- **P1 · diagnostic truth (no behaviour change, ~5 lines).** Track the raw frame gap and log it beside
  the clamped one; print the measured silence (`performance.now() - lastWorkerActivity`) in the stall
  warning instead of the tick EWMA; correct the docstring's "10 ms at 10×" (`:169`) to 100 ms.
- **P2 · cap the banked lag.** `tickAccumulator = Math.min(tickAccumulator, catchUpBudget * msPerTick)`
  whenever the engine falls behind (at minimum on `fallbackFromWorker`). This is the standard max-lag
  rule: it trades world-clock fidelity for the guarantee that the game cannot replay minutes of missed
  time inside a single frame.
- **P3 · make the fallback a throttle, not a demotion.** Keep the worker (it is the thread that can
  afford the sim) and let the speed multiplier become a ceiling the engine reports honestly, or, if the
  fallback stays, cap its first burst at `MAX_CATCHUP_STEPS` and clear the debt rather than inheriting
  it.
- **P4 · the honest 10×.** Either measure and publish what the machine can sustain (the harness already
  counts `stalledTicks` against `PACING_TICK_BUDGET_MS` in `scripts/run-full-year.mts`) and clamp the
  multiplier to it with a visible note, or reduce tick cost where the profile says it is — or change the
  model so a higher multiplier means *fewer, larger* steps instead of more ticks. The last is
  architecture and needs an explicit decision.
