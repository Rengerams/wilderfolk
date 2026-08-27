# R1 Rival-camp Profiles and Persistent Ledgers — Objective Report

**Status:** verified
**Date:** 2026-08-21
**Owner:** `rivalProfiles.ts` for profile policy and normalization; `groupEvents.ts` for creation; `rivalEvents.ts` for legacy hydration; `FrontierPanel.tsx` for read-only presentation
**Cadence:** profile creation at camp creation; legacy normalization at the existing daily rival owner; presentation reads normalized copies

## Player outcome

Each rival camp now has a stable readable temperament, priority, and bounded ledger. The Frontier panel shows the rival's profile and current food, wood, gold, and morale values alongside its existing relationship, population, distance, treaty, raid, and diplomacy information.

R1 deliberately stops before rival daily actions and diplomacy commands. The ledger is persistent state prepared for R2; R1 does not spend resources, change morale, recover camps, queue actions, or alter relationship outcomes.

## Ledger contract

| Field | Bounds / purpose |
|---|---|
| Temperament | `welcoming`, `pragmatic`, `ambitious`, or `warlike` |
| Priority | `food`, `trade`, `security`, or `shelter` |
| Food | 0–200 |
| Wood | 0–200 |
| Gold | 0–200 |
| Morale | 0–100 |
| Recovery | 0–100; reserved for R2 daily simulation |
| Contact count | 0–999; reserved for R3 diplomacy/history |

## Simulation Change Record

- Owner boundary: Profile creation and normalization are centralized in `rivalProfiles.ts`; no profile policy is spread through UI or combat code.
- Decision changed: Rival camps now carry explicit profile/ledger state instead of only relationship and cooldown fields.
- State and persistence: `RivalSettlement.profile` is optional for backward-compatible saves. Existing save allow-list and worker prep already transport `rivalSettlements` as one authoritative field.
- Legacy behavior: Missing or malformed profiles receive deterministic bounded defaults based on rival identity and relationship.
- UI boundary: `FrontierPanel.tsx` uses `normalizeRivalProfile()` and never mutates state during render. The daily rival owner uses `ensureRivalProfile()` for authoritative hydration.
- Cadence: No new tick layer. No R2 action, resource spending, recovery roll, diplomacy command, or relationship mutation was added.
- Invariants: Rival resources remain separate from player resources; no player economy mutation; no raid/diplomacy order change; no worker authority change; no School/Church/Town Hall or schedule behavior change.
- Rollback plan: Remove the optional profile field and UI lines; legacy rival records remain valid because the field is optional.

## Validation

| Check | Result |
|---|---:|
| Focused R1/frontier tests | 2 files, 6 tests passed |
| Worker transport retry | Passed, 1 test |
| TypeScript | Passed |
| Production build | Passed; pre-existing circular-chunk and large-chunk warnings remain |
| ESLint | Passed |
| `git diff --check` | Passed |

One full-suite run encountered the repository's known intermittent worker-ready timeout; the same worker transport test passed immediately in isolation. The R1 focused tests and all static validations passed.

## Deferred non-goals

R2 daily rival actions, ledger consumption/recovery, R3 diplomacy and commands, R4 map/camp presentation history, automatic rival staffing, and new rival tick layers remain deferred.
