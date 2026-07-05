import type { WorldState, Entity, Building, SimulationFocus } from './gameEngine';
import { EntityType, BuildingType, JobType, Season, WeatherType, WEREWOLF_ATTACK_LINES, WEREWOLF_HOWL_LINES, BUILDING_CONFIGS } from './gameTypes';
import { isBarracksGuard } from './defenseStructures';
import {
  addBigNews,
  addFloatingText,
  addNotification,
  createDeathParticles,
  impulseScreenShake,
  SPECIES_CONFIG,
  hasTech,
  getChurchStrength,
  hasStaffedSchool,
  findHumanWorkplace,
  OFFSCREEN_HUMAN_THROTTLE,
  OFFSCREEN_WILDLIFE_THROTTLE,
  OFFSCREEN_GRASS_THROTTLE,
  isInFocus,
} from './gameEngine';
import { addResource } from './economy';
import { setEntityBirthDate } from './worldGen';
import { isPlayerHuman } from './groupEvents';
import { getElectionGatherTarget, isElectionCeremonyActive } from './villageLeadership';
import {
  HUMAN_ADULT_MIN_AGE,
  HUMAN_ADULT_MAX_AGE,
  HUMAN_CHILDHOOD_DAYS,
  HUMAN_MAX_LIFESPAN_DAYS,
  HUMAN_DAILY_ILLNESS_CHANCE,
  PREGNANCY_TICKS,
  REPRODUCTION_COOLDOWN_TICKS,
  allowSocialLife,
  hasResidenceAssignment,
  hasWorkAssignment,
  isNearResidence,
  isResidenceBuilding,
  isWorkHour,
  rebuildChildrenIds,
  shareResidence,
  shouldBeAtHome,
  syncPartnerResidence,
  TICKS_PER_DAY,
  WORK_START,
  EVENING_START,
  isProductionTick,
  getFemaleFertility,
  getOldAgeDeathChance,
  EVENT_INTERVAL,
} from './dayCycle';
import { maybeHumanChat, tickHumanChat } from './humanChat';
import { advanceHumanWalkAnim, pickHumanVariant } from './humanSprites';
import { getRandomName } from './nameLoader';
import { isRenffrGossipActive } from './renffrStar';
import {
  getHumanHuntRange,
  getHumanFleeSpeedMultiplier,
  getHuntFoodMultiplier,
  rollPredatorBlock,
  rollCounterAttack,
} from './combat';
import { isActiveMoonHowler } from './moonHowler';
import { createEntity } from './worldGen';
import { logEvent } from './eventLog';
import { getPlayerCampCenter, isRaidMarchingForRival } from './frontierCombat';
import { clearFactionWanderState, tickFactionCampWander } from './factionWander';

export interface TickContext {
  width: number;
  height: number;
  hourOfDay: number;
  season: Season;
  grassMult: number;
  reproMult: number;
  winterPenalty: number;
  canHeat: boolean;
  byType: Record<EntityType, Entity[]>;
  newEntities: Entity[];
  updatedBuildings: Building[];
  roadBuildings: Building[];
  playerHumans: Entity[];
  entityById: Map<number, Entity>;
  buildingById: Map<number, Building>;
  predators: Entity[];
  focus?: SimulationFocus;
}

const WILDLIFE_TICK_TYPES: EntityType[] = [
  EntityType.Grass,
  EntityType.Tree,
  EntityType.Rabbit,
  EntityType.Deer,
  EntityType.Wolf,
  EntityType.Fox,
  EntityType.Werewolf,
  EntityType.Wildkin,
];

function pushNewEntity(ctx: TickContext, entity: Entity): void {
  ctx.newEntities.push(entity);
  ctx.entityById.set(entity.id, entity);
}

// ============ HUMAN RELATIONSHIP HELPERS ============
function humanDisplayName(entity: Entity): string {
  return entity.name ? `${entity.name}${entity.surname ? ` ${entity.surname}` : ''}` : 'A settler';
}

function hasAffairPartner(entity: Entity): boolean {
  return entity.affairPartnerId != null;
}

function isSpouseNearby(entity: Entity, humans: Entity[], range = 52): boolean {
  if (entity.partnerId == null) return false;
  const spouse = humans.find((h) => h.id === entity.partnerId && h.alive);
  if (!spouse) return false;
  return Math.hypot(spouse.x - entity.x, spouse.y - entity.y) < range;
}

function isValidAffairTarget(entity: Entity, target: Entity): boolean {
  if (!isPlayerHuman(target) || !target.alive || !target.gender) return false;
  if (target.gender === entity.gender || target.id === entity.id) return false;
  if (target.id === entity.partnerId || entity.id === target.partnerId) return false;
  if (target.age < HUMAN_ADULT_MIN_AGE || target.age >= HUMAN_ADULT_MAX_AGE) return false;
  if (entity.affairPartnerId != null && target.id !== entity.affairPartnerId) return false;
  if (target.affairPartnerId != null && target.affairPartnerId !== entity.id) return false;
  return true;
}

function clearAffairPair(a: Entity, b: Entity): void {
  a.affairPartnerId = undefined;
  a.affairProgress = 0;
  b.affairPartnerId = undefined;
  b.affairProgress = 0;
}

function exposeAffair(
  state: WorldState,
  cheater: Entity,
  paramour: Entity,
  reason: 'caught' | 'rumor',
): void {
  const who = humanDisplayName(cheater);
  const other = humanDisplayName(paramour);
  clearAffairPair(cheater, paramour);
  cheater.flash = 12;
  paramour.flash = 12;
  state.villageReputation = Math.max(0, state.villageReputation - (reason === 'caught' ? 8 : 4));
  const midX = (cheater.x + paramour.x) / 2;
  const midY = (cheater.y + paramour.y) / 2;
  addFloatingText(state, midX, midY - 18, reason === 'caught' ? 'Caught!' : 'Scandal!', '#ef4444');
  logEvent(
    state,
    'scandal',
    reason === 'caught'
      ? `${who} was caught with ${other}`
      : `Whispers spread about ${who} and ${other}`,
    who,
  );
  addNotification(state, 'Scandal', `${who} & ${other} — the village is talking`, 'warning');

  // Church-backed prisons may arrest caught adulterers.
  if (reason === 'caught') {
    arrestForScandal(state, cheater);
    arrestForScandal(state, paramour);
  }
}

function arrestForScandal(state: WorldState, offender: Entity): void {
  if (!offender.alive || offender.type !== EntityType.Human) return;
  if (offender.prisonBuildingId != null) return;
  const prisons = state.buildings.filter(
    (b) => b.completed && b.type === BuildingType.Prison && b.occupants.length > 0,
  );
  if (prisons.length === 0) return;
  // Base arrest chance; higher if more staffed prisons ("the law is watching").
  const arrestChance = Math.min(0.45, 0.12 + prisons.length * 0.08);
  if (Math.random() >= arrestChance) return;
  const prison = prisons.find((b) => b.occupants.length < BUILDING_CONFIGS[BuildingType.Prison].maxOccupants)
    ?? prisons[0];
  const sentenceTicks = 60 + Math.floor(Math.random() * 80); // ~2.5–6 days
  if (offender.homeBuildingId != null) {
    const workplace = state.buildings.find((b) => b.id === offender.homeBuildingId);
    if (workplace) {
      workplace.occupants = workplace.occupants.filter((id) => id !== offender.id);
    }
    offender.homeBuildingId = undefined;
    offender.occupation = 'settler';
    offender.job = JobType.Settler;
  }
  offender.prisonBuildingId = prison.id;
  offender.prisonerUntilTick = state.tick + sentenceTicks;
  offender.x = prison.x + (Math.random() - 0.5) * 12;
  offender.y = prison.y + (Math.random() - 0.5) * 8;
  offender.vx = 0;
  offender.vy = 0;
  prison.occupants.push(offender.id);
  const name = humanDisplayName(offender);
  logEvent(state, 'event', `${name} was imprisoned for scandal`, name);
  addFloatingText(state, prison.x, prison.y - 20, 'Imprisoned', '#94a3b8');
}

// ============ COMMUTE HELPERS ============
function homeStandPosition(building: Building, entityId: number): { x: number; y: number } {
  const cx = building.x + building.width / 2;
  const cy = building.y + building.height / 2;
  const seed = entityId * 17 + building.id * 31;
  const angle = (seed * 2.399963) % (Math.PI * 2);
  const ring = (seed % 5) + 1;
  const radius = 10 + ring * 7;
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius * 0.6,
  };
}

