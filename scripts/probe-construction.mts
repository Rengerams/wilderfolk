/**
 * Construction probe (local, gitignored): does an unfinished site get a crew and does its
 * completeness % rise? Covers both the "idle settler available" and "everyone already employed"
 * cases, because the builder picker only takes settlers with no job.
 *
 *   npx tsx scripts/probe-construction.mts
 */
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';
import { isPlayerHuman } from '../src/game/playerHuman';
import { createSimFocus } from '../src/game/simFocus';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

function building(
  state: WorldState,
  type: BuildingType,
  x: number,
  y: number,
  completed: boolean,
): Building {
  const b = {
    id: state.nextBuildingId++, type, x, y, width: 60, height: 48, rotation: 0,
    completed, faction: 'player', occupants: [], constructionProgress: completed ? 100 : 0,
    level: 1, spriteScale: 1, health: 100, maxHealth: 100,
  } as unknown as Building;
  state.buildings.push(b);
  return b;
}

function report(state: WorldState, site: Building, label: string): void {
  const crew = state.buildings.find((b) => b.id === site.id)?.occupants ?? [];
  const settlers = state.entities.filter((e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e));
  console.log(
    `${label}: progress=${site.constructionProgress.toFixed(1)}% completed=${site.completed} crew=[${crew.join(',')}] | ` +
    settlers.map((s) => `#${s.id} job=${s.job} work=${s.homeBuildingId ?? '-'}`).join(' '),
  );
}

for (const scenario of ['idle settler available', 'everyone already employed'] as const) {
  const state = initGame({ seed: 4242, villageName: 'BuildProbe' });
  const focus = createSimFocus(state);
  building(state, BuildingType.House, 420, 430, true);

  if (scenario === 'everyone already employed') {
    const jobs = building(state, BuildingType.LumberMill, 640, 520, true);
    const farm = building(state, BuildingType.Farm, 300, 620, true);
    for (const [i, e] of state.entities.filter((x) => x.alive && isPlayerHuman(x)).entries()) {
      const target = i === 0 ? jobs : farm;
      e.homeBuildingId = target.id;
      target.occupants.push(e.id);
    }
  }

  // `BuildingType` has no `Warehouse` (storage owners are Store/WoodStorehouse/Silo/Barn); the old
  // `BuildingType.Warehouse ?? BuildingType.Store` reached Store at runtime, so name Store directly.
  const site = building(state, BuildingType.Store, 560, 560, false);
  console.log(`\n=== ${scenario} (site #${site.id}, buildTime=${(site as unknown as { buildTime?: number }).buildTime ?? 'config'}) ===`);
  report(state, site, 'day 0');
  for (let day = 1; day <= 5; day++) {
    for (let t = 0; t < TICKS_PER_DAY; t++) gameTick(state, focus);
    report(state, site, `day ${day}`);
  }
}
