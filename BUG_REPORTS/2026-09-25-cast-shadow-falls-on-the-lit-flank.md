# Name of file: 2026-09-25

- Bug: the cast shadow is traced **down-light**, so the ground it darkens is the flank the hillshade is lighting
- Status: resolved
- Date discovered: 2026-09-25
- Version/build: 0.6.5
- Reporter: renderer relief pass (shadows + mountain elevation)
- Area: Play (ground renderer)
- Owner module: `src/game/renderer/whittakerTerrain.ts` (`buildWhittakerFields`)

## Status history

- 2026-09-25 — open (found while measuring how much relief the ground bake shows: the probe's shadow comparison came out with the wrong sign)
- 2026-09-25 — investigating (the sign was traced to the shadow trace's heading, which is the opposite of the hillshade's light)
- 2026-09-25 — resolved (the heading is now one shared constant; the regression test pins which side is shadowed)

## Observed behavior

The ground bake paints a cast shadow, and it paints it on the **wrong side of every ridge**. The
hillshade's light comes from the upper-left, but the shadow trace walked in the opposite direction
(`x + 0.7·step`, `y + 0.8·step`, i.e. down and to the right), so the field recorded "higher ground
down-light of me" — which is the definition of the *lit* flank.

Measured on the shipped bake before the fix (1600×1200, seed 12345, spring, whole-map 1:1, pixels the
old field marked as shadowed vs the rest, one altitude band `0.55 < hn < 0.75` so the comparison is
not a comparison of biomes):

| preset | lit | "shadowed" | difference |
|---|---|---|---|
| highland | 98.6 | 141.1 | **+42.6 luma brighter** |
| scandinavia | 93.4 | 141.2 | **+47.8 luma brighter** |

A cast shadow that makes the ground 43–48 luma *brighter* is not a weak shadow, it is an inverted
one: it was subtracting light from the sunlit face, which both flattened the form the hillshade was
drawing and left the actual lee side unmarked.

## Expected behavior

The shadow field records how much of the sun's path to a cell is blocked, so a cell is shadowed when
the ground **toward the light** (up and to the left, `LIGHT_TOWARD_X/Y`) stands higher than the ray
from the cell to the sun.

## Reproduction steps

1. `npx tsx tmp/probe-relief.mts highland tmp/relief-before` — the "shadow depth" line reports
   `lit 98.6 vs shadow 141.1 = -42.6 luma` (a negative depth is the defect).
2. `npx vitest run tests/groundLook.bands.test.ts` — the case *casts the shadow away from the light
   instead of onto the lit flank* builds a single north-south wall on flat ground and asserts the
   ground to its east (down-light) is shadowed and the ground to its west (up-light) is not. It fails
   against the inverted trace and passes against the fix.

## Evidence

- Probe output above, plus the field statistics after the fix: shadow coverage over land
  **29 % / 14 % / 18 %** (> 0.05) and **11.6 % / 4.7 % / 6.1 %** (> 0.5) on highland / scandinavia /
  continental, and shadow depth **+31.1 / +36.6 / +31.3 luma** — a minority of the land, on the lee
  side, clearly darker.
- 1:1 crops of the same window before and after (`tmp/relief-before-scandinavia.png`,
  `tmp/relief-after-scandinavia.png`).

## Root cause

`LIGHT_TOWARD` was written twice. The hillshade computed `light = (sx · 0.6 + sy · 0.8) · SHADE_GAIN`,
which is a dot product against a light at (−0.6, −0.8) — up-left, correct. The shadow trace marched
to `(+0.7, +0.8)` — the same heading with the sign flipped. Its edge guard (`sx >= cols || sy >= rows`)
matches the flipped heading too, and it recorded the blockers it found there.

A second, independent defect sat in the same loop: the blocker test was a **flat minimum rise**
(`heightDiff > 0`) with a `1/step` falloff, which is not a sun. Any higher ground up-light counted,
however gentle, so once the heading was corrected the same rule put **45 % of highland's land at full
shadow** and simply dimmed the map. It is now a sun inclination: the ground has to climb faster than
`SHADOW_SUN_SLOPE` (0.035 of the elevation range per cell) to block the light at all.

## Regression test

`tests/groundLook.bands.test.ts` → *casts the shadow away from the light instead of onto the lit
flank*: a flat map with one tall north-south wall, built through the real fixture; asserts the cell
two east of the wall (`shadowMap > 0.5`) and the cell two west of it (`=== 0`). Both assertions flip
under the old heading, so the case is a true regression guard rather than a restatement.

## Invariants checked

- One source of truth for the light: the hillshade and the shadow trace both read `LIGHT_TOWARD_X/Y`.
- A shadow is local: coverage stays a minority of the land (`> 0.5` on 4.7–11.6 % of land cells) —
  the property the flat minimum rise violated.

## Save/migration impact

None. The renderer never writes simulation state and the fields are rebuilt per map.

## Verification result

`npm run test:all` green (240 files / 1475 passed, 2 skipped, 0 failed), `tsc` clean, lint 0/0; the
built-artifact browser gate `npm run test:browser` passes. Field build costs **9–10 ms** per map
(shared across every chunk); the per-pixel bake time is unchanged within measurement noise.

## Related commits or files

- `src/game/renderer/whittakerTerrain.ts` — `LIGHT_TOWARD_X/Y`, `SHADOW_SUN_SLOPE`, `SHADOW_OVER_GAIN`,
  `SHADOW_DISTANCE_FALLOFF`, `SHADOW_STRENGTH`, `SHADOW_TRACE_STEPS`.
- `tests/groundLook.bands.test.ts`, `tmp/probe-relief.mts`

## Fix

The light direction is one named constant pair, read by both the hillshade and the trace; the trace
walks toward the light (up-left, out of bounds on the low side), looks 14 cells instead of 6, and
compares the ground's up-light climb per cell against a **sun inclination** rather than zero, with a
distance falloff and a named shadow strength.
