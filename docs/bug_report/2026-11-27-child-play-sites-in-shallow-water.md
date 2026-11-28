# Children select shallow water as a play site

- Bug: Children can choose wadeable shallow water or a shoreline stop whose arrival area overlaps water as their shared play destination.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-27
- Version/build: 0.6.5.2 development, PR #222 (fix inspected at `f5a158a81`)
- Reporter: player observation of children playing in water
- Area: child leisure, terrain suitability and cached group destinations
- Owner module: `src/game/humanLeisureBehavior.ts`; existing terrain and pathfinding owners provide read-only queries
- Related PR/commit: [PR #222](https://github.com/Rengerams/wilderfolk/pull/222), [f5a158a81](https://github.com/Rengerams/wilderfolk/commit/f5a158a81ddc280cc7babd57532a3f7e4b022e80)

## Status history
- 2026-11-27 — open: player reports children playing in water; source trace identifies an invalid destination rule.
- 2026-11-27 — investigating: PR #222 implements dry-site selection and cached-site repair; six PR workflows succeeded on the reviewed code head, including the two new focused regressions. Original live-save reproduction and confirmation remain pending.

## Observed behavior
Children may stay in shallow water while their leisure activity is playing. A dry destination near the shoreline may also permit a child to stop in water within the 14-pixel arrival tolerance. No original save, exact coordinates or seed were independently inspected for this report.

## Expected behavior
Outdoor play sites and their arrival clearance must be dry. Ordinary permitted shallow-water crossings remain legal; the play-destination rule must not redefine general navigation.

## Reproduction steps
1. Use the deterministic child fixture in `tests/humanLeisureBehavior.test.ts` with two player children at (105,105) and (115,105), on a 40 by 30 tile map. Make only tiles 9–12 on each axis dry and all distant candidates shallow water.
2. Install the fixture map in the canonical path grid and run an eligible child-play tick. The old selection predicate accepts walkable shallow-water candidates; the regression requires no selected site, a recorded phase attempt and zero velocity on the dry starting ground.
3. For the cached-site case, set both children to the same current-day/current-phase play site (155,105), with phase attempts already recorded, and place shallow water at tile (16,10). Run the next eligible tick.
4. The regression requires a different shared destination with no water or out-of-map tile in the checked 14-pixel arrival area. The old cached-site predicate checks only the destination's walkability and would accept the dry center beside water.

## Evidence
The PR diff shows that `chooseChildPlaySite` formerly used `isGroundWalkableAt` alone. The shared cache also checked walkability at the center only; arrival could occur within 14 pixels. The two regression fixtures exercise these distinct manifestations of the same destination-suitability defect. The earlier reports on [fixed-location play groups](2026-11-23-child-play-groups-fixed-location.md) and [walking through blocked water](../BUG_REPORTS/2026-09-29-people-walk-through-water.md) address different mechanisms and are not duplicates. Pre-fix test execution was not performed for this report; the pre-fix failure is established by source trace.

## Root cause
Walkability and suitability as a stationary play destination were conflated. The path grid deliberately allows shallow-water travel, but child leisure reused that predicate for selecting and retaining play stops.

## Fix / proposed fix
The existing child leisure owner adds `isDryChildPlaySite`, using canonical terrain queries and the path grid to reject water and out-of-map tiles in the conservative square covering the 14-pixel arrival radius. New and cached group destinations share this rule. Unsafe saved stops can trigger reselection even after the phase was marked attempted. A child already in water with no valid play site clears its stale walk target and falls through to guardian/home logic rather than reporting stationary play. Ordinary wading and bounded route selection remain unchanged. Both architecture registers were updated in the implementation PR.

## Save/migration impact
No new save fields, format changes or migration are introduced. Existing optional `childPlaySite` and `childPlaySiteAttempt` data remain compatible; unsafe current-phase sites are revalidated on an eligible child leisure tick, not eagerly at load. Existing physical positions are not teleported. A real-save round trip and shoreline behavior have not been independently verified.

## Verification result
- PASS — [Node.js CI, run 45919766027](https://github.com/Rengerams/wilderfolk/actions/runs/45919766027): `npm run check:source`, `npm run build` and the standard PR affected-test run succeeded; 117 test files, 932 tests passed, including all 23 tests in `tests/humanLeisureBehavior.test.ts`.
- PASS — GitHub reported success for all six PR workflows associated with `f5a158a81`: Node.js CI, dead code audit, required calendar scheduler gate, and small/medium/large population performance workflows.
- NOT RUN — independent pre-fix test execution, original player-save reproduction, browser/live-save verification and full-year/long-run Vitest suites (excluded from the cited affected-test command).
- PENDING — CI on this documentation follow-up; keep status investigating until remaining gameplay confirmation is available.

## Follow-up (27 Nov 2026)
PR #229 subsequently changed the global pedestrian movement contract: shallow water is now impassable except on completed bridges. This report's earlier wading assumption records the state before that change; its dry-play-site clearance still applies independently.
