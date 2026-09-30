# AGENTS.md — Wilderfolk Godot Port

You are porting **Wilderfolk** from TypeScript/React to Godot, in **GDScript**. Ship **correct, minimal,
verified** changes. In a port, "correct" has a precise meaning: **the GDScript reproduces the TypeScript
behaviour exactly.** Most rules below follow from that one sentence.

---

## 1. The two repositories

| Path | Role |
|---|---|
| `C:\Wilderfolk` | **The oracle.** The TypeScript/React game (~81k lines, 353 source files). Its observable behaviour is the specification. |
| `C:\Wilderfolk2` | **The port.** This project. Godot **4.7.2**, GDScript. |

- **Never invent behaviour.** To learn what a rule does, read it in the TypeScript source. Do not guess, and
  do not "improve" a rule because it looks wrong — **a difference from the oracle is a bug by definition.**
- **Do not refactor `C:\Wilderfolk`.** It exists to stay green and to be reproduced. *Permitted:* fixes that
  make its behaviour correct, or that make golden-master extraction possible. *Not permitted:* refactors,
  dead-code cleanup, feature work, or "improving" anything the port replaces.
- The oracle's gate is `npm run test:all` **plus** `npm run test:full-year` (360 days, ~59 s, 0 invariant
  violations). Both are green. Keep them green — a broken oracle produces meaningless golden values.
- Useful oracle documents: `docs/SIM_RNG_GUIDELINES.md`, `docs/archive/SIMULATION_ARCHITECTURE_0_6_1.md`
  (ownership map — treat it as the porting task list), `docs/HANDOVER-godot-port-2026-09-30.md`.
- **This project's own documents:** [`ARCHITECTURE.md`](ARCHITECTURE.md) decides what may change — the
  simulation is **sacred and ported, never rewritten**; terrain and presentation are free; and the eleven-entry
  seam is the wall between them. [`ROADMAP.md`](ROADMAP.md) is the port plan, the phase order and what is
  already verified; [`MCP.md`](MCP.md) is the Godot AI tool reference — 29 domains, 13 resources, and the
  gotchas that have already bitten. This file is the protocol that binds them.

## 2. Language: GDScript, not C#

Not a style preference:

- The Godot AI MCP plugin treats C# as **text-only** — `diagnostics_status="not_checked"`, no build, no
  compiler diagnostics. With C#, you cannot verify your own work.
- GDScript is **parse-validated** on write by `script_create` / `script_patch`, so a syntax error surfaces
  immediately instead of at runtime.

Use static type hints everywhere (`var x: int`, `-> void`, `Array[String]`). The TypeScript being ported is
heavily typed; hints are how a wrong port gets caught early.

*Escape hatch:* if profiling later shows one hot module cannot keep up, move **that module** to C# or
GDExtension. Never start there.

## 3. The binding rule: parity

**Parity-locked — must match the oracle bit-for-bit:**

- `simRng` owner streams and every seeded derivation (`SimRngCore` / `SimRng`)
- the tick layers and their fixed order: **realtime → systems → assign → daily**
- state transitions, the save format, and every gameplay rule
- the simulation invariants (`simulationInvariants`)

**Free to redesign — do NOT parity-test; use Godot's own tools:**

- terrain generation (noise, tiles, hydrology) — Godot's tooling is better than what it replaces
- rendering, UI, audio, animation — the React + canvas2D layer is **deleted, not ported**

To keep the two apart: **snapshot `WorldState` from TypeScript *after* worldgen, and feed that same state
into the GDScript simulation.** Parity then tests the rules rather than the terrain, and terrain stays free
to change.

## 4. Verification — the part that decides whether this port succeeds

### 4.1 The MCP workflow

The Godot AI plugin attaches to a **running editor**. Close the editor and every `mcp__godot-ai__*` tool
stops working. [`MCP.md`](MCP.md) is the full surface: the domain list, the read-only resources, and the
per-tool notes for driving the editor and the running game.

- Write `.gd` files with `script_create` / `script_patch`, never by hand — they parse-validate and report
  diagnostics.
- **After adding a `.gd` that declares `class_name`, run `filesystem_manage(op="scan")`.** Global class
  names only register on a scan; until then other scripts cannot resolve the type.
- Run suites with `test_run` (`suite="<name>"` for one). It discovers `res://tests/test_*.gd` and runs every
  `test_*` method.
- Suites `extends McpTestSuite` and use its assertions: `assert_true`, `assert_false`, `assert_eq`,
  `assert_ne`, `assert_gt`, `assert_contains`, `assert_has_key`, `assert_is_error`; plus `skip`,
  `fail_setup`, `skip_suite` for preconditions. Godot ships **no** test framework — these suites are ours.
- To observe behaviour: `editor_screenshot`, `logs_read`, `game_manage(op="input_sequence")` for
  frame-accurate input, `editor_manage(op="game_eval")` to run GDScript in the running game.

### 4.2 Enforcement must be automatic, not a ritual

This is the single most important lesson carried over from the TypeScript repo, and it is why the port
exists in the first place. That repository has an invariant collector, a testing bot and 1495 passing tests —
and runs **one** of them automatically. Its strongest gate was run by hand every few days, so regressions
were found late and "changes did not resolve".

**Do not reproduce that here.** The parity suite is the gate. It runs on every change to simulation rules,
and it is not something a human remembers to invoke.

Practical consequence: when you port a rule, port its **test at the same time**. A rule without a parity
test is unverified, however carefully it was written.

### 4.3 The oracle's correctness definition

`collectSimulationInvariantErrors(world)` in `C:\Wilderfolk\src\game\simulation\simulationInvariants.ts` is
the project's definition of a valid world: no human in two occupant lists, `homeBuildingId` matches the
occupant list, a pregnant human has pregnancy progress, at most one living cursed Moon Howler, a manual
building is never auto-staffed, a leader's office and workplace do not overwrite each other.

