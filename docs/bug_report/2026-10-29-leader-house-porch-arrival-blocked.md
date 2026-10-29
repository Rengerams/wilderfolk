# Leader's House spouse cannot complete home arrival

- Bug: resident-specific home approach point can fall inside the Leader's House footprint, leaving a resident pushing against the house without entering to sleep
- Status: investigating — minimal movement patch committed; CI and live game validation pending
- Severity: high
- Date discovered: 2026-10-29
- Version/build: `main` at `e18a5900` inspected
- Reporter: owner (screen capture of Tomika Harms #346)
- Area: simulation movement / home sleep
- Owner module: `src/game/simulation/humanMovement.ts` (`homeStandPosition`, `commuteHumanToBuilding`); `humanTick.ts` schedules home/idle approach
- Related: existing `docs/BUG_REPORTS/2026-09-16-settlers-talk-and-bubble-while-asleep-at-home.md` describes a different sleep presentation bug

## Status history

- 2026-10-29 — investigating: resident repeatedly collided visually with the Leader's House, while the leader could enter
- 2026-10-29 — source audit: home destination used a resident-specific arc around the building centre, not its front edge; idle leisure also used a centre-plus-half-width coordinate as if the centre were the corner
- 2026-10-29 — patch: put the home porch target south of the entire footprint; use this canonical target for both commute and leisure

## Observed behavior

Tomika Harms (#346) is assigned to the Leader's House but the inspector says `Walking home to sleep` while the character remains outside and repeatedly presses against the building. `Rest: 0/100`, `Stamina: 0/100`, `Nutrition: 75/100`. Another resident (the leader) does get indoors. Her movement route in the inspector includes `Leader's House → Quarry → Leader's House`. The owner reports a risk to the resident through inability to rest, although the screenshot does not show a death.

## Expected behavior

Every eligible household member, regardless of entity ID, reaches a walkable doorstep outside the building footprint, enters via `enterHumanBuilding` at the established arrival radius, and receives normal sleep recovery. No collision bypass, unconditional teleport, synthetic stamina gain or special case for the leader is needed.

## Reproduction steps

1. Give a player human (for example id 346) residence in a completed Leader's House (63 × 53 px in the earlier saved example).
2. Schedule a home commute and inspect the computed `homeStandPosition`: the old 16–34 px radius around the house centre can put the target within ±31.5/±26.5 px of the centre.
3. Observe that the target is resident-specific; one resident may have a reachable point while another's path runs into the structure or surrounding blocked ground.
4. Check real movement, arrival and sleep in the owner's browser save. The earlier library save is not the exact live Tomika session, so it cannot alone establish the runtime result.

## Evidence

`homeStandPosition` previously used `building.x + cos(angle) * radius` and `building.y + sin(angle) * radius * 0.65 + height * 0.2` with a small per-ID radius. `humanBuildingTarget` uses this point when `arrivingHome=true`; `commuteHumanToBuilding` grants `indoorBuildingId` only after arrival. The free-time home-steering fallback in `humanTick.ts` independently targeted `home.x + home.width / 2`, which is erroneous for centre-origin building coordinates.

## Root cause

Confirmed static geometry defect: the target for a large residence can be inside its own footprint and the idle steering duplicates a corner-coordinate assumption. Whether the exact Tomika screenshot also involves nearby walls or terrain remains to be checked in the live session.

## Fix / proposed fix

Compute stable resident-specific porch slots with `building.y + building.height / 2 + standoff` and a bounded lateral offset within the front width, then pass them through the existing walkability owner. Both home commute and idle home visits use `homeStandPosition`. Keep `enterHumanBuilding`, pathfinder obstacles, movement integration, sleep eligibility and needs recovery unchanged.

## Save/migration impact

None. The saved residence assignment and indoor state have the same meaning. Only destination coordinates for future movement change.

## Verification result

- STATIC: geometry now places baseline porch targets beyond the south half-height of a completed Leader's House
- PENDING: `tests/humanMovement.test.ts`, lint, TypeScript and build on the PR branch
- PENDING: replay Tomika's live case; verify arrival, indoor state and rest recovery without forcing a position change
