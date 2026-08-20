# Wilderfolk Bug Reports

Every discovered bug must be recorded here before or alongside the fix. Keep the report after verification so future contributors understand why the guard, invariant, or test exists.

Copy the template below into a new dated file:

```md
# Bug: <short name>

- Status: open | investigating | fixed | verified | won't-fix
- Date discovered:
- Version/build:
- Reporter:
- Area: Play | Truth | worker | UI | save/migration | performance
- Owner module:
- Cadence:

## Status history

Track every status change with its date — the report always starts `open` on the
date discovered, then moves through `investigating` / `fixed` / `verified` /
`won't-fix` as the situation changes. Keep the full history after the fix so
future readers see when and why the status changed.

- YYYY-MM-DD — open (how it was discovered)
- YYYY-MM-DD — investigating / fixed / verified / won't-fix (reason)

## Observed behavior

## Expected behavior

## Reproduction steps

1.
2.
3.

## Evidence

Console output, screenshot, save identifier, diagnostic output, or test fixture.

## Root cause

## Fix

## Regression test

## Invariants checked

## Save/migration impact

## Verification result

## Related commits or files
```

The fixed tick-layer structure is documented in `SIMULATION_AUTHORITY.md`. Do not add a new tick layer without first updating that authority document and recording the architectural reason.
