# Escalating ecology drama — design

**Date:** 2026-07-30  
**Status:** Draft for implementation planning  
**Product:** Wilderfolk (`app/`)  
**North star fit:** “Don’t kill all the wolves” — ecology must be readable and consequential.

---

## 1. Goal

Players who **respect the valley** feel light friction and good information.  
Players who **abuse nature for a long time** face extreme, fair consequences.  
**No silent punishment:** every severity step is communicated so the player knows when to be careful.

### Success criteria

- A careful player can stay at **Stable** or briefly **Strained** with clear recovery.
- An abusive player who ignores Strained → Damaged can reach **Collapse**.
- Player can always answer: *What stage is the valley in?* and *Why?*
- Collapse never appears without prior Strained and Damaged signaling (except impossible mid-save edge cases; still show stage UI immediately).

### Non-goals (YAGNI)

- Full rewrite of grass/wildlife simulation.
- Random “act of god” eco disasters with no prior stage.
- Instant Collapse on a single bad day.
- Punishing brand-new colonies in the first colony week before UI literacy.
- Second parallel eco score that contradicts Nature tab.

---

## 2. Player information (mandatory)

Every stage **increase** uses at least two channels. Stage **decrease** uses one soft channel (notification or Nature badge cool-down).

| Channel | Role |
|---------|------|
| **Nature tab** | Primary. Always shows current **valley stage**, plain-language **primary driver**, and 1–2 secondary factors. |
| **Focus hints** | Actionable next step when stage ≥ Strained (e.g. ease hunting, let wolves recover). |
| **Alert strip / notification** | On enter Strained (always), Damaged, Collapse; on full stage recovery. |
| **Big news** | Damaged and Collapse only; also “Valley recovering” when leaving Damaged or Collapse. |
| **Ambient** | Optional from Damaged up: chat lines, thinner grass feel; Collapse may add wildlife behavior near town. Not the only signal. |

### Copy principles

- Prefer cause language: “Deer are eating grass faster than it regrows.”
- Prefer action language in Focus: “Ease hunting for a season” / “Leave some wolves wild.”
- Avoid only a raw percentage with no stage label.

### Early-game grace

- No Collapse until colony day ≥ **14** (or year ≥ 1 if day index is awkward — prefer absolute calendar day ≥ 14).
- Strained may appear earlier but uses softer copy (“Young colony — watch the meadows”).

---

## 3. Stages

| Stage | Intent | Player feel |
|-------|--------|-------------|
| **Stable** | Healthy or mild noise | Quiet Nature tab |
| **Strained** | “Be careful” | Yellow / caution |
| **Damaged** | Clear problem | Orange problem state |
| **Collapse** | Extreme after neglect | Crisis |

### Transition rules

1. **Instant up one step** only when metrics cross a hard threshold *and* hold for a short confirm window (see §5).
2. **Extreme path:** Collapse only if stage was Damaged for a sustained period *or* metrics are catastrophic for longer than Strained alone.
3. **Recovery lag:** Stage can drop only after metrics improve for a lag window (avoids flicker at boundaries).
4. **Hysteresis:** Separate enter vs exit thresholds (enter Strained harder than exit back to Stable).

---

## 4. Metrics (drivers)

Compute from existing systems where possible; do not invent a disconnected sim.

| Driver id | Source (concept) | Bad when |
|-----------|------------------|----------|
| `grazing` | Grazing pressure report (deer demand vs grass recovery) | Pressure high / pasture critical |
| `predators` | Wolf (and similar) vs prey counts | Predators wiped while prey high → boom risk; or prey gone |
| `overhunt` | Human hunting / hunting-spot kills vs wildlife regen | Sustained high kill pressure |
| `footprint` | Eco health / pollution / building footprint | Very low ecosystem health |

**Stage score:** derive a single **stress level** 0–3 (maps to stages) from the **worst** driver, with optional boost if 2+ drivers are bad.

**Nature tab always names the worst driver** in player language.

Suggested player strings:

- grazing → “Meadows under heavy grazing”
- predators → “Food chain unbalanced (predators/prey)”
- overhunt → “Hunting pressure too high”
- footprint → “Town and pollution press the wild”

---

## 5. Timing (fairness)

Constants are design targets; implementation may tune.

| Parameter | Intent |
|-----------|--------|
| Confirm up | Metrics must stay in band for ~0.5–1 colony day before stage +1 |
| Damaged dwell for Collapse | ~3–5 colony days at Damaged (or equivalent stress) before Collapse eligible |
| Recovery lag | ~1–2 colony days improved metrics before stage −1 |
| Notification cooldown | Same stage re-notify not more than once per ~3 days |

---

## 6. Effects by stage

