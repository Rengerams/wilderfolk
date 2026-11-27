# Raid warning hides elected leader's imprisonment

- Bug: The war-band raid panel displays "The elected leader is unavailable to command the army" without distinguishing custody from deployment or unavailable weapons.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-27
- Version/build: 0.6.5.1 save / 0.6.5.2 development
- Reporter: player screenshot and Year-1 Day-311 save
- Area: outgoing raid eligibility / UI preview
- Sole owner: `src/game/frontierCombat.ts` (`canLaunchRaidOnRival`); mustering remains `militiaBalance.canBeMustered`.
- Related PR: this raid message clarification PR

## Status history
- 2026-11-27 — investigating: user reported the generic leader-unavailable warning despite no active war-band.
- 2026-11-27 — root cause reproduced from saved state: the leader had been imprisoned after an affair scandal on day 306.
- 2026-11-27 — fix prepared: explain custody, release time and missing armament with specific reason strings; regression and CI pending.

## Evidence and reproduction
The actual Day-311 save is at tick 89601. Its unique elected leader (ID 2383) is alive, an adult player human and not deployed, with `prisonBuildingId: 274`, `prisonSentenceCrime: "scandal"`, `prisonerUntilTick: 89920`. Its Prison occupant roster also contains the leader's ID. Event log: day 306, an affair was exposed and the leader was imprisoned for scandal. All required weapon research and forge orders are active, and dozens of available soldiers exist. The saved source was inspected locally and **not committed** to the repository.

1. Prepare an armed village with an elected leader and ordinary available soldiers.
2. Set `leader.prisonBuildingId`, `leader.prisonSentenceCrime`, `leader.prisonerUntilTick` for a current scandal sentence; call `canLaunchRaidOnRival` and `getCombatPreview`.
3. Before: the UI returns the generic unavailable-leader string even though the leader is neither missing nor deployed. After: the UI states that the elected leader is imprisoned for scandal with the remaining game hours.
4. Clear the detention flags and verify that the same village can launch normally.
5. In a separate case, remove military technology while keeping a living elected leader: the error must say that weapons are missing rather than incorrectly blaming the leader.

## Root cause
`getRaidParticipants` excludes prisoners via `canBeMustered`, correctly. `canLaunchRaidOnRival` then treats every missing leader as the same unspecified absence. Additionally, `getRaidParticipants` excludes *all* fighters when the village has no required weapons; because the leader check came first, this also produced the misleading leader-unavailable reason.

## Fix and expected behavior
The sole raid eligibility owner now checks armament before leader availability, and distinguishes custody (and saved release tick), off-map deployment and missing/dead leaders. The canonical muster rule **remains unchanged**: jailed citizens, including leaders, may not participate in combat. No new acting commander or parallel eligibility path is introduced.

## Save / migration impact
No schema changes. Imprisoned leaders are still imprisoned; the new message is only an explanation. The user's optional locally prepared save copy frees that leader as an explicit manual pardon (without modifying or publishing the original save).

## Verification
- PASS: inspected the real Day-311 save and cross-checked jail occupants, scandal log and remaining sentence.
- NOT RUN: original-save browser/UI confirmation after fixing source.
- PENDING: `tests/frontierCombat.hostility.test.ts` with armed leader in custody, missing-weapon and preview parity cases, plus GitHub CI.
