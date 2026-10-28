# Verified settler recovery and local well benefits
Date: 2026-10-29. Owner: simulation/humanPhysiology.ts for counters/needs and well radius;
humanSchedule.ts, hotelStay.ts, humanRelationships.ts and hospitalCare.ts provide location eligibility.

- Ordinary settlers only: no extra prison/captive physiology.
- A completed player well reduces stamina drain by 20% within 400 world pixels of its authoritative centre (building.x/y), regardless of activity; overlap does not stack. Other colony wells no longer give map-wide access.
- Sleeping at one's real home (night or verified recovery), a reserved hotel bed, an established lover's residence during a valid overnight tryst, or a real staffed hospital ward all qualify. A visit/nearby building alone never does.
- Each settler must remain stationary and continuously sleeping at the same site for 4 complete simulated hours. A waking tick, movement, save-time gap, site change or interruption restarts the counter.
- Ordinary sleeping recovers 12 rest units and 13 stamina units per hour as before. After 4 hours, positive stamina recovery rises by 50% (13 to 19.5 per hour). Reducing drain while sleeping would have no effect because sleep never drains stamina.
- Save/load persists the starting tick, building id and stationary anchor; old saves start without credit.
- Actual staffed-ward patients gain 10% more positive stamina recovery while sleeping. Hospital treatment remains independently owned by hospitalCare.ts; simply owning a hospital no longer grants a map-wide bonus.