/** Beyond this distance, settlers snap to home/work at shift change (7am / 7pm). */
const COMMUTE_SNAP_DISTANCE = 130;

function humanBuildingTarget(
  building: Building,
  entityId: number,
  arrivingHome: boolean,
): { x: number; y: number } {
  if (arrivingHome) return homeStandPosition(building, entityId);
  const seed = entityId * 13 + building.id * 29;
  const offset = ((seed % 7) - 3) * 6;
  return {
    x: building.x + building.width / 2 + offset,
    // Workers stand in front of the building (south) so sprites aren't buried in the art.
    y: building.y + building.height * 0.92,
  };
}

function commuteDistanceToBuilding(
  entity: Entity,
  building: Building,
  arrivingHome: boolean,
): number {
  const target = humanBuildingTarget(building, entity.id, arrivingHome);
  return Math.hypot(target.x - entity.x, target.y - entity.y);
}

function snapHumanToBuilding(entity: Entity, building: Building, arrivingHome: boolean): void {
  const target = humanBuildingTarget(building, entity.id, arrivingHome);
  entity.x = target.x;
  entity.y = target.y;
  entity.vx = 0;
  entity.vy = 0;
}

function commuteHumanToBuilding(
  entity: Entity,
  building: Building,
  speed: number,
  arrivingHome: boolean,
  rush = 1,
): boolean {
  const target = humanBuildingTarget(building, entity.id, arrivingHome);
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const distRush = Math.min(10, 1 + dist / 50);
  const moveSpeed = speed * rush * distRush;
  if (dist > 22) {
    entity.vx = (dx / dist) * moveSpeed * 0.58;
    entity.vy = (dy / dist) * moveSpeed * 0.58;
    entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
    return false;
  }
  if (dist <= 8) {
    entity.vx = 0;
    entity.vy = 0;
    return true;
  }
  entity.vx = (dx / dist) * moveSpeed * (arrivingHome ? 0.1 : 0.14);
  entity.vy = (dy / dist) * moveSpeed * (arrivingHome ? 0.1 : 0.14);
  entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
  return false;
}

