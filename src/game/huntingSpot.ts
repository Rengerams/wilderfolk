import type { Building, Entity, HuntingSpotPrey } from './gameTypes';
import { BuildingType, EntityType } from './gameTypes';
import { SPECIES_CONFIG } from './speciesConfig';
import { isPlayerHuman } from './playerHuman';
import { MAX_SKILL } from './skills';

/**
 * The Hunting Spot's own rules: who works it, which animal it is after and how close the hunter must
 * be to take it. Seeing (350 px) is not killing — the reach is bodies touching, so the hunter walks.
 */

/** How far an assigned hunter notices prey, in px — the owner's 350. */
export const HUNTING_SPOT_SEARCH_RADIUS_PX = 350;

/**
 * The settler a building sends out — its first living, player-owned occupant; `occupants` is read
 * defensively because a test- or save-built building can lack one.
 */
export function findLiveAssignedWorker(
  building: Building,
  entityById: ReadonlyMap<number, Entity>,
): Entity | undefined {
  const assigned = building.occupants;
  if (!assigned) return undefined;
  for (let i = 0; i < assigned.length; i++) {
    const worker = entityById.get(assigned[i]);
    if (worker?.alive && isPlayerHuman(worker)) return worker;
  }
  return undefined;
}

/** True while `hunter` is the settler this spot sends out. */
export function isHuntingSpotHunter(
  building: Building,
  hunter: Entity,
  entityById: ReadonlyMap<number, Entity>,
): boolean {
  if (building.type !== BuildingType.HuntingSpot || building.completed !== true) return false;
  return findLiveAssignedWorker(building, entityById)?.id === hunter.id;
}

/**
 * How close the hunter must be for the shot to have a chance: bodies touching, both radii — the same
 * expression the free-roam hunter and the wolf use, not a second formula that would drift.
 */
export function huntingKillReach(hunter: Entity, prey: Entity): number {
  const hunterSize = SPECIES_CONFIG[hunter.type]?.size ?? hunter.size;
  const preySize = prey.size > 0 ? prey.size : (SPECIES_CONFIG[prey.type]?.size ?? 6);
  return hunterSize + preySize;
}

/**
 * The animal types a spot set to `preyTarget` will take. One list, so a placement rule that asks
 * "could a spot here hunt anything?" reads the same answer `pickHuntingSpotPrey` hunts by.
 */
export function huntingSpotPreyTypes(preyTarget: HuntingSpotPrey | undefined): EntityType[] {
  const target = preyTarget ?? 'auto';
  const types: EntityType[] = [];
  if (target === 'auto' || target === 'deer') types.push(EntityType.Deer);
  if (target === 'auto' || target === 'rabbit') types.push(EntityType.Rabbit);
  if (target === 'auto' || target === 'wolf') types.push(EntityType.Wolf);
  return types;
}

/**
 * The animal this spot is after right now, or null when nothing is inside its eyes. A tamed animal is
 * never targeted; a wolf carries a +160 px penalty so one is picked only when nothing safer is closer.
 */
export function pickHuntingSpotPrey(
  building: Building,
  hunter: Entity,
  byType: Record<EntityType, Entity[]>,
): Entity | null {
  const targetTypes = huntingSpotPreyTypes(building.huntingSpotPrey);

  let targetPrey: Entity | null = null;
  let bestScore = Infinity;
  for (let t = 0; t < targetTypes.length; t++) {
    const pool = byType[targetTypes[t]] ?? [];
    for (let p = 0; p < pool.length; p++) {
      const prey = pool[p];
      if (!prey.alive || prey.tamedBy != null) continue;
      const dist = Math.hypot(prey.x - hunter.x, prey.y - hunter.y);
      if (dist >= HUNTING_SPOT_SEARCH_RADIUS_PX) continue;
      const score = prey.type === EntityType.Wolf ? dist + 160 : dist;
      if (score < bestScore) {
        bestScore = score;
        targetPrey = prey;
      }
    }
  }
  return targetPrey;
}

/**
 * How far a committed animal may stray before the spot gives it up, in px — the eyes' radius plus the
 * length of the pursuit, so being seen and being hunted are different distances.
 */
const HUNTING_SPOT_ABANDON_RADIUS_PX = HUNTING_SPOT_SEARCH_RADIUS_PX * 2;

/** Whether the spot's own prey setting allows this kind of animal at all. */
function isHuntableSpotPreyType(building: Building, prey: Entity): boolean {
  if (!prey.alive || prey.tamedBy != null) return false;
  const preyTarget = building.huntingSpotPrey ?? 'auto';
  return (
    preyTarget === 'auto' ||
    (preyTarget === 'deer' && prey.type === EntityType.Deer) ||
    (preyTarget === 'rabbit' && prey.type === EntityType.Rabbit) ||
    (preyTarget === 'wolf' && prey.type === EntityType.Wolf)
  );
}

/**
 * Whether a spot may keep the animal it already committed to: huntable, and not so far that the pursuit
 * has plainly failed (`HUNTING_SPOT_ABANDON_RADIUS_PX`).
 */
function mayKeepHuntingSpotTarget(building: Building, hunter: Entity, prey: Entity): boolean {
  if (!isHuntableSpotPreyType(building, prey)) return false;
  return Math.hypot(prey.x - hunter.x, prey.y - hunter.y) < HUNTING_SPOT_ABANDON_RADIUS_PX;
}

/**
 * The animal this spot is after: the one it is **committed** to while the pursuit still makes sense,
 * otherwise the nearest it can see. The commitment survives out to the abandon radius.
 */
