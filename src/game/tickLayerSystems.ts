/**
 * Systems layer — every 4 ticks.
 *
 * Weather, disasters, research, trade caravans, wildlife AI, wolf recruitment.
 * Eco metrics are daily (tickLayerDaily); grass is daily; trees are static.
 */
import type { WorldState, Entity } from './gameTypes';
import { EntityType, TerrainType, TERRAIN_TILE_SIZE, WEREWOLF_ATTACK_LINES, WEREWOLF_HOWL_LINES } from './gameTypes';
import { SPECIES_CONFIG } from './speciesConfig';
import { isProductionTick, EVENT_INTERVAL, isNewCalendarDayTick, killHuman, HUMAN_CHILDHOOD_DAYS, TICKS_PER_HOUR } from './dayCycle';
import type { TickContext } from './simulation/simulationTypes';
import { OFFSCREEN_WILDLIFE_THROTTLE, isInFocus } from './simFocus';
import { addBigNews, createDeathParticles, impulseScreenShake } from './simEffects';
import { GRAZE_BITE_ENERGY, GRASS_GRAZE_MIN_ENERGY } from './grassEcology';
import { isPlayerHuman } from './playerHuman';
import { appendDeathAge } from './citizenId';
import { rollPredatorBlock, rollCounterAttack } from './combat';
import { isActiveMoonHowler } from './moonHowler';
import { logEvent } from './eventLog';
import { buildRoadAvoidanceIndex } from './spatialGrid';
import { buildGrassPopulationSnapshot, buildWildlifePopulationSnapshot, findClosestEntityInRadius, findClosestInEntityGrid, forEachInEntityGrid, queryRoadAvoidance, wildlifeTypePopulation } from './simQueries';
import { USE_SCENT_GRID, RABBIT_SCENT_SENSITIVITY, DEER_SCENT_SENSITIVITY, WILDKIN_SCENT_SENSITIVITY } from './scentGrid';
import { pushNewEntity, markWildlifeDead, syncEntityGrids, markGrassDead, getGrassPopulationCap, clearHuntersTargetingPrey, isValidHuntPrey } from './simulation/simulationEntities';
import { humanDisplayName } from './citizenId';

import { updateWeather, updateDisasters } from './worldEvents';
import { updateResearch } from './research';
import { tickTradeCaravans } from './tradeCaravans';
import { createEntity } from './entityFactory';
import { indexEntity } from './entityIndex';
import { addFloatingText } from './simEffects';
import { WILDLIFE_LAYER_INTERVAL } from './simFocus';

/** Systems layer interval (ticks). Keep in sync with WILDLIFE_LAYER_INTERVAL. */
export const LAYER_SYSTEMS_INTERVAL = WILDLIFE_LAYER_INTERVAL;

/** Occasional predator migration to keep wolf pressure present. */
function tickWolfRecruitment(state: WorldState, ctx: TickContext): void {
  const { width, height, byType, newEntities, entityById } = ctx;
  if (
    !isProductionTick(state.tick, EVENT_INTERVAL.wolfRecruit)
    || (byType[EntityType.Wolf]?.filter((e) => e.alive).length ?? 0) >= 2
    || Math.random() >= 0.1
  ) {
    return;
  }

  const edge = Math.floor(Math.random() * 4);
  let sx = 0;
  let sy = 0;
  if (edge === 0) {
    sx = Math.random() * width;
    sy = 0;
  } else if (edge === 1) {
    sx = Math.random() * width;
    sy = height;
  } else if (edge === 2) {
    sx = 0;
    sy = Math.random() * height;
  } else {
    sx = width;
    sy = Math.random() * height;
  }

  const wolf = createEntity(
    EntityType.Wolf,
    sx,
    sy,
    state.nextEntityId++,
    SPECIES_CONFIG[EntityType.Wolf].spawnEnergy,
  );
  newEntities.push(wolf);
  indexEntity(entityById, wolf);
  addFloatingText(state, sx, sy, 'A lone wolf enters', '#6b7280');
}