// ============ TICK HUMANS ============
export function tickHumans(state: WorldState, ctx: TickContext): void {
  const {
    width, height, hourOfDay, season, canHeat,
    byType, newEntities, updatedBuildings, roadBuildings, playerHumans, focus,
    entityById, buildingById,
  } = ctx;

  const config = SPECIES_CONFIG[EntityType.Human];
  const isWinter = season === Season.Winter;
  const goHomeTime = shouldBeAtHome(hourOfDay);
  const goWorkTime = isWorkHour(hourOfDay);
  const isNewCalendarDay = state.tick > 0 && state.tick % TICKS_PER_DAY === 0;
  const allHumans = byType[EntityType.Human];
  const churchStrength = getChurchStrength(updatedBuildings, playerHumans);
  const staffedSchool = hasStaffedSchool(updatedBuildings);
  const hasWell = updatedBuildings.some(b => b.type === BuildingType.Well && b.completed);
  const hasHospital = updatedBuildings.some(b => b.type === BuildingType.Hospital && b.completed);

  for (const entity of allHumans) {
    if (!entity.alive) continue;

    // Common updates
    if (isNewCalendarDay) {
      entity.age++;
      if (staffedSchool && entity.isJuvenile) entity.age++;
    }
    entity.flash = Math.max(0, entity.flash - 1);
    if (entity.combatTicks && entity.combatTicks > 0) {
      entity.combatTicks--;
      if (entity.combatTicks <= 0) entity.combatTicks = 0;
    }
    if (entity.huntTargetId) {
      const prey = entityById.get(entity.huntTargetId);
      if (!prey?.alive) entity.huntTargetId = undefined;
    }

    // Death by old age, illness, or accident
    const oldAgeChance = getOldAgeDeathChance(entity.age);
    if (oldAgeChance > 0 && (entity.age >= HUMAN_MAX_LIFESPAN_DAYS || Math.random() < oldAgeChance)) {
      entity.alive = false;
      createDeathParticles(state, entity.x, entity.y, '#aaaaaa', 5, 'smoke');
      const fullName = entity.name ? `${entity.name}${entity.surname ? ' ' + entity.surname : ''}` : 'A settler';
      const cause = entity.age >= HUMAN_MAX_LIFESPAN_DAYS ? 'old age' : 'an age-related illness';
      logEvent(state, 'death', `${fullName} died of ${cause} (${entity.age} days)`, fullName);
      continue;
    }
    if (entity.age >= HUMAN_ADULT_MIN_AGE && Math.random() < HUMAN_DAILY_ILLNESS_CHANCE) {
      entity.alive = false;
      createDeathParticles(state, entity.x, entity.y, '#aaaaaa', 5, 'smoke');
      const fullName = entity.name ? `${entity.name}${entity.surname ? ' ' + entity.surname : ''}` : 'A settler';
      logEvent(state, 'death', `${fullName} died of a sudden illness (${entity.age} days)`, fullName);
      continue;
    }

    // Grow up
    if (entity.isJuvenile && entity.age >= HUMAN_CHILDHOOD_DAYS) {
      entity.isJuvenile = false;
      entity.size = config.size;
      entity.speed = config.speed;
    }

    const inFocus = !focus || isInFocus(entity, focus);
    const isPrisoner = entity.prisonBuildingId != null;
    const active = !isPrisoner && (inFocus || entity.pregnant || (state.tick + entity.id) % OFFSCREEN_HUMAN_THROTTLE === 0);

    if (isElectionCeremonyActive(state) && isPlayerHuman(entity)) {
      const target = getElectionGatherTarget(state, entity.id);
      const dx = target.x - entity.x;
      const dy = target.y - entity.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist > 10) {
        entity.vx = (dx / dist) * config.speed * 1.15;
        entity.vy = (dy / dist) * config.speed * 1.15;
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        entity.x += entity.vx;
        entity.y += entity.vy;
      } else {
        entity.vx = 0;
        entity.vy = 0;
      }
      entity.reproductionCooldown = Math.max(0, entity.reproductionCooldown - 1);
      continue;
    }

    if (isPrisoner) {
      entity.vx = 0;
      entity.vy = 0;
      const prison = buildingById.get(entity.prisonBuildingId!);
      if (prison) {
        const dx = prison.x - entity.x;
        const dy = prison.y - entity.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist > 14) {
          entity.x += (dx / dist) * Math.min(dist, 1.2);
          entity.y += (dy / dist) * Math.min(dist, 1.2);
        }
      }
      continue;
    }

    if (!active) {
      if (entity.isJuvenile && entity.age >= HUMAN_CHILDHOOD_DAYS) {
        entity.isJuvenile = false;
        entity.size = config.size;
        entity.speed = config.speed;
      }
      const minimalOldAgeChance = getOldAgeDeathChance(entity.age);
      if (minimalOldAgeChance > 0 && (entity.age >= HUMAN_MAX_LIFESPAN_DAYS || Math.random() < minimalOldAgeChance)) {
        entity.alive = false;
        createDeathParticles(state, entity.x, entity.y, '#aaaaaa', 5, 'smoke');
        const fullName = entity.name ? `${entity.name}${entity.surname ? ` ${entity.surname}` : ''}` : 'A settler';
        const cause = entity.age >= HUMAN_MAX_LIFESPAN_DAYS ? 'old age' : 'an age-related illness';
        logEvent(state, 'death', `${fullName} died of ${cause} (${entity.age} days)`, fullName);
        continue;
      }
      if (entity.age >= HUMAN_ADULT_MIN_AGE && Math.random() < HUMAN_DAILY_ILLNESS_CHANCE) {
        entity.alive = false;
        createDeathParticles(state, entity.x, entity.y, '#aaaaaa', 5, 'smoke');
        const fullName = entity.name ? `${entity.name}${entity.surname ? ` ${entity.surname}` : ''}` : 'A settler';
        logEvent(state, 'death', `${fullName} died of a sudden illness (${entity.age} days)`, fullName);
        continue;
      }
      let minimalEnergyLoss = hasWell ? config.energyLossPerTick * 0.8 : config.energyLossPerTick;
      if (isWinter && !canHeat) minimalEnergyLoss *= 1.5;
      entity.energy -= minimalEnergyLoss;
      const mealHour = hourOfDay === 8 || hourOfDay === 18;
      if (mealHour && state.resources.food >= 1 && entity.energy < entity.maxEnergy * 0.9) {
        state.resources.food -= 1;
        entity.energy = Math.min(entity.maxEnergy, entity.energy + 65);
      }
      entity.reproductionCooldown = Math.max(0, entity.reproductionCooldown - 1);
      if (entity.gender && entity.relationshipStatus === undefined) {
        entity.relationshipStatus = 'single';
        entity.attraction = 50 + Math.random() * 50;
      }
      if (entity.energy <= 0) {
        entity.alive = false;
        createDeathParticles(state, entity.x, entity.y, '#8B0000', 8);
      }
      continue;
    }

    tickHumanChat(entity);

    // Visitors & rival settlers — camp wandering / raid march, no village job systems
    if (entity.faction === 'visitor' || entity.faction === 'rival') {
      const camp = entity.faction === 'visitor'
        ? state.visitorGroups.find((g) => g.id === entity.groupId)
        : state.rivalSettlements.find((r) => r.id === entity.groupId);
      if (camp) {
        const marching = entity.faction === 'rival' && entity.groupId && isRaidMarchingForRival(state, entity.groupId);
        const playerCenter = marching ? getPlayerCampCenter(state, updatedBuildings) : null;
        const cx = marching && playerCenter ? playerCenter.x : ('campX' in camp ? camp.campX : 0);
        const cy = marching && playerCenter ? playerCenter.y : ('campY' in camp ? camp.campY : 0);
        let speedMult = 0.4;
        if (marching) {
          const raidEvt = state.pendingRaidEvents?.find((r) => r.rivalId === entity.groupId);
          const marchTiles = raidEvt?.marchDistanceTiles ?? 30;
          speedMult = Math.max(0.38, 0.92 - marchTiles / 130);
        }
        if (marching) {
          const dx = cx - entity.x;
          const dy = cy - entity.y;
          const dist = Math.hypot(dx, dy) || 1;
          entity.vx = (dx / dist) * config.speed * speedMult;
          entity.vy = (dy / dist) * config.speed * speedMult;
          entity.x += entity.vx;
          entity.y += entity.vy;
          entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        } else {
          tickFactionCampWander(
            state,
            entity,
            cx,
            cy,
            updatedBuildings,
            config.speed * speedMult,
          );
        }
        const dist = Math.hypot(cx - entity.x, cy - entity.y);
        if (marching && dist < 90) entity.combatTicks = Math.max(entity.combatTicks ?? 0, 8);
        maybeHumanChat(
          entity,
          entity.faction === 'visitor' ? 'visitor' : marching ? 'rival' : 'rival',
          entity.id,
          state.tick,
          0.025,
          100,
        );
      }
      continue;
    }

    let energyLoss = hasWell ? config.energyLossPerTick * 0.8 : config.energyLossPerTick;
    if (isWinter && !canHeat) {
      energyLoss *= 1.5;
      if (hourOfDay === 8 && state.tick % TICKS_PER_DAY === 8) entity.flash = 5;
    }

    if (goHomeTime && hasResidenceAssignment(entity)) {
      const residence = updatedBuildings.find((b) => b.id === entity.residenceBuildingId && b.completed);
      if (residence) {
        const hdx = residence.x + residence.width / 2 - entity.x;
        const hdy = residence.y + residence.height / 2 - entity.y;
        if (Math.hypot(hdx, hdy) < 14) energyLoss *= 0.5;
      }
    }
    
    // Hospital reduces energy loss
    if (hasHospital) energyLoss *= 0.9;
    
    entity.energy -= energyLoss;

    let ateFromFarm = false;

    // Meals twice per day (8am & 6pm) — 1 food restores ~65 energy
    const mealHour = hourOfDay === 8 || hourOfDay === 18;
    if (mealHour && state.resources.food >= 1 && entity.energy < entity.maxEnergy * 0.9) {
      state.resources.food -= 1;
      entity.energy = Math.min(entity.maxEnergy, entity.energy + 65);
      ateFromFarm = true;
    }

    for (const building of updatedBuildings) {
      if (building.completed && (building.type === BuildingType.Farm || building.type === BuildingType.Greenhouse)) {
        const dx = building.x + building.width / 2 - entity.x;
        const dy = building.y + building.height / 2 - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 80 && Math.random() < 0.15) {
          entity.energy = Math.min(entity.maxEnergy, entity.energy + config.energyGain['farm']);
          ateFromFarm = true;
          break;
        }
      }
    }

    let suppressIdle = false;
    let onSchedule = false;
    const workplace = findHumanWorkplace(entity, updatedBuildings);
    const allowFreeRoam = !goHomeTime && !(goWorkTime && workplace);
    const socialTime = allowSocialLife(hourOfDay, workplace != null);
    const atHome = shouldBeAtHome(hourOfDay) && isNearResidence(entity, updatedBuildings);

    // Flee from dangerous Moon Howlers on full-moon nights
    const huntingWere = byType[EntityType.Werewolf].find(
      (w) => isActiveMoonHowler(w) && Math.hypot(w.x - entity.x, w.y - entity.y) < 110,
    );
    if (huntingWere) {
      const fdx = entity.x - huntingWere.x;
      const fdy = entity.y - huntingWere.y;
      const fdist = Math.sqrt(fdx * fdx + fdy * fdy) || 1;
      const fleeMult = getHumanFleeSpeedMultiplier(state);
      entity.vx = (fdx / fdist) * config.speed * 1.6 * fleeMult;
      entity.vy = (fdy / fdist) * config.speed * 1.6 * fleeMult;
      entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
      suppressIdle = true;
      onSchedule = true;
      maybeHumanChat(entity, 'sleep', entity.id, state.tick, 0.12, 45);
    }

    // Long commutes: snap at shift change so workers aren't stuck walking all day
    if (!huntingWere && hourOfDay === WORK_START && workplace && hasWorkAssignment(entity)) {
      if (commuteDistanceToBuilding(entity, workplace, false) > COMMUTE_SNAP_DISTANCE) {
        snapHumanToBuilding(entity, workplace, false);
      }
    } else if (!huntingWere && hourOfDay === EVENING_START && hasResidenceAssignment(entity)) {
      const eveningHome = updatedBuildings.find(
        (b) => b.id === entity.residenceBuildingId && b.completed,
      );
      if (
        eveningHome
        && commuteDistanceToBuilding(entity, eveningHome, true) > COMMUTE_SNAP_DISTANCE
      ) {
        snapHumanToBuilding(entity, eveningHome, true);
      }
    }

    // Day/night schedule — home at night, workplace during work hours
    if (!huntingWere && goHomeTime && hasResidenceAssignment(entity)) {
      const residence = updatedBuildings.find((b) => b.id === entity.residenceBuildingId && b.completed);
      if (residence) {
        const arrived = commuteHumanToBuilding(entity, residence, config.speed, true, 2.5);
        onSchedule = true;
        suppressIdle = true;
        if (arrived) {
          maybeHumanChat(entity, 'sleep', entity.id, state.tick, 0.03, 90);
        }
      }
    } else if (
      !huntingWere
      && goWorkTime
      && workplace
      && entity.job === JobType.Guard
      && isBarracksGuard(entity.id, entity.homeBuildingId, updatedBuildings)
    ) {
      const anchor = getPlayerCampCenter(state, updatedBuildings);
      const radius = 95 + (entity.id % 6) * 10;
      const angle = state.tick * 0.028 + entity.id * 2.1;
      const tx = anchor.x + Math.cos(angle) * radius;
      const ty = anchor.y + Math.sin(angle) * radius * 0.55;
      const pdx = tx - entity.x;
      const pdy = ty - entity.y;
      const pdist = Math.hypot(pdx, pdy) || 1;
      entity.vx = (pdx / pdist) * config.speed * 0.65;
      entity.vy = (pdy / pdist) * config.speed * 0.65;
      entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
      onSchedule = true;
      suppressIdle = true;
      if (pdist < 18) {
        maybeHumanChat(entity, 'work', entity.id, state.tick, 0.03, 80);
      }
    } else if (!huntingWere && goWorkTime && workplace) {
      const arrived = commuteHumanToBuilding(
        entity,
        workplace,
        config.speed,
        workplace.completed && isResidenceBuilding(workplace),
        3.5,
      );
      onSchedule = true;
      suppressIdle = true;
      if (arrived) {
        maybeHumanChat(entity, 'work', entity.id, state.tick, 0.04, 70);
      }
    }

    if (!allowFreeRoam && onSchedule && !huntingWere) {
      entity.vx *= 0.85;
      entity.vy *= 0.85;
    }

    if (allowFreeRoam && !ateFromFarm && entity.energy < entity.maxEnergy * 0.8) {
      const preyTypes = [EntityType.Deer, EntityType.Rabbit];
      const huntRange = getHumanHuntRange(state, config.huntRange);
      let closestPrey: Entity | null = null;
      let closestDist = Infinity;

      for (const preyType of preyTypes) {
        for (const prey of byType[preyType]) {
          if (!prey.alive || prey.tamedBy) continue;
          const dx = prey.x - entity.x;
          const dy = prey.y - entity.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < huntRange && dist < closestDist) {
            closestDist = dist;
            closestPrey = prey;
          }
        }
      }

      if (closestPrey && closestDist < config.size + closestPrey.size) {
        closestPrey.alive = false;
        closestPrey.huntTargetId = undefined;
        createDeathParticles(state, closestPrey.x, closestPrey.y, '#8a2a2a', 10);
        entity.energy = Math.min(entity.maxEnergy, entity.energy + config.energyGain[closestPrey.type]);
        entity.flash = 10;
        entity.combatTicks = 16;
        entity.huntTargetId = undefined;
        const foodGain = Math.round(38 * getHuntFoodMultiplier(state));
        addResource(state, 'food', foodGain);
        const preyLabel = closestPrey.type === EntityType.Deer ? 'Deer' : 'Rabbit';
        addFloatingText(state, closestPrey.x, closestPrey.y - 14, `Hunted ${preyLabel}! +${foodGain}`, '#f97316');
        entity.vx = 0;
        entity.vy = 0;
        impulseScreenShake(state, 2);
      } else if (closestPrey) {
        entity.huntTargetId = closestPrey.id;
        const dx = closestPrey.x - entity.x;
        const dy = closestPrey.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        entity.vx = (dx / dist) * config.speed * 0.55;
        entity.vy = (dy / dist) * config.speed * 0.55;
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        suppressIdle = true;
        maybeHumanChat(entity, 'hunt', entity.id, state.tick, 0.05, 55);
      } else {
        entity.huntTargetId = undefined;
      }
    } else if (!allowFreeRoam || ateFromFarm || entity.energy >= entity.maxEnergy * 0.8) {
      entity.huntTargetId = undefined;
    }

    entity.reproductionCooldown = Math.max(0, entity.reproductionCooldown - 1);

    if (entity.gender && entity.relationshipStatus === undefined) {
      entity.relationshipStatus = 'single';
      entity.attraction = 50 + Math.random() * 50;
    }

    if (entity.gender === 'female' && entity.pregnant && entity.pregnancyProgress !== undefined) {
      maybeHumanChat(entity, 'pregnant', entity.id, state.tick, 0.008, 80);
      entity.pregnancyProgress++;
      if (entity.pregnancyProgress >= PREGNANCY_TICKS) {
        const angle = Math.random() * Math.PI * 2;
        const nx = Math.min(width, Math.max(0, entity.x + Math.cos(angle) * 10));
        const ny = Math.min(height, Math.max(0, entity.y + Math.sin(angle) * 10));
        const nearDeer = byType[EntityType.Deer].some(
          (d) => d.alive && Math.hypot(d.x - entity.x, d.y - entity.y) < 80,
        );
        const wildkinBirth = nearDeer && Math.random() < 0.03;
        const biologicalFatherIdAtBirth = entity.pregnantById ?? entity.partnerId;

        entity.energy -= 50;
        entity.pregnant = false;
        entity.pregnancyProgress = 0;
        entity.pregnantById = undefined;
        entity.relationshipStatus = entity.partnerId != null ? 'married' : 'single';
        entity.reproductionCooldown = REPRODUCTION_COOLDOWN_TICKS;

        if (wildkinBirth) {
          const wildkin = createEntity(EntityType.Wildkin, nx, ny, state.nextEntityId++, 250);
          pushNewEntity(ctx, wildkin);
          addBigNews(
            state,
            '🦌 Wildkin Born!',
            `${entity.name || 'A settler'} gave birth to a gentle Wildkin — a rare gift of the forest.`,
            'neutral',
          );
          addFloatingText(state, entity.x, entity.y - 20, 'Wildkin born!', '#a3a35a');
          logEvent(state, 'birth', `${entity.name || 'A settler'} gave birth to a Wildkin`, entity.name);
        } else {
          const biologicalFatherId = biologicalFatherIdAtBirth;
          const husband = entity.partnerId != null
            ? allHumans.find((h) => h.id === entity.partnerId)
            : undefined;
          const biologicalFather = biologicalFatherId != null
            ? allHumans.find((h) => h.id === biologicalFatherId)
            : undefined;
          const isBastard = biologicalFatherId != null && biologicalFatherId !== entity.partnerId;
          const babySurname = isBastard
            ? (entity.surname || '')
            : (husband?.surname || biologicalFather?.surname || entity.surname || '');
          const babyGen = entity.generation + 1;
          const childGender = Math.random() > 0.5 ? 'male' : 'female';
          const child = createEntity(EntityType.Human, nx, ny, state.nextEntityId++, 80, true, {
            gender: childGender,
            fatherId: biologicalFatherId,
            motherId: entity.id,
            generation: babyGen,
            surname: babySurname,
            isBastard,
            spriteVariant: entity.spriteVariant ?? pickHumanVariant(entity.id, childGender),
          });
          child.name = getRandomName(child.gender === 'male' ? 'male' : 'female');
          child.residenceBuildingId = entity.residenceBuildingId;
          const birthMonth = Math.floor(state.dayInYear / 30);
          const birthDay = state.dayInYear % 30;
          setEntityBirthDate(child, state.year, birthMonth, birthDay);
          pushNewEntity(ctx, child);
          entity.childrenIds.push(child.id);
          if (biologicalFather) {
            biologicalFather.flash = 10;
            biologicalFather.childrenIds.push(child.id);
            if (biologicalFather.relationshipStatus === 'expecting') {
              biologicalFather.relationshipStatus = biologicalFather.partnerId != null ? 'married' : 'single';
            }
          }
          if (husband && !isBastard) {
            husband.flash = 10;
            if (!husband.childrenIds.includes(child.id)) husband.childrenIds.push(child.id);
            if (husband.relationshipStatus === 'expecting') husband.relationshipStatus = 'married';
          }
          rebuildChildrenIds([...playerHumans, child]);
          createDeathParticles(state, entity.x, entity.y - 10, isBastard ? '#a855f7' : '#ffb6c1', 12, 'heart');
          const childLabel = `${child.name}${babySurname ? ` ${babySurname}` : ''}`;
          if (isBastard) {
            addFloatingText(state, entity.x, entity.y - 20, `${childLabel} born (bastard)`, '#c084fc');
            addNotification(state, 'Bastard Born', `${childLabel} — born outside wedlock`, 'warning');
            logEvent(state, 'birth', `${childLabel} was born a bastard`, child.name);
            if (husband && biologicalFather && husband.id !== biologicalFather.id) {
              state.villageReputation = Math.max(0, state.villageReputation - 3);
              logEvent(
                state,
                'scandal',
                `Village gossip — ${childLabel} may not be ${humanDisplayName(husband)}'s child`,
                child.name,
              );
              addNotification(
                state,
                'Village Gossip',
                `${childLabel} born — whispers about ${humanDisplayName(entity)}`,
                'warning',
              );
            }
          } else {
            addFloatingText(state, entity.x, entity.y - 20, `${childLabel} born!`, '#ff69b4');
            addNotification(state, 'New Birth', `${childLabel} was born to ${entity.name || 'mother'}!`, 'success');
            logEvent(state, 'birth', `${childLabel} was born`, child.name);
          }
        }
      }
      if (entity.energy <= 0) {
        entity.alive = false;
        createDeathParticles(state, entity.x, entity.y, '#8B0000', 8);
      }
      continue;
    }

    // Evening social — singles head to the village green to meet others
    if (
      socialTime
      && isPlayerHuman(entity)
      && entity.relationshipStatus === 'single'
      && !entity.isJuvenile
      && hourOfDay >= EVENING_START
      && hourOfDay <= 22
      && !suppressIdle
    ) {
      const nearbySingle = allHumans.some(
        (h) =>
          isPlayerHuman(h)
          && h.id !== entity.id
          && h.alive
          && h.gender
          && h.gender !== entity.gender
          && h.relationshipStatus === 'single'
          && Math.hypot(h.x - entity.x, h.y - entity.y) < 90,
      );
      if (!nearbySingle) {
        const tx = width * 0.5 + ((entity.id % 5) - 2) * 35;
        const ty = height * 0.5 + ((entity.id % 7) - 3) * 28;
        const edx = tx - entity.x;
        const edy = ty - entity.y;
        const edist = Math.hypot(edx, edy) || 1;
        if (edist > 12) {
          entity.vx = (edx / edist) * config.speed * 0.45;
          entity.vy = (edy / edist) * config.speed * 0.45;
          entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          suppressIdle = true;
        }
      }
    }

    // Courtship — evenings at home, social hour, or daytime when off work
    if (
      socialTime
      && isPlayerHuman(entity)
      && entity.gender
      && entity.relationshipStatus === 'single'
      && entity.age >= HUMAN_ADULT_MIN_AGE
      && entity.age < HUMAN_ADULT_MAX_AGE
      && entity.energy > config.reproductionEnergyThreshold * 0.6
    ) {
      const courtRange = atHome ? 120 : 80;
      const potentialPartners = allHumans.filter(
        (h) =>
          isPlayerHuman(h)
          && h.gender
          && h.gender !== entity.gender
          && h.alive
          && h.age >= HUMAN_ADULT_MIN_AGE
          && h.age < HUMAN_ADULT_MAX_AGE
          && h.relationshipStatus === 'single'
          && (Math.hypot(h.x - entity.x, h.y - entity.y) < courtRange
            || (atHome && shareResidence(entity, h))),
      );

      if (potentialPartners.length > 0) {
        let closest: Entity | null = null;
        let closestDist = Infinity;
        for (const p of potentialPartners) {
          const dist = Math.hypot(p.x - entity.x, p.y - entity.y);
          if (dist < closestDist) {
            closestDist = dist;
            closest = p;
          }
        }

        if (closest) {
          const dx = closest.x - entity.x;
          const dy = closest.y - entity.y;
          const dist = Math.hypot(dx, dy) || 1;
          const livingTogether = atHome && shareResidence(entity, closest);
          const closeEnough = dist <= 10 || livingTogether;

          if (!closeEnough) {
            const chaseSpeed = atHome ? 0.35 : 0.45;
            entity.vx = (dx / dist) * config.speed * chaseSpeed;
            entity.vy = (dy / dist) * config.speed * chaseSpeed;
            entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
            suppressIdle = true;
          } else {
            entity.vx *= 0.6;
            entity.vy *= 0.6;
            suppressIdle = true;
            maybeHumanChat(entity, 'courtship', entity.id, state.tick, 0.1, 75);
            maybeHumanChat(closest, 'courtship', closest.id, state.tick, 0.1, 75);
            const hasPerformers = state.visitorGroups.some((g) => g.kind === 'performers' && g.daysLeft > 0);
            const courtRate = (4 + churchStrength * 2) * (state.festival?.active ? 2 : 1) * (hasPerformers ? 1.35 : 1) * (livingTogether ? 1.5 : 1);
            entity.courtshipProgress = (entity.courtshipProgress || 0) + courtRate;
            closest.courtshipProgress = (closest.courtshipProgress || 0) + courtRate;

            if (Math.random() < 0.08) {
              state.deathParticles.push({
                x: entity.x + (Math.random() - 0.5) * 15,
                y: entity.y - 8,
                vx: (Math.random() - 0.5) * 0.3,
                vy: -0.8 - Math.random() * 0.5,
                life: 25,
                maxLife: 25,
                color: '#ff69b4',
                size: 2 + Math.random() * 1.5,
                type: 'heart',
              });
            }

            if (entity.courtshipProgress >= 100 && closest.courtshipProgress >= 100) {
              entity.relationshipStatus = 'married';
              entity.partnerId = closest.id;
              entity.courtshipProgress = 0;
              closest.relationshipStatus = 'married';
              closest.partnerId = entity.id;
              closest.courtshipProgress = 0;
              createDeathParticles(
                state,
                (entity.x + closest.x) / 2,
                (entity.y + closest.y) / 2 - 15,
                '#ffd700',
                15,
                'heart',
              );
              addFloatingText(
                state,
                (entity.x + closest.x) / 2,
                (entity.y + closest.y) / 2 - 25,
                'Married!',
                '#ffd700',
              );
              const name1 = entity.name ? `${entity.name}${entity.surname ? ` ${entity.surname}` : ''}` : 'Someone';
              const name2 = closest.name ? `${closest.name}${closest.surname ? ` ${closest.surname}` : ''}` : 'someone';
              logEvent(state, 'marriage', `${name1} and ${name2} got married`, name1);
              addNotification(state, 'Marriage', `${name1} & ${name2} are now married`, 'success');
              entity.chatPhrase = 'Yes!';
              entity.chatTicks = 120;
              closest.chatPhrase = 'Yes!';
              closest.chatTicks = 120;
              syncPartnerResidence(
                entity,
                closest,
                updatedBuildings.filter(isResidenceBuilding),
                playerHumans,
              );
            }
          }
        }
      }
    }

    // Pregnancy — married couples at home together or close in the evening
    if (
      socialTime
      && entity.gender === 'female'
      && entity.relationshipStatus === 'married'
      && !entity.pregnant
      && entity.partnerId
      && entity.reproductionCooldown <= 0
      && entity.energy > config.reproductionEnergyThreshold * 0.75
    ) {
      const partner = allHumans.find((h) => h.id === entity.partnerId);
      if (partner?.alive) {
        const dx = partner.x - entity.x;
        const dy = partner.y - entity.y;
        const dist = Math.hypot(dx, dy) || 1;
        const together = dist < 22 || (atHome && shareResidence(entity, partner));
        const fertility = getFemaleFertility(entity.age);
        if (fertility <= 0) continue;
        const basePregChance = atHome && shareResidence(entity, partner) ? 0.07 : 0.035;
        const pregChance = basePregChance * fertility;

        if (together && Math.random() < pregChance) {
          entity.pregnant = true;
          entity.pregnantById = undefined;
          entity.pregnancyProgress = 0;
          entity.relationshipStatus = 'expecting';
          entity.flash = 15;
          partner.flash = 15;
          createDeathParticles(state, entity.x, entity.y - 8, '#ffb6c1', 10, 'heart');
          addFloatingText(state, entity.x, entity.y - 20, 'Expecting!', '#ff69b4');
          addNotification(state, 'Expecting', `${entity.name || 'A settler'} is expecting a child`, 'success');
        } else if (!together && dist > 15) {
          entity.vx = (dx / dist) * config.speed * 0.3;
          entity.vy = (dy / dist) * config.speed * 0.3;
          entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          suppressIdle = true;
        }
      }
    }

    // Secret affairs — married (or committed) settlers when the spouse isn't watching
    if (
      socialTime
      && isPlayerHuman(entity)
      && !entity.isJuvenile
      && !entity.pregnant
      && entity.gender
      && entity.age >= HUMAN_ADULT_MIN_AGE
      && entity.age < HUMAN_ADULT_MAX_AGE
      && entity.energy > config.reproductionEnergyThreshold * 0.5
      && (entity.relationshipStatus === 'married' || entity.relationshipStatus === 'single')
      && !isSpouseNearby(entity, playerHumans)
    ) {
      const affairRange = atHome ? 100 : 75;
      const paramours = playerHumans.filter(
        (h) =>
          isValidAffairTarget(entity, h)
          && Math.hypot(h.x - entity.x, h.y - entity.y) < affairRange,
      );

      if (paramours.length > 0) {
        let paramour: Entity | null = null;
        let paramourDist = Infinity;
        for (const p of paramours) {
          const dist = Math.hypot(p.x - entity.x, p.y - entity.y);
          if (dist < paramourDist) {
            paramourDist = dist;
            paramour = p;
          }
        }

        if (paramour) {
          const dx = paramour.x - entity.x;
          const dy = paramour.y - entity.y;
          const dist = Math.hypot(dx, dy) || 1;
          const intimate = dist <= 12;

          if (!intimate) {
            entity.vx = (dx / dist) * config.speed * 0.38;
            entity.vy = (dy / dist) * config.speed * 0.38;
            entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
            suppressIdle = true;
          } else {
            entity.vx *= 0.55;
            entity.vy *= 0.55;
            suppressIdle = true;

            if (entity.id < paramour.id) {
              maybeHumanChat(entity, 'affair', entity.id, state.tick, 0.12, 60);
              maybeHumanChat(paramour, 'affair', paramour.id, state.tick, 0.12, 60);

              const churchPenalty = churchStrength > 0 ? 0.65 + (1 - churchStrength) * 0.35 : 1;
              const affairRate = (churchStrength > 0 ? 3 : 5) * (state.festival?.active ? 1.4 : 1) * churchPenalty;
              entity.affairProgress = (entity.affairProgress || 0) + affairRate;
              paramour.affairProgress = (paramour.affairProgress || 0) + affairRate;

              if (Math.random() < 0.06) {
                state.deathParticles.push({
                  x: entity.x + (Math.random() - 0.5) * 10,
                  y: entity.y - 6,
                  vx: (Math.random() - 0.5) * 0.2,
                  vy: -0.5,
                  life: 18,
                  maxLife: 18,
                  color: '#f472b6',
                  size: 2,
                  type: 'heart',
                });
              }

              if (
                isSpouseNearby(entity, playerHumans, 40)
                || isSpouseNearby(paramour, playerHumans, 40)
              ) {
                if (Math.random() < (churchStrength >= 1 ? 0.018 : churchStrength > 0 ? 0.013 : 0.009)) {
                  exposeAffair(state, entity, paramour, 'caught');
                }
              } else if (entity.affairProgress >= 100 && paramour.affairProgress >= 100) {
                entity.affairPartnerId = paramour.id;
                paramour.affairPartnerId = entity.id;
                entity.affairProgress = 100;
                paramour.affairProgress = 100;
              }
            }
          }
        }
      }
    }

    // Illicit pregnancy — affair lovers when spouses are elsewhere
    if (
      socialTime
      && entity.gender === 'female'
      && !entity.pregnant
      && hasAffairPartner(entity)
      && entity.reproductionCooldown <= 0
      && entity.energy > config.reproductionEnergyThreshold * 0.65
      && !isSpouseNearby(entity, playerHumans)
    ) {
      const lover = allHumans.find((h) => h.id === entity.affairPartnerId);
      if (lover?.alive) {
        const dx = lover.x - entity.x;
        const dy = lover.y - entity.y;
        const dist = Math.hypot(dx, dy) || 1;
        const tryst = dist < 20 || (atHome && shareResidence(entity, lover));

        const affairFertility = getFemaleFertility(entity.age);
        if (tryst && affairFertility > 0 && Math.random() < 0.075 * affairFertility) {
          entity.pregnant = true;
          entity.pregnantById = lover.id;
          entity.pregnancyProgress = 0;
          entity.relationshipStatus = entity.partnerId != null ? 'married' : 'expecting';
          entity.flash = 14;
          lover.flash = 14;
          createDeathParticles(state, entity.x, entity.y - 8, '#f472b6', 8, 'heart');
          addFloatingText(state, entity.x, entity.y - 18, 'Secret…', '#c084fc', 'brief');
        } else if (!tryst && dist > 14) {
          entity.vx = (dx / dist) * config.speed * 0.32;
          entity.vy = (dy / dist) * config.speed * 0.32;
          entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          suppressIdle = true;
        }
      }
    }

    // === IDLE BEHAVIOR SYSTEM ===
    if (!onSchedule && entity.isJuvenile) {
      if (hasResidenceAssignment(entity)) {
        const residence = updatedBuildings.find(
          (b) => b.id === entity.residenceBuildingId && b.completed,
        );
        if (residence) {
          commuteHumanToBuilding(entity, residence, config.speed, true);
          suppressIdle = true;
        }
      } else {
        const allAlive = [...state.entities.filter(e => e.alive), ...newEntities];
        const parent = entity.motherId
          ? allAlive.find((e: Entity) => e.id === entity.motherId && e.alive)
          : entity.fatherId
            ? allAlive.find((e: Entity) => e.id === entity.fatherId && e.alive)
            : null;
        if (parent) {
          const pdx = parent.x - entity.x;
          const pdy = parent.y - entity.y;
          const pdist = Math.hypot(pdx, pdy) || 1;
          if (pdist > 25) {
            entity.vx = (pdx / pdist) * config.speed * 0.5;
            entity.vy = (pdy / pdist) * config.speed * 0.5;
            entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          } else if (pdist > 10) {
            entity.vx = (pdx / pdist) * config.speed * 0.15;
            entity.vy = (pdy / pdist) * config.speed * 0.15;
          }
          suppressIdle = true;
        }
      }
    } else if (allowFreeRoam && !suppressIdle && !workplace) {
      const tick = state.tick;
      const idleRoll = Math.floor(tick / 150 + entity.id) % 8;
      const seed = (entity.id * 7919 + Math.floor(tick / 1200)) % 1000;
      let idleVx = 0;
      let idleVy = 0;

      if (idleRoll < 2) {
        const targetX = ((seed * 137.5) % (width * 0.6)) + width * 0.2;
        const targetY = ((seed * 293.1) % (height * 0.6)) + height * 0.2;
        const edx = targetX - entity.x, edy = targetY - entity.y;
        const edist = Math.sqrt(edx * edx + edy * edy) || 1;
        idleVx = (edx / edist) * config.speed * 0.5;
        idleVy = (edy / edist) * config.speed * 0.5;
      } else if (idleRoll < 4) {
        let closestTree: Entity | null = null;
        let closestTreeDist = Infinity;
        for (const tree of byType[EntityType.Tree]) {
          if (!tree.alive) continue;
          const tdx = tree.x - entity.x;
          const tdy = tree.y - entity.y;
          const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
          if (tdist < closestTreeDist) {
            closestTreeDist = tdist;
            closestTree = tree;
          }
        }
        if (closestTree) {
          const tdx = closestTree.x - entity.x;
          const tdy = closestTree.y - entity.y;
          const tdist = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
          if (tdist > 15) {
            idleVx = (tdx / tdist) * config.speed * 0.4;
            idleVy = (tdy / tdist) * config.speed * 0.4;
          } else {
            idleVx = Math.sin(tick * 0.05 + entity.id) * config.speed * 0.15;
            idleVy = Math.cos(tick * 0.04 + entity.id) * config.speed * 0.15;
          }
        }
      } else if (idleRoll < 6) {
        const nearest = allHumans
          .filter(h => h.alive && h.id !== entity.id && !h.isJuvenile)
          .sort((a, b) => {
            const da = (a.x - entity.x) ** 2 + (a.y - entity.y) ** 2;
            const db = (b.x - entity.x) ** 2 + (b.y - entity.y) ** 2;
            return da - db;
          })[0];
        if (nearest) {
          const sdx = nearest.x - entity.x;
          const sdy = nearest.y - entity.y;
          const sdist = Math.sqrt(sdx * sdx + sdy * sdy) || 1;
          if (sdist > 20) {
            idleVx = (sdx / sdist) * config.speed * 0.35;
            idleVy = (sdy / sdist) * config.speed * 0.35;
          } else if (sdist < 8) {
            idleVx = -(sdx / sdist) * config.speed * 0.15;
            idleVy = -(sdy / sdist) * config.speed * 0.15;
          } else {
            idleVx = Math.sin(tick * 0.03 + entity.id) * config.speed * 0.12;
            idleVy = Math.cos(tick * 0.025 + entity.id) * config.speed * 0.12;
            if (isRenffrGossipActive(state)) {
              maybeHumanChat(entity, 'renffr', entity.id, state.tick, 0.14, 110);
              maybeHumanChat(nearest, 'renffr', nearest.id, state.tick, 0.14, 110);
            } else {
              maybeHumanChat(entity, 'social', entity.id, state.tick, 0.06, 85);
              maybeHumanChat(nearest, 'social', nearest.id, state.tick, 0.06, 85);
            }
          }
        }
      } else {
        const time = tick * 0.02 + entity.id;
        idleVx = Math.sin(time) * config.speed * 0.3 + Math.cos(time * 0.7) * config.speed * 0.15;
        idleVy = Math.cos(time * 0.8) * config.speed * 0.3 + Math.sin(time * 1.3) * config.speed * 0.1;
      }

      if (idleVx !== 0 || idleVy !== 0) {
        entity.vx = entity.vx * 0.55 + idleVx * 0.45;
        entity.vy = entity.vy * 0.55 + idleVy * 0.45;
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
      }
    }

    if (!suppressIdle) {
      entity.vx *= 0.9;
      entity.vy *= 0.9;
      if (Math.hypot(entity.vx, entity.vy) < 0.08) {
        entity.vx = 0;
        entity.vy = 0;
      }
    }

    const nearRoad = roadBuildings.some(
      (r) => Math.abs(r.x - entity.x) < r.width / 2 + 12 && Math.abs(r.y - entity.y) < r.height / 2 + 12,
    );
    const roadMult = nearRoad ? 1.5 : 1.0;

    entity.x += entity.vx * roadMult;
    entity.y += entity.vy * roadMult;

    if (entity.x < 0) entity.x = 0;
    if (entity.x > width) entity.x = width;
    if (entity.y < 0) entity.y = 0;
    if (entity.y > height) entity.y = height;

    advanceHumanWalkAnim(entity);

    if (entity.energy <= 0) {
      entity.alive = false;
      createDeathParticles(state, entity.x, entity.y, '#8B0000', 8);
      const fullName = entity.name ? `${entity.name}${entity.surname ? ` ${entity.surname}` : ''}` : 'A settler';
      logEvent(state, 'death', `${fullName} succumbed to exhaustion`, fullName);
    }
  }
}


