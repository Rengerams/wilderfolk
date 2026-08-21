# Age-14 Fertility F1 — v0.6.2.1 Rule Amendment

**Status:** Approved implementation slice  
**Presentation:** Simulation-only and non-explicit. The game continues to present relationships through ordinary life events, status, and birth outcomes; it adds no explicit sexual content.

## Player rule

Fertility starts at **age 14**. Ages 14–17 may begin a pregnancy only through an existing, mutual youth-love relationship, with both settlers living player settlers, both at least 14, the pregnant settler below age 18, adequate energy, and both partners nearby. This is intentionally uncommon: it uses the ordinary nearby adult conception rate multiplied by an age-based youth factor.

| Pregnant settler age | Daily multiplier applied to nearby adult chance | Approximate rule intent |
|---|---:|---|
| 14 | 0.12 | Rare frontier-life outcome. |
| 15 | 0.18 | Still unusual. |
| 16 | 0.24 | Uncommon, but more plausible in a lasting pair. |
| 17 | 0.30 | Still lower than adult conception. |
| 18+ | Existing adult path | No change to married-home, nearby married, or affair rates. |

At age 14, the effective daily chance is `HUMAN_DAILY_PREGNANCY_CHANCE_NEAR × 0.12`, before the existing fertility and trait factors. The rule therefore does not create a new high-frequency birth source or replace adult household formation.

## Ownership and invariants

| Concern | Sole owner | Cadence | Writes |
|---|---|---|---|
| Youth conception eligibility and roll | `simulation/humanRelationships.ts` | Existing once-per-calendar-day conception call | Existing pregnancy fields, `pregnantById`, status, feedback |
| Pregnancy progression and birth | `simulation/humanLifecycle.ts` | Existing pregnancy cadence | Existing progress, child, lineage, birth event |
| Youth-love formation and breakups | `simulation/humanRelationships.ts` | Existing daily youth-love lifecycle | Existing mutual youth-love fields only |
| Age constants and probability helper | `dayCycle.ts` | Pure helper | None |
| UI and rendering | Presentation only | Render | Never creates or edits pregnancy state |

The adult marriage threshold remains **18**. A youth pregnancy does not create a marriage, a shared residence, a workforce transition, or an alternate birth path. The mutual youth-love link stays responsible for the relationship context, while `pregnantById` preserves lineage for the eventual lifecycle owner.

## Guardrails

| Guardrail | Result |
|---|---|
| Age below 14 | No fertility; rejected by the existing conception gate. |
| Missing, dead, non-player, non-male, or one-sided youth-love partner | No youth conception. |
| Married, affair, adult, or post-18 conception | Existing paths are unchanged. |
| Low energy or distance beyond 22 world units | No youth conception for that daily check. |
| Existing pregnancy or reproduction cooldown | No second pregnancy path. |
| Explicit presentation | Not implemented. Only existing neutral pregnancy/birth feedback remains. |

## Regression proof

Focused tests must pin the age-14 eligibility boundary, the lower youth multiplier, rejection of a one-sided youth link, a deterministic successful youth conception with lineage, and unchanged adult married conception behavior.
