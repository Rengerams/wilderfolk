# Election result candidate names change after voting

- Status: investigating
- Severity: medium
- Date discovered: 2026-11-27
- Version/build: 0.6.5.2 development
- Reporter: owner
- Owner: villageLeadership.ts; VillageLeadershipPanel.tsx reads immutable ballot names
- Related PR: #230

## Evidence and reproduction
Start a ballot, change a candidate's surname or remove the candidate, then view the result. The old panel looked up current living entities rather than the election record.

## Fix
Snapshot names at ballot time and persist them with the tally. Existing saves without snapshots show candidate IDs and explicitly unavailable historical names rather than invented names. The existing save and worker transport carry the nested records.

## Verification
Extended existing real-election regression to rename candidates before reveal and assert unchanged names. CI pending.
