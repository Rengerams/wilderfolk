# Wilderfolk Bug Status Overview

**Last audited:** 2026-08-21  
**Scope:** every dated report in [`BUG REPORTS/`](../BUG%20REPORTS/)  
**Purpose:** this is the one quick-reference table for deciding what still needs player testing. The individual bug reports remain the detailed source of evidence, repair history, and regression coverage.

> **Status language:** **Resolved** means the reported code defect is solved and has the required automated evidence. **Resolved — live verification pending** means the code is solved, but a player-facing check in the running game still needs to be recorded. **Won't-fix** means the report was confirmed not to describe a real bug.

## At a glance

| Status | Count | What it means |
|---|---:|---|
| **Resolved** | 20 | No routine player test is required for closure. |
| **Resolved — live verification pending** | 5 | Run the listed in-game check below, then record the result in the linked report. |
| **Won't-fix** | 1 | Documented false positive; no action required. |
| **Open / investigating** | 0 | No known unfixed reported defects. |

## Player test checklist

Complete these five checks in a normal development-game session. Use a **new map** for the river check; existing saves keep their old terrain.

| ID | Report | What to do in the game | Pass condition | Priority |
|---|---|---|---|---|
| **P1** | [Rivers read as ponds](../BUG%20REPORTS/2026-08-21-rivers-read-as-ponds.md) | Start a **new** Verdant map, then at least one other terrain preset. At ordinary play zoom, follow the river from north to south and compare it with the minimap. | A continuous, visibly blue river channel with banks is readable on the main map; no trees stand in river cells; its course agrees with the minimap. | **Highest** |
| **P2** | [Connected movement-module drift](../BUG%20REPORTS/2026-08-20-connected-movement-module-drift.md) | Give a settler a workplace or home on the far side of a river/mountain obstruction. Watch one complete commute at normal speed and fast-forward. | The settler routes around the obstacle, reaches the intended building without stutter or freezing, and the browser console shows no movement/path error. | High |
| **P3** | [Dialogue-busy predicate](../BUG%20REPORTS/2026-08-20-dialogue-busy-predicate-missing.md) | Let several nearby adult settlers socialize at work or in free time. Watch active speech bubbles for several in-game hours. | Settlers do not start overlapping/repeated conversations while already in an active paired dialogue; no self-conversations or `isDialogueBusy` console error appears. | Medium |
| **P4** | [Movement and lifecycle full audit](../BUG%20REPORTS/2026-08-20-movement-lifecycle-full-audit.md) | During ordinary play, observe a long commute, an injured/ill settler visiting the Hospital if available, and the next visible birth/event-log entry. | Commutes stay responsive, hospital routing remains sensible, and a birth creates one child and clears the parent’s pregnancy state without an invariant or console warning. | Medium |
| **P5** | [Original commute cache report](../BUG%20REPORTS/Bug_%20Human%20commute%20path%20cache%20misses%20on%20nearly%20every%20movement%20update.md) | Reuse the P2 setup, but watch a long route while changing speed between 1× and fast-forward. | Movement remains smooth at both speeds; the route does not repeatedly reset or visibly recalculate every few pixels; no worker-stall or path error is logged. | Medium |

### How to close a pending item

1. Record the map preset, approximate in-game day, and whether the check passed.
2. If it fails, capture a screenshot and relevant console output, then change the linked report back to **investigating**.
3. If it passes, add the observation under **Verification result** in the linked report and change its status to **Resolved**.
4. Update the **Last audited** line and the status counts in this overview.

## Complete archive