export function huntingSpotTarget(
  building: Building,
  hunter: Entity,
  entityById: ReadonlyMap<number, Entity>,
  byType: Record<EntityType, Entity[]>,
): Entity | null {
  const committedId = building.huntingSpotTargetId;
  if (committedId != null) {
    const committed = entityById.get(committedId);
    if (committed && mayKeepHuntingSpotTarget(building, hunter, committed)) return committed;
  }
  return pickHuntingSpotPrey(building, hunter, byType);
}

/** Record the spot's choice (or clear it) — the owner of the decision writes it; everyone else reads. */
export function commitHuntingSpotTarget(building: Building, prey: Entity | null): void {
  building.huntingSpotTargetId = prey ? prey.id : undefined;
}

/**
 * The animal this hunter should be walking to right now, or null when there is nothing to walk to —
 * no prey in sight, or already inside the tighter hold distance (kill reach × the close fraction).
 */
export function huntingSpotChaseTarget(
  building: Building,
  hunter: Entity,
  entityById: ReadonlyMap<number, Entity>,
  byType: Record<EntityType, Entity[]>,
): Entity | null {
  if (!isHuntingSpotHunter(building, hunter, entityById)) return null;
  const prey = huntingSpotTarget(building, hunter, entityById, byType);
  if (!prey) return null;
  const holdDistance = huntingKillReach(hunter, prey) * HUNTING_PURSUIT_CLOSE_FRACTION;
  const dist = Math.hypot(prey.x - hunter.x, prey.y - hunter.y);
  return dist > holdDistance ? prey : null;
}

/**
 * How fast the hunter closes, as a multiple of their walk. Prey do not flee, but they wander faster
 * than a working settler's damped 2.55 px/tick; 1.4 clears the deer and rabbit and stays under the wolf.
 */
export const HUNTING_PURSUIT_SPEED_MULT = 1.4;

/**
 * How many ticks ahead of the animal the hunter aims — the difference between a chase that closes and
 * one that treadmills, since steering at its current position fights its radial motion.
 */
export const HUNTING_LEAD_TICKS = 3;

/**
 * How long a hunter's contact with an animal stays good for, in ticks: the spot samples the shot on its
 * own production pass, so a recently recorded contact (`huntingSpotInReachTick`) is accepted.
 */
export const HUNTING_SPOT_STRIKE_GRACE_TICKS = 12;

/** True when the hunter was beside this spot's animal recently enough for the shot to count. */
export function isHuntingStrikeLive(building: Building, tick: number): boolean {
  const at = building.huntingSpotInReachTick;
  return at != null && tick - at <= HUNTING_SPOT_STRIKE_GRACE_TICKS;
}

/**
 * Where the hunter should steer: the animal's position led by its own `vx`/`vy` heading, not a prediction.
 */
export function huntingPursuitPoint(prey: Entity): { x: number; y: number } {
  return {
    x: prey.x + prey.vx * HUNTING_LEAD_TICKS,
    y: prey.y + prey.vy * HUNTING_LEAD_TICKS,
  };
}

/** The hunter holds at this fraction of the kill reach, so prey drift cannot open the shot gate. */
const HUNTING_PURSUIT_CLOSE_FRACTION = 0.6;

/**
 * The wolf's fight-back: the chance it turns on the hunter instead of being taken, and what the bite
 * costs. One hunt in ten; the bite lands on the hunter, whose health is its energy.
 */
export const HUNTING_FIGHT_BACK_CHANCE = 0.1;
export const HUNTING_FIGHT_BACK_BITE_ENERGY = 140;

/**
 * What a fight-back can do to the hunter, rolled once per bite on the same key as the fight-back roll:
 * kill band, then injury band, then an ordinary bite. `huntingFightBackKillChance` narrows the kill band by skill.
 */
export const HUNTING_FIGHT_BACK_KILL_CHANCE = 0.05;
/** 0.11 = the band above the kill band, so a mauling is ~11 % of bites and ~1.1 % of wolf hunts. */
export const HUNTING_FIGHT_BACK_INJURY_CHANCE = 0.11;
/**
 * 260 = the mauling's extra energy on top of the ordinary 140 bite, well over half a settler's 500-point
 * bar; health *is* energy, so surviving it costs the day.
 */
export const HUNTING_FIGHT_BACK_MAUL_ENERGY = 260;

/** What a skilled hunter keeps of the fatal band — a floor, never a guarantee. */
export const HUNTING_FIGHT_BACK_SKILL_FLOOR = 0.2;

/**
 * The fatal band a hunter of this trade skill faces: linear from the 5 % base at skill 0 down to
 * 1 % at skill 100. The injury band keeps its width, so a roll the skill saves becomes a mauling.
 */
export function huntingFightBackKillChance(skill: number): number {
  const trained = Math.min(1, Math.max(0, skill / MAX_SKILL));
  return HUNTING_FIGHT_BACK_KILL_CHANCE * (1 - trained * (1 - HUNTING_FIGHT_BACK_SKILL_FLOOR));
}

/** What a wolf's bite does to the hunter. */
export type HuntingFightBackFate = 'killed' | 'mauled' | 'bitten';

/** The hunter's own trade, as far as the bite is concerned — a named context, never a bare number. */
export interface HuntingFightBackHunter {
  readonly skill?: number;
}

/**
 * Resolve one bite from a roll in `[0, 1)` and the hunter: below the skill-aware kill band kills,
 * below kill + injury mauls, the rest is an ordinary bite. Pure, so the odds are testable.
 */
export function huntingFightBackFate(
  roll: number,
  hunter: HuntingFightBackHunter = {},
): HuntingFightBackFate {
  const killChance = huntingFightBackKillChance(hunter.skill ?? 0);
  if (roll < killChance) return 'killed';
  if (roll < killChance + HUNTING_FIGHT_BACK_INJURY_CHANCE) return 'mauled';
  return 'bitten';
}

