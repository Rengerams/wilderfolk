# Mini-RFC — Human needs overhaul (#61)

**Problem:** Meals and sleep currently share the energy bar, and active/offscreen branches independently mutate it.

**Minimal change:** Player humans own `Entity.needs`; a single physiology owner advances it once before per-entity simulation branches. Nonhuman `energy` remains unchanged; human `energy` is a temporary one-way compatibility projection until all downstream readers are migrated. `tryEatColonyMeal` remains the single food ledger transaction. `scheduleFatigue` remains roster fatigue, not sleep debt.

**Risk-impact:** Combat, parenthood, leisure energy writers, night shifts, hotels, worker transport, food demand forecasts and day-scale calibration require audits and seeded equivalence checks.

**Tick contract:** Observe prior movement and real sleep/duty before offscreen throttling, advance exactly once by elapsed sim ticks, resolve need, then perform the chosen action. `lastAdvancedTick` prevents double application.

**Tuning proposal (not measured):** adult nutrition loss about 30/day, 10 restored per unit of food, aiming at 3 food/day; awake rest loss 4/h and verified sleep +12/h. Severe starvation death follows 48 hours at less than eight nutrition. Stamina zero is never immediately fatal.

**Merge requirements still outstanding:** full energy reference migration, viable day sleep for night workers, health and productivity effects, real task-based need intents, 7/30-day and full-year measured economy balance, verified type/lint/build/tests.
