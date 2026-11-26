# Wilderfolk playtest follow-ups — 23 November 2026

This note records observations and design choices **not addressed** by the separate festival-balance PR. Validate reported defects against a reproducible current save/chronicle before changing simulation behavior. No listed follow-up is claimed verified until its relevant checks pass.

## Gameplay defects and investigations

1. **Hunter traverses water.** The 23 November screenshot shows a hunter apparently walking across open water. Reproduce with that citizen, water tile data, passability/terrain masks and route segments; distinguish walking-on-water from sprite/path visualization. Check whether recent walker/pathfinding changes bypass terrain blocking for hunters. Preserve existing navigation pipeline; avoid hunter-specific duplicate path rules.
2. **Outgoing raid UI remains in battle state after resolution.** FoxGlen was exterminated after surrender, while the banner still said `Battle at FoxGlen`, `They chose to fight` and displayed its obsolete encounter description. `beginRaidReturn` changes `phase` to `returning` without refreshing `title` or `description`, while `App.tsx` renders those stored texts and `rivalResponse`. Present a compact return-journey state, suppress stale fight/deadline copy, retain battle history in the Chronicle, and check reported duplicate "fight" display. Do not replay the battle. **Implementation submitted; verification pending:** shared phase-aware status for banner, guidance and alerts; see the raid-return stale-status bug report.
3. **Youth-love courtships / separate housing.** Inspect Shawnta Sibley and Nestor Sibley after the latest courtship processing-order fix, including reciprocal progress, meeting/proximity, marriage completion and household allocation. Their adoptive sibling relationship is **not** itself a bug under the owner's nonbiological-family game rule. Do not introduce adoptive-kin romance restrictions.
4. **Education progression and immigration credit.** Real school credit requires a child physically attending a staffed school for at least half its school day. `immigrantSchoolDaysForAge` currently grants 20 days per year after age 6 at arrival, allowing 17-year-olds to start at 220 days. Honours graduation currently adds +20 to every job skill. The agreed design is education-tier eligibility first; *trade-specific* skill bonus only after completing the corresponding apprenticeship. Decide how to handle older saves and past awarded skills without erasing legitimate training.
5. **Elections and combat leadership.** Leadership merit currently strongly rewards family name and total job skills. Rebalance around genuine contributions, political record, reputation and context-sensitive voter preferences; keep merit separate from actual ballots. The elected leader should command outgoing armies and settlement defense, with real presence, risk and experience, not merely receive merit for battles they did not attend. Use existing command/muster/battle pipeline.

## Design decisions to make later

6. **Virtual Player placement vs player roads.** The Virtual Player places buildings without respecting carefully laid roads or coherent blocks. Design road-oriented frontage, useful access/spacing, preservation of existing streets and building clusters. **Explicitly deferred**; no changes in festival work.
7. **Overlapping villager names.** Dense crowds obscure the scene. Evaluate zoom-sensitive labels, hovered/selected names, highlighting the leader and important residents, and optional `All / Important / Off` visibility modes. Check screen readability without losing village bustle. **Design only**, not implemented.
8. **Pathfinding quality.** Recent pathfinding looks substantially more natural; preserve that improvement while separately investigating remaining odd corner cases and terrain traversal.

## Validation boundaries

- Use real save or replay and current branch for each observation before claiming a fix.
- Update `OWNERSHIP_OVERVIEW.md`, the applicable `decisionRegistry.ts` entries and relevant regression tests with the actual implementation.
- Avoid unrelated changes to festival cadence, Virtual Player placement, labels, marriage, pathfinding or combat in a single PR.