// ============ TICK WILDLIFE ============
export function tickWildlife(state: WorldState, ctx: TickContext): void {
  const {
    width, height, grassMult, reproMult, winterPenalty,
    byType, roadBuildings, focus, entityById, predators,
  } = ctx;

  const isNewCalendarDay = state.tick > 0 && state.tick % TICKS_PER_DAY === 0;

  for (const entityType of WILDLIFE_TICK_TYPES) {
    for (const entity of byType[entityType]) {
      if (!entity.alive) continue;

    // Common updates
    if (isNewCalendarDay) {
      entity.age++;
    }
    entity.flash = Math.max(0, entity.flash - 1);
    if (entity.combatTicks && entity.combatTicks > 0) {
      entity.combatTicks--;
      if (entity.combatTicks <= 0) entity.combatTicks = 0;
    }
    if (entity.huntTargetId) {
      const prey = entityById.get(entity.huntTargetId);
      if (!prey?.alive) entity.huntTargetId = undefined;
    }
    entity.animFrame += 0.1;

    // Death by old age
    if (entity.age >= entity.maxAge) {
      entity.alive = false;
      createDeathParticles(state, entity.x, entity.y, '#aaaaaa', 5, 'smoke');
      continue;
    }

    // Grow up
    if (entity.isJuvenile && entity.age >= HUMAN_CHILDHOOD_DAYS) {
      entity.isJuvenile = false;
      entity.size = SPECIES_CONFIG[entity.type].size;
      entity.speed = SPECIES_CONFIG[entity.type].speed;
    }

    const config = SPECIES_CONFIG[entity.type];

    // ---- GRASS ----
    if (entity.type === EntityType.Grass) {
      const grassInFocus = !focus || isInFocus(entity, focus);
      if (!grassInFocus && (state.tick + entity.id) % OFFSCREEN_GRASS_THROTTLE !== 0) {
        if (entity.energy <= 0) {
          entity.alive = false;
          createDeathParticles(state, entity.x, entity.y, '#4a7a4a', 3, 'smoke');
        }
        continue;
      }

      const growMult = hasTech(state, 'agriculture_3') && state.weather === WeatherType.Drought
        ? grassMult * 1.5 : grassMult;
      entity.energy = Math.min(entity.maxEnergy, entity.energy + 2.5 * growMult);

      if (entity.energy > config.reproductionEnergyThreshold && Math.random() < config.reproductionChance * grassMult) {
        if (byType[EntityType.Grass].length < 500) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 15 + Math.random() * 25;
          const nx = entity.x + Math.cos(angle) * dist;
          const ny = entity.y + Math.sin(angle) * dist;
          if (nx > 0 && nx < width && ny > 0 && ny < height) {
            pushNewEntity(ctx, createEntity(EntityType.Grass, nx, ny, state.nextEntityId++, config.spawnEnergy));
            entity.energy -= 25;
          }
        }
      }
      if (entity.energy <= 0) {
        entity.alive = false;
        createDeathParticles(state, entity.x, entity.y, '#4a7a4a', 3, 'smoke');
      }
      continue;
    }

    // ---- OTHER ANIMALS ----
    entity.energy -= config.energyLossPerTick + winterPenalty;

    if (entity.energy <= 0) {
      entity.alive = false;
      createDeathParticles(state, entity.x, entity.y, '#8a2a2a', 8);
      continue;
    }

    const wildlifeInFocus = !focus || isInFocus(entity, focus);
    const wildlifeActive = wildlifeInFocus || (state.tick + entity.id) % OFFSCREEN_WILDLIFE_THROTTLE === 0;
    if (!wildlifeActive) {
      entity.reproductionCooldown = Math.max(0, entity.reproductionCooldown - 1);
      continue;
    }

    let targetVx = 0;
    let targetVy = 0;

    // Flee from predators
    if (entity.type === EntityType.Rabbit || entity.type === EntityType.Deer || entity.type === EntityType.Wildkin) {
      let closestPredator: Entity | null = null;
      let closestDist = Infinity;

      for (const pred of predators) {
        if (!pred.alive) continue;
        const dx = pred.x - entity.x;
        const dy = pred.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < config.fleeRange && dist < closestDist) {
          closestDist = dist;
          closestPredator = pred;
        }
      }

      if (closestPredator) {
        const dx = entity.x - closestPredator.x;
        const dy = entity.y - closestPredator.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        targetVx = (dx / dist) * config.speed * 1.5;
        targetVy = (dy / dist) * config.speed * 1.5;
      }
    }

    // Hunt prey
    if (entity.type === EntityType.Wolf || entity.type === EntityType.Fox || entity.type === EntityType.Werewolf) {
      const preyTypes = entity.type === EntityType.Fox
        ? [EntityType.Rabbit]
        : entity.type === EntityType.Werewolf && entity.moonHowlerCursed
          ? [EntityType.Human, EntityType.Deer, EntityType.Rabbit]
          : [EntityType.Deer, EntityType.Rabbit];

      // Pack bonus for wolves: nearby wolves extend hunt range and share kills
      let nearbyPack = 0;
      let huntRange = config.huntRange;
      if (entity.type === EntityType.Wolf) {
        for (const other of byType[EntityType.Wolf]) {
          if (other.id !== entity.id && other.alive && Math.hypot(other.x - entity.x, other.y - entity.y) < 120) {
            nearbyPack++;
          }
        }
        huntRange *= 1 + Math.min(3, nearbyPack) * 0.25;
      } else if (isActiveMoonHowler(entity)) {
        huntRange *= 1.15;
      }

      let closestPrey: Entity | null = null;
      let closestDist = Infinity;

      for (const preyType of preyTypes) {
        for (const prey of byType[preyType]) {
          if (!prey.alive) continue;
          if (prey.id === entity.id) continue;
          if (preyType === EntityType.Human) {
            if (prey.moonHowlerCursed) continue;
            if (prey.faction === 'visitor' || prey.faction === 'rival') continue;
          }
          const dx = prey.x - entity.x;
          const dy = prey.y - entity.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const humanBias = preyType === EntityType.Human ? 0.82 : 1;
          if (dist < huntRange && dist * humanBias < closestDist) {
            closestDist = dist * humanBias;
            closestPrey = prey;
          }
        }
      }

      if (closestPrey) {
        entity.huntTargetId = closestPrey.id;
        const dx = closestPrey.x - entity.x;
        const dy = closestPrey.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const packSpeed = entity.type === EntityType.Wolf && nearbyPack > 0 ? 1.2 : 1;
        const wereSpeed = isActiveMoonHowler(entity) ? 1.25 : 1;
        targetVx = (dx / dist) * config.speed * packSpeed * wereSpeed;
        targetVy = (dy / dist) * config.speed * packSpeed * wereSpeed;

        if (dist < config.size + closestPrey.size) {
          const isHumanPrey = closestPrey.type === EntityType.Human;

          if (isHumanPrey && rollCounterAttack(state, closestPrey.id, entity.id, state.tick)) {
            entity.alive = false;
            entity.huntTargetId = undefined;
            closestPrey.combatTicks = 18;
            closestPrey.flash = 12;
            createDeathParticles(state, entity.x, entity.y, '#8a2a2a', 10);
            addFloatingText(state, closestPrey.x, closestPrey.y - 14, 'Defended!', '#38bdf8');
            impulseScreenShake(state, 3);
            targetVx = 0;
            targetVy = 0;
          } else if (isHumanPrey && rollPredatorBlock(state, closestPrey.id, state.tick)) {
            closestPrey.combatTicks = 14;
            closestPrey.flash = 10;
            entity.flash = 6;
            entity.huntTargetId = undefined;
            addFloatingText(state, closestPrey.x, closestPrey.y - 14, 'Blocked!', '#38bdf8');
            impulseScreenShake(state, 2);
            targetVx = -(dx / dist) * config.speed * 1.4;
            targetVy = -(dy / dist) * config.speed * 1.4;
          } else {
            closestPrey.alive = false;
            closestPrey.huntTargetId = undefined;
            entity.huntTargetId = undefined;
            createDeathParticles(state, closestPrey.x, closestPrey.y, '#8a2a2a', 10);
            const packEnergyBonus = entity.type === EntityType.Wolf ? 1 + nearbyPack * 0.15 : 1;
            const energyGain = isHumanPrey
              ? 220
              : (config.energyGain[closestPrey.type] || 50) * packEnergyBonus;
            entity.energy = Math.min(entity.maxEnergy, entity.energy + energyGain);
            entity.flash = 10;
            entity.combatTicks = 14;

            if (isHumanPrey) {
              const wolfName = entity.name ? `${entity.name}${entity.surname ? ` ${entity.surname}` : ''}` : 'A Moon Howler';
              const victimName = closestPrey.name ? `${closestPrey.name}${closestPrey.surname ? ` ${closestPrey.surname}` : ''}` : 'A settler';
              const line = WEREWOLF_ATTACK_LINES[Math.floor(Math.random() * WEREWOLF_ATTACK_LINES.length)](wolfName, victimName);
              addBigNews(state, '🌝 Moon Howler Attack!', line, 'negative');
              addFloatingText(state, closestPrey.x, closestPrey.y - 12, 'Slain!', '#ef4444');
              logEvent(state, 'death', line, victimName);
              impulseScreenShake(state, 5);
              for (const b of state.buildings) {
                if (b.occupants.includes(closestPrey.id)) {
                  b.occupants = b.occupants.filter((id) => id !== closestPrey.id);
                }
              }
            } else {
              const preyLabel = closestPrey.type === EntityType.Deer ? 'Deer' : 'Rabbit';
              const predatorLabel = entity.type === EntityType.Fox ? 'Fox' : entity.type === EntityType.Wolf ? 'Wolf' : 'Moon Howler';
              addFloatingText(state, closestPrey.x, closestPrey.y - 12, `${predatorLabel} caught ${preyLabel}!`, '#a8a29e');
              if (entity.type === EntityType.Werewolf) {
                addFloatingText(state, closestPrey.x, closestPrey.y - 24, 'Torn apart!', '#c4b5fd');
              }
            }
          }
        }
      } else {
        entity.huntTargetId = undefined;
      }
    }

    if (isActiveMoonHowler(entity) && state.tick % 140 === entity.id % 140) {
      const line = WEREWOLF_HOWL_LINES[Math.floor(Math.random() * WEREWOLF_HOWL_LINES.length)];
      addFloatingText(state, entity.x, entity.y - 18, line, '#c4b5fd');
    }

    // Graze
    if ((entity.type === EntityType.Rabbit || entity.type === EntityType.Deer || entity.type === EntityType.Wildkin) && targetVx === 0 && targetVy === 0) {
      let closestGrass: Entity | null = null;
      let closestGrassDist = Infinity;

      for (const grass of byType[EntityType.Grass]) {
        if (!grass.alive || grass.energy < 5) continue;
        const dx = grass.x - entity.x;
        const dy = grass.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 50 && dist < closestGrassDist) {
          closestGrassDist = dist;
          closestGrass = grass;
        }
      }

      if (closestGrass) {
        const dx = closestGrass.x - entity.x;
        const dy = closestGrass.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        targetVx = (dx / dist) * config.speed * 0.6;
        targetVy = (dy / dist) * config.speed * 0.6;

        if (closestGrassDist < config.size + closestGrass.size) {
          const bite = Math.min(closestGrass.energy, 8);
          closestGrass.energy -= bite;
          entity.energy = Math.min(entity.maxEnergy, entity.energy + config.energyGain['grass']);
          if (closestGrass.energy <= 0) closestGrass.alive = false;
        }
      }
    }

    // Wander
    if (targetVx === 0 && targetVy === 0) {
      if (Math.random() < 0.05) {
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
    for (const r of roadBuildings) {
      const dx = entity.x - (r.x + r.width / 2);
      const dy = entity.y - (r.y + r.height / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 60) {
        entity.vx += (dx / (dist || 1)) * 0.5;
        entity.vy += (dy / (dist || 1)) * 0.5;
      }
    }

    entity.x += entity.vx;
    entity.y += entity.vy;

    // Tamed animals follow their owner
    if (entity.tamedBy) {
      const owner = entityById.get(entity.tamedBy);
      if (owner?.alive) {
        const dx = owner.x - entity.x;
        const dy = owner.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist > 35) {
          entity.vx = (dx / dist) * config.speed * 0.6;
          entity.vy = (dy / dist) * config.speed * 0.6;
          entity.x += entity.vx;
          entity.y += entity.vy;
          entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        }
        // Tamed predators assist owner by hunting nearby prey
        if ((entity.type === EntityType.Wolf || entity.type === EntityType.Fox || entity.type === EntityType.Werewolf) && dist < 80 && isProductionTick(state.tick, EVENT_INTERVAL.tamedHuntAssist)) {
          const assistPrey = byType[EntityType.Rabbit].concat(byType[EntityType.Deer]).find(p => p.alive && Math.hypot(p.x - entity.x, p.y - entity.y) < config.huntRange);
          if (assistPrey) {
            assistPrey.alive = false;
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

    // Reproduction
    entity.reproductionCooldown = Math.max(0, entity.reproductionCooldown - 1);
    
    const sameTypeCount = byType[entity.type].filter(e => e.alive).length;
    const maxPop = entity.type === EntityType.Rabbit ? 120 : entity.type === EntityType.Deer ? 60 : entity.type === EntityType.Wolf ? 25 : 35;
    const capacityFactor = Math.max(0, 1 - (sameTypeCount / maxPop));

    if (entity.reproductionCooldown <= 0 && entity.energy > config.reproductionEnergyThreshold && Math.random() < config.reproductionChance * reproMult * capacityFactor) {
      const mates = byType[entity.type].filter(m => m.alive && m.id !== entity.id && m.energy > config.reproductionEnergyThreshold * 0.3 && Math.abs(m.x - entity.x) < 80 && Math.abs(m.y - entity.y) < 80);
      if (mates.length > 0) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 15;
        const nx = Math.min(width, Math.max(0, entity.x + Math.cos(angle) * dist));
        const ny = Math.min(height, Math.max(0, entity.y + Math.sin(angle) * dist));
        pushNewEntity(ctx, createEntity(entity.type, nx, ny, state.nextEntityId++, config.spawnEnergy));
        entity.energy -= entity.maxEnergy * 0.2;
        entity.reproductionCooldown = config.reproductionCooldown;
      }
    }
    }
  }
}
