# Feature record: Post-taming animal care

- Status: complete — count-based daily ration implementation; per-animal fields explicitly NOT wanted by dev (2026-08-25)
- Date: 2026-08-23
- Status history:
  - 2026-08-23 — feature record written
  - 2026-08-24 — approved by dev (fish/food ration direction)
  - 2026-08-25 — fish concept removed; animals eat ordinary `resources.food` (10% of human daily consumption = 0.2 food/day per tamed animal)
  - 2026-08-25 — dev decision: per-animal care fields, `owner_lost`, and selected-animal panel status are **not interesting/not needed**; the count-based implementation (total tamed × 0.2 food/day, global fed/warning/shortage) is the final A1 scope
- Version/build: Wilderfolk v0.6.3 development working tree
- Area: Stewardship | animal lifecycle | food transparency
- Owner module: `src/game/animalCare.ts`, called only by `src/game/tickLayerDaily.ts`
- Cadence: existing daily simulation layer, after building production

## Developer approval

Approved 2026-08-24 by the dev (roadmap decision point 5 direction: ordinary settlement food). 2026-08-25: fish is removed — animals eat normal food.

## Player contract

A tamed animal is a continuing responsibility. Once per colony day, each tamed animal receives **0.2 food (10% of a human's 2 food/day)** automatically when food is available. The daily food ledger records this as `Animal care`, and the selected-animal panel shows its owner, care condition, and next meal requirement.

Animals eat ordinary settlement food from the shared `resources.food` stock. There is no separate fish inventory and none is planned for v0.6.3.

## Starting values and test plan

| Value | Starting rule | Why it is bounded | Adjustment rule |
|---|---|---|---|
| Ration cadence | 0.2 food per tamed animal per colony day (10% of human 2 food/day) | Directly reflects the developer-approved “10% of normal human consumption” rule without a realtime drain. | If early colonies cannot sustain a tame despite normal food production, reduce the cost only after a seeded play-path review. |
| Warning | One missed daily ration | Gives the player a visible chance to recover before a lasting shortage state. | Increase only if the warning cannot be noticed before the next daily care pass. |
| Shortage | Two consecutive missed daily rations | Creates a clear recoverable problem without hidden death or disappearance. | Increase if normal food fluctuations create frequent false alarms. |
| Recovery | Next successful ration resets missed days | Lets the player repair the state immediately after replenishing food. | Do not add lingering penalties without a separately approved design. |

## State and failure policy

The animal receives a compact persistent care record: the last processed care day, the last fed day, consecutive missed meals, and a readable status. The state transitions are `fed → warning → shortage → fed` on recovery. If the recorded tamer is absent or dead, the status becomes `owner_lost`; the animal is not silently killed, removed, or retamed.

The first slice does not reduce animal movement, hunting assistance, energy, loyalty, or combat capability. It does not add a manual feeding command, a new inventory, a new tick layer, food-type conversion, or a per-animal pathfinding pass.

## Authority, persistence, and rollback

Only the existing daily simulation layer invokes the care owner. The care owner may change existing `resources.food`, the daily economy ledger, and care fields on tamed entities. The new entity field must be carried through save/load normalization and worker delta reconciliation. The selected-animal panel is read-only.

Rollback consists of removing the daily owner call and ignoring the optional care record; no migration or world rewrite is required.

## Focused acceptance

The regressions must prove: taming initializes care; one tamed animal consumes one recorded daily ration; each daily transition is idempotent; no-food warning and shortage are recoverable; missing owner does not consume food or remove the animal; save/load and worker delta preserve valid care state; malformed care state normalizes safely; and existing tamed-follow behavior remains unchanged.

## Assumption

> **ASSUMPTION:** Animals eat ordinary `resources.food`; no fish resource exists for v0.6.3 (dev decision 2026-08-25).
>
> **IMPACT:** Farm, hunting, and fishing all contribute to the same food stock that sustains tamed animals.
>
> **IF WRONG:** A future explicit fish resource would need a separate economy migration; not planned.
>
> **VALIDATE:** Run a seeded colony with one tame, then check that daily `Animal care` consumption (0.2 food), selected-animal status, and food-stock change are readable without diagnostics.

## Unique ID

`2026-08-23-post-taming-animal-care`