Effects stack within a stage; higher stages include lower-stage soft effects unless noted.

### Stable

- No mechanical penalties.
- Nature tab shows stage + “Valley is in balance” (or mild tips only).

### Strained

- **Info:** Focus hint + notification on enter.
- **Soft economy:** Hunting spot / wild meat yield × ~0.9.
- **Ambient:** Occasional settler chat about thin grass / fewer tracks.
- No hard food shock.

### Damaged

- **Info:** Big news + Focus + Nature stage badge.
- **Medium economy:** Hunt yield × ~0.7; slight farm edge penalty optional (× ~0.95) if footprint/grazing driver.
- **Wildlife:** Mild prey population pressure (slightly higher starvation / lower repro) while grazing driver bad.
- **Health:** Small bump to daily illness chance for settlers (readable as “hard living”).
- Still reversible without Collapse.

### Collapse

- **Info:** Big news crisis; Focus prioritizes ecology recovery.
- **Hard economy:** Hunt yield × ~0.4–0.5; food spoilage or consumption stress optional light; immigration soft-cap if food scarce.
- **Wildlife:** Prey crash path accelerates; if predators gone and deer bloated then grass collapse → then deer crash (cascade already implied by sim — amplify if needed).
- **Reputation:** Modest one-time hit on enter Collapse (not every day).
- **Presence:** Hungry wildlife may push nearer camp (existing wander/hunt bias if cheap).
- **Not:** Instant wipe of all settlers; not undodgeable permanent death spiral without recovery path.

### Recovery

- Leaving Collapse → Damaged: big news “Valley recovering — stay careful.”
- Leaving Damaged → Strained: notification.
- Leaving Strained → Stable: soft success toast / Nature copy.

---

## 7. Systems integration

### New module (suggested)

`app/src/game/ecologyStage.ts` (name flexible):

- `export type ValleyStage = 'stable' | 'strained' | 'damaged' | 'collapse'`
- `computeValleyEcologySnapshot(state) → { stage, stress, primaryDriver, drivers, playerSummary }`
- `tickValleyEcologyStage(state)` — called from daily layer (or systems if daily metrics already there)
- Persist on `WorldState`: `valleyStage`, `valleyStageSinceTick` (or day), `valleyStagePeak`, last notify tick/day

### Call sites

| Area | Change |
|------|--------|
| `tickLayerDaily` / ecosystem metrics | Update stage + fire transitions |
| Nature tab UI | Stage badge + driver lines |
| `focusHints` | Ecology hints when stage ≥ strained |
| Notifications / big news | On transitions |
| Hunting / production | Multiply yields by stage factor |
| Optional wildlife daily | Stress modifiers from stage |
| Contextual tutorial | First Strained / first Collapse once |

### Saves

- Persist stage fields; on load recompute snapshot and clamp stage if metrics disagree by more than one step (prefer recompute + apply recovery lag defaults).
- Migrate missing fields → compute from current world.

---

## 8. UI details

### Nature tab

- Header chip: emoji + stage name (e.g. 🌿 Stable, ⚠️ Strained, 🧡 Damaged, ☠️ Collapse).
- One sentence summary.
- Bullet or meter for each driver (good / caution / bad).
- “What helps” list of 2–3 actions (static copy by primary driver).

### Focus examples

- Strained + grazing: “Deer pressure high — ease hunting and leave meadows.”
- Strained + predators: “Too few wolves — Harmony and meadows both suffer if prey explode.”
- Collapse: “Valley in collapse — stop overhunting; protect remaining wild balance.”

---

## 9. Testing plan (for implementation)

1. Unit: metric → stage boundaries with hysteresis cases.
2. Headless: force high deer / no wolves → Strained then Damaged within expected days; recovery when counts rebalance.
3. Play: wipe wolves, ignore alerts → Collapse with visible ladder; restore balance → stages drop with lag.
4. New game day 1–7: no Collapse; UI still readable.
5. Regression: hotel, elections, production ticks unaffected except intentional yield multipliers.

---

## 10. Rollout

1. Snapshot + stage machine + persistence (no heavy effects).
2. Nature + Focus + notifications (information-first).
3. Soft Strained / Damaged effects.
4. Collapse effects + ambient.
5. Tune constants from a short playtest matrix.

---

## 11. Open tuning knobs (decide in plan, not blockers)

- Exact numeric thresholds for each driver.
- Whether farms get any Damaged penalty (default: tiny or none; hunt bears more of the fantasy).
- Whether Collapse can reduce max population soft-cap.

---

## 12. Approval record

- Direction: escalating stages (light → extreme by abuse severity/duration).
- User: “give the player information so he knows when he needs to be careful.”
- Design approved in conversation before this document.
