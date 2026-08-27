# R3 Rival Diplomacy, Demands, and Consequence Loop — Objective Report

**Status:** verified
**Date:** 2026-08-21
**Owner:** existing `groupEvents.ts` diplomacy owner, typed `respondToDiplomacyEvent` command, `SelectedBuildingPanel.tsx` presentation
**Cadence:** existing rival daily cadence for generation and existing diplomacy expiry cadence; no new tick layer

## Player outcome

Rival diplomacy now has an explicit persisted expiry tick and visible remaining-day feedback. A player sees the rival's cause, available choices, choice hints/cost eligibility, and the number of days before the contact expires. The authoritative resolver applies one outcome, removes the live event, records rival contact memory, and ignores stale or repeated event IDs safely.

The R3 slice reuses the existing tribute, border-dispute, alliance, and peace-treaty event families. It does not create a parallel request system or overload caravan requests.

## Contract

| Contract | Behavior |
|---|---|
| Event identity | Existing `eventId` remains the live-action key |
| Expiry | New events persist `expiresAtTick`; legacy events fall back to `createdAtTick + 14 days` |
| Preflight | Existing choice eligibility checks food, gold, spears and settler requirements before dispatch |
| Resolution | Existing authoritative `respondToDiplomacyEvent` clone-and-apply path |
| Idempotence | Resolved events are removed; repeated/stale IDs produce no second transfer |
| Consequence | Relationship, treaty, reputation and resource outcomes use the existing named transitions |
| Memory | Successful contact increments bounded rival `profile.contactCount` to a maximum of 999 |
| UI | Existing rival inspector card shows `Expires in N days` and explains that the displayed choice cost/consequence is applied on response |

## Simulation Change Record

- Owner boundary: `groupEvents.ts` remains the single diplomacy generator, expiry owner, and resolver.
- State: `DiplomacyEvent.expiresAtTick` is optional for backward-compatible saves; existing `pendingDiplomacyEvents` save and worker transport carry it automatically.
- Cadence: No new realtime loop or daily layer was introduced.
- Safety: Expired events are removed before choice resolution. Missing rivals remove the stale event without player-resource mutation. Resolved events are removed after one successful application.
- Invariants: No duplicate payment or food transfer, no stale command consequence, no new player resource source, no change to raid ownership, and no change to School, Church, Town Hall, schedules, fatigue, lifecycle, or simulation cadence.
- Non-goals: R4 camp-history/map storytelling remains separate; no new diplomacy event family or multi-step negotiation chain was added.

## Validation

| Check | Result |
|---|---:|
| R3 expiry tests | 3 passed |
| Worker command roundtrip | 9 passed |
| GameLoop command dispatch | 8 passed |
| Rival profile regression | 6 passed |
| Combined focused suite | 4 files, 26 tests passed |
| TypeScript | Passed |
| Production build | Passed; known circular and >500 kB warnings remain |
| ESLint | Passed |
| `git diff --check` | Passed |

## Deferred follow-up

R4 remains open for camp presence, Chronicle history, latest-contact summaries and map readability. Q2 live browser-worker verification remains a separate quality objective.
