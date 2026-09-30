/**
 * Save inspector — what is in this `.json`, and why does it load (or not)?
 *
 * Written for the 2026-09-16 “savegame failed loading” report: the game collapses every
 * load failure into a player-facing guess, so a sent-in save has to be run through the
 * real path outside the browser to see the failing step.
 *
 * Usage: npx tsx scripts/inspect-save.mts <save.json>
 */
import { readFileSync } from 'node:fs';
import { describeSaveReadFailure, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { ENTITY_PERSISTED_FIELDS, WORLD_STATE_SAVE_KEYS } from '../src/game/saveSchema';
import { EntityType, TERRAIN_TILE_SIZE } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

const file = process.argv[2];
if (!file) {
  console.error('usage: npx tsx scripts/inspect-save.mts <save.json>');
  process.exit(2);
}

const text = readFileSync(file, 'utf8');
console.log(`file ${file}`);
console.log(`size ${text.length} bytes`);

let raw: Record<string, unknown> | undefined;
try {
  raw = JSON.parse(text) as Record<string, unknown>;
} catch (e) {
  console.log(`JSON.parse failed: ${e instanceof Error ? e.message : String(e)}`);
}

if (raw) {
  console.log(
    `_version=${String(raw._version)} · _ticksPerDay=${String(raw._ticksPerDay)} · _savedAt=${String(raw._savedAt)}`,
  );
  const map = raw.worldMap as Record<string, unknown> | undefined;
  console.log(
    `worldMap: ${map ? `size=${String(map.size)} ${String(map.width)}x${String(map.height)} seed=${String(map.seed)} compact=${String(map._compact ?? false)}` : 'absent'}`,
  );
  const entities = Array.isArray(raw.entities) ? (raw.entities as Record<string, unknown>[]) : [];
  const buildings = Array.isArray(raw.buildings) ? (raw.buildings as Record<string, unknown>[]) : [];
  const countType = (type: string): number => entities.filter((e) => e.type === type).length;
  console.log(
    `entities=${entities.length} (humans=${countType(EntityType.Human)} grass=${countType(EntityType.Grass)} trees=${countType(EntityType.Tree)} wildlife=${
      entities.length - countType(EntityType.Human) - countType(EntityType.Grass) - countType(EntityType.Tree)
    })`,
  );
  console.log(`buildings=${buildings.length} tick=${String(raw.tick)} day=${Number(raw.tick ?? 0) / TICKS_PER_DAY}`);
  console.log(`save keys: ${Object.keys(raw).length} present`);

  const missingWorldKeys = WORLD_STATE_SAVE_KEYS.filter((key) => !(key in raw));
  if (missingWorldKeys.length) console.log(`world keys absent from the file: ${missingWorldKeys.join(', ')}`);

  const humans = entities.filter((e) => e.type === EntityType.Human);
  for (const field of ENTITY_PERSISTED_FIELDS) {
    const missing = humans.filter((human) => !(field in human)).length;
    if (missing) console.log(`entity field "${field}" absent on ${missing}/${humans.length} humans`);
  }
}

const parsed = parseSaveJson(text);
if (!parsed.valid) {
  console.log(`\nREFUSED at parse: ${parsed.reason} — ${describeSaveReadFailure(parsed)}`);
  process.exit(1);
}
console.log('\nparsed OK — attempting the full restore (a thrown step prints below)…');
const loaded = loadGameFromParsed(parsed.parsed);
if (!loaded) {
  console.log('\nRESULT: load returned null — the "Save load failed:" line above is the failing step.');
  process.exit(1);
}
console.log(
  `\nRESULT: loaded · tick=${loaded.world.tick} entities=${loaded.world.entities.length} buildings=${loaded.world.buildings.length} humans=${loaded.world.humanPopulation}`,
);

const loadedMap = loaded.world.worldMap;
if (!loadedMap) {
  console.log('worldMap: absent after load');
} else {
  const tilePx = loaded.world.width / loadedMap.width;
  console.log(
    `world state ${loaded.world.width}x${loaded.world.height} px · worldMap ${loadedMap.width}x${loadedMap.height} tiles` +
      ` (${loadedMap.tiles.length} rows, first row ${loadedMap.tiles[0]?.length ?? 0} tiles) · tile = ${tilePx} px`,
  );
  const expectedTilesX = Math.ceil(loaded.world.width / TERRAIN_TILE_SIZE);
  const expectedTilesY = Math.ceil(loaded.world.height / TERRAIN_TILE_SIZE);
  const matches = loadedMap.width === expectedTilesX && loadedMap.height === expectedTilesY;
  console.log(
    `expected ${expectedTilesX}x${expectedTilesY} tiles for that world size — ${matches ? 'MATCHES' : 'MISMATCH: the valley was regenerated at the wrong scale'}`,
  );
  const outOfBounds = loaded.world.entities.filter(
    (e) => e.x > loadedMap.width * TERRAIN_TILE_SIZE || e.y > loadedMap.height * TERRAIN_TILE_SIZE,
  ).length;
  console.log(`entities outside the restored map: ${outOfBounds}/${loaded.world.entities.length}`);
}