| # | Bug report | Area | Status | Player test still needed? |
|---:|---|---|---|---|
| 1 | [Affair establishment dual cadence](../BUG%20REPORTS/2026-08-20-affair-establishment-dual-cadence.md) | Relationships | Resolved | No |
| 2 | [Caravan clears workforce fields](../BUG%20REPORTS/2026-08-20-caravan-clears-workforce-fields.md) | Workforce | Won't-fix — transient caravan carriers are outside the workforce domain | No |
| 3 | [Church auto-staffing](../BUG%20REPORTS/2026-08-20-church-auto-staffing.md) | Workforce | Resolved | No |
| 4 | [Command waits for worker idle](../BUG%20REPORTS/2026-08-20-command-waits-for-worker-idle.md) | Worker commands | Resolved | No |
| 5 | [Connected movement-module drift](../BUG%20REPORTS/2026-08-20-connected-movement-module-drift.md) | Movement / pathing | Resolved — live verification pending | **P2** |
| 6 | [Demolish command failure](../BUG%20REPORTS/2026-08-20-demolish-command-failure.md) | Worker commands | Resolved | No |
| 7 | [Ambiguous diagnostics counters](../BUG%20REPORTS/2026-08-20-diagnostics-ambiguous-counters.md) | Diagnostics | Resolved | No |
| 8 | [Dialogue-busy predicate missing](../BUG%20REPORTS/2026-08-20-dialogue-busy-predicate-missing.md) | Social life | Resolved — live verification pending | **P3** |
| 9 | [Duplicate movement owner](../BUG%20REPORTS/2026-08-20-duplicate-movement-owner.md) | Movement architecture | Resolved | No |
| 10 | [Housing owner not declared](../BUG%20REPORTS/2026-08-20-housing-owner-not-declared.md) | Governance | Resolved | No |
| 11 | [Immigrant pregnancy due progress missing](../BUG%20REPORTS/2026-08-20-immigrant-pregnancy-missing-due-progress.md) | Lifecycle | Resolved | No |
| 12 | [Leader cannot hold workplace](../BUG%20REPORTS/2026-08-20-leader-cannot-hold-workplace.md) | Leadership / workforce | Resolved | No |
| 13 | [Moon Howler replacement not rare](../BUG%20REPORTS/2026-08-20-moon-howler-replacement-not-rare.md) | Moon Howler | Resolved | No |
| 14 | [Movement and lifecycle full audit](../BUG%20REPORTS/2026-08-20-movement-lifecycle-full-audit.md) | Movement / lifecycle | Resolved — live verification pending | **P4** |
| 15 | [Prisoner occupants wiped](../BUG%20REPORTS/2026-08-20-prisoner-occupants-wiped.md) | Workforce / prison | Resolved | No |
| 16 | [Worker-stall optimistic rollback](../BUG%20REPORTS/2026-08-20-worker-stall-optimistic-revert.md) | Worker commands | Resolved | No |
| 17 | [Commute cache target tile omitted](../BUG%20REPORTS/2026-08-21-commute-path-cache-missing-target-tile.md) | Movement / pathing | Resolved | No |
| 18 | [Festival participants kept working](../BUG%20REPORTS/2026-08-21-festival-participants-keep-working.md) | Festivals | Resolved | No |
| 19 | [Hunt visuals outlived animation clock](../BUG%20REPORTS/2026-08-21-hunt-visuals-expire-on-simulation-ticks.md) | Rendering | Resolved | No |
| 20 | [Hunting Spot bypassed wildlife cleanup](../BUG%20REPORTS/2026-08-21-hunting-spot-bypasses-wildlife-cleanup.md) | Hunting / ecology | Resolved | No |
| 21 | [Rivers read as ponds](../BUG%20REPORTS/2026-08-21-rivers-read-as-ponds.md) | Terrain / rendering | Resolved — live verification pending | **P1** |
| 22 | [Tailwind/PostCSS startup failure](../BUG%20REPORTS/2026-08-21-ui-tailwind-postcss-startup-failure.md) | UI startup | Resolved | No |
| 23 | [Worker tick-error fallback missing](../BUG%20REPORTS/2026-08-21-worker-tick-error-does-not-fallback.md) | Worker reliability | Resolved | No |
| 24 | [Original commute cache churn](../BUG%20REPORTS/Bug_%20Human%20commute%20path%20cache%20misses%20on%20nearly%20every%20movement%20update.md) | Movement / pathing | Resolved — live verification pending | **P5** |
| 25 | [Ambient dialogue leader monologue](../BUG%20REPORTS/2026-08-21-ambient-dialogue-often-becomes-leader-monologue.md) | Social life | Resolved | No |
| 26 | [Split dialogue-bank categories](../BUG%20REPORTS/2026-08-21-split-dialogue-bank-has-duplicate-and-mismatched-categories.md) | Content pipeline | Resolved | No |

## Important interpretation

The three movement reports intentionally overlap. They are not three separate unresolved code defects:

- **P2** proves the runtime uses the one tested movement owner.
- **P5** proves the visible long-commute experience remains smooth after the cache-key repairs.
- **P4** is the broader movement/lifecycle playtest, including hospital and birth behavior.

A successful long-commute test can be recorded in both **P2** and **P5**, provided the note explicitly says the same play session covered both reports.

## Automated baseline

The latest archive audit passed **55 test files / 347 tests**, TypeScript validation, and focused ESLint. Automated evidence supports every resolved report; this document only tracks the remaining checks that require player observation.