export function tickLayerSystems(state: WorldState, ctx: TickContext): void {
  updateWeather(state);
  updateDisasters(state);
  updateResearch(state);
  tickTradeCaravans(state);
  tickWildlife(state, ctx);
  tickWolfRecruitment(state, ctx);
}

const WILDLIFE_TICK_TYPES: EntityType[] = [
  EntityType.Rabbit,
  EntityType.Deer,
  EntityType.Wolf,
  EntityType.Fox,
  EntityType.Werewolf,
  EntityType.Wildkin,
];


function isWildlifePredator(entity: Entity): boolean {
  return (
    entity.alive
    && (
      entity.type === EntityType.Wolf
      || entity.type === EntityType.Fox
      || entity.type === EntityType.Werewolf
      || (entity.type === EntityType.Human
        && !entity.isJuvenile
        && (isPlayerHuman(entity) || entity.faction === 'rival'))
    )
  );
}


// ============ TICK WILDLIFE (systems layer — not every tick) ============
/**
 * Mobile fauna AI. Host should call from systems layer every
 * `WILDLIFE_LAYER_INTERVAL` ticks. Grass is `tickGrassDaily`; trees have no tick.
 */
export function tickWildlife(state: WorldState, ctx: TickContext): void {
  const {
    width, height, reproMult, winterPenalty,
    byType, newEntities, updatedBuildings, roadBuildings, focus, entityById, predators,
    grassGrid, mobileGrid, scentGrid,
  } = ctx;

  /** Energy / cooldowns are per-tick rates; scale to systems cadence. */
  const step = WILDLIFE_LAYER_INTERVAL;

  const roadAvoidance = ctx.roadAvoidance ?? buildRoadAvoidanceIndex(width, height, roadBuildings);
  ctx.roadAvoidance = roadAvoidance;
  if (!ctx.wildlifePopulation) {
    ctx.wildlifePopulation = buildWildlifePopulationSnapshot(
      byType,
      newEntities,
      ctx.wildlifeSpawnParent,
    );
  }
  const wildlifePopulation = ctx.wildlifePopulation;
  // Grass snapshot only for graze death accounting mid-wildlife-pass.
  if (!ctx.grassPopulation) {
    ctx.grassPopulation = buildGrassPopulationSnapshot(byType, newEntities);
  }
  if (ctx.grassCap === undefined) {
    ctx.grassCap = getGrassPopulationCap(width, height);
  }
  const preyFallback = (byType[EntityType.Rabbit] ?? []).concat(byType[EntityType.Deer] ?? []);

  const isNewCalendarDay = isNewCalendarDayTick(state);
  const wildlifeDeathsThisTick = new Set<number>();

  for (const entityType of WILDLIFE_TICK_TYPES) {
    // Iterate a copy — markWildlifeDead splices the bucket while we walk it,
    // which otherwise skips the entity after each in-tick death.
    for (const entity of [...(byType[entityType] ?? [])]) {
      if (!entity.alive) continue;

    // Common updates
    if (isNewCalendarDay) {
      entity.age++;
    }
    entity.flash = Math.max(0, entity.flash - step);
    if (entity.combatTicks && entity.combatTicks > 0) {
      entity.combatTicks = Math.max(0, entity.combatTicks - step);
    }
    if (entity.huntTargetId) {
      const prey = entityById.get(entity.huntTargetId);
      if (!prey?.alive) entity.huntTargetId = undefined;
    }
    entity.animFrame = (entity.animFrame ?? 0) + 0.1 * step;

    // Death by old age
    if (entity.age >= entity.maxAge) {
      markWildlifeDead(ctx, entity, wildlifeDeathsThisTick, state.tick);
      createDeathParticles(state, entity.x, entity.y, '#aaaaaa', 5, 'smoke');
      syncEntityGrids(ctx, entity);
      continue;
    }

    // Grow up
    if (entity.isJuvenile && entity.age >= HUMAN_CHILDHOOD_DAYS) {
      entity.isJuvenile = false;
      entity.size = SPECIES_CONFIG[entity.type].size;
      entity.speed = SPECIES_CONFIG[entity.type].speed;
    }

    const config = SPECIES_CONFIG[entity.type];

    // Energy loss scaled to systems cadence (including off-screen fauna).
    // Grazers run slightly cheaper metabolism so passive play doesn't empty the map by summer.
    const grazerEase =
      entity.type === EntityType.Rabbit || entity.type === EntityType.Deer || entity.type === EntityType.Wildkin
        ? 0.82
        : 1;
    entity.energy -= (config.energyLossPerTick * grazerEase + winterPenalty) * step;

    if (entity.energy <= 0) {
      markWildlifeDead(ctx, entity, wildlifeDeathsThisTick, state.tick);
      createDeathParticles(state, entity.x, entity.y, '#8a2a2a', 8);
      syncEntityGrids(ctx, entity);
      continue;
    }

    const wildlifeInFocus = !focus || isInFocus(entity, focus);
    const wildlifeActive = wildlifeInFocus || (state.tick + entity.id) % OFFSCREEN_WILDLIFE_THROTTLE === 0;
    if (!wildlifeActive) {
      entity.reproductionCooldown = Math.max(0, entity.reproductionCooldown - step);
      syncEntityGrids(ctx, entity);
      continue;
    }

    let targetVx = 0;
    let targetVy = 0;

    // Flee from predators — every systems pulse for all prey (do NOT use tick+id % 2:
    // wildlife only runs on even ticks → odd ids never fled).
    if (entity.type === EntityType.Rabbit || entity.type === EntityType.Deer || entity.type === EntityType.Wildkin) {
      let closestPredator: Entity | null = null;

      closestPredator = findClosestEntityInRadius(
        mobileGrid,
        entity.x,
        entity.y,
        config.fleeRange,
        (pred) => isWildlifePredator(pred),
        'flee',
        predators,
      ) ?? null;

      if (closestPredator) {
        const dx = entity.x - closestPredator.x;
        const dy = entity.y - closestPredator.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        targetVx = (dx / dist) * config.speed * 1.5;
        targetVy = (dy / dist) * config.speed * 1.5;
      } else if (USE_SCENT_GRID && scentGrid) {
        const sensitivity = entity.type === EntityType.Rabbit
          ? RABBIT_SCENT_SENSITIVITY
          : entity.type === EntityType.Deer
            ? DEER_SCENT_SENSITIVITY
            : WILDKIN_SCENT_SENSITIVITY;
        const sample = scentGrid.sampleFleeGradient(entity.x, entity.y, sensitivity);
        if (sample.strength > 0) {
          targetVx = sample.awayX * config.speed * 1.25;
          targetVy = sample.awayY * config.speed * 1.25;
        }
      }
    }

    // Hunt prey — only when hungry (energy below 70% max)
    const isHungry = entity.energy < entity.maxEnergy * 0.7;
    if (isHungry && (entity.type === EntityType.Wolf || entity.type === EntityType.Fox || entity.type === EntityType.Werewolf)) {
      const moonHowlerHunter = entity.type === EntityType.Werewolf && isActiveMoonHowler(entity);
      const preyTypes = entity.type === EntityType.Fox
        ? [EntityType.Rabbit]
        : moonHowlerHunter
          ? [EntityType.Human, EntityType.Deer, EntityType.Rabbit]
          : [EntityType.Deer, EntityType.Rabbit];

      // Pack bonus for wolves: nearby wolves extend hunt range and share kills
      let nearbyPack = 0;
      let huntRange = config.huntRange;
      if (entity.type === EntityType.Wolf) {
        forEachInEntityGrid(
          mobileGrid,
          entity.x,
          entity.y,
          120,
          (other) => {
            if (
              other.type === EntityType.Wolf
              && other.id !== entity.id
              && other.alive
              && !wildlifeDeathsThisTick.has(other.id)
            ) nearbyPack++;
          },
          'wolf_pack',
          byType[EntityType.Wolf],
        );
        huntRange *= 1 + Math.min(3, nearbyPack) * 0.25;
      } else if (moonHowlerHunter) {
        huntRange *= 1.15;
      }

      const huntPick = { prey: null as Entity | null, dist: Infinity };
      const preyTypeSet = new Set<EntityType>(preyTypes);

      const huntPreyFallback = preyTypes.flatMap((type) => byType[type]);
      forEachInEntityGrid(
        mobileGrid,
        entity.x,
        entity.y,
        huntRange,
        (prey, dSq) => {
          if (!preyTypeSet.has(prey.type)) return;
          if (!isValidHuntPrey(prey, prey.type, entity.id)) return;
          const dist = Math.sqrt(dSq);
          const humanBias = prey.type === EntityType.Human ? 0.82 : 1;
          const biased = dist * humanBias;
          if (biased < huntPick.dist) {
            huntPick.dist = biased;
            huntPick.prey = prey;
          }
        },
        'hunt',
        huntPreyFallback,
      );

      if (huntPick.prey) {
        const caughtPrey = huntPick.prey;
        entity.huntTargetId = caughtPrey.id;
        const dx = caughtPrey.x - entity.x;
        const dy = caughtPrey.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const packSpeed = entity.type === EntityType.Wolf && nearbyPack > 0 ? 1.2 : 1;
        const wereSpeed = moonHowlerHunter ? 1.25 : 1;
        targetVx = (dx / dist) * config.speed * packSpeed * wereSpeed;
        targetVy = (dy / dist) * config.speed * packSpeed * wereSpeed;

        if (dist < config.size + caughtPrey.size) {
          const isHumanPrey = caughtPrey.type === EntityType.Human;

          if (isHumanPrey && rollCounterAttack(
            state, caughtPrey.id, entity.id, state.tick, caughtPrey.combatRollSeed ?? 0,
          )) {
            const victimId = caughtPrey.id;
            // Full death path — cursed howlers need killHuman via markWildlifeDead
            markWildlifeDead(ctx, entity, wildlifeDeathsThisTick, state.tick);
            syncEntityGrids(ctx, entity);
            clearHuntersTargetingPrey(victimId, entityById, ctx.huntTargetByPreyId);
            // Slaying a Moon Howler earns the defender a title.
            if (entity.type === EntityType.Werewolf && entity.moonHowlerCursed && !caughtPrey.title) {
              caughtPrey.title = 'Moonslayer';
              addFloatingText(state, caughtPrey.x, caughtPrey.y - 28, 'Moonslayer!', '#fbbf24');
              logEvent(state, 'combat', `${humanDisplayName(caughtPrey)} slew the Moon Howler and earned the title Moonslayer`, caughtPrey.name);
            }
            caughtPrey.combatTicks = 18;
            caughtPrey.flash = 12;
            createDeathParticles(state, entity.x, entity.y, '#8a2a2a', 10);
            addFloatingText(state, caughtPrey.x, caughtPrey.y - 14, 'Defended!', '#38bdf8');
            impulseScreenShake(state, 3);
            targetVx = 0;
            targetVy = 0;
          } else if (isHumanPrey && rollPredatorBlock(
            state, caughtPrey.id, state.tick, caughtPrey.combatRollSeed ?? 0,
          )) {
            caughtPrey.combatTicks = 14;
            caughtPrey.flash = 10;
            entity.flash = 6;
            entity.huntTargetId = undefined;
            addFloatingText(state, caughtPrey.x, caughtPrey.y - 14, 'Blocked!', '#38bdf8');
            impulseScreenShake(state, 2);
            targetVx = -(dx / dist) * config.speed * 1.4;
            targetVy = -(dy / dist) * config.speed * 1.4;
          } else {
            const victimId = caughtPrey.id;
            if (isHumanPrey) {
              killHuman(caughtPrey, updatedBuildings, entityById, state.tick);
              const humanBucket = byType[caughtPrey.type];
              if (humanBucket) {
                const hIdx = humanBucket.indexOf(caughtPrey);
                if (hIdx >= 0) humanBucket.splice(hIdx, 1);
              }
            } else {
              markWildlifeDead(ctx, caughtPrey, wildlifeDeathsThisTick, state.tick);
            }
            clearHuntersTargetingPrey(victimId, entityById, ctx.huntTargetByPreyId);
            syncEntityGrids(ctx, caughtPrey);
            entity.huntTargetId = undefined;
            createDeathParticles(state, caughtPrey.x, caughtPrey.y, '#8a2a2a', 10);
            const packEnergyBonus = entity.type === EntityType.Wolf ? 1 + nearbyPack * 0.15 : 1;
            const energyGain = isHumanPrey
              ? 220
              : (config.energyGain[caughtPrey.type] || 50) * packEnergyBonus;
            entity.energy = Math.min(entity.maxEnergy, entity.energy + energyGain);
            entity.flash = 10;
            entity.combatTicks = 14;

            if (isHumanPrey) {
              const wolfName = entity.name ? `${entity.name}${entity.surname ? ` ${entity.surname}` : ''}` : 'A Moon Howler';
              const victimName = caughtPrey.name ? `${caughtPrey.name}${caughtPrey.surname ? ` ${caughtPrey.surname}` : ''}` : 'A settler';
              const line = WEREWOLF_ATTACK_LINES[Math.floor(Math.random() * WEREWOLF_ATTACK_LINES.length)](wolfName, victimName);
              addBigNews(state, '🌝 Moon Howler Attack!', line, 'negative');
              addFloatingText(state, caughtPrey.x, caughtPrey.y - 12, 'Slain!', '#ef4444');
              logEvent(state, 'death', appendDeathAge(line, caughtPrey), victimName);
              impulseScreenShake(state, 5);
            } else {
              const preyLabel = caughtPrey.type === EntityType.Deer ? 'Deer' : 'Rabbit';
              const predatorLabel = entity.type === EntityType.Fox ? 'Fox' : entity.type === EntityType.Wolf ? 'Wolf' : 'Moon Howler';
              addFloatingText(state, caughtPrey.x, caughtPrey.y - 12, `${predatorLabel} caught ${preyLabel}!`, '#a8a29e');
              if (entity.type === EntityType.Werewolf) {
                addFloatingText(state, caughtPrey.x, caughtPrey.y - 24, 'Torn apart!', '#c4b5fd');
              }
            }
          }
        }
      } else {
        entity.huntTargetId = undefined;
      }
    }

    // Systems layer only runs every WILDLIFE_LAYER_INTERVAL ticks — stagger by pulse, not raw tick,
    // so every id can howl. ~2 clock hours between howls for a given entity.
    if (entity.type === EntityType.Werewolf && isActiveMoonHowler(entity)) {
      const pulse = Math.floor(state.tick / WILDLIFE_LAYER_INTERVAL);
      const pulsePeriod = Math.max(1, Math.round((2 * TICKS_PER_HOUR) / WILDLIFE_LAYER_INTERVAL));
      if (pulse % pulsePeriod === entity.id % pulsePeriod) {
        const line = WEREWOLF_HOWL_LINES[Math.floor(Math.random() * WEREWOLF_HOWL_LINES.length)];
        addFloatingText(state, entity.x, entity.y - 18, line, '#c4b5fd');
      }
    }

    // Graze earlier / farther so herds recover before starving out
    const needsFood = entity.energy < entity.maxEnergy * 0.78;
    if (needsFood && (entity.type === EntityType.Rabbit || entity.type === EntityType.Deer || entity.type === EntityType.Wildkin) && targetVx === 0 && targetVy === 0) {
      const grazeRange = 70;
      let closestGrass: Entity | null = null;
      let closestGrassDist = Infinity;

      const grazeHit = findClosestInEntityGrid(
        grassGrid,
        entity.x,
        entity.y,
        grazeRange,
        (grass) => grass.alive && grass.energy >= GRASS_GRAZE_MIN_ENERGY,
        'graze',
        byType[EntityType.Grass],
      );
      if (grazeHit) {
        closestGrass = grazeHit.entity;
        closestGrassDist = Math.sqrt(grazeHit.distSq);
      }

      if (closestGrass) {
        const dx = closestGrass.x - entity.x;
        const dy = closestGrass.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        targetVx = (dx / dist) * config.speed * 0.6;
        targetVy = (dy / dist) * config.speed * 0.6;

        if (closestGrassDist < config.size + closestGrass.size) {
          const bite = Math.min(closestGrass.energy, GRAZE_BITE_ENERGY);
          closestGrass.energy -= bite;
          entity.energy = Math.min(entity.maxEnergy, entity.energy + config.energyGain['grass']);
          if (closestGrass.energy <= 0) {
            markGrassDead(ctx, closestGrass);
            syncEntityGrids(ctx, closestGrass);
          }
        }
      }
    }

    // Wander — systems layer runs every WILDLIFE_LAYER_INTERVAL ticks; scale chance so
    // daily wander attempts stay ~like a per-tick 5% rate at 24 TPD.
    if (targetVx === 0 && targetVy === 0) {
      if (Math.random() < 1 - (1 - 0.05) ** step) {
        const angle = Math.random() * Math.PI * 2;
        entity.vx = Math.cos(angle) * config.speed * 0.4;
        entity.vy = Math.sin(angle) * config.speed * 0.4;
      }
      targetVx = entity.vx;
      targetVy = entity.vy;
    }

    entity.vx = targetVx;
    entity.vy = targetVy;
    if (entity.vx !== 0 || entity.vy !== 0) {
      entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
    }

    // Road avoidance
    queryRoadAvoidance(roadAvoidance, entity);

    // Tamed animals follow their owner (velocity only — unified movement below)
    if (entity.tamedBy) {
      const owner = entityById.get(entity.tamedBy);
      if (owner?.alive) {
        const dx = owner.x - entity.x;
        const dy = owner.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist > 35) {
          entity.vx = (dx / dist) * config.speed * 0.6;
          entity.vy = (dy / dist) * config.speed * 0.6;
          entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        }
      }
    }

    // Wildlife wade shallow water but stop at rivers and deep water — slide
    // along the bank by cancelling the blocked axis instead of wading across.
    const worldMap = state.worldMap;
    if (worldMap) {
      const nextX = entity.x + entity.vx;
      const nextY = entity.y + entity.vy;
      const tileAt = (px: number, py: number): TerrainType | undefined =>
        worldMap.tiles[Math.floor(py / TERRAIN_TILE_SIZE)]?.[Math.floor(px / TERRAIN_TILE_SIZE)]?.type;
      const deep = (t: TerrainType | undefined) => t === TerrainType.River || t === TerrainType.DeepWater;
      if (deep(tileAt(nextX, nextY))) {
        const xBlocked = deep(tileAt(nextX, entity.y));
        const yBlocked = deep(tileAt(entity.x, nextY));
        if (xBlocked && !yBlocked) entity.vx = 0;
        else if (yBlocked && !xBlocked) entity.vy = 0;
        else { entity.vx = 0; entity.vy = 0; }
      }
    }

    entity.x += entity.vx;
    entity.y += entity.vy;

    // Tamed predators assist owner by hunting nearby prey
    if (entity.tamedBy) {
      const owner = entityById.get(entity.tamedBy);
      if (owner?.alive) {
        const dist = Math.hypot(owner.x - entity.x, owner.y - entity.y);
        if (
          (entity.type === EntityType.Wolf || entity.type === EntityType.Fox
            || (entity.type === EntityType.Werewolf && !isActiveMoonHowler(entity)))
          && dist < 80
          && isProductionTick(state.tick, EVENT_INTERVAL.tamedHuntAssist)
        ) {
          const assistPrey = findClosestEntityInRadius(
            mobileGrid,
            entity.x,
            entity.y,
            config.huntRange,
            (p) =>
              (p.type === EntityType.Rabbit || p.type === EntityType.Deer)
              && isValidHuntPrey(p, p.type, entity.id),
            'tamed_hunt',
            preyFallback,
          );
          if (assistPrey?.alive) {
            const preyId = assistPrey.id;
            markWildlifeDead(ctx, assistPrey, wildlifeDeathsThisTick, state.tick);
            clearHuntersTargetingPrey(preyId, entityById, ctx.huntTargetByPreyId);
            syncEntityGrids(ctx, assistPrey);
            createDeathParticles(state, assistPrey.x, assistPrey.y, '#8a2a2a', 6);
            entity.energy = Math.min(entity.maxEnergy, entity.energy + (config.energyGain[assistPrey.type] || 50) * 0.5);
            entity.flash = 6;
            const huntMsg = entity.type === EntityType.Werewolf ? 'Snack run!' : 'Hunted!';
            addFloatingText(state, assistPrey.x, assistPrey.y - 10, huntMsg, '#a8a29e');
          }
        }
      }
    }

    if (entity.x < 0) entity.x = 0;
    if (entity.x > width) entity.x = width;
    if (entity.y < 0) entity.y = 0;
    if (entity.y > height) entity.y = height;

    // Reproduction — cursed humans in werewolf form must not spawn wildlife offspring
    entity.reproductionCooldown = Math.max(0, entity.reproductionCooldown - step);

    if (entity.type !== EntityType.Werewolf) {
    const sameTypeCount = wildlifeTypePopulation(wildlifePopulation, entity.type, entity.id);
    const maxPop = entity.type === EntityType.Rabbit ? 120 : entity.type === EntityType.Deer ? 60 : entity.type === EntityType.Wolf ? 25 : 35;
    const capacityFactor = Math.max(0, 1 - (sameTypeCount / maxPop));
    // Bounce back when scarce (passive valleys were going empty by ~half year)
    const scarcityBoost = sameTypeCount < maxPop * 0.25 ? 1.55 : sameTypeCount < maxPop * 0.45 ? 1.25 : 1;

    if (entity.reproductionCooldown <= 0 && entity.energy > config.reproductionEnergyThreshold && Math.random() < config.reproductionChance * reproMult * capacityFactor * scarcityBoost) {
      const mate = findClosestEntityInRadius(
        mobileGrid,
        entity.x,
        entity.y,
        80,
        (m) =>
          m.type === entity.type
          && m.id !== entity.id
          && m.energy > config.reproductionEnergyThreshold * 0.3,
        'mate',
        byType[entity.type],
      );
      if (mate) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 15;
        const nx = Math.min(width, Math.max(0, entity.x + Math.cos(angle) * dist));
        const ny = Math.min(height, Math.max(0, entity.y + Math.sin(angle) * dist));
        const offspring = createEntity(entity.type, nx, ny, state.nextEntityId++, config.spawnEnergy);
        if (!ctx.wildlifeSpawnParent) ctx.wildlifeSpawnParent = new Map();
        ctx.wildlifeSpawnParent.set(offspring.id, entity.id);
        pushNewEntity(state, ctx, offspring);
        entity.energy -= entity.maxEnergy * 0.2;
        entity.reproductionCooldown = config.reproductionCooldown;
      }
    }
    }
    syncEntityGrids(ctx, entity);
    }
  }
}
