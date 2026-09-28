# Bug: `tsc -b` failed — the new `assignResident` command did not match its owner

- Bug: Worker command `assignResident` passes a resident id that no owner accepts
- Status: resolved
- Date discovered: 2026-09-13
- Version/build: Wilderfolk 0.6.4.1 working tree
- Reporter: found while verifying the Auto-play task (`npm run build` / `tsc -b`)
- Area: worker
- Owner module: `src/game/simWorker/commands.ts`
- Cadence: n/a (compile-time)

## Status history

- 2026-09-13 — open: `tsc -b` reported `src/game/simWorker/commands.ts(332,62): error TS2554: Expected 2 arguments, but got 3.`
- 2026-09-13 — resolved: the command now matches the owner's two-argument contract; `tsc -b` exits 0.

## Observed behavior

The project does not build:

```text
src/game/simWorker/commands.ts(332,62): error TS2554: Expected 2 arguments, but got 3.
```

`tests/` runs were unaffected — the failure is only visible through the app
project (`tsc -b`), not through `tsconfig.vitest.json`.

## Expected behavior

`npm run build` (and `tsc -b`) compiles cleanly.

## Reproduction steps

1. `node node_modules/typescript/bin/tsc -b` (or `npm run build`).

## Root cause

The working tree added a new worker command:

```ts
| { proto: 1; op: 'assignResident'; buildingId: number; humanId: number }
```

routed as `assignResidentToBuilding(world, cmd.buildingId, cmd.humanId)`. The
residency owner's exported action is
`assignResidentToBuilding(originalState, buildingId)` — it re-runs **automatic**
housing assignment ("settlers pick homes by themselves") and has no per-resident
rule. The same owner is called two-argument from the main-thread route
(`buildingActionRouting.ts:25`), and no caller anywhere sends `assignResident`
(`*.ts` / `*.tsx` grep: only the union, the op set, the validator, and the route).

## Fix

Aligned the command with its owner instead of inventing a per-resident assignment
rule:

- union: `| { proto: 1; op: 'assignResident'; buildingId: number }`
- validator: `isFiniteNumber(cmd.buildingId)`
- route: `assignResidentToBuilding(world, cmd.buildingId)`

If a per-resident "assign this settler to this house" action is wanted later, it
belongs in the residency owner first, and the command can carry the id afterwards.

## Save/migration impact

None — worker commands are runtime messages; nothing here is persisted.

## Verification result

`tsc -b` exits 0; `oxlint --type-aware --type-check` 0 warnings / 0 errors on all
320 files; the full local suite passes.

## Related commits or files

- `src/game/simWorker/commands.ts`
- `src/game/buildingResidencyActions.ts` (owner contract)
- `src/game/buildingActionRouting.ts` (main-thread route)
