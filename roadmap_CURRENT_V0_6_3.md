# Wilderfolk Roadmap — Current v0.6.3

Status: development working tree (2026-08-24)

## Scope

| Pri | ID | Item | Goal | Owner / notes | Status |
|---|---|---:|---|---|---|
| 1 | **F1** | Venue-schedule delta reconciliation | Worker shifts match venue schedules across worker/main-thread deltas. | `src/game/venueSchedule.ts`; worker delta tests | ✅ Done |
| 2 | **F2** | Festival / venue duty | Festival and venue staffing follow one schedule owner. | `src/game/venueSchedule.ts` | ✅ Done |
| 3 | **F3** | Festival / venue load normalization | Canonical normalizers at load boundary and worker prep; malformed/legacy regressions. | `src/game/simPrep.ts`; save migration | ✅ Done |
| 4 | **Q1** | Family-reference integrity | Surviving family records stay free of references to permanently removed settlers. | `killHuman()` removal transition | ✅ Done |
| 5 | **Q2** | Patrol visibility + prison guard role | Patrol detection bounded; Prison uses institutional custody (Prison Guard role). High Alert / raid-prep deferred. | `src/game/humanTick.ts`, `src/game/frontierCombat.ts`, `src/game/defenseStructures.ts` | ✅ Done (patrol High Alert deferred to later version) |
| 6 | **T1** | Renderer/game chunk boundary | Remove production circular-chunk warning through a measured import boundary. | Vite/Rollup boundary; renderer-loader | ⏳ Deferred — do as latest |
| 7 | **T2** | Worker transport test timeout | `tests/gameWorker.transport.test.ts` deterministic under full suite. | `src/game/simWorker/gameWorker.node.ts` — self Proxy fix | ✅ Done |
| 8 | **D1** | Deterministic production simulation seed | Long-horizon simulation replayable from a world seed (100-tick replay). | `src/game/simRng.ts`, worldGen/entityFactory/terrainGen/migration, context-seeded chat rolls | ✅ Done |
| 9 | **U1** | UX/UI density and hierarchy | Narrow sidebar/inspector readable; developer accepted UX-01..UX-07. | `App.tsx`, `FocusPanel.tsx`, `SelectedBuildingPanel.tsx` | ✅ Done |
| 10 | **B1** | Citizens stay at workplace during work hours | Stop assigned workers leaving job buildings during the work window. | `humanTick.ts` realtime movement | 🔍 Investigating (status display added; dev to verify) |
| 11 | **B2** | Worker assignment panel truth (auto/manual) | Auto mode hides manual pick list; manual shows only unemployed adults. | `SelectedBuildingPanel.tsx` | ✅ Done |
| 12 | **S1** | The Deer Parliament | One-time seeded ecology story; real deer/ecology facts, 4 responses, follow-up. | `src/game/deerParliament.ts` | ✅ Done |
| 13 | **S2** | The Traveling Theatre Company | One-time seeded visitor story: real-history scripts, support package, opening night. | `src/game/travelingTheatre.ts` | ✅ Done |
| 14 | **S3** | The Wedding That Nearly Started a War | One-time rival diplomacy chain: gift → delayed response → feast/delegation/fortify. | `src/game/weddingDiplomacy.ts` | ✅ Done |
| 15 | **S4** | The Apprentice’s Terrible Invention Fair | One-time workshop story: three inventions, fund/redesign, delayed demo, keep/improve/dismantle. | `src/game/inventionFair.ts` | ✅ Done |
| 16 | **S5** | The Rumour Ledger | One-time social story: recent event → rumour → correct/encourage/ignore/investigate. | `src/game/rumourLedger.ts` | ✅ Done |
| 17 | **A1** | Post-taming animal care | Tamed animals consume 0.2 food/day each (10% of human daily 2 food); fed → warning → shortage → fed. First slice in code; full per-animal contract (per-animal fields, owner_lost, panel status) open. | `src/game/animalCare.ts` | ⏳ First slice — full contract open |
| 18 | **C1** | Guided Campaign story integration | All five story chapters complete from real story flags. | `src/game/guidedCampaign.ts` + story flags | ✅ Done |
| 19 | **E1** | Election campaign promises | Deterministic promises at election start; mid-term evaluation with reputation effects. | `src/game/electionPromises.ts`, `src/game/villageLeadership.ts` | ✅ Done |
| 20 | **BAL** | Fertility + relationship chaos balance | Youth conception 14–17 raised (0.25/0.35/0.50/0.70); normal/affair pregnancy and affair/scandal/divorce rates raised. | `dayCycle.ts`, `simulation/humanRelationships.ts`, `humanTick.ts` | ✅ Done |

## Still open before a v0.6.3 release claim

| Area | Finding | Next step |
|---|---|---|
| Worker movement | Citizens assigned to a workplace may leave during work hours (B1). | Reproduce with the per-human status display, then fix the realtime work-movement owner. |
| Animal care | A1 full per-animal contract not implemented yet (first slice: 0.2 food/day each, global status). | Implement per-animal care fields, owner_lost, `Animal care` ledger entry, selected-animal panel status. |
| Technical debt | Circular renderer/game chunk and large game chunk remain (T1). | Measure an import boundary before any further chunk experiment; do as latest. |
| Polish | UX-02/05/07 fully implemented (inspector hierarchy, village details disclosure, disclosure-state memory); live narrow/desktop browser review recommended. | Optional browser review before release. |

## Decisions

1. **Patrol / High Alert** — deferred to a later version; v0.6.3 keeps visibility-only patrol.
2. **Prison Guard occupant fallback** — resolved by design: institutional custody, no occupant-fallback.
3. **A1 animal care** — approved: shared food stock represents a fish-capable settlement ration until a distinct fish inventory exists.
4. **D1 deterministic seed** — per-owner seeded streams + context-seeded chat rolls; 100-tick replay test green.
5. **S1–S5** — implemented as full multi-stage chains per `docs/archive/story/*.md`.

## References

- Story docs: `docs/archive/story/STORY_*.md`
- UX audit: `docs/archive/UX_UI_AUDIT_2026-08-23.md`
- Bug reports: `BUG_REPORTS/*.md`
