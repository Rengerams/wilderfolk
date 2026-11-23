# Child play groups remain at one fixed spot

- Bug: Children playing together stay clustered around their current position instead of travelling to distinct playable locations.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-23
- Version/build: 0.6.5.2 current development main, after merged PR #182
- Reporter: player follow-up after the daily-playmate fix
- Area: child leisure, local movement and selected-settler inspector
- Owner module: `humanLeisureBehavior.ts` and read-only `humanStatus.ts`
- Related PR/commit: fix/children-play-sites-roam-20261123

## Status history
- 2026-11-23 — open: player confirms the children still repeatedly return to one fixed spot after PR #182.
- 2026-11-23 — investigating: friendship-weighted groups and shared play sites committed, with save-schema and inspector support; CI pending.

## Observed behavior
With two children already near each other, the child leisure branch steers toward the other child's exact coordinates when farther than 16 pixels. Inside 16 pixels it only adds tiny waveform velocities. No different play destination ever gets selected. PR #182 only made the playmate selection daily, not the actual play movement.

## Expected behavior
Children form a daily play circle with one to three companions, tending to choose familiar and school friends while still including acquaintances. Every circle moves between suitable outdoor locations during unscheduled free time. School, sleep, medical care and other scheduled needs still take priority. Play destinations must be walkable and must not knowingly lead across impassable river or building segments.

## Reproduction steps
1. Put two player children close together on open, reachable ground.
2. Exercise the single child leisure entry when a playmate is selected and repeat later in the same game day.
3. Before the fix, the only movement target is the partner (or a tiny jiggle while close); after the fix the child selects a separate, reachable site and changes sites at a subsequent three-hour phase.
4. Repeat on a flat test map with a full river column between banks.

## Evidence
The authoritative `tickHumanChildLeisure` branch used `steerHumanToward(entity, mate.x, mate.y, ...)` when distance exceeded 16, otherwise waveform velocities. No play spot existed. The original shoreline screenshot and later player observation establish the symptom, but do not by themselves prove that every affected character is free of separate pathfinding problems.

## Root cause
Playmate selection and playful movement were conflated. A valid mate was treated as the destination, keeping nearby children circling rather than travelling somewhere to play.

## Fix / proposed fix
The same child leisure owner uses the existing friendship and school-bond scores to select a weighted, deterministic daily circle of 2–4 children. One bounded, walkable outdoor play stop is shared by that circle during each three-hour leisure phase using the group/day/phase seed. It records the membership and active destination in optional `Entity.childPlayGroupIds` and `Entity.childPlaySite` fields so saves, worker snapshots and the read-only inspector agree. The current path owner's ground and direct-line checks reject blocked targets; movement integration and the existing daily playmate rule are unchanged. When no safe stop is available, keep the existing companion interaction rather than sending a child to a blocked target.

## Save/migration impact
Optional per-child circle and play-site fields are persisted by the existing entity schema; legacy saves populate them on the next eligible play tick. Existing full entity save/worker-delta paths already carry optional entity fields. No version gate or migration change.

## Verification result
- Source trace: completed.
- Focused regressions for movement, phase continuity, river-side reachability, friendship preference, shared group destinations and inspector projection: committed; latest CI pending.
- Type checks, full CI and live-game confirmation: pending.
