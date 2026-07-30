import { writeFileSync } from 'fs';
import { initGame } from '../src/game/worldGen.ts';
import { MapSize, BuildingType } from '../src/game/gameTypes.ts';
import { startBuilding, canPlaceBuilding } from '../src/game/buildingActions.ts';
import { gameTick } from '../src/game/gameTick.ts';
import { assignMissingWorkers, findHumanWorkplace } from '../src/game/workforce.ts';
import { isPlayerHuman } from '../src/game/playerHuman.ts';

const log: string[] = [];
const p = (m: string) => {
  log.push(m);
  console.log(m);
};

function tryPlace(s: ReturnType<typeof initGame>, type: BuildingType, ox: number, oy: number) {
  const cx = ox;
  const cy = oy;
  for (let r = 40; r <= 280; r += 20) {
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      if (canPlaceBuilding(s, type, x, y, 0)) {
        return startBuilding(s, type, x, y, 0);
      }
    }
  }
  return s;
}

p('init...');
let s = initGame({ size: MapSize.Small, villageName: 'Test' });
const pioneers = s.entities.filter(isPlayerHuman);
p(`humans=${pioneers.length} camp≈${pioneers[0]?.x},${pioneers[0]?.y} wood=${s.resources.wood}`);

const cx = pioneers[0]?.x ?? s.width / 2;
const cy = pioneers[0]?.y ?? s.height / 2;

s = tryPlace(s, BuildingType.House, cx, cy);
let house = s.buildings.find((b) => b.type === BuildingType.House);
p(`house placed=${!!house} occ=${JSON.stringify(house?.occupants)} p=${house?.constructionProgress}`);

s = tryPlace(s, BuildingType.Farm, cx + 40, cy + 40);
let farm = s.buildings.find((b) => b.type === BuildingType.Farm);
p(`farm placed=${!!farm} occ=${JSON.stringify(farm?.occupants)} p=${farm?.constructionProgress}`);

if (farm) {
  for (const id of farm.occupants) {
    const h = s.entities.find((e) => e.id === id)!;
    p(`builder ${id} site=${findHumanWorkplace(h, s.buildings)?.type}`);
  }
}

for (let i = 0; i < 720; i++) s = gameTick(s);

house = s.buildings.find((b) => b.type === BuildingType.House);
farm = s.buildings.find((b) => b.type === BuildingType.Farm);
p(`after 720 ticks house done=${house?.completed} farm done=${farm?.completed} farmOcc=${JSON.stringify(farm?.occupants)}`);
const jobs = s.entities.filter(isPlayerHuman).filter((h) => h.homeBuildingId != null);
p(`job workers=${jobs.length} ${JSON.stringify(jobs.map((h) => ({ id: h.id, home: h.homeBuildingId, job: h.job })))}`);
p(`food=${s.resources.food} wood=${s.resources.wood}`);
p(`all=${JSON.stringify(s.buildings.map((b) => ({ t: b.type, d: b.completed, p: Math.floor(b.constructionProgress ?? 0), o: b.occupants.length })))}`);

writeFileSync('smoke-build-out.txt', log.join('\n'));
