# Settler sleep, local water wells and hospital recovery
Date: 2026-10-29. Owner: simulation/humanPhysiology.ts for needs and well radius;
humanTick.ts for sleep observations; hotelStay.ts and hospitalCare.ts for venue eligibility.

- Only ordinary player settlers receive physiology; imprisoned foreign captives have no stamina or rest simulation.
- A completed player well within 400 world pixels of its authoritative centre (building.x/y) reduces negative stamina drain by 20%. Overlapping wells do not stack.
- Sleeping at one's own completed house requires actual indoor presence and a valid residence assignment; nighttime sleep or daytime recovery qualifies.
- Hotel sleep requires actual indoor presence at the reserved hotel bed and valid nighttime lodging eligibility. Mere building proximity never counts as sleep.
- Ordinary sleep restores 12.5 rest and 12.5 stamina per simulated hour. Eight hours restore 100 points from zero, capped at 100; there is no four-hour threshold or bonus and no rest-progress save metadata.
- Existing established tryst and staffed-ward sleep checks remain independent. Staffed admitted patients recover 10% more positive sleep stamina; medical treatment still belongs to hospitalCare.ts.