**Port that collector early and run it every tick.** It is more valuable than any single gameplay rule,
because it is what makes a divergence *visible* instead of a mystery.

## 5. Port order

Do not reorder this without a reason you can state.

1. ✅ `simRng` / `SimRngCore` — **done and green**: bit-exact against TypeScript, 10 tests / 386 assertions.
2. **`simulationInvariants`** — the correctness oracle (§4.3). Port next, before more rules.
3. **`saveLoad`** on the **same JSON schema** — it is simultaneously the save format and the diff format.
4. **Tick layers** in fixed order, with their parity tests.
5. **Worldgen** — free to redesign; verify by invariants and by eye, not by parity.
6. **Presentation last** — `TileMapLayer`/`MultiMesh` terrain, `Control`-tree UI replacing the React panels.

### 5.1 Current verified state

- `src/game/sim_rng_core.gd` — `SimRngCore`, bit-exact 32-bit math
- `src/game/sim_rng.gd` — `SimRng`, owner-stream registry + snapshot/restore
- `tests/test_sim_rng.gd` — suite `sim_rng`, **10 tests / 386 assertions / 0 failed**
- `tests/fixtures/sim_rng_golden.json` — golden values, **must stay UTF-8**
- Oracle generator: `C:\Wilderfolk\scripts\dump-sim-rng.mts`
  (`cd C:\Wilderfolk; npx tsx scripts/dump-sim-rng.mts` writes the fixture directly as UTF-8).
  It moved out of `tmp/` on 2026-09-30: the oracle's `npm run clean` now empties `tmp/` wholesale, so a
  generator that lives there is a generator that disappears. Do not move it back.

## 6. Hazards — each of these has already caused a real failure

**JavaScript is 32-bit, GDScript `int` is signed 64-bit.**
- Hold RNG state as **unsigned 32-bit** and re-mask with `0xFFFFFFFF` after every operation that can exceed
  32 bits.
- Compute `imul` from **16-bit halves**. A naive `a * b` on two values near 2³² reaches ~1.8e19, past the
  signed 64-bit ceiling (~9.2e18), so it would depend on int64 wraparound.
- A wrong RNG still produces plausible numbers, so this failure looks like hundreds of logic bugs instead of
  one. That is why §5.1's suite gates everything.

**Godot's JSON parser returns every number as a `float`.** Cast golden values with `int(...)` before
comparing.

**Golden fixtures must be UTF-8.** Windows PowerShell 5.1 `>` writes **UTF-16LE** (`FF FE`), which Godot's
`FileAccess` cannot parse. Never generate a fixture with shell redirection — let the tool that owns the data
write it.

**The shell.** Verify before trusting PowerShell 7 syntax:
`$PSVersionTable.PSVersion.ToString()`. If it reports `5.1`, read the **PowerShell 5.1 fallbacks** in
`C:\Wilderfolk\command.md` — `&&` is a parse error there and `>` writes UTF-16LE. A harness can hold a stale
shell resolution from before PowerShell 7 was installed, so never assume.

## 7. GDScript rules that are cheap now and expensive later

These are not our own scars — they come from a mature Godot 4.7 plugin's rules file, and they hold here for
the same mechanical reasons. Each one is a *silent* failure mode, which is why they are written down rather
than left to taste.

**Signals: use the `Signal` object, never the string form.**

```gdscript
sig.connect(callable)          # not connect("sig", callable)
sig.emit(args)                 # not emit_signal("sig", args)
sig.is_connected(callable)     # not is_connected("sig", callable)
```

The string form still works in Godot 4, which is exactly why it survives: a typo in the signal name is
unchecked and only surfaces at runtime, while the `Signal` form fails at **parse** time. Mixing both in one
file is how it creeps back — **when you touch such a call, convert the others in that file in the same
change.**

**Numeric fields: `PackedFloat32Array` / `PackedInt32Array`, not `Array`.**

The oracle stores its fields as `Float32Array` — `elevation`, `moisture`, `temperature`, `riverDist`. The
direct analogue is `PackedFloat32Array`, and it is the correct choice for two independent reasons: packed
arrays are contiguous and unboxed, while an untyped `Array` boxes every element; and a plain float array in
GDScript is **64-bit where the oracle is 32-bit**, so a rule that depends on rounding would diverge silently.
Match the width, not just the type.

**Editor-only classes must be guarded at runtime.**

A script that touches `EditorInterface`, `EditorPlugin` or `EditorScript` without an `Engine.is_editor_hint()`
guard fails to register or hard-crashes in an **exported build** — the failure is invisible in the editor,
which is the only place you would have tested it. Any script that must also run inside the editor needs
`@tool` at the top; anything editor-specific belongs behind the guard:

```gdscript
if Engine.is_editor_hint():
    var ei: Object = Engine.get_singleton("EditorInterface")
    if ei:
        print(ei.get_selected_paths())
```

## 8. Reporting

End every task with:

```text
DONE / BLOCKED: <one-line outcome>

Changed:
- <path> — what changed and why

Verification:
- parity: `test_run suite="<suite>"` — <n tests, n assertions, result>
- oracle impact: <none | which TS behaviour was read and from where>

Notes:
- Assumptions: <...>
- Not yet ported / deliberately deferred: <...>
```

Distinguish **passed / failed / blocked / not run / deferred**. Never report a check as passing unless you
ran it, and never report a rule as ported unless a parity test covers it.

**Mantra:** read the oracle → port the rule *and its test* → run the parity suite → report.
Never invent behaviour, never skip parity, never let verification be a thing someone has to remember.
