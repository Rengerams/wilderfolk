# Wilderfolk Roadmap — Current v0.6.3

Status: development working tree (2026-08-25)

| Priority | ID | Upgrade or feature | Main value | Primary owner/cadence | First-slice outcome | Status |
|---|---|---:|---|---|---|---|
| 0 | **F1** | Worker venue-schedule reconciliation | Stops successful Tavern/Hotel schedule commands from reverting or displaying stale hours after worker confirmation. | Worker command result, SimTickDelta, GameLoop reconciliation. | Tavern and Hotel schedules survive worker command/result round trips in worker and fallback modes. | ✅ Done — full suite green (86 files / 467 tests). [1] |
| 0 | **F2** | Festival policy repair | Makes festival opening, innkeeper work, fatigue, and duration truthful. | Festival daily owner; realtime venue/work query. | Festival visitor opening stays separate from bounded scheduled Innkeeper duty; performer extension is monotonic. | ✅ Done — full suite green. [1] |
| 1 | **F3** | Festival and venue load normalization | Prevents malformed or legacy festival/venue state from surviving as inconsistent runtime data. | Save/load normalization; existing daily expiry and schedule readers. | Canonical safe festival and venue values after load, with legacy/malformed tests. | ✅ Done — normalizers wired at load/worker prep. [1] |
| 1 | **S1** | The Deer Parliament | Makes ecology pressure visible and funny through one bounded seasonal story. | Existing daily ecology owner. | One deer gathering, four visible responses, one bounded ecological follow-up. | ✅ Done — `src/game/deerParliament.ts`, full chain. [6] |
| 2 | **S2** | The Traveling Theatre Company | Lets visitors reinterpret factual colony history without altering the Chronicle. | Existing visitor lifecycle and story-card pattern. | One performer group, factual script selection, one performance, safe departure. | ✅ Done — `src/game/travelingTheatre.ts`, 3 stages. [6] |
| 3 | **S3** | The Wedding That Nearly Started a War | Makes rival diplomacy personal through one delayed, readable chain. | Existing rival/diplomacy owner and typed command pattern. | One rival, three stages, four bounded outcomes. | ✅ Done — `src/game/weddingDiplomacy.ts`. [6] |
| 4 | **S4** | The Apprentice’s Terrible Invention Fair | Gives apprenticeship a memorable, bounded workshop event. | Existing apprenticeship/workshop state at an annual or daily boundary. | One named apprentice, three authored inventions, one selected experiment. | ✅ Done — `src/game/inventionFair.ts`. [6] |
| 5 | **S5** | The Rumour Ledger | Lets a real event gain a temporary social interpretation without rewriting historical truth. | Existing event-log/Chronicle and Town Hall/social owner at a weekly boundary. | One sourced rumour, four responses, one bounded effect. | ✅ Done — `src/game/rumourLedger.ts`. [6] |
| 6 | **A1** | Post-taming animal care | Turns taming from a one-time payment into a visible stewardship choice. | Existing animal lifecycle through a bounded daily owner. | Count-based daily ration: 0.2 food per tamed animal (10% of human), fed→warning→shortage→fed. | ✅ Done — count-based per dev decision (no per-animal fields). [7] |
| 7 | **C1** | Guided Campaign story integration | Connects the existing campaign journal to real authored story outcomes. | `guidedCampaign.ts` daily projection; each story’s existing domain owner. | Each implemented story sets its matching namespaced resolved flag through its own owner. | ✅ Done — read-only projection verified; all five real flags connected. [2] |
| 8 | **Q1** | Family-reference integrity | Keeps surviving family records free of references to permanently removed settlers. | `killHuman()` removal transition and family cleanup helpers. | Parent/child, partner, affair, and pregnancy-parent survivor cleanup with direct regression proof. | ✅ Done — focused + full suite green. [3] |
| 9 | **Q2** | Barracks and Prison truth pass | Aligns security/policing copy, policy, and audit claims with implemented behavior. | Existing Soldier patrol, Prison transition, workforce, and UI owners. | Clear standing-militia/patrol/custody labels plus one approved policy for each open behavior. | ✅ Done — Barracks copy = Soldiers/+14; patrol visibility-only; Prison institutional custody. [4] |
| 10 | **V1** | Character-set and world-map presentation | Makes residents readable and distinct at map scale without changing simulation identity. | Presentation assets and existing renderer only. | Integrated adult/child visual set with normal-zoom review. | 🟡 Partial — adult/child sprites wired; old paths remain as rollback fallback; normal-map acceptance pending. [5] |
| 11 | **V2** | Footpath and Taming Post visual acceptance | Replaces placeholder-looking presentation with reviewed authored assets. | Presentation assets and existing renderer only. | Reviewed footpath/Taming Post assets; footpath may simply end (no road-end asset needed). | 🟡 Partial — footpath sprites wired; road-end intentionally not connected (dev decision 2026-08-24). |
| 12 | **T1** | Renderer/game chunk boundary | Removes circular chunk warning and oversized production game chunk. | Vite/Rolldown build boundary; renderer loader. | Acyclic chunk graph; game chunk below 500 kB. | 🟡 Partial — circular warning resolved; game chunk still 667 kB (needs `rolldownOptions.output.codeSplitting` / dynamic imports). |
| 13 | **T2** | Worker transport test timeout | Makes `tests/gameWorker.transport.test.ts` deterministic under the full suite. | `gameWorker.node.ts` self-Proxy fix; full-suite validation. | Repeated full-suite runs pass within timeout. | ✅ Done — two+ consecutive green runs. |
| 14 | **D1** | Deterministic production simulation seed | Makes long-horizon simulation replayable from a world seed. | `simRng.ts` per-owner streams + context-seeded chat rolls. | Same seed → same world + 300-tick replay. | ✅ Done — 100-tick test in suite; manual 300-tick verified. |
| 15 | **U1** | UX/UI density and hierarchy | Makes the narrow sidebar/selected-building inspector readable without losing map context. | Sidebar presentation, `SelectedBuildingPanel`, `VillageTabPanel`, `CollapsibleSection`. | UX-01..UX-07 fully implemented. | ✅ Done — UX-01/03/04/06 + UX-02/05/07 implemented. |
| 16 | **B1** | Citizens stay at their workplace during work hours | Stops assigned workers leaving job buildings during the configured work window. | `humanTick.ts` realtime work movement. | Status display + root-cause fix. | 🔍 Investigating — status display added (building-label based, incl. "Walking home"); dev to verify in-game. |
| 17 | **B2** | Worker assignment panel truth (auto/manual) | Auto mode stops offering a manual pick list; manual mode shows only unemployed adults + per-worker remove. | `SelectedBuildingPanel.tsx`; `buildingActions.ts`. | Manual pick list hidden in auto; only unemployed in manual; per-worker remove buttons. | ✅ Done — focused test added; per-worker remove (commit `a877e6e`). |
| 18 | **E1** | Election campaign promises | Makes leadership elections feel consequential: promises and success/fail consequences. | `electionPromises.ts`; `villageLeadership.ts`. | Deterministic promises + mid-term evaluation. | ✅ Done — reputation effects wired. |
| 19 | **BAL** | Fertility + relationship chaos balance | More chaos: youth fertility 14–17, normal/affair pregnancy, affair/scandal/divorce rates. | `dayCycle.ts`, `humanRelationships.ts`, `humanTick.ts`. | Youth multipliers 0.25/0.35/0.50/0.70; pregnancy/affair bumps. | ✅ Done. |
| 20 | **REL** | Amicable divorce without cheating | Married couples can grow apart without an affair or scandal; children stay with the mother. | `humanRelationships.ts` daily relationship owner; `nameLoader.ts` marriage links. | One daily roll per couple; 7.5% per game year (×10 real 7.5‰); mother keeps home + kids; maiden name restored. | ✅ Done — commit `8f96686`. |

