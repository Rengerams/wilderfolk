# Gameplay markers stay drawn over a running Spotlight performance

- Bug: during the ready Spotlight performance every cast member still carried a name plate and every upgraded building still showed its gold level frame, pennant and "Lv" text, so the girl in the middle was buried under interface marks.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-03
- Version/build: 0.6.5.1 working tree (0.6.5.2 development)
- Reporter: owner gameplay screenshot — "may dont show the names during he show and thoe yellow things around buildings"
- Area: Spotlight Lore presentation — canvas overhead labels, building level markers and the entity-layer cache
- Owner module: `src/game/renderer/humans.ts` (name plates), `src/game/renderer/buildings.ts` (level frames, pennants, level text), `src/game/entityLayer.ts` (layer key)
- Related: [Spotlight stage obscures village cast](../bug_report/2026-11-02-spotlight-stage-visibility.md), [Spotlight chorus slots stacked](../bug_report/2026-11-03-spotlight-chorus-slots-stacked.md)

## Status history
- 2026-11-03 — resolved: the ready phase hides name plates and building level markers, and the layer key now carries the phase; targeted tests, TypeScript, lint, build and a browser capture pass.

## Observed behavior

The owner's screenshot of a live scene shows ten name plates stacked across the plaza and gold frames with pennants and "Lv3" tags around the neighbouring houses and silos. The girl stands in the middle of a correctly spaced ring, but the labels and frames cover her body and the whole stage.

## Expected behavior

While the performance is presented, the frame shows the venue and its cast — no settler name plates and no building level markers. The moment the scene ends, every marker returns; nothing in the world changes.

## Reproduction steps

1. Load a colony with a completed Village Square and at least one upgraded (Lv2+) building near the stage.
2. Start the Spotlight scene (`?debug=1` Guide card → Run Spotlight Event) and let it reach `ready`.
3. Observe the cast's name plates and the gold building frames/level text still drawn over the paused performance.

## Evidence

- Owner screenshot dated 2026-11-03: plates over every performer, gold frames + pennants + "Lv3" on the surrounding buildings.
- Source trace: `drawHumans` drew a plate whenever `shouldDrawHumanNameLabel(zoom, …)` passed, with no scene check; `drawBuildings` called `drawBuildingLevelUpgrades` and `drawBuildingLevelMark` and painted `Lv{level}` for every completed building unconditionally; `buildEntityLayerKey` did not carry `spotlightLore.phase` even though `drawBuildings` is a layer painter.
- Browser capture after the fix: the same save and camera show no plates and no gold frames, with the ring and captions intact.

## Root cause

The overhead and building painters never consulted the spotlight scene, so their gameplay markers stayed on top of a presentation that is meant to own the frame. The baked entity-layer key was missing the scene phase, so even a scene-aware building pass could have reused a marked bake during the show or a marker-free bake after it.

## Fix / proposed fix

- `renderer/humans.ts`: skip the name plate while `spotlightLore?.phase === 'ready'`; speech bubbles, the cast filter and the talking mouth are unchanged.
- `renderer/buildings.ts`: skip `drawBuildingLevelUpgrades`, `drawBuildingLevelMark` and the `Lv{level}` text during that phase.
- `entityLayer.ts`: add the scene phase to the layer key so the baked building layer repaints when a performance starts or ends.

## Save/migration impact

None. The change is render-only view state; no world field, save field or scene record changes.

## Verification result

- `npx vitest run tests/spotlightQuietStage.test.ts` — PASS (3): no plate while ready and the plate returns afterwards; no gold frame/`Lv3` while ready while the building still paints; the layer key changes at scene start.
- Targeted renderer/spotlight suites (`spotlightLore`, `renderBatch.nameLabelGender`, `renderer.presentationLayout`, `settlers.indoors`, `renderBatch.buildingFallback`, `visualsAudit.renderWiring`, `renderBatch.frameCaches`) — PASS, 100 tests.
- Browser acceptance via `scripts/autoplay_playwright_probe.py --spotlight-save … --spotlight-screenshot …` — PASS: overlay visible, caption `1 / 44`, no page errors; capture shows the ring without name plates or gold level frames.
- `npm run test:types`, `npm run lint`, `npm run build`, `npm run check:source` — PASS.
