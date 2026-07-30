import { EntityType } from '../game/gameEngine';
import type { Entity } from '../game/gameEngine';
import {
  playHumanHuntSfx,
  playPredatorHuntSfx,
  playMoonHowlerSfx,
  playTameSfx,
  playTransformSfx,
  playSettlerDeathSfx,
} from './interactionSfx';

const PREY_TYPES = new Set<EntityType>([EntityType.Rabbit, EntityType.Deer]);
const PREDATOR_TYPES = new Set<EntityType>([
  EntityType.Wolf,
  EntityType.Fox,
  EntityType.Werewolf,
  EntityType.Human,
]);

function nearbyHunters(prey: Entity, entities: Entity[], radius = 90): Entity[] {
  return entities.filter(
    (e) =>
      e.alive &&
      PREDATOR_TYPES.has(e.type) &&
      Math.hypot(e.x - prey.x, e.y - prey.y) < radius,
  );
}

/** Play SFX only when sim state shows a real interaction this tick. */
export function detectInteractionSounds(prevEntities: Entity[], currentEntities: Entity[]) {
  const prevById = new Map(prevEntities.map((e) => [e.id, e]));

  for (const curr of currentEntities) {
    const prev = prevById.get(curr.id);
    if (!prev) continue;

    // Tame / befriend
    if (!prev.tamedBy && curr.tamedBy) {
      if (curr.type === EntityType.Werewolf) playMoonHowlerSfx();
      else playTameSfx();
    }

    // Human → Moon Howler
    if (prev.type === EntityType.Human && curr.type === EntityType.Werewolf && curr.alive) {
      playTransformSfx();
    }
  }

  // New Moon Howler spawned
  const prevWereIds = new Set(
    prevEntities.filter((e) => e.type === EntityType.Werewolf).map((e) => e.id),
  );
  for (const curr of currentEntities) {
    if (curr.alive && curr.type === EntityType.Werewolf && !prevWereIds.has(curr.id)) {
      const wasHuman = prevById.get(curr.id)?.type === EntityType.Human;
      if (!wasHuman) playMoonHowlerSfx();
    }
  }

  // Deaths
  for (const prev of prevEntities) {
    if (!prev.alive) continue;
    const curr = currentEntities.find((e) => e.id === prev.id);
    if (!curr || curr.alive) continue;

    if (prev.type === EntityType.Human) {
      playSettlerDeathSfx();
      continue;
    }

    if (!PREY_TYPES.has(prev.type)) continue;

    const hunters = nearbyHunters(prev, currentEntities);
    if (hunters.some((h) => h.type === EntityType.Human)) {
      playHumanHuntSfx();
    } else if (hunters.some((h) => h.type === EntityType.Werewolf)) {
      playMoonHowlerSfx();
    } else if (hunters.some((h) => h.type === EntityType.Wolf || h.type === EntityType.Fox)) {
      playPredatorHuntSfx();
    }
  }
}