## Still open before a v0.6.3 release claim

| Area | Finding | Next step |
|---|---|---|
| Worker movement (B1) | Citizens assigned to a workplace may leave during work hours. | Reproduce with the per-human status display, then fix the realtime work-movement owner. |
| Build size (T1) | `game` chunk is 667 kB (>500 kB); circular warning resolved. | Use `rolldownOptions.output.codeSplitting` or dynamic imports; measure again. |
| Presentation (V1/V2) | Normal-map-scale acceptance for character set; reviewed Taming Post asset. | Browser review at normal zoom; optional authored asset pass. |

## Decisions

1. **Patrol / High Alert** — deferred to a later version; v0.6.3 keeps visibility-only patrol.
2. **Prison Guard occupant fallback** — resolved by design: institutional custody, no occupant-fallback.
3. **A1 animal care** — count-based, ordinary food (0.2/day per tamed animal); no per-animal fields, no fish resource.
4. **D1 deterministic seed** — per-owner streams + context-seeded chat rolls; 300-tick replay verified.
5. **S1–S5** — full multi-stage chains per `docs/archive/story/STORY_*.md`.
6. **Footpath road-end** — not connected by design; a footpath may simply end.
7. **WallCorner removed** — walls are straight vertical/horizontal only (R-rotation); corners emerge naturally where segments cross. No separate corner building type.
8. **Walls block pathfinding; gates are passable** — completed player walls block humans; WallGate stays a passable opening. Water/mountains block at every distance (no short-hop shortcut).

## References

- Story docs: `docs/archive/story/STORY_*.md`
- UX audit: `docs/archive/UX_UI_AUDIT_2026-08-23.md`
- Bug reports: `BUG_REPORTS/*.md`
