import { EntityType } from '../game/gameEngine';
import { PREDATOR_TYPES } from '../game/combat';
import type { Entity } from '../game/gameTypes';
import { isPlayerHumanShiftOwner } from '../game/playerHuman';
import {
  playHumanHuntSfx,
  playPredatorHuntSfx,
  playMoonHowlerSfx,
  playTameSfx,
  playTransformSfx,
  playSettlerDeathSfx,
} from './interactionSfx';

const PREY_TYPES = new Set<EntityType>([EntityType.Rabbit, EntityType.Deer]);
/**
 * Hunters audible near prey: sim predators (`combat`'s PREDATOR_TYPES) plus humans.
 * Composing the owner keeps added predators audible without a new branch here.
 */
const HUNTING_TYPES = new Set<EntityType>([...PREDATOR_TYPES, EntityType.Human]);

function nearbyHunters(prey: Entity, entities: Entity[], radius = 90): Entity[] {
  return entities.filter(
    (e) =>
      e.alive &&
      HUNTING_TYPES.has(e.type) &&
      Math.hypot(e.x - prey.x, e.y - prey.y) < radius,
  );
}

/** Play SFX only when sim state shows a real interaction this tick. */
export function detectInteractionSounds(
  prevEntities: Entity[],
  currentEntities: Entity[],
  recordedPlayerDeaths?: number,
) {
  const prevById = new Map(prevEntities.map((e) => [e.id, e]));
  // Death lookup by id: scanning the roster per dead entity is quadratic in colony size.
  const currentById = new Map(currentEntities.map((e) => [e.id, e]));

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

  if (recordedPlayerDeaths != null) {
    for (let death = 0; death < recordedPlayerDeaths; death++) playSettlerDeathSfx();
  }

  // The worker tally is authoritative; retained corpses support callers without a world snapshot.
  for (const prev of prevEntities) {
    if (!prev.alive) continue;
    const curr = currentById.get(prev.id);
    if (!curr || curr.alive) continue;

    // The one settler-death cue: ownership comes from the player module, so a cursed settler
    // dying in wolf form still counts and a visitor or rival death stays silent.
    if (isPlayerHumanShiftOwner(prev)) {
      if (recordedPlayerDeaths == null) playSettlerDeathSfx();
      continue;
    }
    if (prev.type === EntityType.Human) continue;

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