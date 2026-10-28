# Foreign captive false exhaustion
- Date: 2026-10-29
- Owner: simulation/humanNeeds.ts and humanTick.ts
- Status: fixed in PR; CI verification pending

Stationary war captives used a second energy-loss simulation, with winter, village well, home-rest and hospital bonuses despite having no player needs. It could kill imprisoned foreigners through exhaustion while they did not work or roam.

Fix: remove captive energy-loss/death path, feed a single daily prison ration without energy restoration, and give normal needs only after successful voluntary recruitment. Existing captive decisions, guard custody, food ledger and ordinary player starvation continue unchanged.
