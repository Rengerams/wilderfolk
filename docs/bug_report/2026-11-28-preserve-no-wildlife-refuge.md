# Preserve promises wildlife recovery without habitat

- Bug: completed Wildlife Preserves affect abstract health and pollution but not local hunting or wildlife replenishment.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-28
- Version/build: 0.6.5.2 development, base 8dd5190
- Reporter: player question and code trace
- Area: wildlife management
- Owner module: `wildlifePopulationPolicy.ts`, `worldGen.ts`, existing hunting owners

## Status history
- 2026-11-28 — investigating: implemented shared protected habitat rule; CI pending.

## Observed versus expected
Building description promises recovery, but original hunting and refill paths never read completed preserves. Local habitat should shelter wildlife from settler hunting and help scarce grazer populations recover.

## Reproduction and evidence
Trace `huntingSpotTarget`, `tickHumanHunting` and `replenishDepletedWildlife` at base 8dd5190. No preserve input exists in these paths.

## Fix
Completed preserves protect wildlife within 96 px of the centre; both settler hunting paths consult one policy predicate, including committed targets. Existing three-day grazer refill is directed into a rotating completed preserve and begins at 1.5 times the normal scarcity threshold when grass is sufficient. The per-pulse cap and predator carrying-capacity rules remain unchanged. Failed local placement falls back to the existing ring.

## Save/migration impact
None. Protection is derived from completed buildings, with no second scheduler or state.

## Verification
Regressions added for committed prey and preserve restock; not run locally; CI pending.
