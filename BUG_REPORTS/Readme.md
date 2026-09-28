# Wilderfolk Bug Reports

Every discovered bug must be recorded here before or alongside the fix. Keep the report after verification so future contributors understand why the guard, invariant, or test exists.

`SUMMARY.md` is the one-file register of every report (date discovered → date solved, problem, fix). Add a line there whenever you add a report.

Copy the template below into a new dated file:

```md
# Name of file: yyyy-mm-dd 

- Bug: <short name>
- Status: open | investigating | resolved | resolved — live verification pending | won't-fix
- Date discovered:
- Version/build:
- Reporter:
- Area: Play | Truth | worker | UI | save/migration | performance
- Owner module: (optional)
- Cadence: (optional)

## Status history

Track every status change with its date — the report always starts `open` on the
date discovered, then moves through `investigating` / `resolved` /
`resolved — live verification pending` / `won't-fix` as the situation changes.
Use `resolved` once the repair and required automated evidence are complete.
Use `resolved — live verification pending` only when the code is solved but a
specific player-facing browser/play check remains to be recorded. Keep the full
history so future readers see when and why the status changed.

- YYYY-MM-DD — open (how it was discovered)
- YYYY-MM-DD — investigating / resolved / resolved — live verification pending / won't-fix (reason)

## Observed behavior

## Expected behavior

## Reproduction steps

1.
2.
3.

## Evidence

Console output, screenshot, save identifier, diagnostic output, or test fixture. (optional)

## Root cause
(optional)


## Regression test
(optional)
## Invariants checked
(optional)
## Save/migration impact
(optional)
## Verification result
(optional)
## Related commits or files
(optional)
## Fix
(to close the bug in the end)
```

The fixed tick-layer structure is documented in `SIMULATION_AUTHORITY.md`. Do not add a new tick layer without first updating that authority document and recording the architectural reason.
