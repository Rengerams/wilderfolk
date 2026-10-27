# Mini-RFC — Human needs overhaul (#61)

**Current status (27 October 2026):** implementation PR #62 merged into `main` and is accepted. This mini-RFC preserves pre-implementation risks and tuning proposals; any remaining verification is post-merge follow-up, not a draft PR gate.

**Problem:** Meals and sleep currently share the energy bar, and active/offscreen branches independently mutate it.

**Minimal change:** Player humans own `Entity.needs`; a single physiology owner advances it once before per-entity simulation branches. Nonhuman `energy` remains unchanged; human `energy` is a temporary one-way compatibility projection until all downstream readers are migrated. `tryEatColonyMeal` remains the single food ledger transaction. `scheduleFatigue` remains roster fatigue, not sleep debt.

**Risk-impact:** Combat, parenthood, leisure energy writers, night shifts, hotels, worker transport, food demand forecasts and day-scale calibration require audits and seeded equivalence checks.

**Tick contract:** Observe prior movement and real sleep/duty before offscreen throttling, advance exactly once by elapsed sim ticks, resolve need, then perform the chosen action. `lastAdvancedTick` prevents double application.

**Tuning proposal (not measured):** adult nutrition loss about 30/day, 10 restored per unit of food, aiming at 3 food/day; awake rest loss 4/h and verified sleep +12/h. Severe starvation death follows 48 hours at less than eight nutrition. Stamina zero is never immediately fatal.

**Recovery:** A critically tired off-duty settler has a eight-simulation-hour recovery window. Home rest is credited only when physically back at a completed assigned residence; a prisoner requires an actual completed prison cell. Recovery ends at 85 rest, even if the window remains. Overnight work schedules a daytime recovery intent after the shift; only actual time at an assigned, completed residence credits sleep. Night work is never itself credited as sleep.

**Post-merge verification and refinements:** complete the remaining human-energy reference audit; verify day sleep for night workers, health/productivity effects and task-based intents on current code; measure 7/30/360-day economy balance and final-main type/lint/build/tests. These are not an assertion that already merged PR #62 was unaccepted.
